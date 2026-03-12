import sqlite3
import tempfile
import unittest
from unittest.mock import patch
import os
import time

import webapp


class CollectPostprocessTest(unittest.TestCase):
    def _create_db(self, path: str) -> None:
        conn = sqlite3.connect(path)
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE collect_runs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              started_at TEXT,
              finished_at TEXT,
              status TEXT,
              hotspots_inserted INTEGER DEFAULT 0,
              opportunities_count INTEGER DEFAULT 0,
              sources_success INTEGER DEFAULT 0,
              sources_empty INTEGER DEFAULT 0,
              sources_error INTEGER DEFAULT 0,
              items_total INTEGER DEFAULT 0,
              items_new INTEGER DEFAULT 0,
              items_existing INTEGER DEFAULT 0,
              notes TEXT
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE regen_summaries_jobs (
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
        cur.execute(
            """
            CREATE TABLE hotspots (
              id TEXT PRIMARY KEY,
              title TEXT,
              content TEXT,
              ai_summary TEXT,
              title_zh TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
        conn.close()

    def test_repair_stale_collect_runs_marks_old_running_rows_partial(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
            self._create_db(tmp.name)
            conn = sqlite3.connect(tmp.name)
            conn.execute(
                "INSERT INTO collect_runs (id, started_at, status, notes) VALUES (1, datetime('now', '-5 hours'), 'running', 'manual')"
            )
            conn.commit()
            conn.close()

            repaired = webapp._repair_stale_collect_runs(tmp.name, stale_after_seconds=60)

            self.assertEqual(repaired, 1)
            conn = sqlite3.connect(tmp.name)
            row = conn.execute("SELECT status, finished_at, notes FROM collect_runs WHERE id = 1").fetchone()
            conn.close()
            self.assertEqual(row[0], "partial")
            self.assertTrue((row[1] or "").strip())
            self.assertIn("recovered stale running collect", (row[2] or "").lower())

    def test_repair_stale_regen_jobs_marks_old_running_rows_interrupted(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
            self._create_db(tmp.name)
            conn = sqlite3.connect(tmp.name)
            conn.execute(
                "INSERT INTO regen_summaries_jobs (job_key, status, created_at, started_at) VALUES ('2026-03-10', 'running', datetime('now', '-5 hours'), datetime('now', '-5 hours'))"
            )
            conn.commit()
            conn.close()

            repaired = webapp._repair_stale_regen_jobs(tmp.name, stale_after_seconds=60)

            self.assertEqual(repaired, 1)
            conn = sqlite3.connect(tmp.name)
            row = conn.execute("SELECT status, finished_at, error FROM regen_summaries_jobs WHERE job_key = '2026-03-10'").fetchone()
            conn.close()
            self.assertEqual(row[0], "interrupted")
            self.assertTrue((row[1] or "").strip())
            self.assertIn("recovered stale running regen job", (row[2] or "").lower())

    def test_repair_stale_regen_jobs_marks_old_queued_rows_interrupted(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
            self._create_db(tmp.name)
            conn = sqlite3.connect(tmp.name)
            conn.execute(
                "INSERT INTO regen_summaries_jobs (job_key, status, created_at) VALUES ('2026-03-11', 'queued', datetime('now', '-5 hours'))"
            )
            conn.commit()
            conn.close()

            repaired = webapp._repair_stale_regen_jobs(tmp.name, stale_after_seconds=60)

            self.assertEqual(repaired, 1)
            conn = sqlite3.connect(tmp.name)
            row = conn.execute("SELECT status, finished_at, error FROM regen_summaries_jobs WHERE job_key = '2026-03-11'").fetchone()
            conn.close()
            self.assertEqual(row[0], "interrupted")
            self.assertTrue((row[1] or "").strip())
            self.assertIn("recovered stale queued regen job", (row[2] or "").lower())

    def test_successful_collect_enqueues_regen_job(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
            self._create_db(tmp.name)
            conn = sqlite3.connect(tmp.name)
            conn.execute(
                """
                INSERT INTO collect_runs
                (id, started_at, finished_at, status, hotspots_inserted, items_total, items_new, items_existing)
                VALUES (1, '2026-03-12 09:16:38', '2026-03-12 09:20:00', 'success', 20, 20, 20, 0)
                """
            )
            conn.commit()
            conn.close()

            with patch.object(webapp, "_start_regen_summaries_job", return_value={"job_key": "2026-03-12", "status": "queued"}) as mock_start:
                result = webapp._maybe_enqueue_regen_after_collect(tmp.name, 1)

            self.assertEqual(result, {"job_key": "2026-03-12", "status": "queued"})
            mock_start.assert_called_once()

    def test_failed_collect_does_not_enqueue_regen_job(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
            self._create_db(tmp.name)
            conn = sqlite3.connect(tmp.name)
            conn.execute(
                """
                INSERT INTO collect_runs
                (id, started_at, finished_at, status, hotspots_inserted, items_total, items_new, items_existing)
                VALUES (1, '2026-03-12 09:16:38', '2026-03-12 09:20:00', 'error', 20, 20, 20, 0)
                """
            )
            conn.commit()
            conn.close()

            with patch.object(webapp, "_start_regen_summaries_job") as mock_start:
                result = webapp._maybe_enqueue_regen_after_collect(tmp.name, 1)

            self.assertIsNone(result)
            mock_start.assert_not_called()

    def test_regen_job_finishes_when_summary_generation_times_out(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
            self._create_db(tmp.name)
            conn = sqlite3.connect(tmp.name)
            conn.execute(
                """
                INSERT INTO hotspots (id, title, content, ai_summary, title_zh, created_at)
                VALUES ('h1', 'English title', 'Long enough content for summary generation.' || substr('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 1, 30), '', '', datetime('now'))
                """
            )
            conn.execute(
                "INSERT INTO regen_summaries_jobs (job_key, status, created_at, batch_limit) VALUES ('2026-03-12', 'queued', datetime('now'), 10)"
            )
            conn.commit()
            conn.close()

            def slow_summary(*args, **kwargs):
                time.sleep(0.2)
                return {"summary": "should not be stored", "title_zh": "不应写入"}

            with patch.object(webapp, "DB_PATH", tmp.name), \
                 patch.object(webapp, "generate_ai_summary", side_effect=slow_summary), \
                 patch.object(webapp, "_translate_title_to_chinese", return_value="英文标题"), \
                 patch.dict(os.environ, {"REGEN_SUMMARY_ITEM_TIMEOUT_SECONDS": "0.05"}, clear=False):
                updated = webapp._regen_summaries_job("2026-03-12", batch_limit=10)

            self.assertEqual(updated, 1)
            conn = sqlite3.connect(tmp.name)
            row = conn.execute(
                "SELECT ai_summary, title_zh FROM hotspots WHERE id = 'h1'"
            ).fetchone()
            job = conn.execute(
                "SELECT status, processed, updated, failed, finished_at FROM regen_summaries_jobs WHERE job_key = '2026-03-12'"
            ).fetchone()
            conn.close()
            self.assertTrue((row[0] or "").startswith("[PENDING]"))
            self.assertEqual(row[1], "英文标题")
            self.assertEqual(job[0], "finished")
            self.assertEqual(job[1], 1)
            self.assertEqual(job[2], 1)
            self.assertEqual(job[3], 0)
            self.assertTrue((job[4] or "").strip())


if __name__ == "__main__":
    unittest.main()
