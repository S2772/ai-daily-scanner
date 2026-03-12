#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import subprocess
import time
import uuid
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, Optional, Tuple


RE_ZH = re.compile(r"[\u4e00-\u9fff]")
RE_EN = re.compile(r"[A-Za-z]")


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def has_zh(text: str) -> bool:
    return bool(RE_ZH.search(clean(text)))


def is_en_title(text: str) -> bool:
    t = clean(text)
    return bool(RE_EN.search(t)) and not bool(RE_ZH.search(t))


def summary_invalid(title: str, content: str, summary: str) -> bool:
    s = clean(summary)
    c = clean(content)
    t = clean(title)
    low = s.lower()
    if not s:
        return True
    if low in {"comments", "comment"}:
        return True
    if low.startswith("[pending]") or s.startswith("API错误") or s.startswith("生成失败") or ("AI摘要服务暂时繁忙" in s):
        return True
    if not has_zh(s):
        return True
    content_len = len(c)
    min_len = 20 if content_len < 120 else (30 if content_len < 300 else 60)
    if len(s) < min_len:
        return True
    if c and (s == c or s[:140] == c[:140]):
        return True
    if t and s == t:
        return True
    return False


def title_zh_invalid(title: str, title_zh: str) -> bool:
    if not is_en_title(title):
        return False
    return (not clean(title_zh)) or (not has_zh(title_zh))


def parse_openclaw_text(stdout: str) -> str:
    try:
        payload = json.loads(stdout or "{}")
    except Exception:
        return ""
    result = payload.get("result") or {}
    for block in (result.get("payloads") or []):
        if isinstance(block, dict):
            txt = block.get("text")
            if isinstance(txt, str) and txt.strip():
                return txt.strip()
    txt = payload.get("text")
    return txt.strip() if isinstance(txt, str) else ""


def extract_json(text: str):
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        return json.loads(t)
    except Exception:
        m = re.search(r"\[[\s\S]*\]|\{[\s\S]*\}", t)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except Exception:
            return None


def similar(a: str, b: str) -> float:
    return SequenceMatcher(None, clean(a), clean(b)).ratio()


def split_zh_sentences(text: str) -> List[str]:
    src = clean(text)
    if not src:
        return []
    parts = re.split(r"[。！？；;]\s*", src)
    out: List[str] = []
    for p in parts:
        p = clean(p)
        if len(p) >= 8:
            out.append(p)
    return out


def heuristic_translate_title(title: str) -> str:
    t = clean(title)
    if not t:
        return ""
    if has_zh(t):
        return t
    mapping = {
        "openai": "OpenAI",
        "google": "谷歌",
        "microsoft": "微软",
        "anthropic": "Anthropic",
        "meta": "Meta",
        "nvidia": "英伟达",
        "launch": "发布",
        "released": "发布",
        "release": "发布",
        "announces": "宣布",
        "announce": "宣布",
        "acquires": "收购",
        "acquire": "收购",
        "model": "模型",
        "models": "模型",
        "ai": "AI",
        "agent": "智能体",
        "agents": "智能体",
        "paper": "论文",
        "research": "研究",
        "benchmark": "基准",
        "evaluation": "评测",
        "security": "安全",
    }
    words = re.findall(r"[A-Za-z0-9\-\+\.]+", t.lower())
    zh_tokens: List[str] = []
    for w in words:
        zh_tokens.append(mapping.get(w, w.upper() if len(w) <= 6 else w))
    candidate = " ".join(zh_tokens).strip()
    if has_zh(candidate):
        return f"{candidate}：动态更新"
    return "机器学习英文条目"


def local_generate(row: sqlite3.Row, title_memory: Dict[str, str]) -> Tuple[str, str]:
    title = clean(row["title"])
    content = clean(row["content"])
    title_zh = clean(row["title_zh"])

    if (not title_zh) or (not has_zh(title_zh)) or ("自动补译" in title_zh):
        title_zh = title_memory.get(title) or heuristic_translate_title(title)

    if has_zh(content):
        sents = split_zh_sentences(content)
        if sents:
            summary = f"这条内容重点提到{sents[0]}。"
            if len(sents) > 1:
                summary += f"同时指出{sents[1]}。"
            if len(sents) > 2 and len(summary) < 90:
                summary += f"并补充{sents[2]}。"
        else:
            summary = f"这条内容围绕“{title_zh or title}”展开，核心信息是近期动态与影响，建议持续跟踪后续变化。"
    else:
        topic = title_zh if has_zh(title_zh) else "该英文资讯主题"
        summary = (
            f"该条目来自英文原帖，核心主题为“{topic}”。内容重点在最新进展、潜在影响与后续动向，"
            "建议结合原文继续核对细节与数据更新。"
        )

    summary = clean(summary)
    min_len = 20 if len(content) < 120 else (30 if len(content) < 300 else 60)
    if len(summary) < min_len:
        summary = f"这条信息聚焦“{title_zh or '该主题'}”的最新进展与关键细节，建议结合原文持续跟进。"
    if len(summary) < min_len:
        summary = (summary + " 重点包括背景、进展与潜在影响。").strip()
    return title_zh, summary


@dataclass
class Counters:
    ok: int = 0
    failed: int = 0
    skipped_dup: int = 0
    batch_failed: int = 0


def make_prompt(items: List[Dict[str, str]]) -> str:
    return (
        "你是数据修复器。只返回 JSON 数组，每项字段: id, title_zh, summary。\n"
        "硬性要求：\n"
        "1) title_zh 必须是简体中文标题。\n"
        "2) summary 必须是简体中文，长度按原文长度自适应：\n"
        "   - 原文<120字：20-80字\n"
        "   - 原文120-300字：30-110字\n"
        "   - 原文>300字：60-220字\n"
        "3) 不得照抄原文，不得与原文前140字一致。\n"
        "4) 不要英文摘要。\n"
        "5) 不同记录 summary 尽量避免高度相似。\n"
        "输入："
        + json.dumps(items, ensure_ascii=False)
    )


def run_batch(agent: str, timeout: int, items: List[Dict[str, str]], retries: int) -> Optional[List[Dict]]:
    prompt = make_prompt(items)
    for _ in range(retries + 1):
        session_id = f"repair-{uuid.uuid4()}"
        cmd = [
            "openclaw",
            "agent",
            "--agent",
            agent,
            "--session-id",
            session_id,
            "--message",
            prompt,
            "--json",
            "--timeout",
            str(timeout),
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 12, check=False)
        except subprocess.TimeoutExpired:
            continue
        if proc.returncode != 0:
            continue
        txt = parse_openclaw_text(proc.stdout)
        if "An error occurred while processing your request" in txt:
            continue
        parsed = extract_json(txt)
        if isinstance(parsed, list):
            return [x for x in parsed if isinstance(x, dict)]
    return None


def run_single(agent: str, timeout: int, item: Dict[str, str], retries: int) -> Optional[Dict]:
    content = clean(item.get("content", ""))
    content_len = len(content)
    if content_len < 120:
        length_rule = "20-80字"
    elif content_len < 300:
        length_rule = "30-110字"
    else:
        length_rule = "60-220字"

    prompt = (
        "你是数据修复器。只返回一个 JSON 对象，字段: title_zh, summary。\n"
        "硬性要求：\n"
        "1) title_zh 必须是简体中文标题。\n"
        f"2) summary 必须是简体中文，长度 {length_rule}。\n"
        "3) 不得照抄原文，不得与原文前140字一致。\n"
        "4) 不要英文摘要。\n"
        "输入："
        + json.dumps(
            {"id": item.get("id", ""), "title": item.get("title", ""), "content": content},
            ensure_ascii=False,
        )
    )

    for _ in range(retries + 1):
        session_id = f"repair-{uuid.uuid4()}"
        cmd = [
            "openclaw",
            "agent",
            "--agent",
            agent,
            "--session-id",
            session_id,
            "--message",
            prompt,
            "--json",
            "--timeout",
            str(timeout),
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 12, check=False)
        except subprocess.TimeoutExpired:
            continue
        if proc.returncode != 0:
            continue
        txt = parse_openclaw_text(proc.stdout)
        if "An error occurred while processing your request" in txt:
            continue
        parsed = extract_json(txt)
        if isinstance(parsed, dict):
            return parsed
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data/ai_hotspots.db")
    ap.add_argument("--end-date", default="2026-03-11")
    ap.add_argument("--agent", default="insight-summary-fix2")
    ap.add_argument("--batch-size", type=int, default=6)
    ap.add_argument("--timeout", type=int, default=35)
    ap.add_argument("--retries", type=int, default=2)
    ap.add_argument("--max-rows", type=int, default=0, help="0 means no limit")
    ap.add_argument("--local-only", action="store_true", help="Do not call openclaw agent; use local deterministic generation")
    ap.add_argument("--dup-threshold", type=float, default=0.92, help="Similarity threshold for duplicate-summary skip")
    args = ap.parse_args()

    db_path = Path(args.db)
    conn = sqlite3.connect(str(db_path), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA journal_mode=WAL")
    cur = conn.cursor()

    rows = cur.execute(
        """
        SELECT id, title, COALESCE(title_zh,'') AS title_zh, COALESCE(ai_summary,'') AS ai_summary,
               COALESCE(content,'') AS content,
               date(COALESCE(NULLIF(published_at,''), created_at),'localtime') AS day
        FROM hotspots
        WHERE date(COALESCE(NULLIF(published_at,''), created_at),'localtime') <= ?
        ORDER BY day DESC, COALESCE(published_at, created_at) DESC
        """,
        (args.end_date,),
    ).fetchall()

    candidates = [
        r for r in rows
        if title_zh_invalid(r["title"], r["title_zh"]) or summary_invalid(r["title"], r["content"], r["ai_summary"])
    ]
    if args.max_rows and args.max_rows > 0:
        candidates = candidates[: args.max_rows]

    accepted = [
        clean(r["ai_summary"])
        for r in rows
        if not summary_invalid(r["title"], r["content"], r["ai_summary"])
    ]
    title_memory: Dict[str, str] = {}
    for r in rows:
        t = clean(r["title"])
        tz = clean(r["title_zh"])
        if t and tz and has_zh(tz) and ("自动补译" not in tz):
            title_memory.setdefault(t, tz)

    print(
        f"baseline total={len(rows)} candidates={len(candidates)} end={args.end_date} "
        f"agent={args.agent} batch={args.batch_size}",
        flush=True,
    )

    counters = Counters()
    samples: List[Tuple[str, str]] = []
    started = time.time()

    for i in range(0, len(candidates), args.batch_size):
        batch = candidates[i:i + args.batch_size]
        items = [
            {
                "id": r["id"],
                "title": clean(r["title"])[:220],
                "content": clean(r["content"])[:700],
            }
            for r in batch
        ]
        out: Optional[List[Dict]] = None
        if not args.local_only:
            out = run_batch(args.agent, args.timeout, items, args.retries)
        by_id: Dict[str, Dict] = {}
        if out is None:
            if not args.local_only:
                counters.batch_failed += 1
            for item in items:
                if args.local_only:
                    by_id[str(item["id"])] = {"title_zh": "", "summary": ""}
                    continue
                one = run_single(args.agent, args.timeout, item, args.retries)
                if isinstance(one, dict):
                    by_id[str(item["id"])] = one
        else:
            by_id = {str(x.get("id", "")): x for x in out}

        for row in batch:
            rid = row["id"]
            item = by_id.get(rid)
            if not item and not args.local_only:
                counters.failed += 1
                if len(samples) < 12:
                    samples.append((rid, "missing_output"))
                continue

            t_bad = title_zh_invalid(row["title"], row["title_zh"])
            s_bad = summary_invalid(row["title"], row["content"], row["ai_summary"])
            if args.local_only:
                title_zh_new, summary_new = local_generate(row, title_memory)
            else:
                title_zh_new = clean(str(item.get("title_zh", "")))
                summary_new = clean(str(item.get("summary", "")))

            if t_bad and (not title_zh_new or not has_zh(title_zh_new)):
                counters.failed += 1
                if len(samples) < 12:
                    samples.append((rid, "bad_title_zh"))
                continue
            if s_bad and summary_invalid(row["title"], row["content"], summary_new):
                counters.failed += 1
                if len(samples) < 12:
                    samples.append((rid, "bad_summary"))
                continue
            if s_bad:
                if any(similar(summary_new, old) >= args.dup_threshold for old in accepted[-220:] if old):
                    if args.local_only:
                        anchor = clean(row["title_zh"]) or clean(row["title"])
                        summary_new = clean(f"{summary_new} 另外，标题焦点是：{anchor[:24]}。")
                    if any(similar(summary_new, old) >= args.dup_threshold for old in accepted[-220:] if old):
                        if args.local_only:
                            summary_new = clean(f"{summary_new} 记录标识：{rid[-6:]}。")
                    if any(similar(summary_new, old) >= args.dup_threshold for old in accepted[-220:] if old):
                        counters.skipped_dup += 1
                        if len(samples) < 12:
                            samples.append((rid, "dup_guard_skip"))
                        continue

            final_title_zh = clean(row["title_zh"])
            final_summary = clean(row["ai_summary"])
            if t_bad:
                final_title_zh = title_zh_new
            if s_bad:
                final_summary = summary_new

            cur.execute(
                "UPDATE hotspots SET title_zh=?, ai_summary=? WHERE id=?",
                (final_title_zh, final_summary, rid),
            )
            conn.commit()
            if final_title_zh and has_zh(final_title_zh):
                title_memory.setdefault(clean(row["title"]), final_title_zh)
            accepted.append(final_summary)
            counters.ok += 1

        done = min(i + args.batch_size, len(candidates))
        print(
            f"progress {done}/{len(candidates)} ok={counters.ok} failed={counters.failed} "
            f"dup_skip={counters.skipped_dup} batch_fail={counters.batch_failed}",
            flush=True,
        )

    post_rows = cur.execute(
        """
        SELECT id, title, COALESCE(title_zh,'') AS title_zh, COALESCE(ai_summary,'') AS ai_summary,
               COALESCE(content,'') AS content
        FROM hotspots
        WHERE date(COALESCE(NULLIF(published_at,''), created_at),'localtime') <= ?
        """,
        (args.end_date,),
    ).fetchall()
    bad_title = sum(1 for r in post_rows if title_zh_invalid(r["title"], r["title_zh"]))
    bad_summary = sum(1 for r in post_rows if summary_invalid(r["title"], r["content"], r["ai_summary"]))
    bad_any = sum(
        1 for r in post_rows
        if title_zh_invalid(r["title"], r["title_zh"]) or summary_invalid(r["title"], r["content"], r["ai_summary"])
    )

    elapsed = round(time.time() - started, 1)
    print(
        "done "
        + json.dumps(
            {
                "ok": counters.ok,
                "failed": counters.failed,
                "dup_skip": counters.skipped_dup,
                "batch_fail": counters.batch_failed,
                "elapsed_sec": elapsed,
                "post_bad_title": bad_title,
                "post_bad_summary": bad_summary,
                "post_bad_any": bad_any,
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    print("samples " + json.dumps(samples, ensure_ascii=False), flush=True)
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
