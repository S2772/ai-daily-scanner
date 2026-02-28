#!/usr/bin/env python3
"""
AI热点日报 Dashboard Web应用（标准库版）
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List
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
    "base_url": "https://bobdong.cn/v1/chat/completions",
    "api_key": "sk-pkTNOMFFkTCohLxN8Fswqhr5pCbPxypDHRy8hoATEFbIO2El",
    "model": "claude-haiku-4-5-20251001"
}

def _load_summary_system_prompt() -> str:
    try:
        return SUMMARY_AGENT_SOUL.read_text(encoding="utf-8")
    except Exception:
        return ""

def generate_ai_summary(text: str, title: str = "") -> Dict[str, str]:
    """调用 summary agent 生成深度中文摘要，返回 {"summary": str, "title_zh": str}"""
    import re
    if not text or len(text.strip()) < 10:
        return {"summary": "内容太短，无法生成摘要", "title_zh": ""}

    is_foreign = bool(title) and not bool(re.search(r'[\u4e00-\u9fff]', title))

    user_msg = f"""请对以下AI热点内容生成深度中文摘要，返回JSON格式：
{{"summary":"150-250字摘要，有叙事感，直击痛点，揭示底层逻辑，开门见山","title_zh":"外文标题的中文翻译，中文标题则为空字符串","content_type":"深度文章或行业新闻或KOL言论"}}

只返回JSON，不要其他内容。

标题：{title}

内容：{text[:3000]}"""

    try:
        headers = {
            "Authorization": f"Bearer {AI_API_CONFIG['api_key']}",
            "Content-Type": "application/json"
        }
        data = {
            "model": AI_API_CONFIG["model"],
            "messages": [{"role": "user", "content": user_msg}],
            "max_tokens": 800,
            "temperature": 0.7
        }
        response = requests.post(AI_API_CONFIG["base_url"], headers=headers, json=data, timeout=30)
        if response.status_code != 200:
            return {"summary": f"API错误: {response.status_code}", "title_zh": ""}

        content = response.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        if not content:
            return {"summary": "生成失败: 空响应", "title_zh": ""}

        # 检测模型拒绝响应
        if any(kw in content for kw in ["I'm Kiro", "I am Kiro", "as Kiro", "I'm an AI"]):
            # 降级：用简单提示重试
            simple_msg = f"用中文总结以下内容（100字以内），只返回JSON {{\"summary\":\"...\",\"title_zh\":\"...\"}}：\n标题：{title}\n{text[:1000]}"
            data2 = {**data, "messages": [{"role": "user", "content": simple_msg}]}
            r2 = requests.post(AI_API_CONFIG["base_url"], headers=headers, json=data2, timeout=30)
            if r2.status_code == 200:
                content = r2.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip() or content

        # 去掉 markdown 代码块
        if content.startswith("```"):
            content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        try:
            parsed = json.loads(content)
            return {
                "summary": parsed.get("summary", "").strip(),
                "title_zh": parsed.get("title_zh", "").strip()
            }
        except json.JSONDecodeError:
            # 非JSON时直接用内容作为摘要
            title_zh = ""
            if is_foreign:
                m = re.search(r'"title_zh"\s*:\s*"([^"]+)"', content)
                if m:
                    title_zh = m.group(1)
            return {"summary": content[:500], "title_zh": title_zh}

    except Exception as e:
        return {"summary": f"生成失败: {str(e)}", "title_zh": ""}


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
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
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
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
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

        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")

    def do_POST(self) -> None:
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

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/sources/"):
            src_id = path[len("/api/sources/"):]
            if src_id:
                self.handle_sources_put(src_id)
                return
        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/sources/"):
            src_id = path[len("/api/sources/"):]
            if src_id:
                self.handle_sources_delete(src_id)
                return
        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")

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

    def handle_collect(self) -> None:
        scraper = AIScraper(DB_PATH)
        hotspots_count, opportunities_count = scraper.run_daily_collection()
        json_response(
            self,
            HTTPStatus.OK,
            {
                "ok": True,
                "hotspots_count": hotspots_count,
                "opportunities_count": opportunities_count,
                "collected_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            },
        )

    def handle_summary(self, query: Dict[str, List[str]]) -> None:
        date = self._query_date(query)
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) AS cnt FROM hotspots WHERE date(created_at) = date(?)", (date,))
        hotspot_count = cursor.fetchone()["cnt"]
        cursor.execute(
            "SELECT COUNT(*) AS cnt FROM opportunities WHERE date(created_at) = date(?)",
            (date,),
        )
        opportunity_count = cursor.fetchone()["cnt"]
        cursor.execute("SELECT COUNT(*) AS cnt FROM notes WHERE date(created_at) = date(?)", (date,))
        note_count = cursor.fetchone()["cnt"]
        conn.close()
        json_response(
            self,
            HTTPStatus.OK,
            {
                "ok": True,
                "date": date,
                "hotspot_count": hotspot_count,
                "opportunity_count": opportunity_count,
                "note_count": note_count,
            },
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
        date = self._query_date(query)
        limit = int(query.get("limit", ["50"])[0])
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, title, content, url, source, category, tags, ai_summary, title_zh,
                   innovation_score, commercial_score, tech_score,
                   investment_score, total_score, created_at
            FROM hotspots
            WHERE date(created_at) = date(?)
            ORDER BY total_score DESC, created_at DESC
            LIMIT ?
            """,
            (date, limit),
        )
        rows = cursor.fetchall()
        
        # 检查并生成缺失的AI摘要（每次最多生成3个，避免超时）
        hotspots = []
        generated_count = 0
        max_generate = 3  # 每次最多生成3个
        
        for row in rows:
            hotspot = serialize_hotspot(row)
            # 如果没有AI摘要且未超过生成上限，生成一个
            if not hotspot.get("ai_summary") and generated_count < max_generate:
                content = hotspot.get("content", "")
                title = hotspot.get("title", "")
                if content and len(content) > 20:
                    result = generate_ai_summary(content, title)
                    cursor.execute(
                        "UPDATE hotspots SET ai_summary = ?, title_zh = ? WHERE id = ?",
                        (result["summary"], result["title_zh"], hotspot["id"])
                    )
                    hotspot["ai_summary"] = result["summary"]
                    hotspot["title_zh"] = result["title_zh"]
                    generated_count += 1
            hotspots.append(hotspot)
        
        if generated_count > 0:
            conn.commit()
        conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True, "date": date, "hotspots": hotspots, "generated": generated_count})

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
        date = self._query_date(query)
        limit = int(query.get("limit", ["20"])[0])
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, title, description, category, potential_score,
                   competition_level, resources_needed, timeline, pain_points,
                   blue_ocean_opportunity, monetization_potential, domains, priority, created_at
            FROM opportunities
            WHERE date(created_at) = date(?)
            ORDER BY potential_score DESC, created_at DESC
            LIMIT ?
            """,
            (date, limit),
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
            {"ok": True, "date": date, "opportunities": opportunities},
        )

    def handle_source_status(self, query: Dict[str, List[str]]) -> None:
        date = self._query_date(query)
        conn = connect_db()
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                SELECT source, source_type, status, item_count, error_message, created_at
                FROM source_status
                WHERE date(created_at) = date(?)
                ORDER BY created_at DESC, source ASC
                """,
                (date,),
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

        json_response(self, HTTPStatus.OK, {"ok": True, "date": date, "source_status": statuses})

    def handle_notes(self, query: Dict[str, List[str]]) -> None:
        date = self._query_date(query)
        limit = int(query.get("limit", ["50"])[0])
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT n.id, n.hotspot_id, n.content, n.tags, n.created_at,
                   h.title AS hotspot_title
            FROM notes n
            LEFT JOIN hotspots h ON n.hotspot_id = h.id
            WHERE date(n.created_at) = date(?)
            ORDER BY n.created_at DESC
            LIMIT ?
            """,
            (date, limit),
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
        json_response(self, HTTPStatus.OK, {"ok": True, "date": date, "notes": notes})

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
        """批量重新生成所有缺失摘要（后台同步执行）"""
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, title, content FROM hotspots
            WHERE (ai_summary IS NULL OR ai_summary = '')
            AND content IS NOT NULL AND length(content) > 20
        """)
        rows = cursor.fetchall()
        updated = 0
        for row in rows:
            result = generate_ai_summary(row["content"], row["title"])
            cursor.execute(
                "UPDATE hotspots SET ai_summary = ?, title_zh = ? WHERE id = ?",
                (result["summary"], result["title_zh"], row["id"])
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


def create_server(host: str = "127.0.0.1", port: int = 5001) -> ThreadingHTTPServer:
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
