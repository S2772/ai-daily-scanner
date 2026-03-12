from __future__ import annotations

import argparse
import sqlite3
import sys
import time

import os
from pathlib import Path

# ensure repo root on sys.path so `import webapp` works
ROOT = Path(__file__).resolve().parents[1]
os.chdir(str(ROOT))
sys.path.insert(0, str(ROOT))

import webapp


def should_retry(content: str, ai_summary: str) -> bool:
    content = (content or "").strip()
    ai_summary = (ai_summary or "").strip()
    if not content:
        return False
    if not ai_summary:
        return True
    if ai_summary.startswith("[PENDING]"):
        return True

    lowered = ai_summary.lower()
    if lowered in {"comments", "comment"}:
        return True
    if len(ai_summary) < 60:
        return True

    # excerpt-like: prefix identical
    return ai_summary[:140].strip() == content[:140].strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data/ai_hotspots.db")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--sleep", type=float, default=0.2)
    args = ap.parse_args()

    conn = sqlite3.connect(args.db, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    cur = conn.cursor()

    # Reduce lock contention with the dashboard: keep write transactions short.
    conn.isolation_level = None
    cur.execute("PRAGMA wal_autocheckpoint = 1000")

    # Ensure only one backfill runs at a time (prevents self-deadlock / long locks)
    cur.execute("BEGIN IMMEDIATE")
    try:
        cur.execute("SELECT 1")
    finally:
        cur.execute("COMMIT")

    cur.execute(
        """
        SELECT id, title, content, ai_summary
        FROM hotspots
        WHERE date(created_at)=date('now')
        ORDER BY COALESCE(published_at, created_at) DESC
        LIMIT 800
        """
    )
    rows = cur.fetchall()

    to_fix = [r for r in rows if should_retry(r["content"], r["ai_summary"])]
    to_fix = to_fix[: max(0, args.limit)]
    print(f"today candidates={len(to_fix)} (limit={args.limit})")

    fixed = 0
    processed = 0
    for r in to_fix:
        res = webapp.generate_ai_summary(r["content"] or "", r["title"] or "")
        summ = (res.get("summary") or "").strip()
        if not summ or summ.startswith("[PENDING]"):
            processed += 1
            continue
        if summ[:140].strip() == (r["content"] or "")[:140].strip():
            processed += 1
            continue
        title_zh = (res.get("title_zh") or "").strip()
        cur.execute(
            "BEGIN IMMEDIATE"
        )
        try:
            cur.execute(
                "UPDATE hotspots SET ai_summary=?, title_zh=COALESCE(NULLIF(title_zh,''), ?) WHERE id=?",
                (summ, title_zh, r["id"]),
            )
            cur.execute("COMMIT")
        except Exception:
            cur.execute("ROLLBACK")
            raise

        fixed += 1
        processed += 1

        if processed % 10 == 0:
            print(f"progress {processed}/{len(to_fix)} fixed={fixed}")

        if args.sleep:
            time.sleep(args.sleep)

    conn.close()

    print(f"fixed={fixed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
