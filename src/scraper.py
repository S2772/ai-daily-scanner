#!/usr/bin/env python3
"""
AI热点日报爬虫 - 本地版本
收集AI领域热点信息，包含技术、产品、投资、机会等
"""

import os
import requests
import sqlite3
import json
import time
import re
import queue
import threading
import feedparser
import xml.etree.ElementTree as ET
from collections import Counter
from typing import List, Dict, Any
import hashlib
from html.parser import HTMLParser
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from .twitter_scraper import TwitterScraper
from .ai_config import get_ai_api_config

AI_API_CONFIG = get_ai_api_config(
    default_model="gpt-5.2-codex",
    default_fallback_models="gpt-5.3-codex,gpt-5.2,gpt-4.1",
)


def _get_timeout_seconds(env_key: str, default_value: float) -> float:
    raw = os.getenv(env_key, "").strip()
    if not raw:
        return float(default_value)
    try:
        value = float(raw)
    except Exception:
        return float(default_value)
    if value <= 0:
        return float(default_value)
    return value


class _StripTagsParser(HTMLParser):
    """Strip HTML tags and extract plain text, skipping common UI/navigation blocks."""
    _SKIP_TAGS = {
        "script", "style", "noscript", "svg", "canvas", "iframe",
        "nav", "header", "footer", "button", "input", "select",
        "option", "textarea", "aside", "form",
    }
    _BLOCK_TAGS = {
        "article", "section", "div", "p", "br", "li", "ul", "ol",
        "h1", "h2", "h3", "h4", "h5", "h6", "blockquote",
    }
    _UI_ATTR_KEYWORDS = (
        "nav", "menu", "header", "footer", "sidebar", "breadcrumb", "toolbar",
        "share", "social", "author", "meta", "metadata", "byline", "avatar",
        "subscribe", "comment", "reply", "related", "recommend", "toc",
        "advert", "ads", "promo", "banner", "cookie", "modal", "popup",
        "login", "signup", "register", "search", "btn", "button", "pager",
    )

    def __init__(self):
        super().__init__()
        self._skip_stack = []
        self._parts = []

    def handle_starttag(self, tag, attrs):
        tag_lower = (tag or "").lower()
        parent_skip = self._skip_stack[-1] if self._skip_stack else False
        skip = parent_skip or self._should_skip(tag_lower, attrs or [])
        self._skip_stack.append(skip)

        if not skip and tag_lower in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag):
        tag_lower = (tag or "").lower()
        skipping = self._skip_stack.pop() if self._skip_stack else False
        if not skipping and tag_lower in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data):
        if self._skip_stack and self._skip_stack[-1]:
            return
        text = (data or "").strip()
        if text:
            self._parts.append(text)

    def get_text(self):
        text = " ".join(part.strip() for part in self._parts if part.strip())
        return clean_extracted_text(text)

    def _should_skip(self, tag: str, attrs: List[Any]) -> bool:
        if tag in self._SKIP_TAGS:
            return True
        for key, value in attrs:
            key_lower = (key or "").lower()
            value_lower = str(value or "").lower()
            if key_lower in {"class", "id", "role", "aria-label", "data-testid"}:
                if any(token in value_lower for token in self._UI_ATTR_KEYWORDS):
                    return True
        return False


_INLINE_UI_PATTERNS = [
    r"\bOriginal\b",
    r"\b\d{1,2}\s*Founder\b",
    r"在小说阅读器中沉浸阅读",
    r"内容[｜|]\s*[^ \n|｜]{1,20}\s*编辑[｜|]\s*[^ \n|｜]{1,20}",
]

_UI_LINE_KEYWORDS = (
    "author", "editor", "by ", "share", "social", "follow", "subscribe",
    "comment", "reply", "menu", "navigation", "breadcrumb", "login",
    "signup", "register", "related", "recommend", "copyright",
    "原创", "原文", "作者", "编辑", "来源", "转载", "分享", "关注",
    "点赞", "评论", "订阅", "目录", "返回", "上一篇", "下一篇", "阅读原文",
)


def _looks_like_ui_line(line: str, short_line_counts: Counter) -> bool:
    if not line:
        return True
    lower = line.lower()
    if re.fullmatch(r"(original|原创|作者|编辑|来源|分享|点赞|评论|关注|订阅|目录|返回|展开|收起|阅读原文)", lower):
        return True
    if any(k in lower for k in _UI_LINE_KEYWORDS) and len(line) <= 60:
        return True
    if short_line_counts.get(line, 0) >= 2 and len(line) <= 24:
        return True
    if (line.count("|") + line.count("｜") + line.count("/") >= 2) and len(line) <= 60:
        return True
    return False


def _dedupe_short_tokens(text: str) -> str:
    tokens = text.split()
    if len(tokens) < 2:
        return text

    deduped = []
    prev_norm = ""
    for token in tokens:
        norm = re.sub(r"[^\w\u4e00-\u9fff]+", "", token.lower())
        if re.search(r"[\u4e00-\u9fff]", norm):
            norm = re.sub(r"[a-z0-9]{1,2}$", "", norm)
        if norm and norm == prev_norm and len(norm) <= 16:
            continue
        deduped.append(token)
        prev_norm = norm
    return " ".join(deduped)


def clean_extracted_text(text: str) -> str:
    """Normalize extracted text and remove common UI/meta fragments."""
    if not text:
        return ""

    content = text.replace("\r", "\n").replace("\u00a0", " ")
    for pattern in _INLINE_UI_PATTERNS:
        content = re.sub(pattern, " ", content, flags=re.IGNORECASE)
    content = re.sub(r"[ \t\f\v]+", " ", content)
    content = re.sub(r"\n{3,}", "\n\n", content)

    raw_lines = [line.strip(" \t-•·|｜>") for line in content.split("\n")]
    short_line_counts = Counter(
        re.sub(r"\s+", " ", line).strip()
        for line in raw_lines
        if line and len(line) <= 24
    )

    cleaned_lines = []
    for line in raw_lines:
        line = re.sub(r"\s+", " ", line).strip()
        line = _dedupe_short_tokens(line)
        if not line:
            continue
        if _looks_like_ui_line(line, short_line_counts):
            continue
        if cleaned_lines and line == cleaned_lines[-1]:
            continue
        cleaned_lines.append(line)

    return "\n".join(cleaned_lines).strip()


def strip_html_tags(html: str) -> str:
    """Extract plain text from HTML.

    For long-form sources (e.g. WeChat full HTML in WeWe-RSS feeds), being too
    aggressive about skipping UI-like containers can drop the entire article.

    We delegate to a relaxed extractor that only skips truly non-content tags.
    """
    from src.html_text import strip_html_tags_relaxed

    return strip_html_tags_relaxed(html)


def normalize_published_at(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, time.struct_time):
        try:
            return time.strftime("%Y-%m-%d %H:%M:%S", value)
        except Exception:
            return ""

    text = str(value).strip()
    if not text:
        return ""

    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(text, fmt)
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass

    iso_candidate = text.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(iso_candidate)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        pass

    try:
        dt = parsedate_to_datetime(text)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return text


class AIScraper:
    def __init__(self, db_path: str = "data/ai_hotspots.db"):
        """初始化爬虫，创建数据库连接"""
        self.db_path = self._resolve_db_path(db_path)
        self._ensure_db_parent_dir()
        self.init_database()
        
        # 从 sources.json 加载信息源配置
        self.sources_config = self._load_sources_config()
        
        # 构建运行时 sources（兼容旧逻辑）
        self.sources = {
            "twitter_profiles": self.sources_config.get("twitter_profiles", [
                "karpathy", "ylecun", "AndrewYNg", "sama",
            ]),
            "blogs": [s["url"] for s in self.sources_config.get("official_research_blogs", []) if s.get("url")],
            "rss_feeds": self.sources_config.get("rss_feeds", [
                "https://arxiv.org/rss/cs.AI",
                "https://news.ycombinator.com/rss",
                "https://www.reddit.com/r/MachineLearning/.rss",
            ]),
            "github_trending": [
                "https://github.com/trending?since=daily&spoken_language_code=en",
            ],
            "cn_model_labs": [s["url"] for s in self.sources_config.get("cn_model_labs", []) if s.get("url")],
            "investment_institutions": [s["url"] for s in self.sources_config.get("investment_institutions", []) if s.get("url")],
        }
        
        # 中文博主/公众号分类索引（供抓取和报告使用）
        self.cn_blogger_categories = {}
        for cat_key, cat_data in self.sources_config.get("categories", {}).items():
            self.cn_blogger_categories[cat_key] = {
                "name": cat_data.get("name", ""),
                "description": cat_data.get("description", ""),
                "bloggers": cat_data.get("bloggers", []),
                "highlights": cat_data.get("highlights", {}),
            }
        
        # 分类体系
        self.categories = [
            "技术突破", "产品发布", "投资融资", 
            "行业动态", "人才流动", "市场机会"
        ]
        
        # 标签体系
        self.tags = [
            "计算机视觉", "NLP", "强化学习", "生成式AI",
            "大语言模型", "多模态", "自动驾驶", "机器人",
            "开源项目", "创业公司", "融资", "并购",
            "学术研究", "工程实践", "工具发布"
        ]

    @staticmethod
    def _resolve_db_path(db_path: str) -> str:
        """将数据库路径标准化到项目根目录下，避免受运行目录影响。"""
        if os.path.isabs(db_path):
            return db_path
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(project_root, db_path)

    def _ensure_db_parent_dir(self) -> None:
        """确保数据库目录存在，避免 sqlite 无法打开文件。"""
        parent = os.path.dirname(self.db_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        
    def _load_sources_config(self) -> Dict[str, Any]:
        """从 sources.json 加载信息源配置"""
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "sources.json")
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"⚠️ 加载 sources.json 失败: {e}，使用默认配置")
        return {}

    def get_all_bloggers_flat(self) -> List[Dict[str, str]]:
        """返回所有博主的扁平列表，附带分类信息"""
        result = []
        for cat_key, cat_data in self.cn_blogger_categories.items():
            for blogger in cat_data["bloggers"]:
                entry = {
                    "name": blogger,
                    "category": cat_data["name"],
                    "description": cat_data["description"],
                }
                highlights = cat_data.get("highlights", {})
                if blogger in highlights:
                    entry["highlight"] = highlights[blogger]
                result.append(entry)
        return result

    def get_all_sources_summary(self) -> Dict[str, Any]:
        """返回所有信息源的汇总统计"""
        bloggers = self.get_all_bloggers_flat()
        return {
            "cn_bloggers_total": len(bloggers),
            "cn_blogger_categories": len(self.cn_blogger_categories),
            "rss_feeds": len(self.sources.get("rss_feeds", [])),
            "twitter_profiles": len(self.sources.get("twitter_profiles", [])),
            "official_blogs": len(self.sources.get("blogs", [])),
            "cn_model_labs": len(self.sources.get("cn_model_labs", [])),
            "investment_institutions": len(self.sources.get("investment_institutions", [])),
            "thought_leaders": sum(
                len(v) for v in self.sources_config.get("thought_leaders", {}).values()
            ),
            "podcasts_platforms": len(self.sources_config.get("podcasts_and_platforms", [])),
        }

    def init_database(self):
        """初始化SQLite数据库"""
        try:
            conn = sqlite3.connect(self.db_path)
        except sqlite3.OperationalError as e:
            raise RuntimeError(
                f"无法打开数据库文件: {self.db_path}. 请检查目录权限与路径配置。"
            ) from e
        cursor = conn.cursor()
        
        # 创建热点信息表
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS hotspots (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT,
            url TEXT,
            source TEXT,
            category TEXT,
            tags TEXT,  -- JSON数组存储多个标签
            ai_summary TEXT,  -- AI生成的中文摘要
            innovation_score INTEGER DEFAULT 0,
            commercial_score INTEGER DEFAULT 0,
            tech_score INTEGER DEFAULT 0,
            investment_score INTEGER DEFAULT 0,
            total_score INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # 创建机会挖掘表
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS opportunities (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT,
            potential_score INTEGER DEFAULT 0,
            competition_level TEXT,
            resources_needed TEXT,
            timeline TEXT,
            pain_points TEXT,
            blue_ocean_opportunity TEXT,
            monetization_potential TEXT,
            domains TEXT,
            priority TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')

        # 数据库迁移：添加新列（如果不存在）
        try:
            cursor.execute("SELECT pain_points FROM opportunities LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE opportunities ADD COLUMN pain_points TEXT")
        try:
            cursor.execute("SELECT blue_ocean_opportunity FROM opportunities LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE opportunities ADD COLUMN blue_ocean_opportunity TEXT")
        try:
            cursor.execute("SELECT monetization_potential FROM opportunities LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE opportunities ADD COLUMN monetization_potential TEXT")
        try:
            cursor.execute("SELECT domains FROM opportunities LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE opportunities ADD COLUMN domains TEXT")
        try:
            cursor.execute("SELECT priority FROM opportunities LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE opportunities ADD COLUMN priority TEXT")
        try:
            cursor.execute("SELECT title_zh FROM hotspots LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE hotspots ADD COLUMN title_zh TEXT")

        try:
            cursor.execute("SELECT published_at FROM hotspots LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE hotspots ADD COLUMN published_at TIMESTAMP")
        
        # 创建用户笔记表
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            hotspot_id TEXT,
            content TEXT,
            tags TEXT,
            is_important BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (hotspot_id) REFERENCES hotspots (id)
        )
        ''')

        # 创建采集源状态表
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS source_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            source_type TEXT NOT NULL,
            status TEXT NOT NULL,
            item_count INTEGER DEFAULT 0,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        conn.commit()
        conn.close()
        
    def generate_id(self, text: str) -> str:
        """生成唯一的ID"""
        return hashlib.md5(text.encode()).hexdigest()[:12]
    
    def fetch_web_content(self, url: str) -> str:
        """获取网页内容，优先使用Jina AI Reader API绕过登录"""
        try:
            # 首先尝试使用 Jina AI Reader API（可以绕过登录）
            jina_url = f"https://r.jina.ai/{url}"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(jina_url, headers=headers, timeout=15)
            if response.status_code == 200 and response.text.strip():
                content = clean_extracted_text(response.text)
                # 检查是否返回了有效内容
                if content and len(content) > 120:
                    print(f"  ✓ 通过Jina AI获取: {url}")
                    return content
        except Exception as e:
            print(f"  ✗ Jina AI获取失败: {url}, 尝试直接访问...")
        
        # 如果Jina AI失败，尝试直接获取
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            html = response.text or ""
            if "<html" in html.lower() or "<body" in html.lower():
                return strip_html_tags(html)
            return clean_extracted_text(html)
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            return ""
    
    def _parse_wewe_atom(self, feed_url: str, content: bytes) -> List[Dict[str, Any]]:
        """直接用 xml.etree 解析 WeWe RSS Atom feed，绕过 feedparser 的 HTML sanitizer"""
        items = []
        try:
            root = ET.fromstring(content)
            ns = {'atom': 'http://www.w3.org/2005/Atom'}
            entries = root.findall('atom:entry', ns)
            for entry in entries[:10]:
                title_el = entry.find('atom:title', ns)
                raw_title = title_el.text.strip() if title_el is not None and title_el.text else ""
                link_el = entry.find('atom:link', ns)
                url = link_el.get('href', '') if link_el is not None else ""
                content_el = entry.find('atom:content', ns)
                raw_html = content_el.text or "" if content_el is not None else ""
                clean_text = strip_html_tags(raw_html) if raw_html else ""

                if len(raw_title) > 200:
                    if not clean_text:
                        clean_text = raw_title
                    title = raw_title.replace('\n', ' ').replace('\r', '')[:100].strip()
                    if len(raw_title) > 100:
                        title += "..."
                else:
                    title = raw_title

                if (not clean_text or len(clean_text) < 120 or 'Video Mini Program' in clean_text) and url:
                    fetched_text = self.fetch_web_content(url)
                    if fetched_text and len(fetched_text) > len(clean_text):
                        clean_text = fetched_text

                if len(clean_text) > 5000:
                    clean_text = clean_text[:5000]

                text_for_classify = title + " " + clean_text
                item = {
                    "id": self.generate_id(url + title),
                    "title": title,
                    "content": clean_text,
                    "url": url,
                    "source": feed_url,
                    "category": self.classify_content(text_for_classify),
                    "tags": json.dumps(self.extract_tags(text_for_classify)),
                    "published_at": normalize_published_at(
                        entry.findtext('atom:updated', default='', namespaces=ns)
                        or entry.findtext('atom:published', default='', namespaces=ns)
                        or ''
                    ),
                }
                scores = self.calculate_scores_detailed(title, clean_text, item["category"])
                item.update(scores)
                items.append(item)
        except ET.ParseError as e:
            print(f"  XML解析失败 {feed_url}: {e}")
        return items

    def parse_rss_feed_with_status(self, feed_url: str) -> Dict[str, Any]:
        """解析RSS订阅源并返回状态"""
        items = []
        error_message = ""
        try:
            headers = {
                "User-Agent": "python-requests/2.31.0"
            }
            
            # 添加重试机制
            max_retries = 3
            response = None
            for attempt in range(max_retries):
                try:
                    response = requests.get(feed_url, headers=headers, timeout=15)
                    response.raise_for_status()
                    break
                except requests.exceptions.RequestException as e:
                    if attempt == max_retries - 1:
                        raise
                    print(f"尝试 {attempt + 1}/{max_retries} 失败，等待重试: {e}")
                    time.sleep(2 ** attempt)  # 指数退避
            
            # WeWe RSS (localhost:4000) 用直接 XML 解析，避免 feedparser 破坏 HTML 内容
            if "localhost:4000" in feed_url:
                items = self._parse_wewe_atom(feed_url, response.content)
            else:
                feed = feedparser.parse(response.content)

                if getattr(feed, "bozo", False):
                    print(f"Warning: RSS解析可能异常 {feed_url}")

                for entry in feed.entries[:10]:
                    raw_content = entry.get("summary", "") or entry.get("description", "")
                    content = strip_html_tags(raw_content)
                    article_url = entry.get("link", "")
                    lowered_content = content.strip().lower()
                    teaser_signals = (
                        len(content) < 120
                        or lowered_content in {"comments", "comment", "查看全文"}
                        or content.endswith("查看全文")
                    )
                    if teaser_signals and article_url:
                        fetched_text = self.fetch_web_content(article_url)
                        if fetched_text and len(fetched_text) > len(content):
                            content = fetched_text
                    text_for_classify = entry.get("title", "") + " " + content

                    published_at = ""
                    if entry.get("published_parsed"):
                        published_at = normalize_published_at(entry.published_parsed)
                    if not published_at and entry.get("updated_parsed"):
                        published_at = normalize_published_at(entry.updated_parsed)
                    if not published_at:
                        published_at = normalize_published_at(entry.get("published", "") or entry.get("updated", "") or "")

                    item = {
                        "id": self.generate_id(entry.get("link", "") + entry.get("title", "")),
                        "title": entry.get("title", ""),
                        "content": content,
                        "url": entry.get("link", ""),
                        "source": feed_url,
                        "category": self.classify_content(text_for_classify),
                        "tags": json.dumps(self.extract_tags(text_for_classify)),
                        "published_at": published_at,
                    }
                    scores = self.calculate_scores_detailed(item["title"], content, item["category"])
                    item.update(scores)
                    items.append(item)
        except Exception as e:
            error_message = str(e)
            print(f"Error parsing RSS feed {feed_url}: {error_message}")
            
            if "NameResolutionError" in error_message or "Failed to resolve" in error_message:
                error_message = f"DNS解析失败: {feed_url}。请检查网络连接或DNS设置。"

        status = "success"
        if error_message:
            status = "error"
        elif len(items) == 0:
            status = "empty"

        return {
            "source": feed_url,
            "source_type": "rss",
            "status": status,
            "item_count": len(items),
            "error_message": error_message,
            "items": items,
        }

    def parse_rss_feed(self, feed_url: str) -> List[Dict[str, Any]]:
        """兼容旧调用：只返回items"""
        return self.parse_rss_feed_with_status(feed_url)["items"]

    def save_source_statuses(self, statuses: List[Dict[str, Any]]):
        """保存采集源状态"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # 清理今天的源状态，避免一次次叠加
        cursor.execute("DELETE FROM source_status WHERE date(created_at) = date('now')")

        for row in statuses:
            cursor.execute(
                '''
                INSERT INTO source_status (source, source_type, status, item_count, error_message)
                VALUES (?, ?, ?, ?, ?)
                ''',
                (
                    row.get("source", ""),
                    row.get("source_type", "rss"),
                    row.get("status", "unknown"),
                    int(row.get("item_count", 0)),
                    row.get("error_message", ""),
                ),
            )

        conn.commit()
        conn.close()
    
    def classify_content(self, text: str) -> str:
        """根据内容文本分类"""
        text_lower = text.lower()

        tech_keywords = [
            "paper", "research", "algorithm", "model", "training", "accuracy",
            "技术突破", "技术创新", "算法", "模型", "训练", "研究", "论文",
            "开源", "架构", "推理", "微调", "预训练", "基准测试", "性能提升",
        ]
        product_keywords = [
            "launch", "release", "announce", "product", "feature", "update",
            "产品发布", "新功能", "上线", "发布", "推出", "更新", "版本",
            "应用", "工具", "平台", "插件", "接口", "API",
        ]
        investment_keywords = [
            "funding", "investment", "series", "raise", "valuation", "investor",
            "融资", "投资", "估值", "轮融资", "亿美元", "亿元", "收购", "并购",
            "上市", "IPO", "风投", "VC", "天使轮", "A轮", "B轮", "C轮",
        ]
        industry_keywords = [
            "partnership", "collaboration", "regulation", "policy", "standard",
            "行业动态", "监管", "政策", "法规", "合作", "标准", "生态",
            "竞争", "市场份额", "行业报告", "趋势", "格局",
        ]
        talent_keywords = [
            "人才", "加入", "离职", "跳槽", "招聘", "团队", "创始人",
            "CEO", "CTO", "hired", "joins", "leaves", "founder",
        ]

        if any(keyword in text_lower for keyword in investment_keywords):
            return "投资融资"
        elif any(keyword in text_lower for keyword in tech_keywords):
            return "技术突破"
        elif any(keyword in text_lower for keyword in product_keywords):
            return "产品发布"
        elif any(keyword in text_lower for keyword in talent_keywords):
            return "人才流动"
        elif any(keyword in text_lower for keyword in industry_keywords):
            return "行业动态"
        else:
            return "市场机会"
    
    def extract_tags(self, text: str) -> List[str]:
        """从文本中提取标签"""
        text_lower = text.lower()
        matched_tags = []
        
        for tag in self.tags:
            tag_lower = tag.lower()
            # 简单的关键词匹配
            if tag_lower in text_lower:
                matched_tags.append(tag)
            # 一些常见的缩写匹配
            elif tag == "NLP" and ("natural language" in text_lower or "nlp" in text_lower):
                matched_tags.append(tag)
            elif tag == "LLM" and ("large language model" in text_lower or "llm" in text_lower):
                matched_tags.append(tag)
        
        return matched_tags[:3]  # 最多返回3个标签
    
    def calculate_scores(self, item: Dict[str, Any]) -> Dict[str, int]:
        """计算各项评分"""
        text = (item.get("title", "") + " " + item.get("content", "")).lower()
        
        # 创新度评分：基于技术关键词
        innovation_keywords = ["breakthrough", "novel", "new method", "state-of-the-art", "sota"]
        innovation_score = sum(10 for keyword in innovation_keywords if keyword in text)
        
        # 商业化潜力：基于商业关键词
        commercial_keywords = ["product", "service", "market", "revenue", "customer", "business"]
        commercial_score = sum(8 for keyword in commercial_keywords if keyword in text)
        
        # 技术成熟度：基于实现关键词
        tech_keywords = ["production", "deploy", "scale", "stable", "reliable"]
        tech_score = sum(6 for keyword in tech_keywords if keyword in text)
        
        # 投资热度：基于投资关键词
        investment_keywords = ["funding", "investment", "series", "valuation", "investor"]
        investment_score = sum(10 for keyword in investment_keywords if keyword in text)
        
        # 总分（加权平均）
        total_score = int((innovation_score * 0.3 + commercial_score * 0.3 + 
                          tech_score * 0.2 + investment_score * 0.2))
        
        return {
            "innovation_score": min(innovation_score, 10),
            "commercial_score": min(commercial_score, 10),
            "tech_score": min(tech_score, 10),
            "investment_score": min(investment_score, 10),
            "total_score": min(total_score, 10)
        }

    def _summarize_fallback(self, title: str, content: str) -> str:
        text = (content or title or "").strip()
        if not text:
            return ""
        if len(text) > 220:
            return f"{text[:220]}..."
        return text

    def _generate_ai_summary(self, title: str, content: str) -> str:
        source_text = (content or title or "").strip()
        if len(source_text) < 10:
            return self._summarize_fallback(title, content)
        if not AI_API_CONFIG.get("api_key"):
            return self._summarize_fallback(title, content)

        models = []
        if AI_API_CONFIG.get("model"):
            models.append(str(AI_API_CONFIG["model"]))
        for model in AI_API_CONFIG.get("fallback_models", []):
            if model not in models:
                models.append(model)
        if not models:
            models = ["gpt-5.2-codex"]

        prompt = f"""请将下面热点内容总结成简体中文摘要（80-150字），只返回摘要正文，不要额外说明。

标题：{title}
内容：{source_text[:2500]}"""

        headers = {
            "Authorization": f"Bearer {AI_API_CONFIG['api_key']}",
            "Content-Type": "application/json",
        }
        for model in models:
            payload = {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 400,
                "temperature": 0.3,
            }
            try:
                response = requests.post(
                    AI_API_CONFIG["base_url"],
                    headers=headers,
                    json=payload,
                    timeout=30,
                )
                if response.status_code != 200:
                    continue
                summary = (
                    response.json()
                    .get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                    .strip()
                )
                if summary:
                    return summary[:600]
            except Exception:
                continue

        return self._summarize_fallback(title, content)

    def _resolve_scores(self, item: Dict[str, Any]) -> Dict[str, int]:
        score_keys = [
            "innovation_score",
            "commercial_score",
            "tech_score",
            "investment_score",
            "total_score",
        ]
        if all(key in item for key in score_keys):
            try:
                return {
                    "innovation_score": max(0, min(10, int(item.get("innovation_score", 0)))),
                    "commercial_score": max(0, min(10, int(item.get("commercial_score", 0)))),
                    "tech_score": max(0, min(10, int(item.get("tech_score", 0)))),
                    "investment_score": max(0, min(10, int(item.get("investment_score", 0)))),
                    "total_score": max(0, min(10, int(item.get("total_score", 0)))),
                }
            except (TypeError, ValueError):
                pass

        return self.calculate_scores_detailed(
            item.get("title", ""),
            item.get("content", ""),
            item.get("category", "市场机会"),
        )
    
    def save_hotspot(self, item: Dict[str, Any]):
        """保存热点信息到数据库"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 优先使用抓取阶段已计算的详细评分，避免被旧逻辑覆盖
        scores = self._resolve_scores(item)
        ai_summary = str(item.get("ai_summary") or "").strip()
        if not ai_summary:
            ai_summary = self._generate_ai_summary(item.get("title", ""), item.get("content", ""))
        title_zh = str(item.get("title_zh") or item.get("title") or "").strip()
        
        published_at = normalize_published_at(
            item.get("published_at") or item.get("published") or item.get("updated")
        )

        # Soft-dedupe: if (url, source) already exists, reuse its id to avoid duplicating the same item
        url = item.get("url") or ""
        source = item.get("source") or ""
        if url and source:
            cursor.execute(
                "SELECT id FROM hotspots WHERE url = ? AND source = ? LIMIT 1",
                (url, source),
            )
            row = cursor.fetchone()
            if row and row[0]:
                item["id"] = row[0]

        cursor.execute(
            """
            INSERT OR REPLACE INTO hotspots
            (id, title, content, url, source, category, tags, ai_summary, title_zh,
             innovation_score, commercial_score, tech_score, investment_score, total_score,
             published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item["id"],
                item["title"][:200],  # 限制标题长度
                item["content"][:20000] if item.get("content") else "",  # 限制内容长度（支持公众号全文展示）
                url,
                source,
                item["category"],
                item["tags"],
                ai_summary,
                title_zh,
                scores["innovation_score"],
                scores["commercial_score"],
                scores["tech_score"],
                scores["investment_score"],
                scores["total_score"],
                published_at,
            ),
        )
        
        conn.commit()
        conn.close()
    
    def identify_opportunities(self):
        """识别机会蓝海"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # 清理今天自动生成的机会，避免旧结果残留
        cursor.execute(
            """
            DELETE FROM opportunities
            WHERE date(created_at) = date('now') AND id LIKE 'auto_%'
            """
        )

        # 分析热点数据，找出潜在机会
        cursor.execute('''
        SELECT category, tags, COUNT(*) as count,
               AVG(commercial_score) as avg_commercial,
               AVG(investment_score) as avg_investment,
               GROUP_CONCAT(title, '|') as titles,
               GROUP_CONCAT(content, '|') as contents
        FROM hotspots
        WHERE date(created_at) = date('now')
        GROUP BY category, tags
        ORDER BY avg_commercial DESC, avg_investment DESC
        LIMIT 10
        ''')

        opportunities = []
        for row in cursor.fetchall():
            category, tags_json, count, avg_commercial, avg_investment, titles_str, contents_str = row

            # 解析标签
            tags = json.loads(tags_json) if tags_json else []

            # 计算机会潜力分数
            potential_score = int((avg_commercial * 0.6 + avg_investment * 0.4) * 10)

            # 确定竞争级别
            if count < 3:
                competition_level = "低竞争"
                priority = "高"
            elif count < 10:
                competition_level = "中等竞争"
                priority = "中"
            else:
                competition_level = "高竞争"
                priority = "低"

            # 从热点标题中提取机会名称（取第一个标题的关键部分）
            titles_list = titles_str.split('|') if titles_str else []
            opportunity_name = titles_list[0][:50] if titles_list else f"{category}领域的机会"

            # 生成当前痛点
            pain_points = f"当前{category}领域存在{count}个热点，但缺乏统一的解决方案。市场需求旺盛，但竞争程度为{competition_level}。"

            # 生成蓝海机会
            blue_ocean = f"在{category}领域，结合{', '.join(tags[:2]) if tags else '新技术'}，可以开发创新的解决方案。商业潜力评分{avg_commercial:.1f}/10，投资热度{avg_investment:.1f}/10。"

            # 生成变现潜力
            monetization = f"通过SaaS订阅、技术授权或咨询服务等方式变现。预计3-6个月内可验证市场，1-2年内实现规模化。"

            opportunity = {
                "id": f"auto_{self.generate_id(f'{category}_{tags_json}')}",
                "title": opportunity_name,
                "description": f"基于最近{count}个相关热点分析",
                "category": category,
                "potential_score": potential_score,
                "competition_level": competition_level,
                "resources_needed": "技术团队、市场调研、初期资金",
                "timeline": "3-6个月验证，1-2年规模化",
                "pain_points": pain_points,
                "blue_ocean_opportunity": blue_ocean,
                "monetization_potential": monetization,
                "domains": json.dumps(tags[:3]) if tags else "[]",
                "priority": priority
            }
            opportunities.append(opportunity)

            # 保存到数据库
            cursor.execute('''
            INSERT OR REPLACE INTO opportunities
            (id, title, description, category, potential_score, competition_level, resources_needed, timeline, pain_points, blue_ocean_opportunity, monetization_potential, domains, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                opportunity["id"],
                opportunity["title"],
                opportunity["description"],
                opportunity["category"],
                opportunity["potential_score"],
                opportunity["competition_level"],
                opportunity["resources_needed"],
                opportunity["timeline"],
                opportunity["pain_points"],
                opportunity["blue_ocean_opportunity"],
                opportunity["monetization_potential"],
                opportunity["domains"],
                opportunity["priority"]
            ))

        conn.commit()
        conn.close()
        return opportunities

    def _run_with_timeout(self, fn, timeout_seconds: float, timeout_message: str):
        out: "queue.Queue[tuple]" = queue.Queue(maxsize=1)

        def _worker():
            try:
                out.put(("ok", fn(), None))
            except Exception as exc:
                out.put(("err", exc, None))

        t = threading.Thread(target=_worker, daemon=True)
        t.start()
        t.join(timeout_seconds)
        if t.is_alive():
            raise TimeoutError(timeout_message)
        if out.empty():
            raise RuntimeError("worker exited without result")
        status, payload, _ = out.get_nowait()
        if status == "err":
            raise payload
        return payload
    
    def run_daily_collection(self):
        """执行每日收集任务"""
        print("开始收集AI热点信息...")

        all_items = []
        source_statuses = []
        source_timeout = _get_timeout_seconds("COLLECT_SOURCE_TIMEOUT_SECONDS", 45.0)
        twitter_timeout = _get_timeout_seconds("COLLECT_TWITTER_TIMEOUT_SECONDS", 480.0)

        # 收集RSS订阅源：单源失败不可阻塞整次 run
        for feed_url in self.sources["rss_feeds"]:
            print(f"处理RSS源: {feed_url}")
            try:
                result = self._run_with_timeout(
                    lambda: self.parse_rss_feed_with_status(feed_url),
                    source_timeout,
                    f"source timeout after {int(source_timeout)}s: {feed_url}",
                )
            except Exception as e:
                is_timeout = isinstance(e, TimeoutError) or "timeout" in str(e).lower()
                result = {
                    "source": feed_url,
                    "source_type": "rss",
                    "status": "error",
                    "item_count": 0,
                    "error_message": (
                        f"TimeoutError: {e}" if is_timeout else f"{e.__class__.__name__}: {e}"
                    ),
                    "items": [],
                }

            items = result.get("items", []) or []
            all_items.extend(items)
            source_statuses.append(
                {
                    "source": result.get("source", feed_url),
                    "source_type": result.get("source_type", "rss"),
                    "status": result.get("status", "unknown"),
                    "item_count": int(result.get("item_count", 0) or 0),
                    "error_message": result.get("error_message", ""),
                }
            )
            time.sleep(1)  # 礼貌延迟

        # 收集Twitter热点
        print("\n" + "="*50)
        twitter_count = 0
        try:
            twitter_scraper = TwitterScraper(self.db_path)
            twitter_count = int(
                self._run_with_timeout(
                    lambda: twitter_scraper.run_twitter_collection(),
                    twitter_timeout,
                    f"twitter timeout after {int(twitter_timeout)}s",
                )
                or 0
            )
            source_statuses.append(
                {
                    "source": "twitter",
                    "source_type": "twitter",
                    "status": "success" if twitter_count > 0 else "empty",
                    "item_count": twitter_count,
                    "error_message": "" if twitter_count > 0 else "未获取到推文",
                }
            )
            all_items.extend([{"id": f"twitter_{i}"} for i in range(twitter_count)])  # 占位符
        except Exception as e:
            is_timeout = isinstance(e, TimeoutError) or "timeout" in str(e).lower()
            source_statuses.append(
                {
                    "source": "twitter",
                    "source_type": "twitter",
                    "status": "error",
                    "item_count": 0,
                    "error_message": (
                        f"TimeoutError: {e}" if is_timeout else f"{e.__class__.__name__}: {e}"
                    ),
                }
            )

        # 如果所有外部源都失败，使用模拟数据
        if not all_items:
            print("⚠️ 所有外部源都失败，使用模拟数据...")
            all_items = self.generate_mock_data()
            source_statuses.append(
                {
                    "source": "mock_data",
                    "source_type": "mock",
                    "status": "success",
                    "item_count": len(all_items),
                    "error_message": "使用模拟数据（外部源连接失败）",
                }
            )

        self.save_source_statuses(source_statuses)

        if not all_items:
            print("⚠️ 未收集到任何热点，跳过机会识别。请检查网络或RSS源状态。")
            return 0, 0

        # 保存所有热点（RSS的）
        for item in all_items:
            if "id" in item and not item["id"].startswith("twitter_"):
                self.save_hotspot(item)

        # 识别机会
        opportunities = self.identify_opportunities()

        total_items = len([i for i in all_items if not i.get("id", "").startswith("twitter_")]) + twitter_count
        print(f"收集完成！共收集{total_items}个热点，识别{len(opportunities)}个机会")
        return total_items, len(opportunities)
    
    def generate_mock_data(self) -> List[Dict[str, Any]]:
        """生成模拟数据，用于网络连接失败时"""
        mock_items = []
        
        # 定义模拟数据
        mock_data_definitions = [
            {
                "title": "OpenAI发布GPT-5，性能大幅提升",
                "content": "OpenAI发布了新一代大语言模型GPT-5，在推理能力、代码生成和多模态理解方面都有显著提升。",
                "category": "产品发布",
                "tags": ["大语言模型", "NLP", "OpenAI"],
                "url": "https://openai.com/blog/gpt-5",
            },
            {
                "title": "Google发布Gemini Ultra多模态模型",
                "content": "Google发布了多模态AI模型Gemini Ultra，在多项基准测试中表现优异。",
                "category": "产品发布",
                "tags": ["多模态", "Google", "AI模型"],
                "url": "https://ai.googleblog.com/gemini-ultra",
            },
            {
                "title": "AI芯片初创公司融资1亿美元",
                "content": "一家专注于AI芯片的初创公司完成1亿美元B轮融资，投资方包括多家知名风投。",
                "category": "投资融资",
                "tags": ["AI芯片", "硬件", "创业公司"],
                "url": "https://techcrunch.com/ai-chip-startup-funding",
            },
            {
                "title": "Meta开源Llama 3大语言模型",
                "content": "Meta开源了Llama 3大语言模型，提供70B和400B两个版本。",
                "category": "开源项目",
                "tags": ["开源", "大语言模型", "Meta"],
                "url": "https://ai.meta.com/blog/llama-3",
            },
            {
                "title": "AI医疗诊断系统获得FDA批准",
                "content": "一款基于深度学习的医疗诊断系统获得FDA批准，可用于辅助医生诊断。",
                "category": "技术突破",
                "tags": ["医疗AI", "诊断", "FDA"],
                "url": "https://medicalai.com/fda-approval",
            },
            {
                "title": "微软发布Copilot Studio，支持自定义AI助手",
                "content": "微软发布了Copilot Studio，允许企业创建和定制自己的AI助手。",
                "category": "产品发布",
                "tags": ["AI助手", "微软", "企业AI"],
                "url": "https://microsoft.com/copilot-studio",
            },
            {
                "title": "英伟达发布新一代AI芯片H200",
                "content": "英伟达发布了新一代AI芯片H200，性能比前代提升40%。",
                "category": "技术突破",
                "tags": ["AI芯片", "英伟达", "硬件"],
                "url": "https://nvidia.com/h200",
            },
            {
                "title": "AI初创公司被谷歌以5亿美元收购",
                "content": "一家专注于AI视频生成的初创公司被谷歌以5亿美元收购。",
                "category": "投资融资",
                "tags": ["收购", "谷歌", "视频生成"],
                "url": "https://techcrunch.com/google-acquires-ai-startup",
            },
        ]
        
        # 生成带评分的模拟数据
        for data in mock_data_definitions:
            scores = self.calculate_scores_detailed(data["title"], data["content"], data["category"])
            item = {
                "id": self.generate_id(data["title"] + str(time.time())),
                "title": data["title"],
                "content": data["content"],
                "url": data["url"],
                "source": "mock_data",
                "category": data["category"],
                "tags": json.dumps(data["tags"]),
            }
            item.update(scores)
            mock_items.append(item)
        
        return mock_items
    
    def calculate_scores_detailed(self, title: str, content: str, category: str) -> Dict[str, int]:
        """计算各项评分"""
        text = (title + " " + content).lower()

        # 创新度评分
        innovation_score = 5  # 基础分
        innovation_keywords = [
            "breakthrough", "novel", "innovative", "new approach", "first", "pioneering",
            "groundbreaking", "state-of-the-art", "cutting-edge", "revolutionary",
            "突破", "新颖", "创新", "首创", "前沿", "领先", "革命性",
            "首次", "全新", "开创", "里程碑", "超越", "刷新", "sota",
        ]
        for keyword in innovation_keywords:
            if keyword in text:
                innovation_score += 1

        # 商业潜力评分
        commercial_score = 5  # 基础分
        commercial_keywords = [
            "funding", "investment", "series", "raise", "valuation", "investor",
            "market", "revenue", "profit", "business", "commercial", "product",
            "launch", "release", "customer", "user", "growth", "scale",
            "融资", "投资", "估值", "市场", "收入", "利润", "商业", "产品",
            "发布", "客户", "用户", "增长", "规模化", "变现", "盈利",
            "订阅", "付费", "企业", "toB", "tob", "saas", "上线", "推出",
        ]
        for keyword in commercial_keywords:
            if keyword in text:
                commercial_score += 1

        # 技术难度评分
        tech_score = 5  # 基础分
        tech_keywords = [
            "algorithm", "model", "framework", "architecture", "system", "method",
            "technique", "approach", "solution", "implementation",
            "算法", "模型", "框架", "架构", "系统", "方法", "技术", "实现",
            "训练", "推理", "微调", "部署", "开源", "代码", "参数", "性能",
            "benchmark", "评测", "基准", "准确率", "效果", "优化",
        ]
        for keyword in tech_keywords:
            if keyword in text:
                tech_score += 1

        # 投资价值评分
        investment_score = 5  # 基础分
        investment_keywords = [
            "funding", "investment", "series", "raise", "valuation", "investor",
            "acquisition", "merger", "ipo", "exit",
            "融资", "投资", "收购", "合并", "上市", "退出", "估值",
            "亿美元", "亿元", "千万", "轮融资", "天使", "风投", "vc",
            "红杉", "a16z", "软银", "高瓴", "IDG",
        ]
        for keyword in investment_keywords:
            if keyword in text:
                investment_score += 1
        
        # 根据分类调整评分
        if category == "产品发布":
            commercial_score += 2
            investment_score += 1
        elif category == "投资融资":
            commercial_score += 3
            investment_score += 3
        elif category == "技术突破":
            innovation_score += 2
            tech_score += 2
        elif category == "开源项目":
            innovation_score += 1
            tech_score += 1
        
        # 确保评分在0-10之间
        innovation_score = max(0, min(10, innovation_score))
        commercial_score = max(0, min(10, commercial_score))
        tech_score = max(0, min(10, tech_score))
        investment_score = max(0, min(10, investment_score))
        
        # 计算总分
        total_score = (innovation_score + commercial_score + tech_score + investment_score) // 4
        
        return {
            "innovation_score": innovation_score,
            "commercial_score": commercial_score,
            "tech_score": tech_score,
            "investment_score": investment_score,
            "total_score": total_score
        }

if __name__ == "__main__":
    scraper = AIScraper()
    scraper.run_daily_collection()
