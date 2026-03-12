from __future__ import annotations

import sqlite3
import traceback
import os
import queue
import threading
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from src.scraper import AIScraper


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


def _run_daily_collection_with_timeout(scraper: AIScraper, timeout_seconds: float) -> Tuple[int, int]:
    out: "queue.Queue[Tuple[str, Any, Any]]" = queue.Queue(maxsize=1)

    def _worker() -> None:
        try:
            result = scraper.run_daily_collection()
            out.put(("ok", result, None))
        except Exception as exc:
            out.put(("err", exc, traceback.format_exc()))

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    t.join(timeout_seconds)

    if t.is_alive():
        raise TimeoutError(f"collect run timed out after {int(timeout_seconds)}s")

    if out.empty():
        raise RuntimeError("collect run worker exited without result")

    state, payload, tb = out.get_nowait()
    if state == "err":
        raise RuntimeError(f"{payload.__class__.__name__}: {payload}\n{tb}")

    if not isinstance(payload, tuple) or len(payload) != 2:
        raise RuntimeError("collect run returned unexpected result shape")
    return int(payload[0] or 0), int(payload[1] or 0)


def _connect_db(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30)
    conn.execute("PRAGMA busy_timeout=30000")
    try:
        conn.set_busy_timeout(30000)
    except Exception:
        pass
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.row_factory = sqlite3.Row
    return conn


def run_collect_job(db_path: str, run_id: int) -> None:
    """Run collection job and update collect_runs status.

    This function is safe to run in a background thread.
    ALWAYS writes finished_at/status, even if scraper crashes.
    """

    started_at = datetime.now()
    conn = _connect_db(db_path)
    cursor = conn.cursor()

    try:
        scraper = AIScraper(db_path)
        run_timeout = _get_timeout_seconds("COLLECT_RUN_TIMEOUT_SECONDS", 1800.0)
        hotspots_count, opportunities_count = _run_daily_collection_with_timeout(scraper, run_timeout)

        try:
            cursor.execute(
                """
                SELECT status, COUNT(*) AS cnt
                FROM source_status
                WHERE date(created_at) = date('now')
                GROUP BY status
                """
            )
            status_rows = cursor.fetchall()
        except Exception:
            status_rows = []

        status_counts: Dict[str, int] = {str(r["status"]): int(r["cnt"] or 0) for r in status_rows} if status_rows else {}
        sources_success = int(status_counts.get("success", 0))
        sources_empty = int(status_counts.get("empty", 0))
        sources_error = int(status_counts.get("error", 0))

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
        items_row = cursor.fetchone()
        items_total = int(items_row["items_total"] if items_row else 0)
        items_new = int(items_row["items_new"] if items_row else 0)
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
                items_existing = ?,
                notes = ?
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
                None,
                run_id,
            ),
        )
        conn.commit()
    except Exception as exc:
        finished_at = datetime.now()
        final_status = "error"
        if isinstance(exc, TimeoutError) or "timed out" in str(exc).lower():
            final_status = "partial"
        cursor.execute(
            """
            UPDATE collect_runs
            SET finished_at = ?, status = ?, notes = ?
            WHERE id = ?
            """,
            (
                finished_at.strftime("%Y-%m-%d %H:%M:%S"),
                final_status,
                f"{exc.__class__.__name__}: {exc}\n{traceback.format_exc()}"[:2000],
                run_id,
            ),
        )
        conn.commit()
    finally:
        # CRITICAL: always write finished_at if not already written
        cursor.execute("SELECT finished_at FROM collect_runs WHERE id = ?", (run_id,))
        row = cursor.fetchone()
        if row and not row["finished_at"]:
            cursor.execute(
                "UPDATE collect_runs SET finished_at = ?, status = ?, notes = ? WHERE id = ?",
                (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "partial", "interrupted or timeout", run_id),
            )
            conn.commit()
        conn.close()
