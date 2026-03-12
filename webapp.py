#!/usr/bin/env python3
"""
AI热点日报 Dashboard Web应用（标准库版）
"""

from __future__ import annotations

import hashlib
import json
import os
import queue
import re
import shutil
import sqlite3
import threading
import subprocess
import traceback
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATE_FILE = BASE_DIR / "templates" / "index.html"
DB_PATH = str(BASE_DIR / "data" / "ai_hotspots.db")
SUMMARY_AGENT_SOUL = Path.home() / ".openclaw" / "workspace-summary" / "SOUL.md"

from src.scraper import AIScraper
from src.collect_runner import run_collect_job
from src.ai_config import get_ai_api_config
import requests


@dataclass
class SchedulerConfig:
    enabled: bool
    hour: int


_scheduler_reload_event = threading.Event()
_scheduler_state_lock = threading.Lock()
_scheduler_state: Dict[str, Any] = {
    "enabled": True,
    "hour": 10,
    "last_run_id": None,
    "last_triggered_at": None,
    "next_trigger_at": None,
}


def notify_scheduler_reload() -> None:
    _scheduler_reload_event.set()


# AI API 配置
AI_API_CONFIG = get_ai_api_config(
    default_model="claude-sonnet-4",
    default_fallback_models="claude-sonnet-3.5,gpt-5.2,gpt-4.1",
)

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

    primary = (os.getenv("OPENCLAW_TRANSLATION_AGENT", "summary") or "summary").strip()
    fallback = (os.getenv("OPENCLAW_TRANSLATION_AGENT_FALLBACK", "main") or "").strip()
    agent_ids = [primary]
    # summary agent can occasionally deadlock on session lock; fallback agent is configurable.
    if fallback and fallback != primary:
        agent_ids.append(fallback)

    for agent_id in agent_ids:
        cmd = ["openclaw", "agent", "--agent", agent_id, "--message", prompt, "--json", "--timeout", str(timeout)]
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except Exception:
            continue

        if proc.returncode != 0:
            continue

        try:
            payload = json.loads(proc.stdout or "{}")
            result = payload.get("result") or {}
            blocks = result.get("payloads") or []
            for b in blocks:
                if isinstance(b, dict):
                    txt = b.get("text")
                    if isinstance(txt, str) and txt.strip():
                        return _clean_text(txt)
            txt = payload.get("text")
            if isinstance(txt, str) and txt.strip():
                return _clean_text(txt)
        except Exception:
            continue
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
        blob = match.group(0)
        # common issue: unescaped quotes inside JSON string values
        # try a couple of normalizations before giving up
        candidates = [blob]
        candidates.append(blob.replace('"按秒开发、按分钟迭代"', '按秒开发、按分钟迭代'))
        candidates.append(blob.replace('\\"', "'"))
        for cand in candidates:
            try:
                parsed = json.loads(cand)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                continue
    return {}

def _call_chat_completion(messages: List[Dict[str, str]], max_tokens: int = 800, temperature: float = 0.5, timeout: int = 45) -> str:
    """Call upstream chat completion.

    Prefer upstream API; if it fails, fallback to OpenClaw agent (local).
    """

    force_openclaw = (os.getenv("SUMMARY_FORCE_OPENCLAW", "0") or "").strip().lower() in {"1", "true", "yes"}
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
    if not force_openclaw and AI_API_CONFIG.get("api_key"):
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
                body_preview = (resp.text or "").strip().replace("\n", " ")[:240]
                last_error = f"{model}:upstream_status_{resp.status_code}:{body_preview}"
                continue
            try:
                content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if content:
                    return content
                last_error = f"{model}:empty_content"
            except Exception as exc:
                last_error = f"{model}:invalid_json:{exc}"
                continue
    elif not AI_API_CONFIG.get("api_key"):
        last_error = "missing_ai_api_key"

    # Fallback to OpenClaw agent for summary generation.
    fallback_enabled = (os.getenv("OPENCLAW_SUMMARY_FALLBACK", "1") or "").strip().lower() in {"1", "true", "yes"}
    if fallback_enabled:
        prompt = "".join([
            "你是摘要生成器。必须【只输出】一个 JSON 对象，输出内容前后不能有任何多余字符、解释、代码块标记。\n",
            "JSON schema: {\"summary\": string(150-220字简体中文摘要), \"title_zh\": string(中文标题)}\n",
            "如果无法生成，也必须返回同结构 JSON，summary 写明失败原因（简短）。\n\n",
            "输入：\n",
            json.dumps({"title": messages[-1].get("content", "")[:1200]}, ensure_ascii=False),
        ])
        try:
            content = _call_openclaw_agent(prompt, timeout=max(30, min(120, timeout)))
            if content:
                # try to extract json payload aggressively
                parsed = _extract_json_payload(content)
                if parsed:
                    return json.dumps(parsed, ensure_ascii=False)
                return content
        except Exception as exc:
            last_error = f"openclaw_agent_failed:{exc}"

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

def _looks_like_excerpt(summary: str, source_text: str) -> bool:
    summary = _clean_text(summary)
    source_text = _clean_text(source_text)
    if not summary or not source_text:
        return False
    # If the beginning is identical, it's almost certainly an excerpt.
    head = 140
    return summary[:head] == source_text[:head]


def _looks_like_invalid_summary(summary: str, source_text: str) -> bool:
    summary = _clean_text(summary)
    if not summary:
        return True

    lowered = summary.lower()
    if lowered in {"comments", "comment"}:
        return True

    if len(summary) < 60:
        return True

    if summary.startswith("原文摘录"):
        return True

    return _looks_like_excerpt(summary, source_text)


def generate_ai_summary(text: str, title: str = "") -> Dict[str, str]:
    """Generate Chinese summary.

    For AI Insight Hub: delegate summary generation to OpenClaw `summary` agent.

    Policy (user-confirmed): do NOT store excerpt-like fallbacks as AI summary.
    If the model fails or returns an excerpt, return a queue/pending marker.
    """

    if not text or len(text.strip()) < 10:
        return {"summary": "[PENDING] 内容太短，无法生成摘要", "title_zh": _translate_title_to_chinese(title)}

    system_prompt = _load_summary_system_prompt().strip()
    user_msg = f"""你是摘要生成器。必须【只输出】一个 JSON 对象，输出内容前后不能有任何多余字符、解释、代码块标记。
JSON schema: {{\"summary\": string(150-220字简体中文摘要), \"title_zh\": string(中文标题)}}
如果无法生成，也必须返回同结构 JSON，summary 写明失败原因（简短）。

输入：
{{"title": "请对以下AI热点内容生成中文摘要。\n\n输出格式（必须严格遵守）：\njson\n{{\n \"summary\": \"150-220字的简体中文摘要，结构清晰，直击重点\",\n \"title_zh\": \"中文标题\"\n}}\n\n\n要求：\n1. summary 必须是简体中文，不要加\"原文摘录：\"等前缀\n2. title_zh 必须是中文（如果原标题已经是中文就保持原样）\n3. 只返回 JSON 对象，不要有其他文字\n\n原文：\n标题：{title}\n内容：{text[:3500]}"}}"""

    messages: List[Dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_msg})

    fallback_title = _translate_title_to_chinese(title)

    last_error = ""
    for attempt in range(2):
        try:
            timeout = 60 if attempt == 0 else 90
            content = _call_openclaw_agent(user_msg, timeout=timeout)
            if not content:
                last_error = "empty_openclaw_response"
                continue

            parsed = _extract_json_payload(content)
            if parsed and parsed.get("summary"):
                summary = _clean_text(str(parsed.get("summary", "")))
                title_zh = _clean_text(str(parsed.get("title_zh", "")))
            else:
                last_error = "invalid_json_payload"
                continue

            if not summary:
                last_error = "empty_summary"
                continue

            summary = _translate_summary_to_chinese(summary)
            if not _contains_chinese(summary):
                last_error = "non_chinese_summary"
                continue

            if _looks_like_invalid_summary(summary, text):
                last_error = "invalid_or_excerpt_like_summary"
                continue

            if not title_zh:
                title_zh = fallback_title
            elif not _contains_chinese(title_zh):
                title_zh = _translate_title_to_chinese(title_zh)

            if not title_zh:
                title_zh = fallback_title

            return {"summary": summary[:600], "title_zh": title_zh}
        except Exception as exc:
            last_error = str(exc)

    marker = f"[PENDING] AI摘要生成失败({last_error or 'unknown'}), 稍后自动重试"
    return {"summary": marker, "title_zh": fallback_title}


def _generate_ai_summary_with_timeout(text: str, title: str = "", timeout_seconds: Optional[float] = None) -> Dict[str, str]:
    timeout_value = timeout_seconds
    if timeout_value is None:
        try:
            timeout_value = float((os.getenv("REGEN_SUMMARY_ITEM_TIMEOUT_SECONDS", "") or "").strip() or 45)
        except Exception:
            timeout_value = 45.0
    timeout_value = max(0.05, float(timeout_value))

    result_box: "queue.Queue[Tuple[str, Any]]" = queue.Queue(maxsize=1)

    def _worker() -> None:
        try:
            result_box.put(("ok", generate_ai_summary(text, title)))
        except Exception as exc:
            result_box.put(("err", exc))

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    t.join(timeout_value)

    if t.is_alive():
        fallback_title = _translate_title_to_chinese(title)
        return {
            "summary": f"[PENDING] AI摘要生成超时({int(timeout_value)}s), 稍后自动重试",
            "title_zh": fallback_title,
        }

    if result_box.empty():
        fallback_title = _translate_title_to_chinese(title)
        return {
            "summary": "[PENDING] AI摘要生成失败(worker_exit_without_result), 稍后自动重试",
            "title_zh": fallback_title,
        }

    state, payload = result_box.get_nowait()
    if state == "err":
        fallback_title = _translate_title_to_chinese(title)
        return {
            "summary": f"[PENDING] AI摘要生成失败({payload}), 稍后自动重试",
            "title_zh": fallback_title,
        }
    return payload


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


def _get_scheduler_config() -> SchedulerConfig:
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = ? LIMIT 1", ("daily_deadline_hour",))
    row = cur.fetchone()
    hour_raw = str(row[0] if row else "10")
    try:
        hour = int(hour_raw)
    except Exception:
        hour = 10

    cur.execute("SELECT value FROM settings WHERE key = ? LIMIT 1", ("daily_collect_enabled",))
    row2 = cur.fetchone()
    enabled_raw = str(row2[0] if row2 else "1")
    enabled = enabled_raw.strip().lower() not in {"0", "false", "no"}

    conn.close()
    hour = max(0, min(23, hour))
    return SchedulerConfig(enabled=enabled, hour=hour)


def _connect_db_path(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30)
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn


def _repair_stale_collect_runs(db_path: str, stale_after_seconds: int = 7200) -> int:
    conn = _connect_db_path(db_path)
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE collect_runs
        SET finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
            status = 'partial',
            notes = CASE
                WHEN notes IS NULL OR trim(notes) = '' THEN 'recovered stale running collect'
                WHEN instr(lower(notes), 'recovered stale running collect') > 0 THEN notes
                ELSE substr(notes || '\nrecovered stale running collect', 1, 2000)
            END
        WHERE status = 'running'
          AND finished_at IS NULL
          AND started_at IS NOT NULL
          AND (strftime('%s', datetime('now','localtime')) - strftime('%s', started_at)) >= ?
        """,
        (int(stale_after_seconds),),
    )
    repaired = int(cur.rowcount or 0)
    conn.commit()
    conn.close()
    return repaired


def _repair_stale_regen_jobs(db_path: str, stale_after_seconds: int = 7200) -> int:
    conn = _connect_db_path(db_path)
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE regen_summaries_jobs
        SET finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
            status = 'interrupted',
            error = CASE
                WHEN status = 'queued' THEN CASE
                    WHEN error IS NULL OR trim(error) = '' THEN 'recovered stale queued regen job'
                    WHEN instr(lower(error), 'recovered stale queued regen job') > 0 THEN error
                    ELSE substr(error || '\nrecovered stale queued regen job', 1, 2000)
                END
                ELSE CASE
                    WHEN error IS NULL OR trim(error) = '' THEN 'recovered stale running regen job'
                    WHEN instr(lower(error), 'recovered stale running regen job') > 0 THEN error
                    ELSE substr(error || '\nrecovered stale running regen job', 1, 2000)
                END
            END
        WHERE status IN ('running', 'queued')
          AND finished_at IS NULL
          AND COALESCE(started_at, created_at) IS NOT NULL
          AND (strftime('%s', datetime('now','localtime')) - strftime('%s', COALESCE(started_at, created_at))) >= ?
        """,
        (int(stale_after_seconds),),
    )
    repaired = int(cur.rowcount or 0)
    conn.commit()
    conn.close()
    return repaired


def _start_regen_summaries_job(job_key: Optional[str] = None, batch_limit: int = 40) -> Dict[str, Any]:
    job_key = (job_key or datetime.now().strftime("%Y-%m-%d")).strip()
    batch_limit = max(1, min(200, int(batch_limit)))
    _repair_stale_regen_jobs(DB_PATH)

    conn = connect_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT OR IGNORE INTO regen_summaries_jobs(job_key,status,batch_limit) VALUES(?,?,?)",
        (job_key, "queued", int(batch_limit)),
    )
    cur.execute(
        "SELECT job_key, status, total, processed, updated, failed, batch_limit, error, created_at, started_at, finished_at FROM regen_summaries_jobs WHERE job_key = ? LIMIT 1",
        (job_key,),
    )
    row = cur.fetchone()
    job = dict(row) if row else {"job_key": job_key, "status": "queued", "batch_limit": int(batch_limit)}
    status = str(job.get("status") or "queued")

    if status != "running":
        cur.execute(
            "UPDATE regen_summaries_jobs SET status='queued', error=NULL, total=0, processed=0, updated=0, failed=0, started_at=NULL, finished_at=NULL, batch_limit=? WHERE job_key=?",
            (int(batch_limit), job_key),
        )
        conn.commit()
        conn.close()

        def _bg() -> None:
            try:
                _regen_summaries_job(job_key=job_key, batch_limit=int(batch_limit))
            except Exception as exc:
                conn2 = connect_db()
                cur2 = conn2.cursor()
                cur2.execute(
                    "UPDATE regen_summaries_jobs SET status='interrupted', error=?, finished_at=CURRENT_TIMESTAMP WHERE job_key=?",
                    (str(exc)[:2000], job_key),
                )
                conn2.commit()
                conn2.close()

        threading.Thread(target=_bg, daemon=True).start()
        return {"job_key": job_key, "status": "queued", "batch_limit": int(batch_limit)}

    conn.close()
    return job


def _maybe_enqueue_regen_after_collect(db_path: str, run_id: int) -> Optional[Dict[str, Any]]:
    conn = _connect_db_path(db_path)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, started_at, status, hotspots_inserted, items_total, items_new, items_existing
        FROM collect_runs
        WHERE id = ?
        LIMIT 1
        """,
        (run_id,),
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    if str(row["status"] or "") not in {"success", "partial"}:
        return None

    candidate_count = max(
        int(row["hotspots_inserted"] or 0),
        int(row["items_total"] or 0),
        int(row["items_new"] or 0) + int(row["items_existing"] or 0),
    )
    if candidate_count <= 0:
        return None

    try:
        batch_limit = max(20, min(200, int(os.getenv("AUTO_REGEN_SUMMARIES_LIMIT", "120"))))
    except ValueError:
        batch_limit = 120
    started_at = str(row["started_at"] or "").strip()
    job_key = started_at[:10] if len(started_at) >= 10 else datetime.now().strftime("%Y-%m-%d")
    return _start_regen_summaries_job(job_key=job_key, batch_limit=batch_limit)


def _run_collect_job_with_postprocess(db_path: str, run_id: int) -> None:
    run_collect_job(db_path, run_id)
    _maybe_enqueue_regen_after_collect(db_path, run_id)


def _create_collect_run_and_start(db_path: str, *, reason: str) -> int:
    _repair_stale_collect_runs(db_path)
    _repair_stale_regen_jobs(db_path)
    started_at = datetime.now()
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO collect_runs (started_at, status, notes)
        VALUES (?, ?, ?)
        """,
        (started_at.strftime("%Y-%m-%d %H:%M:%S"), "running", reason[:240] if reason else None),
    )
    run_id = int(cursor.lastrowid)
    conn.commit()
    conn.close()

    t = threading.Thread(target=_run_collect_job_with_postprocess, args=(db_path, run_id), daemon=True)
    t.start()
    return run_id


def _next_daily_trigger(now: datetime, hour: int) -> datetime:
    target = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if target <= now:
        target = target + timedelta(days=1)
    return target


def _scheduler_loop(db_path: str) -> None:
    while True:
        cfg = _get_scheduler_config()
        with _scheduler_state_lock:
            _scheduler_state["enabled"] = cfg.enabled
            _scheduler_state["hour"] = cfg.hour

        if not cfg.enabled:
            with _scheduler_state_lock:
                _scheduler_state["next_trigger_at"] = None
            _scheduler_reload_event.wait(timeout=3600)
            _scheduler_reload_event.clear()
            continue

        next_at = _next_daily_trigger(datetime.now(), cfg.hour)
        with _scheduler_state_lock:
            _scheduler_state["next_trigger_at"] = next_at.strftime("%Y-%m-%d %H:%M:%S")

        while True:
            timeout = max(1.0, (next_at - datetime.now()).total_seconds())
            fired = _scheduler_reload_event.wait(timeout=timeout)
            if fired:
                _scheduler_reload_event.clear()
                break

            # time reached
            triggered_at = datetime.now()
            try:
                run_id = _create_collect_run_and_start(db_path, reason=f"scheduled_daily@{cfg.hour:02d}:00")
                with _scheduler_state_lock:
                    _scheduler_state["last_run_id"] = run_id
                    _scheduler_state["last_triggered_at"] = triggered_at.strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                pass

            next_at = _next_daily_trigger(datetime.now(), cfg.hour)
            with _scheduler_state_lock:
                _scheduler_state["next_trigger_at"] = next_at.strftime("%Y-%m-%d %H:%M:%S")


def start_scheduler_thread() -> None:
    t = threading.Thread(target=_scheduler_loop, args=(DB_PATH,), daemon=True)
    t.start()


def connect_db() -> sqlite3.Connection:
    (BASE_DIR / "data").mkdir(parents=True, exist_ok=True)
    # Under background summary backfills, SQLite can hold write locks.
    # Use a longer busy timeout so dashboard reads wait instead of failing.
    conn = sqlite3.connect(DB_PATH, timeout=30)
    # Also set connection-level busy_timeout (PRAGMA alone can be 0 on some builds).
    conn.execute("PRAGMA busy_timeout=30000")
    try:
        conn.set_busy_timeout(30000)
    except Exception:
        pass
    conn.execute("PRAGMA synchronous=NORMAL")
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
        CREATE TABLE IF NOT EXISTS regen_summaries_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_key TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL,
            total INTEGER DEFAULT 0,
            processed INTEGER DEFAULT 0,
            updated INTEGER DEFAULT 0,
            failed INTEGER DEFAULT 0,
            batch_limit INTEGER DEFAULT 0,
            error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMP,
            finished_at TIMESTAMP
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
            saved INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (hotspot_id) REFERENCES hotspots (id)
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS saved_items (
            id TEXT PRIMARY KEY,
            hotspot_id TEXT,
            title TEXT,
            url TEXT,
            source_name TEXT,
            origin_type TEXT,
            status TEXT,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # lightweight index for listing + filtering
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_saved_items_created_at ON saved_items(created_at)"
    )

    # keep updated_at in sync on updates (sqlite >= 3.24 supports UPSERT; trigger is safer)
    conn.execute(
        """
        CREATE TRIGGER IF NOT EXISTS trg_saved_items_updated_at
        AFTER UPDATE ON saved_items
        FOR EACH ROW
        BEGIN
            UPDATE saved_items SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;
        """
    )

    # 默认配置：每日完成抓取的截止小时（0-23），用于“今日数据”口径。
    conn.execute(
        "INSERT OR IGNORE INTO settings(key,value) VALUES('daily_deadline_hour','10')"
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
    for col, ddl in [("ai_summary", "TEXT"), ("title_zh", "TEXT"), ("published_at", "TIMESTAMP")]:
        try:
            cursor.execute(f"SELECT {col} FROM hotspots LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute(f"ALTER TABLE hotspots ADD COLUMN {col} {ddl}")
            conn.commit()

    try:
        cursor.execute("SELECT saved FROM notes LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE notes ADD COLUMN saved INTEGER DEFAULT 0")
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
        "published_at": row["published_at"] if "published_at" in row.keys() else None,
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
            if path == "/api/log-daily":
                self.handle_log_daily(query)
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
            if path == "/api/wechat-latest":
                self.handle_wechat_latest(query)
                return
            if path.startswith("/api/hotspots/"):
                hotspot_id = path[len("/api/hotspots/"):]
                if hotspot_id:
                    self.handle_hotspot_detail(hotspot_id)
                    return
            if path == "/api/source-status":
                self.handle_source_status(query)
                return
            if path == "/api/saved":
                self.handle_saved_list(query)
                return
            if path == "/api/saved-status":
                self.handle_saved_status_options()
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

            if path == "/api/regen-summaries/progress":
                self.handle_regen_summaries_progress()
                return
            if path == "/api/sources":
                self.handle_sources_get()
                return
            if path == "/api/collect-runs":
                self.handle_collect_runs(query)
                return
            if path == "/api/settings":
                self.handle_settings_get()
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
            if parsed.path == "/api/settings":
                self.handle_settings_put()
                return
            if parsed.path == "/api/saved":
                self.handle_saved_create()
                return
            if parsed.path == "/api/hotspots-retry":
                self.handle_hotspots_retry()
                return
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
        except Exception as exc:
            self._handle_uncaught_error(exc)

    def do_PUT(self) -> None:
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            if path == "/api/settings":
                self.handle_settings_put()
                return
            if path.startswith("/api/sources/"):
                src_id = path[len("/api/sources/"):]
                if src_id:
                    self.handle_sources_put(src_id)
                    return
            if path.startswith("/api/saved/"):
                item_id = path[len("/api/saved/"):]
                if item_id:
                    self.handle_saved_update(item_id)
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

    def _query_date_field(self, query: Dict[str, List[str]]) -> str:
        raw = (query.get("date_field", [""])[0] or "").strip().lower()
        if raw in {"published", "published_at", "publish"}:
            return "published_at"
        return "created_at"

    def _date_expr(self, date_field: str) -> str:
        if date_field == "published_at":
            return "COALESCE(NULLIF(date(published_at), ''), date(created_at))"
        # created_at: use date component of created_at
        return "date(created_at)"

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
        """Trigger collection.

        Returns immediately with a run_id and runs the job asynchronously.
        This avoids request timeouts / empty replies on slow sources.
        """

        run_id = _create_collect_run_and_start(DB_PATH, reason="manual")
        json_response(self, HTTPStatus.OK, {"ok": True, "run_id": run_id, "status": "running"})

    def handle_summary(self, query: Dict[str, List[str]]) -> None:
        date_field = self._query_date_field(query)
        hs_date_expr = self._date_expr(date_field)
        hs_where, hs_params, range_meta = self._build_date_filter(query, hs_date_expr)
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
            "date_field": date_field,
        }
        payload.update(range_meta)
        json_response(
            self,
            HTTPStatus.OK,
            payload,
        )

    def handle_trend(self, query: Dict[str, List[str]]) -> None:
        days = int(query.get("days", ["30"])[0])
        date_field = self._query_date_field(query)
        hs_date_expr = self._date_expr(date_field)
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT {hs_date_expr} AS d, COUNT(*) AS cnt,
                   AVG(total_score) AS avg_score
            FROM hotspots
            GROUP BY {hs_date_expr}
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
            "date_field": date_field,
        })

    def handle_log_daily(self, query: Dict[str, List[str]]) -> None:
        """Daily log summary.

        Returns total items in a date range (by created_at) and a breakdown by content_date
        (date(published_at) fallback date(created_at)).

        Query params:
        - date / start_date / end_date / all_time (reuse existing date filter helpers)
        - date_field: affects which date field drives the range filter (default: published_at)
        """

        date_field = self._query_date_field(query)
        hs_date_expr = self._date_expr(date_field)
        hs_where, hs_params, range_meta = self._build_date_filter(query, hs_date_expr)

        conn = connect_db()
        cursor = conn.cursor()

        # total in range
        cursor.execute(f"SELECT COUNT(*) AS cnt FROM hotspots WHERE {hs_where}", tuple(hs_params))
        total = int(cursor.fetchone()["cnt"])

        # breakdown by content date (published fallback created)
        cursor.execute(
            f"""
            SELECT COALESCE(NULLIF(date(published_at), ''), date(created_at)) AS content_date,
                   COUNT(*) AS cnt
            FROM hotspots
            WHERE {hs_where}
            GROUP BY COALESCE(NULLIF(date(published_at), ''), date(created_at))
            ORDER BY content_date DESC
            LIMIT 400
            """,
            tuple(hs_params),
        )
        breakdown = [{"date": r["content_date"], "count": int(r["cnt"])} for r in cursor.fetchall()]

        conn.close()
        payload: Dict[str, Any] = {"ok": True, "total": total, "breakdown": breakdown, "date_field": date_field}
        payload.update(range_meta)
        json_response(self, HTTPStatus.OK, payload)
        return

    def handle_latest_date(self) -> None:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT COALESCE(NULLIF(date(published_at), ''), date(created_at)) AS d
            FROM hotspots
            ORDER BY COALESCE(published_at, created_at) DESC
            LIMIT 1
            """
        )
        row = cursor.fetchone()
        conn.close()
        latest_date = row["d"] if row and row["d"] else ""
        json_response(self, HTTPStatus.OK, {"ok": True, "latest_date": latest_date})

    def handle_hotspots(self, query: Dict[str, List[str]]) -> None:
        date_field = self._query_date_field(query)
        hs_date_expr = self._date_expr(date_field)
        where_clause, where_params, range_meta = self._build_date_filter(query, hs_date_expr)
        limit = int(query.get("limit", ["50"])[0])
        fill_missing_raw = (query.get("fill_missing", [""])[0] or "").strip().lower()
        fill_missing = fill_missing_raw in {"1", "true", "yes"}
        # Never generate summaries/translations inline for published_at list views.
        # It makes the hottest dashboard path block on LLM calls and causes timeouts.
        if date_field == "published_at":
            fill_missing = False
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
        try:
            offset = int(query.get("offset", ["0"])[0])
        except ValueError:
            offset = 0
        offset = max(0, offset)

        cursor.execute(
            f"""
            SELECT id, title, content, url, source, category, tags, ai_summary, title_zh,
                   innovation_score, commercial_score, tech_score,
                   investment_score, total_score, created_at, published_at
            FROM hotspots
            WHERE {where_clause}
            ORDER BY total_score DESC, COALESCE(published_at, created_at) DESC
            LIMIT ? OFFSET ?
            """,
            (*where_params, limit, offset),
        )
        rows = cursor.fetchall()

        hotspots = [serialize_hotspot(row) for row in rows]
        generated_count = 0

        if fill_missing:
            try:
                max_generate = max(1, min(40, int(os.getenv("HOTSPOT_FILL_MISSING_LIMIT", "10"))))
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
        payload: Dict[str, Any] = {"ok": True, "hotspots": hotspots, "generated": generated_count, "date_field": date_field}
        payload.update(range_meta)
        json_response(self, HTTPStatus.OK, payload)

    def handle_hotspot_source_groups(self, query: Dict[str, List[str]]) -> None:
        date_field = self._query_date_field(query)
        hs_date_expr = self._date_expr(date_field)
        where_clause, where_params, range_meta = self._build_date_filter(query, hs_date_expr)
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

        grouped_raw = [{"source": row["source"] or "", "count": row["cnt"]} for row in rows]

        def _is_wechat_source(source: str) -> bool:
            s = (source or "").strip()
            return s.startswith("http://localhost:4000/feeds/MP_WXS_")

        wechat_count = sum(item["count"] for item in grouped_raw if _is_wechat_source(item["source"]))
        grouped = [item for item in grouped_raw if not _is_wechat_source(item["source"])]
        if wechat_count > 0:
            grouped.insert(0, {"source": "微信公众号", "count": wechat_count})

        json_response(self, HTTPStatus.OK, {"ok": True, "sources": grouped, "date_field": date_field, **range_meta})

    def handle_wechat_latest(self, query: Dict[str, List[str]]) -> None:
        try:
            limit = int((query.get("limit") or ["20"])[0])
        except Exception:
            limit = 20
        limit = max(1, min(200, limit))

        try:
            offset = int((query.get("offset") or ["0"])[0])
        except Exception:
            offset = 0
        offset = max(0, offset)

        start_date = (query.get("start_date") or [""])[0].strip()
        end_date = (query.get("end_date") or [""])[0].strip()

        blogger = (query.get("blogger") or [""])[0].strip()
        category = (query.get("category") or [""])[0].strip()
        tag = (query.get("tag") or [""])[0].strip()
        q = (query.get("q") or [""])[0].strip()

        where = ["source LIKE 'http://localhost:4000/feeds/MP_WXS_%'"]
        params: List[Any] = []

        if start_date:
            where.append("date(coalesce(published_at, created_at)) >= date(?)")
            params.append(start_date)
        if end_date:
            where.append("date(coalesce(published_at, created_at)) <= date(?)")
            params.append(end_date)
        if category:
            where.append("category = ?")
            params.append(category)
        if tag:
            where.append("tags LIKE ?")
            params.append(f"%{tag}%")
        if blogger:
            where.append("source = ?")
            params.append(blogger)
        if q:
            where.append("(title LIKE ? OR title_zh LIKE ? OR source LIKE ?)")
            like = f"%{q}%"
            params.extend([like, like, like])

        where_clause = " AND ".join(where)
        conn = connect_db()
        cursor = conn.cursor()

        total_row = cursor.execute(
            f"SELECT COUNT(*) AS cnt FROM hotspots WHERE {where_clause}",
            tuple(params),
        ).fetchone()
        total = int(total_row["cnt"] if total_row else 0)

        cursor.execute(
            f"""
            SELECT id, title, content, url, source, category, tags, ai_summary, title_zh,
                   innovation_score, commercial_score, tech_score,
                   investment_score, total_score, created_at, published_at
            FROM hotspots
            WHERE {where_clause}
            ORDER BY coalesce(published_at, created_at) DESC
            LIMIT ? OFFSET ?
            """,
            (*params, limit, offset),
        )
        rows = cursor.fetchall()
        conn.close()

        items = [serialize_hotspot(row) for row in rows]
        json_response(self, HTTPStatus.OK, {"ok": True, "items": items, "total": total, "limit": limit, "offset": offset})

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

    def handle_hotspots_retry(self) -> None:
        """Retry analysis for a single hotspot.

        Use this for admin/debug flows when a record has empty/low-quality
        analysis due to earlier scraping/LLM failures.
        """

        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "JSON格式错误"})
            return

        hotspot_id = str(payload.get("id", "") or "").strip()
        if not hotspot_id:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "id 不能为空"})
            return

        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, title, content, url, category, ai_summary, title_zh
            FROM hotspots
            WHERE id = ?
            """,
            (hotspot_id,),
        )
        row = cursor.fetchone()
        if not row:
            conn.close()
            json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "hotspot 不存在"})
            return

        title = row["title"] or ""
        content = row["content"] or ""
        category = row["category"] or ""

        if not content.strip():
            conn.close()
            # Friendly error: do not expose details
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "正文为空，无法重试分析（需要先补抓全文）"})
            return

        result = generate_ai_summary(content, title)
        ai_summary = (result.get("summary") or "").strip()
        title_zh = (result.get("title_zh") or "").strip()
        scraper = AIScraper(DB_PATH)
        scores = scraper.calculate_scores_detailed(title, content, category)

        cursor.execute(
            """
            UPDATE hotspots
            SET ai_summary = ?,
                title_zh = ?,
                innovation_score = ?,
                commercial_score = ?,
                tech_score = ?,
                investment_score = ?,
                total_score = ?
            WHERE id = ?
            """,
            (
                ai_summary,
                title_zh,
                int(scores.get("innovation_score", 0)),
                int(scores.get("commercial_score", 0)),
                int(scores.get("tech_score", 0)),
                int(scores.get("investment_score", 0)),
                int(scores.get("total_score", 0)),
                hotspot_id,
            ),
        )
        conn.commit()
        conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True, "id": hotspot_id})

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
                   COALESCE(n.saved, 0) AS saved,
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
                    "saved": int(row["saved"] or 0),
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
        saved = int(bool(payload.get("saved", 0)))

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
            "INSERT INTO notes (id, hotspot_id, content, tags, saved) VALUES (?, ?, ?, ?, ?)",
            (note_id, hotspot_id, note_content, tags, saved),
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



    def handle_regen_summaries(self) -> None:
        """批量补全缺失摘要与中文标题（后台异步执行，可重复触发）"""

        batch_limit = 40
        try:
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            if "limit" in query and query["limit"]:
                batch_limit = max(1, min(200, int(query["limit"][0])))
        except Exception:
            batch_limit = 40

        job = _start_regen_summaries_job(batch_limit=int(batch_limit))
        json_response(self, HTTPStatus.OK, {"ok": True, **job})


    def handle_regen_summaries_progress(self) -> None:
        """Lightweight progress endpoint for regen summaries jobs."""

        job_key = datetime.now().strftime("%Y-%m-%d")
        try:
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            if "job_key" in query and query["job_key"]:
                job_key = (query["job_key"][0] or job_key).strip()
        except Exception:
            pass

        conn = connect_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT job_key, status, total, processed, updated, failed, batch_limit, error, created_at, started_at, finished_at FROM regen_summaries_jobs WHERE job_key = ? LIMIT 1",
            (job_key,),
        )
        row = cur.fetchone()
        conn.close()
        if not row:
            json_response(self, HTTPStatus.OK, {"ok": True, "job_key": job_key, "status": "missing"})
            return

        json_response(self, HTTPStatus.OK, {"ok": True, **dict(row)})

    def handle_generate_summary(self, query: Dict[str, List[str]]) -> None:
        """生成AI中文摘要"""
        text = query.get("text", [""])[0]
        title = query.get("title", [""])[0]

        if not text:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "缺少text参数"})
            return

        result = generate_ai_summary(text, title)
        json_response(self, HTTPStatus.OK, {"ok": True, "summary": result["summary"], "title_zh": result["title_zh"]})

    # ------------------------
    # saved_items APIs
    # ------------------------

    def _parse_int(self, query: Dict[str, List[str]], key: str, default: int, min_value: int, max_value: int) -> int:
        raw = (query.get(key, [""])[0] or "").strip()
        try:
            value = int(raw)
        except Exception:
            value = default
        return max(min_value, min(max_value, value))

    def handle_saved_status_options(self) -> None:
        json_response(
            self,
            HTTPStatus.OK,
            {
                "ok": True,
                "options": [
                    {"value": "new", "label": "New"},
                    {"value": "reading", "label": "Reading"},
                    {"value": "done", "label": "Done"},
                    {"value": "archived", "label": "Archived"},
                ],
            },
        )

    def handle_saved_list(self, query: Dict[str, List[str]]) -> None:
        limit = self._parse_int(query, "limit", 50, 1, 200)
        offset = self._parse_int(query, "offset", 0, 0, 1000000)
        status = (query.get("status", [""])[0] or "").strip().lower()

        where = "1=1"
        params: List[Any] = []
        if status:
            where = "status = ?"
            params.append(status)

        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(f"SELECT COUNT(*) AS cnt FROM saved_items WHERE {where}", tuple(params))
        total_row = cursor.fetchone()
        total = int(total_row["cnt"] if total_row else 0)

        cursor.execute(
            f"""
            SELECT id, hotspot_id, title, url, source_name, origin_type, status, note, created_at, updated_at
            FROM saved_items
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (*params, limit, offset),
        )
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()

        json_response(self, HTTPStatus.OK, {"ok": True, "items": rows, "total": total, "limit": limit, "offset": offset})

    def handle_saved_create(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "JSON格式错误"})
            return

        origin_type = str(payload.get("origin_type", ""))
        if origin_type not in {"hotspot", "url"}:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "origin_type 仅支持 hotspot/url"})
            return

        hotspot_id = str(payload.get("hotspot_id", "") or "").strip()
        title = str(payload.get("title", "") or "").strip()
        url = str(payload.get("url", "") or "").strip()
        source_name = str(payload.get("source_name", "") or "").strip()
        status = str(payload.get("status", "new") or "new").strip().lower()
        note = str(payload.get("note", "") or "").strip()

        if origin_type == "hotspot":
            if not hotspot_id:
                json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "hotspot_id 不能为空"})
                return
            conn = connect_db()
            cursor = conn.cursor()
            cursor.execute("SELECT title, url, source FROM hotspots WHERE id = ? LIMIT 1", (hotspot_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "hotspot_id 无效"})
                return
            if not title:
                title = row["title"] or ""
            if not url:
                url = row["url"] or ""
            if not source_name:
                source_name = row["source"] or ""
        else:
            if not url:
                json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "url 不能为空"})
                return
            if not title:
                title = url
            if not source_name:
                try:
                    parsed = urlparse(url)
                    source_name = parsed.netloc or "Web"
                except Exception:
                    source_name = "Web"
            conn = connect_db()
            cursor = conn.cursor()

        dedupe_key = f"hotspot:{hotspot_id}" if origin_type == "hotspot" else f"url:{url}"
        item_id = hashlib.md5(dedupe_key.encode("utf-8")).hexdigest()[:16]

        cursor.execute(
            """
            INSERT INTO saved_items(id, hotspot_id, title, url, source_name, origin_type, status, note, created_at, updated_at)
            VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
              status=excluded.status,
              note=excluded.note,
              title=excluded.title,
              url=excluded.url,
              source_name=excluded.source_name,
              updated_at=CURRENT_TIMESTAMP
            """,
            (item_id, hotspot_id or None, title, url, source_name, origin_type, status or "new", note),
        )
        conn.commit()
        conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True, "id": item_id})

    def handle_saved_update(self, item_id: str) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "JSON格式错误"})
            return

        fields = {
            "status": payload.get("status"),
            "note": payload.get("note"),
            "title": payload.get("title"),
            "url": payload.get("url"),
            "source_name": payload.get("source_name"),
        }
        sets = []
        params: List[Any] = []
        for k, v in fields.items():
            if v is None:
                continue
            sets.append(f"{k} = ?")
            params.append(str(v))
        if not sets:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "缺少可更新字段"})
            return
        sets.append("updated_at = CURRENT_TIMESTAMP")

        conn = connect_db()
        cur = conn.cursor()
        cur.execute(f"UPDATE saved_items SET {', '.join(sets)} WHERE id = ?", tuple(params + [item_id]))
        conn.commit()
        conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True, "id": item_id})





def _get_setting(conn: sqlite3.Connection, key: str, default: str = "") -> str:
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = ? LIMIT 1", (key,))
    row = cur.fetchone()
    if not row:
        return default
    # row may be tuple or sqlite3.Row depending on connection
    try:
        return str(row["value"] or default)
    except Exception:
        return str(row[0] or default)


class DashboardHandler(DashboardHandler):
    def handle_sources_get(self) -> None:
        conn = connect_db()
        init_sources_meta_table(conn)
        sources = load_all_sources(conn)
        conn.close()
        categories: Dict[str, List[Dict[str, Any]]] = {}
        for src in sources:
            cat = src["category"]
            categories.setdefault(cat, []).append(src)
        json_response(
            self,
            HTTPStatus.OK,
            {
                "ok": True,
                "sources": sources,
                "categories": categories,
                "total": len(sources),
            },
        )

    def handle_settings_get(self) -> None:
        conn = connect_db()
        deadline = _get_setting(conn, "daily_deadline_hour", "10")
        enabled = _get_setting(conn, "daily_collect_enabled", "1")
        conn.close()

        with _scheduler_state_lock:
            sched = dict(_scheduler_state)

        json_response(
            self,
            HTTPStatus.OK,
            {
                "ok": True,
                "daily_deadline_hour": int(deadline or 10),
                "daily_collect_enabled": (str(enabled).strip() not in {"0", "false", "no"}),
                "scheduler": {
                    "enabled": bool(sched.get("enabled")),
                    "hour": int(sched.get("hour") or 0),
                    "last_run_id": sched.get("last_run_id"),
                    "last_triggered_at": sched.get("last_triggered_at"),
                    "next_trigger_at": sched.get("next_trigger_at"),
                },
            },
        )


def _regen_summaries_job(job_key: str, batch_limit: int = 40) -> int:
    """Regenerate summaries in background.

    Returns number of updated rows.
    Uses a dedicated connection to reduce lock contention.
    """

    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA busy_timeout=8000")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("UPDATE regen_summaries_jobs SET status='running', started_at=COALESCE(started_at, CURRENT_TIMESTAMP), finished_at=NULL WHERE job_key = ?", (job_key,))
    conn.commit()

    cursor.execute(
        """
        SELECT id, title, content, ai_summary, title_zh
        FROM hotspots
        WHERE (
            ai_summary IS NULL
            OR ai_summary = ''
            OR ai_summary LIKE '[PENDING]%'
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
        LIMIT ?
        """,
        (int(batch_limit),),
    )
    rows = cursor.fetchall()

    cursor.execute("UPDATE regen_summaries_jobs SET total = ? WHERE job_key = ?", (len(rows), job_key))
    conn.commit()

    updated = 0
    processed = 0
    failed = 0
    for row in rows:
        summary_text = str(row["ai_summary"] or "").strip()
        title_zh = str(row["title_zh"] or "").strip()
        content = str(row["content"] or "")
        title = str(row["title"] or "")
        needs_summary = (
            (not summary_text)
            or summary_text.startswith("[PENDING]")
            or summary_text.startswith("API错误")
            or summary_text.startswith("生成失败")
            or ("AI摘要服务暂时繁忙" in summary_text)
        )
        needs_title_zh = not title_zh

        summary_input = content if len(content) > 20 else title
        if needs_summary and summary_input:
            result = _generate_ai_summary_with_timeout(summary_input, title)
            summary_text = result.get("summary", summary_text)
            title_zh = result.get("title_zh", title_zh)

        if needs_title_zh and not title_zh:
            title_zh = _translate_title_to_chinese(title)

        try:
            cursor.execute(
                "UPDATE hotspots SET ai_summary = ?, title_zh = ? WHERE id = ?",
                (summary_text, title_zh, row["id"]),
            )
            conn.commit()
            updated += 1
        except Exception:
            conn.rollback()
            failed += 1

        processed += 1
        if processed % 5 == 0:
            cursor.execute("UPDATE regen_summaries_jobs SET processed=?, updated=?, failed=? WHERE job_key=?", (processed, updated, failed, job_key))
            conn.commit()

    cursor.execute("UPDATE regen_summaries_jobs SET processed=?, updated=?, failed=?, status='finished', finished_at=CURRENT_TIMESTAMP WHERE job_key=?", (processed, updated, failed, job_key))
    conn.commit()
    conn.close()
    return updated


def _regen_summaries_worker(job_key: str, batch_limit: int, worker_index: int, worker_count: int) -> Tuple[int, int, int]:
    """Run a shard of regen summaries work.

    Returns (processed, updated, failed).
    Each worker uses its own DB connection.
    """

    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA busy_timeout=8000")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT id, title, content, ai_summary, title_zh
        FROM hotspots
        WHERE (
            ai_summary IS NULL
            OR ai_summary = ''
            OR ai_summary LIKE '[PENDING]%'
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
        LIMIT ?
        """,
        (int(batch_limit),),
    )
    rows = cursor.fetchall()

    processed = 0
    updated = 0
    failed = 0

    for idx, row in enumerate(rows):
        if (idx % max(1, int(worker_count))) != int(worker_index):
            continue

        summary_text = str(row["ai_summary"] or "").strip()
        title_zh = str(row["title_zh"] or "").strip()
        content = str(row["content"] or "")
        title = str(row["title"] or "")
        needs_summary = (
            (not summary_text)
            or summary_text.startswith("[PENDING]")
            or summary_text.startswith("API错误")
            or summary_text.startswith("生成失败")
            or ("AI摘要服务暂时繁忙" in summary_text)
        )
        needs_title_zh = not title_zh

        summary_input = content if len(content) > 20 else title
        if needs_summary and summary_input:
            try:
                result = _generate_ai_summary_with_timeout(summary_input, title)
                summary_text = result.get("summary", summary_text)
                title_zh = result.get("title_zh", title_zh)
            except Exception:
                failed += 1
                processed += 1
                continue

        if needs_title_zh and not title_zh:
            title_zh = _translate_title_to_chinese(title)

        try:
            cursor.execute(
                "UPDATE hotspots SET ai_summary = ?, title_zh = ? WHERE id = ?",
                (summary_text, title_zh, row["id"]),
            )
            conn.commit()
            updated += 1
        except Exception:
            conn.rollback()
            failed += 1

        processed += 1

    conn.close()
    return processed, updated, failed


    def handle_settings_put(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "JSON格式错误"})
            return

        try:
            hour = int(payload.get("daily_deadline_hour"))
        except Exception:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "daily_deadline_hour 必须是整数"})
            return

        enabled_raw = payload.get("daily_collect_enabled", True)
        enabled = bool(enabled_raw)
        if isinstance(enabled_raw, str):
            enabled = enabled_raw.strip().lower() not in {"0", "false", "no"}

        if hour < 0 or hour > 23:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "daily_deadline_hour 范围 0-23"})
            return

        conn = connect_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO settings(key,value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            ("daily_deadline_hour", str(hour)),
        )
        cur.execute(
            "INSERT INTO settings(key,value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            ("daily_collect_enabled", "1" if enabled else "0"),
        )
        conn.commit()
        conn.close()

        # notify scheduler to reload immediately
        try:
            notify_scheduler_reload()
        except Exception:
            pass

        json_response(self, HTTPStatus.OK, {"ok": True, "daily_deadline_hour": hour, "daily_collect_enabled": enabled})

    def _parse_int(self, query: Dict[str, List[str]], key: str, default: int, min_value: int, max_value: int) -> int:
        raw = (query.get(key, [""])[0] or "").strip()
        try:
            value = int(raw)
        except Exception:
            value = default
        return max(min_value, min(max_value, value))

    def handle_saved_status_options(self) -> None:
        # simple enum to keep frontend stable
        json_response(self, HTTPStatus.OK, {
            "ok": True,
            "options": [
                {"value": "new", "label": "New"},
                {"value": "reading", "label": "Reading"},
                {"value": "done", "label": "Done"},
                {"value": "archived", "label": "Archived"},
            ],
        })

    def handle_saved_list(self, query: Dict[str, List[str]]) -> None:
        limit = self._parse_int(query, "limit", 50, 1, 200)
        offset = self._parse_int(query, "offset", 0, 0, 1000000)
        status = (query.get("status", [""])[0] or "").strip().lower()

        where = "1=1"
        params: List[Any] = []
        if status:
            where = "status = ?"
            params.append(status)

        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(f"SELECT COUNT(*) AS cnt FROM saved_items WHERE {where}", tuple(params))
        total_row = cursor.fetchone()
        total = int(total_row["cnt"] if total_row else 0)

        cursor.execute(
            f"""
            SELECT id, hotspot_id, title, url, source_name, origin_type, status, note, created_at, updated_at
            FROM saved_items
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (*params, limit, offset),
        )
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()

        json_response(self, HTTPStatus.OK, {"ok": True, "items": rows, "total": total, "limit": limit, "offset": offset})

    def handle_saved_create(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "JSON格式错误"})
            return

        origin_type = str(payload.get("origin_type", ""))
        if origin_type not in {"hotspot", "url"}:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "origin_type 仅支持 hotspot/url"})
            return

        hotspot_id = str(payload.get("hotspot_id", "") or "").strip()
        title = str(payload.get("title", "") or "").strip()
        url = str(payload.get("url", "") or "").strip()
        source_name = str(payload.get("source_name", "") or "").strip()
        status = str(payload.get("status", "new") or "new").strip().lower()
        note = str(payload.get("note", "") or "").strip()

        if origin_type == "hotspot":
            if not hotspot_id:
                json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "hotspot_id 不能为空"})
                return
            # auto-populate title/url/source from hotspots if not provided
            conn = connect_db()
            cursor = conn.cursor()
            cursor.execute("SELECT title, url, source FROM hotspots WHERE id = ? LIMIT 1", (hotspot_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "hotspot_id 无效"})
                return
            if not title:
                title = row["title"] or ""
            if not url:
                url = row["url"] or ""
            if not source_name:
                source_name = row["source"] or ""
        else:
            if not url:
                json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "url 不能为空"})
                return
            if not title:
                title = url
            if not source_name:
                try:
                    parsed = urlparse(url)
                    source_name = parsed.netloc or "Web"
                except Exception:
                    source_name = "Web"
            conn = connect_db()
            cursor = conn.cursor()

        # dedupe key: hotspot_id for hotspot, url for url
        if origin_type == "hotspot":
            dedupe_key = f"hotspot:{hotspot_id}"
        else:
            dedupe_key = f"url:{url}"  # normalized later if needed
        item_id = hashlib.md5(dedupe_key.encode("utf-8")).hexdigest()[:16]

        cursor.execute(
            """
            INSERT INTO saved_items (id, hotspot_id, title, url, source_name, origin_type, status, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                hotspot_id=excluded.hotspot_id,
                title=excluded.title,
                url=excluded.url,
                source_name=excluded.source_name,
                origin_type=excluded.origin_type,
                status=excluded.status,
                note=excluded.note
            """,
            (item_id, hotspot_id or None, title, url, source_name, origin_type, status, note),
        )
        conn.commit()
        conn.close()

        json_response(self, HTTPStatus.OK, {"ok": True, "id": item_id})

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
    start_scheduler_thread()
    server = create_server(port=port)
    print(f"Dashboard running at http://127.0.0.1:{port}")
    server.serve_forever()
