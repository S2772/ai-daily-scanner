#!/usr/bin/env python3
"""
AI热点日报 Dashboard Web应用（标准库版）
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import traceback
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATE_FILE = BASE_DIR / "templates" / "index.html"
DB_PATH = str(BASE_DIR / "data" / "ai_hotspots.db")
SUMMARY_AGENT_SOUL = Path.home() / ".openclaw" / "workspace-summary" / "SOUL.md"

from src.scraper import AIScraper
import requests


# AI API 配置
AI_API_CONFIG = {
    "base_url": os.getenv("AI_API_BASE_URL", "https://bobdong.cn/v1/chat/completions"),
    "api_key": os.getenv("AI_API_KEY", "sk-pkTNOMFFkTCohLxN8Fswqhr5pCbPxypDHRy8hoATEFbIO2El"),
    "model": os.getenv("AI_API_MODEL", "claude-sonnet-4"),
    "fallback_models": [
        m.strip()
        for m in os.getenv("AI_API_FALLBACK_MODELS", "claude-sonnet-3.5,gpt-5.2,gpt-4.1").split(",")
        if m.strip()
    ],
}

def _load_summary_system_prompt() -> str:
    try:
        return SUMMARY_AGENT_SOUL.read_text(encoding="utf-8")
    except Exception:
        return ""

def _contains_chinese(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text or ""))

def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()

def _strip_code_fence(text: str) -> str:
    content = (text or "").strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return content

def _call_openclaw_agent(prompt: str, timeout: int = 45) -> str:
    enabled = (os.getenv("OPENCLAW_TRANSLATION_FALLBACK", "1") or "").strip().lower()
    if enabled not in {"1", "true", "yes"}:
        return ""
    if not shutil.which("openclaw"):
        return ""

    agent_id = (os.getenv("OPENCLAW_TRANSLATION_AGENT", "main") or "main").strip()
    cmd = ["openclaw", "agent", "--agent", agent_id, "--message", prompt, "--json"]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except Exception:
        return ""

    if proc.returncode != 0:
        return ""

    try:
        payload = json.loads(proc.stdout or "{}")
        blocks = payload.get("result", {}).get("payloads", [])
        if blocks and isinstance(blocks[0], dict):
            return _clean_text(str(blocks[0].get("text", "")))
    except Exception:
        pass
    return ""

def _extract_json_payload(text: str) -> Dict[str, Any]:
    content = _strip_code_fence(text)
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    match = re.search(r"\{[\s\S]*\}", content)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return {}

def _call_chat_completion(messages: List[Dict[str, str]], max_tokens: int = 800, temperature: float = 0.5, timeout: int = 45) -> str:
    models: List[str] = []
    primary = str(AI_API_CONFIG.get("model", "")).strip()
    if primary:
        models.append(primary)
    for m in AI_API_CONFIG.get("fallback_models", []):
        if m not in models:
            models.append(m)
    if not models:
        models = ["gpt-5.2-codex"]

    headers = {
        "Authorization": f"Bearer {AI_API_CONFIG['api_key']}",
        "Content-Type": "application/json",
    }
    last_error = ""
    for model in models:
        data = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        try:
            resp = requests.post(AI_API_CONFIG["base_url"], headers=headers, json=data, timeout=timeout)
        except Exception as exc:
            last_error = f"{model}:request_failed:{exc}"
            continue
        if resp.status_code != 200:
            last_error = f"{model}:upstream_status_{resp.status_code}"
            continue
        try:
            content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            if content:
                return content
            last_error = f"{model}:empty_content"
        except Exception as exc:
            last_error = f"{model}:invalid_json:{exc}"
            continue
    raise RuntimeError(last_error or "all_models_failed")

def _translate_title_to_chinese(title: str) -> str:
    title = _clean_text(title)
    if not title:
        return ""
    if _contains_chinese(title):
        return title
    prompt = f"请把下面标题翻译成简体中文，只返回译文，不要解释：\n{title}"
    try:
        translated = _strip_code_fence(_call_chat_completion([{"role": "user", "content": prompt}], max_tokens=120, temperature=0.2, timeout=30))
        translated = translated.splitlines()[0].strip().strip('"')
        if translated and _contains_chinese(translated):
            return translated
    except Exception:
        pass

    translated = _call_openclaw_agent(
        f"请把下面标题翻译成简体中文，只返回译文，不要解释：\n{title}",
        timeout=35,
    )
    if translated and _contains_chinese(translated):
        return translated

    return title

def _translate_summary_to_chinese(summary: str) -> str:
    summary = _clean_text(summary)
    if not summary:
        return summary
    if _contains_chinese(summary):
        zh_count = len(re.findall(r"[\u4e00-\u9fff]", summary))
        en_count = len(re.findall(r"[A-Za-z]", summary))
        if zh_count > 0 and en_count <= zh_count * 2:
            return summary
    prompt = f"请把下面内容翻译成简体中文，并保持信息完整：\n{summary[:1000]}"
    try:
        translated = _strip_code_fence(_call_chat_completion([{"role": "user", "content": prompt}], max_tokens=450, temperature=0.2, timeout=35))
        translated = _clean_text(translated)
        if translated and _contains_chinese(translated):
            return translated
    except Exception:
        pass

    translated = _call_openclaw_agent(
        f"请把下面内容翻译成简体中文，并保持信息完整：\n{summary[:1000]}",
        timeout=45,
    )
    if translated and _contains_chinese(translated):
        return translated

    return summary

def _fallback_summary(text: str, title: str = "") -> str:
    cleaned = _clean_text(text)
    if not cleaned:
        return "暂无可用内容。"
    lowered = cleaned.lower()
    broken_signals = [
        "the media could not be played",
        "temporarily unavailable",
        "access denied",
        "unsupported browser",
        "content is unavailable",
    ]
    if any(signal in lowered for signal in broken_signals):
        return "原文抓取失败，源站返回了错误提示文案。请稍后重试抓取或检查该来源是否可访问。"
    if _contains_chinese(cleaned):
        return f"{cleaned[:220]}..."
    if len(cleaned) <= 260:
        return f"原文摘录：{cleaned}"
    return f"原文要点摘录：{cleaned[:260]}..."

def generate_ai_summary(text: str, title: str = "") -> Dict[str, str]:
    """调用 summary agent 生成深度中文摘要，返回 {"summary": str, "title_zh": str}"""
    if not text or len(text.strip()) < 10:
        return {"summary": "内容太短，无法生成摘要", "title_zh": _translate_title_to_chinese(title)}

    system_prompt = _load_summary_system_prompt().strip()
    user_msg = f"""请对以下AI热点内容生成中文摘要。

**输出格式**（必须严格遵守）：
```json
{{
  "summary": "150-220字的简体中文摘要，结构清晰，直击重点",
  "title_zh": "中文标题"
}}
```

**要求**：
1. summary 必须是简体中文，不要加"原文摘录："等前缀
2. title_zh 必须是中文（如果原标题已经是中文就保持原样）
3. 只返回 JSON 对象，不要有其他文字

**原文**：
标题：{title}
内容：{text[:3500]}"""

    messages: List[Dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_msg})

    fallback_title = _translate_title_to_chinese(title)
    last_error = ""
    for attempt in range(2):
        try:
            content = _call_chat_completion(messages, max_tokens=800 if attempt == 0 else 500, temperature=0.4 if attempt == 0 else 0.2)
            if not content:
                last_error = "empty_response"
                continue

            parsed = _extract_json_payload(content)
            if parsed and parsed.get("summary"):
                summary = _clean_text(str(parsed.get("summary", "")))
                title_zh = _clean_text(str(parsed.get("title_zh", "")))
            else:
                # JSON 解析失败，尝试从文本中提取
                clean_content = content.strip()
                # 移除常见前缀
                for prefix in ["原文摘录：", "原文要点摘录：", "摘要：", "Summary:", "内容摘要："]:
                    if clean_content.startswith(prefix):
                        clean_content = clean_content[len(prefix):].strip()
                summary = _clean_text(clean_content)
                title_zh = ""

            if not summary:
                last_error = "empty_summary"
                continue

            summary = _translate_summary_to_chinese(summary)
            if not _contains_chinese(summary):
                summary = _fallback_summary(text, title)

            if not title_zh:
                title_zh = fallback_title
            elif not _contains_chinese(title_zh):
                title_zh = _translate_title_to_chinese(title_zh)

            if not title_zh:
                title_zh = fallback_title

            return {"summary": summary[:600], "title_zh": title_zh}
        except Exception as exc:
            last_error = str(exc)

    fallback_summary = _fallback_summary(text, title)
    fallback_summary = _translate_summary_to_chinese(fallback_summary)
    return {"summary": fallback_summary, "title_zh": fallback_title}


def init_sources_meta_table(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sources_meta (
            id TEXT PRIMARY KEY,
            tags TEXT DEFAULT '[]',
            status TEXT DEFAULT 'active',
            notes TEXT DEFAULT '',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()


def fetch_wewe_feed_info() -> Dict[str, Dict[str, str]]:
    """Fetch feed names+intros from WeWe RSS API. Returns {mp_id: {name, intro}}"""
    try:
        resp = requests.get("http://localhost:4000/feeds", timeout=5)
        if resp.status_code == 200:
            feeds = resp.json()
            if isinstance(feeds, list):
                return {f["id"]: {"name": f.get("name", f["id"]), "intro": f.get("intro", "")} for f in feeds}
    except Exception:
        pass
    return {}


def load_all_sources(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """Load all sources from sources.json + WeWe API + SQLite meta."""
    sources_file = BASE_DIR / "sources.json"
    if not sources_file.exists():
        return []

    data = json.loads(sources_file.read_text(encoding="utf-8"))
    wewe_info = fetch_wewe_feed_info()

    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, tags, status, notes FROM sources_meta")
        meta_rows: Dict[str, Any] = {row["id"]: row for row in cursor.fetchall()}
    except sqlite3.OperationalError:
        meta_rows = {}

    def get_meta(src_id: str) -> Dict[str, Any]:
        row = meta_rows.get(src_id)
        if row and row["status"] == "deleted":
            return {"_deleted": True, "tags": [], "status": "deleted", "notes": ""}
        tags: List[str] = []
        if row:
            try:
                tags = json.loads(row["tags"] or "[]")
            except Exception:
                tags = []
        return {
            "tags": tags,
            "status": (row["status"] if row else "active"),
            "notes": (row["notes"] if row else ""),
        }

    sources: List[Dict[str, Any]] = []

    for url in data.get("rss_feeds", []):
        if "localhost:4000" in url:
            mp_id = url.split("/feeds/")[-1].replace(".atom", "")
            src_id = f"wechat_{mp_id}"
            meta = get_meta(src_id)
            if meta.get("_deleted"):
                continue
            info = wewe_info.get(mp_id, {})
            sources.append({
                "id": src_id, "type": "wechat", "category": "微信公众号",
                "name": info.get("name", mp_id), "url": url,
                "note": info.get("intro", ""),
                **{k: v for k, v in meta.items() if k != "_deleted"},
            })
        else:
            src_id = "rss_" + hashlib.md5(url.encode()).hexdigest()[:8]
            meta = get_meta(src_id)
            if meta.get("_deleted"):
                continue
            name = url.split("//")[-1].split("/")[0]
            sources.append({
                "id": src_id, "type": "rss", "category": "RSS订阅",
                "name": name, "url": url, "note": "",
                **{k: v for k, v in meta.items() if k != "_deleted"},
            })

    for username in data.get("twitter_profiles", []):
        src_id = f"twitter_{username}"
        meta = get_meta(src_id)
        if meta.get("_deleted"):
            continue
        sources.append({
            "id": src_id, "type": "twitter", "category": "Twitter博主",
            "name": f"@{username}", "url": f"https://twitter.com/{username}", "note": "",
            **{k: v for k, v in meta.items() if k != "_deleted"},
        })

    for item in data.get("official_research_blogs", []):
        src_id = "blog_" + hashlib.md5(item["name"].encode()).hexdigest()[:8]
        meta = get_meta(src_id)
        if meta.get("_deleted"):
            continue
        sources.append({
            "id": src_id, "type": "official_blog", "category": "官方研究博客",
            "name": item["name"], "url": item.get("url", ""), "note": item.get("note", ""),
            **{k: v for k, v in meta.items() if k != "_deleted"},
        })

    for item in data.get("cn_model_labs", []):
        src_id = "cnlab_" + hashlib.md5(item["name"].encode()).hexdigest()[:8]
        meta = get_meta(src_id)
        if meta.get("_deleted"):
            continue
        sources.append({
            "id": src_id, "type": "cn_model_lab", "category": "国内模型实验室",
            "name": item["name"], "url": item.get("url", ""), "note": item.get("note", ""),
            **{k: v for k, v in meta.items() if k != "_deleted"},
        })

    for item in data.get("thought_leaders", {}).get("tech_giants", []):
        src_id = "leader_tech_" + hashlib.md5(item["name"].encode()).hexdigest()[:8]
        meta = get_meta(src_id)
        if meta.get("_deleted"):
            continue
        sources.append({
            "id": src_id, "type": "thought_leader", "category": "思想领袖",
            "name": item["name"], "url": "", "note": item.get("note", ""),
            **{k: v for k, v in meta.items() if k != "_deleted"},
        })

    for item in data.get("thought_leaders", {}).get("business_leaders", []):
        src_id = "leader_biz_" + hashlib.md5(item["name"].encode()).hexdigest()[:8]
        meta = get_meta(src_id)
        if meta.get("_deleted"):
            continue
        sources.append({
            "id": src_id, "type": "thought_leader", "category": "思想领袖",
            "name": item["name"], "url": "", "note": item.get("note", ""),
            **{k: v for k, v in meta.items() if k != "_deleted"},
        })

    for item in data.get("podcasts_and_platforms", []):
        src_id = "podcast_" + hashlib.md5(item["name"].encode()).hexdigest()[:8]
        meta = get_meta(src_id)
        if meta.get("_deleted"):
            continue
        sources.append({
            "id": src_id, "type": "podcast", "category": "播客/平台",
            "name": item["name"], "url": item.get("url", ""), "note": item.get("note", ""),
            **{k: v for k, v in meta.items() if k != "_deleted"},
        })

    for item in data.get("industry_analysis", []):
        src_id = "industry_" + hashlib.md5(item["name"].encode()).hexdigest()[:8]
        meta = get_meta(src_id)
        if meta.get("_deleted"):
            continue
        sources.append({
            "id": src_id, "type": "industry", "category": "产业分析",
            "name": item["name"], "url": item.get("url", ""), "note": item.get("note", ""),
            **{k: v for k, v in meta.items() if k != "_deleted"},
        })

    for item in data.get("investment_institutions", []):
        src_id = "invest_" + hashlib.md5(item["name"].encode()).hexdigest()[:8]
        meta = get_meta(src_id)
        if meta.get("_deleted"):
            continue
        sources.append({
            "id": src_id, "type": "investment", "category": "投资机构",
            "name": item["name"], "url": item.get("url", ""), "note": item.get("note", ""),
            **{k: v for k, v in meta.items() if k != "_deleted"},
        })

    return sources


def connect_db() -> sqlite3.Connection:
    (BASE_DIR / "data").mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")

    # 确保核心表存在，避免新库或空库时直接查询导致 500
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS hotspots (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT,
            url TEXT,
            source TEXT,
            category TEXT,
            tags TEXT,
            ai_summary TEXT,
            innovation_score INTEGER DEFAULT 0,
            commercial_score INTEGER DEFAULT 0,
            tech_score INTEGER DEFAULT 0,
            investment_score INTEGER DEFAULT 0,
            total_score INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
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
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            hotspot_id TEXT,
            content TEXT,
            tags TEXT,
            is_important BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (hotspot_id) REFERENCES hotspots (id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS source_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            source_type TEXT NOT NULL,
            status TEXT NOT NULL,
            item_count INTEGER DEFAULT 0,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # 数据库迁移：添加缺失列
    cursor = conn.cursor()
    for col, ddl in [("ai_summary", "TEXT"), ("title_zh", "TEXT")]:
        try:
            cursor.execute(f"SELECT {col} FROM hotspots LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute(f"ALTER TABLE hotspots ADD COLUMN {col} {ddl}")
            conn.commit()

    return conn


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: Dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(body)


def serialize_hotspot(row: sqlite3.Row) -> Dict[str, Any]:
    tags_raw = row["tags"] or "[]"
    try:
        tags = json.loads(tags_raw)
    except json.JSONDecodeError:
        tags = []

    try:
        ai_summary = row["ai_summary"] or ""
    except (IndexError, KeyError):
        ai_summary = ""

    try:
        title_zh = row["title_zh"] or ""
    except (IndexError, KeyError):
        title_zh = ""

    return {
        "id": row["id"],
        "title": row["title"],
        "content": row["content"] or "",
        "url": row["url"] or "",
        "source": row["source"] or "",
        "category": row["category"] or "",
        "tags": tags,
        "ai_summary": ai_summary,
        "title_zh": title_zh,
        "innovation_score": row["innovation_score"],
        "commercial_score": row["commercial_score"],
        "tech_score": row["tech_score"],
        "investment_score": row["investment_score"],
        "total_score": row["total_score"],
        "created_at": row["created_at"],
    }


class DashboardHandler(BaseHTTPRequestHandler):
    def _handle_uncaught_error(self, exc: Exception) -> None:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        detail = f"{exc.__class__.__name__}: {exc}"
        traceback.print_exc()

        if self.path.startswith("/api/"):
            json_response(
                self,
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {
                    "ok": False,
                    "error": "服务内部错误，请稍后重试",
                    "timestamp": timestamp,
                    "detail": detail,
                },
            )
            return

        self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, "Internal Server Error")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            query = parse_qs(parsed.query)

            if path == "/":
                self.serve_dashboard()
                return
            if path.startswith("/static/"):
                self.serve_static(path)
                return
            if path == "/api/summary":
                self.handle_summary(query)
                return
            if path == "/api/trend":
                self.handle_trend(query)
                return
            if path == "/api/latest-date":
                self.handle_latest_date()
                return
            if path == "/api/hotspots":
                self.handle_hotspots(query)
                return
            if path == "/api/hotspots-source-groups":
                self.handle_hotspot_source_groups(query)
                return
            if path.startswith("/api/hotspots/"):
                hotspot_id = path[len("/api/hotspots/"):]
                if hotspot_id:
                    self.handle_hotspot_detail(hotspot_id)
                    return
            if path == "/api/source-status":
                self.handle_source_status(query)
                return
            if path == "/api/opportunities":
                self.handle_opportunities(query)
                return
            if path == "/api/notes":
                self.handle_notes(query)
                return
            if path == "/api/export":
                self.handle_export(query)
                return
            if path == "/api/generate-summary":
                self.handle_generate_summary(query)
                return
            if path == "/api/regen-summaries":
                self.handle_regen_summaries()
                return
            if path == "/api/sources":
                self.handle_sources_get()
                return
            if path == "/api/collect-runs":
                self.handle_collect_runs(query)
                return

            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
        except Exception as exc:
            self._handle_uncaught_error(exc)

    def do_POST(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/api/collect":
                self.handle_collect()
                return
            if parsed.path == "/api/notes":
                self.handle_add_note()
                return
            if parsed.path == "/api/sources":
                self.handle_sources_post()
                return
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
        except Exception as exc:
            self._handle_uncaught_error(exc)

    def do_PUT(self) -> None:
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            if path.startswith("/api/sources/"):
                src_id = path[len("/api/sources/"):]
                if src_id:
                    self.handle_sources_put(src_id)
                    return
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
        except Exception as exc:
            self._handle_uncaught_error(exc)

    def do_DELETE(self) -> None:
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            if path.startswith("/api/sources/"):
                src_id = path[len("/api/sources/"):]
                if src_id:
                    self.handle_sources_delete(src_id)
                    return
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
        except Exception as exc:
            self._handle_uncaught_error(exc)

    def serve_dashboard(self) -> None:
        if not TEMPLATE_FILE.exists():
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, "dashboard template missing")
            return
        html = TEMPLATE_FILE.read_text(encoding="utf-8")
        today = datetime.now().strftime("%Y-%m-%d")
        html = html.replace("__TODAY__", today)
        body = html.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, path: str) -> None:
        rel = path[len("/static/") :]
        file_path = (STATIC_DIR / rel).resolve()
        if STATIC_DIR.resolve() not in file_path.parents and file_path != STATIC_DIR.resolve():
            self.send_error(HTTPStatus.FORBIDDEN, "Forbidden")
            return
        if not file_path.exists() or not file_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File Not Found")
            return

        content_type = "text/plain; charset=utf-8"
        if file_path.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif file_path.suffix == ".js":
            content_type = "application/javascript; charset=utf-8"

        body = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _query_date(self, query: Dict[str, List[str]]) -> str:
        return query.get("date", [datetime.now().strftime("%Y-%m-%d")])[0]

    def _build_date_filter(
        self, query: Dict[str, List[str]], column: str
    ) -> Tuple[str, List[str], Dict[str, str]]:
        all_time = (query.get("all_time", [""])[0] or "").strip().lower()
        date = (query.get("date", [""])[0] or "").strip()
        start_date = (query.get("start_date", [""])[0] or "").strip()
        end_date = (query.get("end_date", [""])[0] or "").strip()

        if all_time in {"1", "true", "yes"}:
            return "1=1", [], {"all_time": "1"}

        if date:
            return f"date({column}) = date(?)", [date], {"date": date}

        if start_date or end_date:
            start = start_date or end_date
            end = end_date or start_date
            if start and end and start > end:
                start, end = end, start
            return (
                f"date({column}) BETWEEN date(?) AND date(?)",
                [start or "", end or ""],
                {"start_date": start or "", "end_date": end or ""},
            )

        today = datetime.now().strftime("%Y-%m-%d")
        return f"date({column}) = date(?)", [today], {"date": today}

    def handle_collect_runs(self, query: Dict[str, List[str]]) -> None:
        try:
            limit = int(query.get("limit", ["30"])[0])
        except ValueError:
            limit = 30
        limit = max(1, min(200, limit))

        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, started_at, finished_at, status,
                   hotspots_inserted, opportunities_count,
                   sources_success, sources_empty, sources_error,
                   items_total, items_new, items_existing,
                   notes
            FROM collect_runs
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        runs = [dict(r) for r in cursor.fetchall()]

        # attach date breakdown
        for r in runs:
            cursor.execute(
                """
                SELECT content_date, item_count
                FROM collect_run_date_breakdown
                WHERE run_id = ?
                ORDER BY content_date DESC
                """,
                (r["id"],),
            )
            r["date_breakdown"] = [dict(x) for x in cursor.fetchall()]

        conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True, "runs": runs})

    def handle_collect(self) -> None:
        started_at = datetime.now()
        scraper = AIScraper(DB_PATH)

        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO collect_runs (started_at, status)
            VALUES (?, ?)
            """,
            (started_at.strftime("%Y-%m-%d %H:%M:%S"), "running"),
        )
        run_id = cursor.lastrowid
        conn.commit()

        try:
            hotspots_count, opportunities_count = scraper.run_daily_collection()

            # Aggregate run stats
            cursor.execute(
                """
                SELECT
                  SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success_cnt,
                  SUM(CASE WHEN status='empty' THEN 1 ELSE 0 END) AS empty_cnt,
                  SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS error_cnt
                FROM source_status
                WHERE date(created_at) = date('now')
                """
            )
            row = cursor.fetchone() or {}
            sources_success = int(row.get("success_cnt") or 0)
            sources_empty = int(row.get("empty_cnt") or 0)
            sources_error = int(row.get("error_cnt") or 0)

            # Date breakdown (content date = date(published_at) if available else date(created_at))
            cursor.execute("DELETE FROM collect_run_date_breakdown WHERE run_id = ?", (run_id,))
            cursor.execute(
                """
                INSERT INTO collect_run_date_breakdown (run_id, content_date, item_count)
                SELECT ?,
                       COALESCE(NULLIF(date(published_at), ''), date(created_at)) AS content_date,
                       COUNT(*) AS cnt
                FROM hotspots
                WHERE date(created_at) = date('now')
                GROUP BY COALESCE(NULLIF(date(published_at), ''), date(created_at))
                """,
                (run_id,),
            )

            finished_at = datetime.now()
            # Run-level dedupe stats (soft-dedupe means: existing (url,source) row is updated)
            cursor.execute(
                """
                SELECT COUNT(*) AS items_total,
                       SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS items_new
                FROM hotspots
                """,
                (
                    started_at.strftime("%Y-%m-%d %H:%M:%S"),
                    finished_at.strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )
            items_row = cursor.fetchone() or {}
            items_total = int(items_row.get("items_total") or 0)
            items_new = int(items_row.get("items_new") or 0)
            items_existing = max(0, int(hotspots_count or 0) - items_new)

            cursor.execute(
                """
                UPDATE collect_runs
                SET finished_at = ?,
                    status = ?,
                    hotspots_inserted = ?,
                    opportunities_count = ?,
                    sources_success = ?,
                    sources_empty = ?,
                    sources_error = ?,
                    items_total = ?,
                    items_new = ?,
                    items_existing = ?
                WHERE id = ?
                """,
                (
                    finished_at.strftime("%Y-%m-%d %H:%M:%S"),
                    "success",
                    int(hotspots_count or 0),
                    int(opportunities_count or 0),
                    sources_success,
                    sources_empty,
                    sources_error,
                    items_total,
                    items_new,
                    items_existing,
                    run_id,
                ),
            )
            conn.commit()

            json_response(
                self,
                HTTPStatus.OK,
                {
                    "ok": True,
                    "run_id": run_id,
                    "hotspots_count": hotspots_count,
                    "opportunities_count": opportunities_count,
                    "collected_at": finished_at.strftime("%Y-%m-%d %H:%M:%S"),
                },
            )
        except Exception as exc:
            finished_at = datetime.now()
            cursor.execute(
                """
                UPDATE collect_runs
                SET finished_at = ?, status = ?, notes = ?
                WHERE id = ?
                """,
                (finished_at.strftime("%Y-%m-%d %H:%M:%S"), "error", str(exc), run_id),
            )
            conn.commit()
            raise
        finally:
            conn.close()

    def handle_summary(self, query: Dict[str, List[str]]) -> None:
        hs_where, hs_params, range_meta = self._build_date_filter(query, "created_at")
        opp_where, opp_params, _ = self._build_date_filter(query, "created_at")
        note_where, note_params, _ = self._build_date_filter(query, "created_at")
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(f"SELECT COUNT(*) AS cnt FROM hotspots WHERE {hs_where}", tuple(hs_params))
        hotspot_count = cursor.fetchone()["cnt"]
        cursor.execute(
            f"SELECT COUNT(*) AS cnt FROM opportunities WHERE {opp_where}",
            tuple(opp_params),
        )
        opportunity_count = cursor.fetchone()["cnt"]
        cursor.execute(f"SELECT COUNT(*) AS cnt FROM notes WHERE {note_where}", tuple(note_params))
        note_count = cursor.fetchone()["cnt"]
        conn.close()
        payload: Dict[str, Any] = {
            "ok": True,
            "hotspot_count": hotspot_count,
            "opportunity_count": opportunity_count,
            "note_count": note_count,
        }
        payload.update(range_meta)
        json_response(
            self,
            HTTPStatus.OK,
            payload,
        )

    def handle_trend(self, query: Dict[str, List[str]]) -> None:
        days = int(query.get("days", ["30"])[0])
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT date(created_at) AS d, COUNT(*) AS cnt,
                   AVG(total_score) AS avg_score
            FROM hotspots
            GROUP BY date(created_at)
            ORDER BY d DESC
            LIMIT ?
            """,
            (days,),
        )
        rows = cursor.fetchall()
        cursor.execute(
            """
            SELECT category, COUNT(*) AS cnt
            FROM hotspots
            GROUP BY category
            ORDER BY cnt DESC
            """,
        )
        cat_rows = cursor.fetchall()
        cursor.execute(
            """
            SELECT COUNT(DISTINCT source) AS cnt FROM hotspots
            """
        )
        sources_row = cursor.fetchone()
        conn.close()

        trend = [{"date": r["d"], "count": r["cnt"], "avg_score": round(r["avg_score"] or 0, 1)} for r in rows]
        trend.reverse()
        categories = [{"category": r["category"], "count": r["cnt"]} for r in cat_rows]
        json_response(self, HTTPStatus.OK, {
            "ok": True,
            "trend": trend,
            "categories": categories,
            "total_sources": sources_row["cnt"] if sources_row else 0,
        })

    def handle_latest_date(self) -> None:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT date(created_at) AS d
            FROM hotspots
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
        row = cursor.fetchone()
        conn.close()
        latest_date = row["d"] if row and row["d"] else ""
        json_response(self, HTTPStatus.OK, {"ok": True, "latest_date": latest_date})

    def handle_hotspots(self, query: Dict[str, List[str]]) -> None:
        where_clause, where_params, range_meta = self._build_date_filter(query, "created_at")
        limit = int(query.get("limit", ["50"])[0])
        fill_missing_raw = (query.get("fill_missing", [""])[0] or "").strip().lower()
        fill_missing = fill_missing_raw in {"1", "true", "yes"}
        try:
            fill_missing_max_limit = max(
                1, int(os.getenv("HOTSPOT_FILL_MISSING_MAX_LIMIT", "100"))
            )
        except ValueError:
            fill_missing_max_limit = 100
        if fill_missing and limit > fill_missing_max_limit:
            fill_missing = False
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT id, title, content, url, source, category, tags, ai_summary, title_zh,
                   innovation_score, commercial_score, tech_score,
                   investment_score, total_score, created_at
            FROM hotspots
            WHERE {where_clause}
            ORDER BY total_score DESC, created_at DESC
            LIMIT ?
            """,
            (*where_params, limit),
        )
        rows = cursor.fetchall()

        hotspots = [serialize_hotspot(row) for row in rows]
        generated_count = 0

        if fill_missing:
            try:
                max_generate = max(1, min(20, int(os.getenv("HOTSPOT_FILL_MISSING_LIMIT", "3"))))
            except ValueError:
                max_generate = 3
            for hotspot in hotspots:
                content = hotspot.get("content", "")
                title = hotspot.get("title", "")
                ai_summary_text = str(hotspot.get("ai_summary") or "")
                needs_summary = (
                    (not ai_summary_text)
                    or ai_summary_text.startswith("API错误")
                    or ai_summary_text.startswith("生成失败")
                    or ("AI摘要服务暂时繁忙" in ai_summary_text)
                )
                needs_title_zh = not hotspot.get("title_zh")

                if (needs_summary or needs_title_zh) and generated_count < max_generate:
                    summary_text = ai_summary_text
                    title_zh = hotspot.get("title_zh", "")
                    summary_input = content if content and len(content) > 20 else title

                    if needs_summary and summary_input:
                        result = generate_ai_summary(summary_input, title)
                        summary_text = result.get("summary", summary_text)
                        title_zh = result.get("title_zh", title_zh)
                    elif needs_title_zh:
                        title_zh = _translate_title_to_chinese(title)
                    if needs_summary and not summary_text:
                        summary_text = _fallback_summary(summary_input, title)

                    try:
                        cursor.execute(
                            "UPDATE hotspots SET ai_summary = ?, title_zh = ? WHERE id = ?",
                            (summary_text, title_zh, hotspot["id"])
                        )
                        hotspot["ai_summary"] = summary_text
                        hotspot["title_zh"] = title_zh
                        generated_count += 1
                    except sqlite3.OperationalError:
                        pass

            if generated_count > 0:
                try:
                    conn.commit()
                except sqlite3.OperationalError:
                    pass
        conn.close()
        payload: Dict[str, Any] = {"ok": True, "hotspots": hotspots, "generated": generated_count}
        payload.update(range_meta)
        json_response(self, HTTPStatus.OK, payload)

    def handle_hotspot_source_groups(self, query: Dict[str, List[str]]) -> None:
        where_clause, where_params, range_meta = self._build_date_filter(query, "created_at")
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT source, COUNT(*) AS cnt
            FROM hotspots
            WHERE {where_clause}
            GROUP BY source
            ORDER BY cnt DESC, source ASC
            """,
            tuple(where_params),
        )
        rows = cursor.fetchall()
        conn.close()

        grouped = [{"source": row["source"] or "", "count": row["cnt"]} for row in rows]
        json_response(self, HTTPStatus.OK, {"ok": True, "sources": grouped, **range_meta})

    def handle_hotspot_detail(self, hotspot_id: str) -> None:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, title, content, url, source, category, tags, ai_summary, title_zh,
                   innovation_score, commercial_score, tech_score,
                   investment_score, total_score, created_at
            FROM hotspots WHERE id = ?
            """,
            (hotspot_id,),
        )
        row = cursor.fetchone()
        conn.close()
        if not row:
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
            return
        json_response(self, HTTPStatus.OK, {"ok": True, "hotspot": serialize_hotspot(row)})

    def handle_opportunities(self, query: Dict[str, List[str]]) -> None:
        where_clause, where_params, range_meta = self._build_date_filter(query, "created_at")
        limit = int(query.get("limit", ["20"])[0])
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT id, title, description, category, potential_score,
                   competition_level, resources_needed, timeline, pain_points,
                   blue_ocean_opportunity, monetization_potential, domains, priority, created_at
            FROM opportunities
            WHERE {where_clause}
            ORDER BY potential_score DESC, created_at DESC
            LIMIT ?
            """,
            (*where_params, limit),
        )
        rows = cursor.fetchall()
        conn.close()
        opportunities: List[Dict[str, Any]] = []
        for row in rows:
            domains = []
            try:
                domains = json.loads(row["domains"] or "[]")
            except (json.JSONDecodeError, TypeError):
                domains = []

            opportunities.append(
                {
                    "id": row["id"],
                    "title": row["title"],
                    "description": row["description"] or "",
                    "category": row["category"] or "",
                    "potential_score": row["potential_score"],
                    "competition_level": row["competition_level"] or "",
                    "resources_needed": row["resources_needed"] or "",
                    "timeline": row["timeline"] or "",
                    "pain_points": row["pain_points"] or "",
                    "blue_ocean_opportunity": row["blue_ocean_opportunity"] or "",
                    "monetization_potential": row["monetization_potential"] or "",
                    "domains": domains,
                    "priority": row["priority"] or "中",
                    "created_at": row["created_at"],
                }
            )
        json_response(
            self,
            HTTPStatus.OK,
            {"ok": True, "opportunities": opportunities, **range_meta},
        )

    def handle_source_status(self, query: Dict[str, List[str]]) -> None:
        where_clause, where_params, range_meta = self._build_date_filter(query, "created_at")
        conn = connect_db()
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"""
                SELECT source, source_type, status, item_count, error_message, created_at
                FROM source_status
                WHERE {where_clause}
                ORDER BY created_at DESC, source ASC
                """,
                tuple(where_params),
            )
            rows = cursor.fetchall()
        except sqlite3.OperationalError:
            rows = []
        conn.close()

        statuses: List[Dict[str, Any]] = []
        for row in rows:
            statuses.append(
                {
                    "source": row["source"],
                    "source_type": row["source_type"],
                    "status": row["status"],
                    "item_count": row["item_count"],
                    "error_message": row["error_message"] or "",
                    "created_at": row["created_at"],
                }
            )

        json_response(self, HTTPStatus.OK, {"ok": True, "source_status": statuses, **range_meta})

    def handle_notes(self, query: Dict[str, List[str]]) -> None:
        where_clause, where_params, range_meta = self._build_date_filter(query, "n.created_at")
        limit = int(query.get("limit", ["50"])[0])
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT n.id, n.hotspot_id, n.content, n.tags, n.created_at,
                   h.title AS hotspot_title
            FROM notes n
            LEFT JOIN hotspots h ON n.hotspot_id = h.id
            WHERE {where_clause}
            ORDER BY n.created_at DESC
            LIMIT ?
            """,
            (*where_params, limit),
        )
        rows = cursor.fetchall()
        conn.close()

        notes: List[Dict[str, Any]] = []
        for row in rows:
            notes.append(
                {
                    "id": row["id"],
                    "hotspot_id": row["hotspot_id"] or "",
                    "hotspot_title": row["hotspot_title"] or "",
                    "content": row["content"] or "",
                    "tags": row["tags"] or "",
                    "created_at": row["created_at"],
                }
            )
        json_response(self, HTTPStatus.OK, {"ok": True, "notes": notes, **range_meta})

    def handle_add_note(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "JSON格式错误"})
            return

        hotspot_id = str(payload.get("hotspot_id", "")).strip()
        note_content = str(payload.get("content", "")).strip()
        tags = str(payload.get("tags", "")).strip()

        if not hotspot_id:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "hotspot_id 不能为空"})
            return
        if not note_content:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "content 不能为空"})
            return

        note_id = hashlib.md5(
            f"{hotspot_id}:{note_content}:{datetime.now().isoformat()}".encode("utf-8")
        ).hexdigest()[:12]

        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO notes (id, hotspot_id, content, tags) VALUES (?, ?, ?, ?)",
            (note_id, hotspot_id, note_content, tags),
        )
        conn.commit()
        conn.close()

        json_response(self, HTTPStatus.OK, {"ok": True, "note_id": note_id})

    def handle_export(self, query: Dict[str, List[str]]) -> None:
        """导出热点数据为CSV格式"""
        date = self._query_date(query)
        export_type = query.get("type", ["hotspots"])[0]
        
        conn = connect_db()
        cursor = conn.cursor()
        
        if export_type == "hotspots":
            cursor.execute(
                """
                SELECT id, title, content, url, source, category, tags,
                       innovation_score, commercial_score, tech_score,
                       investment_score, total_score, created_at
                FROM hotspots
                WHERE date(created_at) = date(?)
                ORDER BY total_score DESC, created_at DESC
                """,
                (date,),
            )
            rows = cursor.fetchall()
            
            # 生成CSV内容
            csv_lines = []
            # 表头
            csv_lines.append("ID,标题,内容,URL,来源,分类,标签,创新度评分,商业潜力评分,技术难度评分,投资价值评分,综合评分,创建时间")
            
            for row in rows:
                tags_raw = row["tags"] or "[]"
                try:
                    tags = json.loads(tags_raw)
                    tags_str = ";".join(tags)
                except json.JSONDecodeError:
                    tags_str = ""
                
                # 转义CSV特殊字符
                title = str(row["title"] or "").replace('"', '""')
                content = str(row["content"] or "").replace('"', '""')
                
                csv_lines.append(
                    f'{row["id"]},"{title}","{content}",{row["url"]},{row["source"]},'
                    f'{row["category"]},"{tags_str}",{row["innovation_score"] or 0},'
                    f'{row["commercial_score"] or 0},{row["tech_score"] or 0},'
                    f'{row["investment_score"] or 0},{row["total_score"] or 0},'
                    f'{row["created_at"]}'
                )
            
            csv_content = "\n".join(csv_lines)
            filename = f"ai_hotspots_{date}.csv"
            
        elif export_type == "opportunities":
            cursor.execute(
                """
                SELECT id, title, description, category, potential_score,
                       competition_level, resources_needed, timeline, created_at
                FROM opportunities
                WHERE date(created_at) = date(?)
                ORDER BY potential_score DESC, created_at DESC
                """,
                (date,),
            )
            rows = cursor.fetchall()
            
            # 生成CSV内容
            csv_lines = []
            # 表头
            csv_lines.append("ID,标题,描述,分类,潜力评分,竞争程度,所需资源,时间线,创建时间")
            
            for row in rows:
                description = str(row["description"] or "").replace('"', '""')
                
                csv_lines.append(
                    f'{row["id"]},"{row["title"]}","{description}",{row["category"]},'
                    f'{row["potential_score"] or 0},{row["competition_level"] or ""},'
                    f'{row["resources_needed"] or ""},{row["timeline"] or ""},'
                    f'{row["created_at"]}'
                )
            
            csv_content = "\n".join(csv_lines)
            filename = f"ai_opportunities_{date}.csv"
        
        else:
            conn.close()
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "不支持的导出类型"})
            return
        
        conn.close()
        
        # 发送CSV文件
        body = csv_content.encode("utf-8-sig")  # UTF-8 with BOM for Excel compatibility
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_generate_summary(self, query: Dict[str, List[str]]) -> None:
        """生成AI中文摘要"""
        text = query.get("text", [""])[0]
        title = query.get("title", [""])[0]

        if not text:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "缺少text参数"})
            return

        result = generate_ai_summary(text, title)
        json_response(self, HTTPStatus.OK, {"ok": True, "summary": result["summary"], "title_zh": result["title_zh"]})

    def handle_regen_summaries(self) -> None:
        """批量补全缺失摘要与中文标题（后台同步执行）"""
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, title, content, ai_summary, title_zh FROM hotspots
            WHERE (
                ai_summary IS NULL
                OR ai_summary = ''
                OR ai_summary LIKE 'API错误:%'
                OR ai_summary LIKE '生成失败:%'
                OR ai_summary LIKE '%AI摘要服务暂时繁忙%'
                OR title_zh IS NULL
                OR title_zh = ''
            )
            AND (
                (content IS NOT NULL AND length(content) > 20)
                OR (title IS NOT NULL AND title != '')
            )
            ORDER BY created_at DESC
        """)
        rows = cursor.fetchall()
        updated = 0
        for row in rows:
            summary_text = str(row["ai_summary"] or "").strip()
            title_zh = str(row["title_zh"] or "").strip()
            content = str(row["content"] or "")
            title = str(row["title"] or "")
            needs_summary = (
                (not summary_text)
                or summary_text.startswith("API错误")
                or summary_text.startswith("生成失败")
                or ("AI摘要服务暂时繁忙" in summary_text)
            )
            needs_title_zh = not title_zh

            summary_input = content if len(content) > 20 else title
            if needs_summary and summary_input:
                result = generate_ai_summary(summary_input, title)
                summary_text = result.get("summary", summary_text)
                title_zh = result.get("title_zh", title_zh)
            if needs_summary and not summary_text:
                summary_text = _fallback_summary(summary_input, title)

            if needs_title_zh and not title_zh:
                title_zh = _translate_title_to_chinese(title)

            cursor.execute(
                "UPDATE hotspots SET ai_summary = ?, title_zh = ? WHERE id = ?",
                (summary_text, title_zh, row["id"])
            )
            updated += 1
        conn.commit()
        conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True, "updated": updated})

    def handle_sources_get(self) -> None:
        conn = connect_db()
        init_sources_meta_table(conn)
        sources = load_all_sources(conn)
        conn.close()
        categories: Dict[str, List[Dict[str, Any]]] = {}
        for src in sources:
            cat = src["category"]
            categories.setdefault(cat, []).append(src)
        json_response(self, HTTPStatus.OK, {
            "ok": True,
            "sources": sources,
            "categories": categories,
            "total": len(sources),
        })

    def handle_sources_post(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "JSON格式错误"})
            return

        name = str(payload.get("name", "")).strip()
        url = str(payload.get("url", "")).strip()
        src_type = str(payload.get("type", "rss")).strip()
        note = str(payload.get("note", "")).strip()

        if not name:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "名称不能为空"})
            return

        src_id = f"{src_type}_" + hashlib.md5(f"{name}{url}".encode()).hexdigest()[:8]

        sources_file = BASE_DIR / "sources.json"
        data: Dict[str, Any] = {}
        if sources_file.exists():
            data = json.loads(sources_file.read_text(encoding="utf-8"))

        if src_type == "rss" and url:
            feeds = data.get("rss_feeds", [])
            if url not in feeds:
                feeds.append(url)
            data["rss_feeds"] = feeds
        elif src_type == "twitter" and url:
            username = url.rstrip("/").split("/")[-1].lstrip("@")
            profiles = data.get("twitter_profiles", [])
            if username not in profiles:
                profiles.append(username)
            data["twitter_profiles"] = profiles

        sources_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

        conn = connect_db()
        init_sources_meta_table(conn)
        conn.execute(
            "INSERT OR REPLACE INTO sources_meta (id, tags, status, notes) VALUES (?, ?, ?, ?)",
            (src_id, "[]", "active", note),
        )
        conn.commit()
        conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True, "id": src_id})

    def handle_sources_put(self, src_id: str) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length) if content_length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "JSON格式错误"})
            return

        tags = json.dumps(payload.get("tags", []), ensure_ascii=False)
        status = str(payload.get("status", "active"))
        notes = str(payload.get("notes", ""))

        conn = connect_db()
        init_sources_meta_table(conn)
        conn.execute(
            """INSERT OR REPLACE INTO sources_meta (id, tags, status, notes, updated_at)
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            (src_id, tags, status, notes),
        )
        conn.commit()
        conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True})

    def handle_sources_delete(self, src_id: str) -> None:
        conn = connect_db()
        init_sources_meta_table(conn)
        conn.execute(
            """INSERT OR REPLACE INTO sources_meta (id, tags, status, notes, updated_at)
               VALUES (?, '[]', 'deleted', '', CURRENT_TIMESTAMP)""",
            (src_id,),
        )
        conn.commit()
        conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True})

    def log_message(self, format: str, *args: Any) -> None:
        return


def create_server(host: str = "127.0.0.1", port: int = 6003) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), DashboardHandler)


if __name__ == "__main__":
    import sys
    port = 6003
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port number: {sys.argv[1]}, using default port 6003")
    
    AIScraper(DB_PATH)
    server = create_server(port=port)
    print(f"Dashboard running at http://127.0.0.1:{port}")
    server.serve_forever()
