#!/usr/bin/env python3
"""
Twitter爬虫模块 - 使用Jina AI Reader提取推文内容
收集AI领域名人、技术大拿的推文和观点
"""

import os
import requests
import sqlite3
import json
import time
import re
from typing import List, Dict, Any
from datetime import datetime, timedelta
import hashlib
from .ai_config import get_ai_api_config

# AI API 配置
AI_API_CONFIG = get_ai_api_config(
    default_model="gpt-5.2-codex",
    default_fallback_models="gpt-5.2,gpt-4.1",
)


class TwitterScraper:
    def __init__(self, db_path: str = "data/ai_hotspots.db"):
        """初始化Twitter爬虫"""
        self.db_path = self._resolve_db_path(db_path)
        self._ensure_db_parent_dir()
        self.min_valid_content_length = 100
        self.max_fetch_attempts = 2
        self.placeholder_markers = [
            "people on x are the first to know",
            "sign up now to get your own personalized timeline",
            "science & technology new york",
            "don’t miss what's happening",
            "don't miss what's happening",
            "join x today",
            "what’s happening",
            "what's happening",
        ]

        # AI领域重要Twitter账号
        self.ai_influencers = {
            # 技术大拿
            "karpathy": "Andrej Karpathy - Tesla AI Director",
            "ylecun": "Yann LeCun - Meta AI Chief",
            "AndrewYNg": "Andrew Ng - AI Pioneer",
            "sama": "Sam Altman - OpenAI CEO",
            "hardmaru": "David Ha - AI Researcher",
            "jerryjliu0": "Jerry Liu - LlamaIndex Creator",
            "emollick": "Ethan Mollick - Wharton AI Professor",

            # 公司官方账号
            "OpenAI": "OpenAI Official",
            "GoogleAI": "Google AI",
            "MetaAI": "Meta AI",
            "DeepMindAI": "DeepMind",
            "AnthropicAI": "Anthropic",
            "MistralAI": "Mistral AI",

            # 投资者和评论家
            "VCInvestor": "VC Investor",
            "paulg": "Paul Graham - Y Combinator",
        }

        # 关键词和话题标签
        self.keywords = [
            "#AI", "#MachineLearning", "#LLM", "#GenerativeAI",
            "#DeepLearning", "#NLP", "#ComputerVision", "#Robotics",
            "#AIStartup", "#AIResearch", "#Transformer", "#BERT",
            "#GPT", "#Claude", "#Gemini", "#Llama"
        ]

        self.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

    @staticmethod
    def _resolve_db_path(db_path: str) -> str:
        if os.path.isabs(db_path):
            return db_path
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(project_root, db_path)

    def _ensure_db_parent_dir(self) -> None:
        parent = os.path.dirname(self.db_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

    def generate_id(self, text: str) -> str:
        """生成唯一的ID"""
        return hashlib.md5(text.encode()).hexdigest()[:12]

    def fetch_twitter_profile_with_jina(self, username: str) -> List[Dict[str, Any]]:
        """
        使用Jina AI Reader获取Twitter用户的推文
        """
        tweets = []
        try:
            # 构建Twitter用户页面URL
            twitter_url = f"https://twitter.com/{username}"
            jina_url = f"https://r.jina.ai/{twitter_url}"

            headers = {
                'User-Agent': self.user_agent,
                'Accept': 'text/plain'
            }

            for attempt in range(1, self.max_fetch_attempts + 1):
                print(f"  📥 通过Jina获取 @{username} 的推文... (尝试 {attempt}/{self.max_fetch_attempts})")
                response = requests.get(jina_url, headers=headers, timeout=15)

                if response.status_code != 200:
                    print(f"  ✗ Jina返回状态码: {response.status_code}")
                    break

                content = response.text

                # 解析推文内容（改进的方式）
                tweets = self._parse_tweets_from_content(content, username)
                if tweets:
                    print(f"  ✓ 成功获取 {len(tweets)} 条推文")
                    break

                if self._looks_like_placeholder_page(content) and attempt < self.max_fetch_attempts:
                    print(f"  ⚠️ 检测到占位内容，准备重试 @{username}")
                    time.sleep(1)
                    continue

                print(f"  ⚠️ @{username} 未解析到有效推文")
                break

        except Exception as e:
            print(f"  ✗ 获取 @{username} 失败: {str(e)}")

        return tweets

    def _normalize_text(self, text: str) -> str:
        """归一化文本，便于规则匹配"""
        normalized = text.lower()
        normalized = normalized.replace("’", "'")
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        return normalized

    def _contains_placeholder_marker(self, text: str) -> bool:
        """判断内容是否包含占位文案"""
        normalized = self._normalize_text(text)
        return any(marker in normalized for marker in self.placeholder_markers)

    def _looks_like_placeholder_page(self, content: str) -> bool:
        """判断整页是否主要为占位信息"""
        if self._contains_placeholder_marker(content):
            return True

        if "Markdown Content:" in content:
            content = content.split("Markdown Content:", 1)[1]
        paragraphs = [p.strip() for p in re.split(r'\n\s*\n+', content) if p.strip()]
        if not paragraphs:
            return True

        placeholder_hits = sum(1 for p in paragraphs if self._contains_placeholder_marker(p))
        return placeholder_hits >= 2

    def _parse_tweets_from_content(self, content: str, username: str) -> List[Dict[str, Any]]:
        """
        从Jina返回的内容中解析推文
        改进版本：更智能地提取实际推文内容
        """
        tweets = []

        # 找到 "Markdown Content:" 之后的内容
        if "Markdown Content:" in content:
            content = content.split("Markdown Content:", 1)[1]

        # 按多个换行符分割段落
        paragraphs = re.split(r'\n\s*\n+', content)

        for para in paragraphs:
            para = para.strip()

            # 跳过太短的段落
            if len(para) < 20:
                continue

            # 跳过明显的元数据或导航
            if any(skip in para.lower() for skip in [
                'image', 'photo', 'profile', 'followers', 'following',
                'verified', 'protected', 'pinned', 'quote', 'reply',
                'retweet', 'like', 'bookmark', 'share', 'more'
            ]):
                continue

            # 跳过只包含用户名或链接的段落
            if para.startswith('@') or para.startswith('http') or len(para.split()) < 5:
                continue

            # 跳过包含大量emoji或特殊字符的段落
            emoji_count = len(re.findall(r'[\U0001F300-\U0001F9FF]', para))
            if emoji_count > len(para) / 10:
                continue

            # 清理段落：移除图片标记、链接等
            cleaned = para
            cleaned = re.sub(r'\!\[Image \d+.*?\]\(.*?\)', '', cleaned)  # 移除图片标记
            cleaned = re.sub(r'\[.*?\]\(.*?\)', '', cleaned)  # 移除链接
            cleaned = re.sub(r'https?://\S+', '', cleaned)  # 移除URL
            cleaned = re.sub(r'@\w+', '', cleaned)  # 移除@提及
            cleaned = re.sub(r'#\w+', '', cleaned)  # 移除话题标签
            cleaned = re.sub(r'\s+', ' ', cleaned).strip()  # 清理多余空格

            if self._contains_placeholder_marker(cleaned):
                print(f"  ↳ 跳过占位内容 @{username}: {cleaned[:80]}")
                continue

            # 如果清理后还有足够的内容
            if len(cleaned) < self.min_valid_content_length:
                print(
                    f"  ↳ 跳过过短内容 @{username}: 长度={len(cleaned)} < {self.min_valid_content_length}"
                )
                continue

            if not re.match(r'^[\d\s\W]+$', cleaned):
                tweets.append({
                    "text": cleaned,
                    "likes": 0,
                    "retweets": 0,
                    "replies": 0
                })

        # 转换为热点格式
        hotspots = []
        for tweet in tweets[:5]:  # 只取前5条
            if len(tweet["text"]) > 20:  # 过滤太短的推文
                hotspot = {
                    "id": self.generate_id(f"{username}_{tweet['text']}"),
                    "title": tweet["text"][:100],  # 标题为推文前100字
                    "content": tweet["text"],
                    "url": f"https://twitter.com/{username}",
                    "source": f"twitter_{username}",
                    "source_type": "twitter",
                    "author": username,
                    "engagement": tweet["likes"] + tweet["retweets"],
                    "category": self._classify_tweet(tweet["text"]),
                    "tags": json.dumps(self._extract_tags_from_tweet(tweet["text"])),
                }
                hotspots.append(hotspot)

        return hotspots

    def _classify_tweet(self, text: str) -> str:
        """分类推文"""
        text_lower = text.lower()

        if any(word in text_lower for word in ["paper", "research", "algorithm", "model", "training"]):
            return "技术突破"
        elif any(word in text_lower for word in ["launch", "release", "announce", "product", "feature"]):
            return "产品发布"
        elif any(word in text_lower for word in ["funding", "investment", "series", "raise", "valuation"]):
            return "投资融资"
        elif any(word in text_lower for word in ["partnership", "collaboration", "regulation", "policy"]):
            return "行业动态"
        else:
            return "市场机会"

    def _extract_tags_from_tweet(self, text: str) -> List[str]:
        """从推文中提取标签"""
        tags = []

        # 提取话题标签
        hashtags = re.findall(r'#\w+', text)
        tags.extend(hashtags[:3])

        # 关键词匹配
        keywords_map = {
            "NLP": ["nlp", "natural language", "language model"],
            "计算机视觉": ["vision", "image", "computer vision", "cv"],
            "强化学习": ["reinforcement learning", "rl", "reward"],
            "生成式AI": ["generative", "generation", "diffusion"],
            "大语言模型": ["llm", "language model", "gpt", "bert"],
            "多模态": ["multimodal", "vision-language", "vl"],
            "自动驾驶": ["autonomous", "self-driving", "autonomous vehicle"],
            "机器人": ["robot", "robotics"],
        }

        text_lower = text.lower()
        for tag, keywords in keywords_map.items():
            if any(kw in text_lower for kw in keywords):
                tags.append(tag)

        return list(set(tags))[:5]  # 去重并限制数量

    def fetch_trending_tweets(self) -> List[Dict[str, Any]]:
        """
        获取Twitter上的AI相关热点推文
        """
        all_tweets = []

        # 获取各个影响者的推文
        for username in self.ai_influencers.keys():
            print(f"\n获取 @{username} 的推文...")
            tweets = self.fetch_twitter_profile_with_jina(username)
            all_tweets.extend(tweets)
            time.sleep(2)  # 礼貌延迟

        return all_tweets

    def save_twitter_hotspot(self, item: Dict[str, Any]):
        """保存Twitter热点到数据库"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # 计算评分
        scores = self._calculate_twitter_scores(item)

        # 生成 AI 摘要
        ai_summary = self._generate_summary(item["title"], item["content"])

        cursor.execute('''
        INSERT OR REPLACE INTO hotspots
        (id, title, content, url, source, category, tags, ai_summary,
         innovation_score, commercial_score, tech_score, investment_score, total_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            item["id"],
            item["title"][:200],
            item["content"][:1000],
            item["url"],
            item["source"],
            item["category"],
            item["tags"],
            ai_summary,
            scores["innovation_score"],
            scores["commercial_score"],
            scores["tech_score"],
            scores["investment_score"],
            scores["total_score"]
        ))

        conn.commit()
        conn.close()

    def _generate_summary(self, title: str, content: str) -> str:
        """使用 AI API 生成推文摘要"""
        if not content or len(content.strip()) < 10:
            return ""
        if not AI_API_CONFIG.get("api_key"):
            return ""

        prompt = f"""请为以下Twitter推文生成一个简洁的中文摘要（30-50字），突出核心观点：

推文标题：{title}

推文内容：{content[:500]}

请直接返回中文摘要，不要其他内容。"""

        try:
            headers = {
                "Authorization": f"Bearer {AI_API_CONFIG['api_key']}",
                "Content-Type": "application/json"
            }
            data = {
                "model": AI_API_CONFIG["model"],
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 200,
                "temperature": 0.7
            }
            response = requests.post(
                AI_API_CONFIG["base_url"],
                headers=headers,
                json=data,
                timeout=10
            )
            if response.status_code == 200:
                result = response.json()
                summary = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                return summary.strip() if summary else ""
            else:
                return ""
        except Exception as e:
            return ""

    def _calculate_twitter_scores(self, item: Dict[str, Any]) -> Dict[str, int]:
        """计算Twitter推文的评分"""
        text = (item.get("title", "") + " " + item.get("content", "")).lower()
        engagement = item.get("engagement", 0)

        # 基础分
        innovation_score = 5
        commercial_score = 5
        tech_score = 5
        investment_score = 5

        # 根据内容关键词调整
        innovation_keywords = ["breakthrough", "novel", "innovative", "new", "first", "突破", "创新"]
        commercial_keywords = ["product", "launch", "market", "business", "产品", "发布", "市场"]
        tech_keywords = ["algorithm", "model", "training", "deploy", "算法", "模型", "训练"]
        investment_keywords = ["funding", "investment", "series", "raise", "融资", "投资"]

        for keyword in innovation_keywords:
            if keyword in text:
                innovation_score += 1

        for keyword in commercial_keywords:
            if keyword in text:
                commercial_score += 1

        for keyword in tech_keywords:
            if keyword in text:
                tech_score += 1

        for keyword in investment_keywords:
            if keyword in text:
                investment_score += 1

        # 根据互动数调整（互动多说明重要）
        engagement_boost = min(engagement // 1000, 2)  # 最多加2分
        innovation_score += engagement_boost
        commercial_score += engagement_boost

        # 限制分数范围
        innovation_score = min(innovation_score, 10)
        commercial_score = min(commercial_score, 10)
        tech_score = min(tech_score, 10)
        investment_score = min(investment_score, 10)

        # 计算总分
        total_score = int((innovation_score * 0.3 + commercial_score * 0.3 +
                          tech_score * 0.2 + investment_score * 0.2))

        return {
            "innovation_score": innovation_score,
            "commercial_score": commercial_score,
            "tech_score": tech_score,
            "investment_score": investment_score,
            "total_score": min(total_score, 10)
        }

    def run_twitter_collection(self) -> int:
        """执行Twitter热点收集"""
        print("\n" + "="*50)
        print("🐦 开始收集Twitter AI热点...")
        print("="*50)

        tweets = self.fetch_trending_tweets()

        if not tweets:
            print("⚠️ 未获取到任何推文")
            return 0

        # 保存所有推文
        for tweet in tweets:
            self.save_twitter_hotspot(tweet)

        print(f"\n✓ 成功收集 {len(tweets)} 条Twitter推文")
        return len(tweets)
