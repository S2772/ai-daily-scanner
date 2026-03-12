import os
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import patch

from src.collect_runner import run_collect_job
from src.scraper import AIScraper


class _HangScraper:
    def __init__(self, _db_path: str):
        pass

    def run_daily_collection(self):
        time.sleep(0.3)
        return 0, 0


class _DummyTwitterScraper:
    def __init__(self, _db_path: str):
        pass

    def run_twitter_collection(self):
        return 0


class CollectTimeoutGuardrailsTest(unittest.TestCase):
    def _create_collect_runner_db(self, path: str) -> None:
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
            CREATE TABLE source_status (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              source TEXT,
              source_type TEXT,
              status TEXT,
              item_count INTEGER DEFAULT 0,
              error_message TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE hotspots (
              id TEXT PRIMARY KEY,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              published_at TEXT
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE collect_run_date_breakdown (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              run_id INTEGER,
              content_date TEXT,
              item_count INTEGER
            )
            """
        )
        cur.execute(
            "INSERT INTO collect_runs (id, started_at, status, notes) VALUES (1, datetime('now'), 'running', 'manual')"
        )
        conn.commit()
        conn.close()

    def test_collect_runner_sets_finished_at_when_scraper_hangs(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
            self._create_collect_runner_db(tmp.name)

            with patch.dict(os.environ, {"COLLECT_RUN_TIMEOUT_SECONDS": "0.05"}), patch(
                "src.collect_runner.AIScraper", _HangScraper
            ):
                run_collect_job(tmp.name, 1)

            conn = sqlite3.connect(tmp.name)
            row = conn.execute("SELECT status, finished_at, notes FROM collect_runs WHERE id = 1").fetchone()
            conn.close()

            self.assertIsNotNone(row)
            self.assertEqual(row[0], "partial")
            self.assertTrue((row[1] or "").strip())
            self.assertIn("timeout", (row[2] or "").lower())

    def test_source_timeout_does_not_block_entire_collect(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
            scraper = AIScraper(tmp.name)
            scraper.sources["rss_feeds"] = ["https://slow.example/rss", "https://fast.example/rss"]

            def _fake_parse(feed_url: str):
                if "slow" in feed_url:
                    time.sleep(0.25)
                    return {
                        "source": feed_url,
                        "source_type": "rss",
                        "status": "success",
                        "item_count": 1,
                        "error_message": "",
                        "items": [{"id": "slow1", "title": "slow", "content": "slow content", "url": "https://slow", "source": feed_url, "category": "产品发布", "tags": "[]"}],
                    }
                return {
                    "source": feed_url,
                    "source_type": "rss",
                    "status": "success",
                    "item_count": 1,
                    "error_message": "",
                    "items": [{"id": "fast1", "title": "fast", "content": "fast content", "url": "https://fast", "source": feed_url, "category": "产品发布", "tags": "[]"}],
                }

            with patch.dict(
                os.environ,
                {
                    "COLLECT_SOURCE_TIMEOUT_SECONDS": "0.05",
                    "COLLECT_TWITTER_TIMEOUT_SECONDS": "1",
                },
            ), patch.object(scraper, "parse_rss_feed_with_status", side_effect=_fake_parse), patch(
                "src.scraper.TwitterScraper", _DummyTwitterScraper
            ), patch.object(scraper, "save_hotspot", return_value=None), patch.object(
                scraper, "identify_opportunities", return_value=[]
            ):
                total_items, _ = scraper.run_daily_collection()

            conn = sqlite3.connect(tmp.name)
            rows = conn.execute(
                "SELECT source, status, item_count, error_message FROM source_status ORDER BY source"
            ).fetchall()
            conn.close()

            by_source = {r[0]: r for r in rows}
            self.assertIn("https://slow.example/rss", by_source)
            self.assertIn("https://fast.example/rss", by_source)
            self.assertEqual(by_source["https://slow.example/rss"][1], "error")
            self.assertIn("timeout", (by_source["https://slow.example/rss"][3] or "").lower())
            self.assertEqual(by_source["https://fast.example/rss"][1], "success")
            self.assertEqual(total_items, 1)


if __name__ == "__main__":
    unittest.main()
