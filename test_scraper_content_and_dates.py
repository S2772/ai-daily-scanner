import tempfile
import unittest
from unittest.mock import patch

from src.scraper import AIScraper
from src.twitter_scraper import TwitterScraper


class ScraperContentAndDatesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix='.db')
        self.scraper = AIScraper(self.tmp.name)

    def tearDown(self):
        self.tmp.close()

    def test_save_hotspot_keeps_created_at_stable_and_normalizes_published_at(self):
        item = {
            'id': 'x1',
            'title': 'Test title',
            'content': 'A long enough body for testing published parsing.' * 4,
            'url': 'https://example.com/post',
            'source': 'https://example.com/feed',
            'category': '产品发布',
            'tags': '[]',
            'published_at': '2026-03-11T08:01:02.000Z',
            'innovation_score': 1,
            'commercial_score': 2,
            'tech_score': 3,
            'investment_score': 4,
            'total_score': 5,
        }

        self.scraper.save_hotspot(item)

        import sqlite3
        conn = sqlite3.connect(self.tmp.name)
        row = conn.execute("SELECT created_at, published_at FROM hotspots WHERE id='x1'").fetchone()
        conn.close()

        self.assertIsNotNone(row)
        self.assertNotEqual((row[0] or '').strip(), '')
        self.assertEqual(row[1], '2026-03-11 08:01:02')

    def test_save_hotspot_can_skip_ai_summary_generation_for_collect_path(self):
        item = {
            'id': 'x2',
            'title': 'Test title',
            'content': 'A long enough body for testing summary bypass.' * 4,
            'url': 'https://example.com/post-2',
            'source': 'https://example.com/feed',
            'category': '产品发布',
            'tags': '[]',
            'innovation_score': 1,
            'commercial_score': 2,
            'tech_score': 3,
            'investment_score': 4,
            'total_score': 5,
        }

        with patch.object(self.scraper, '_generate_ai_summary', side_effect=AssertionError('should not be called')):
            self.scraper.save_hotspot(item, generate_summary=False)

        import sqlite3
        conn = sqlite3.connect(self.tmp.name)
        row = conn.execute("SELECT ai_summary FROM hotspots WHERE id='x2'").fetchone()
        conn.close()

        self.assertIsNotNone(row)
        self.assertEqual(row[0] or '', '')

    def test_save_twitter_hotspot_can_skip_ai_summary_generation_for_collect_path(self):
        twitter = TwitterScraper(self.tmp.name)
        item = {
            'id': 'tw1',
            'title': 'Twitter title',
            'content': 'Long enough tweet content for bypass testing.' * 4,
            'url': 'https://twitter.com/example/status/1',
            'source': 'Twitter/@example',
            'category': '产品发布',
            'tags': '[]',
            'engagement': 0,
        }

        with patch.object(twitter, '_generate_summary', side_effect=AssertionError('should not be called')):
            twitter.save_twitter_hotspot(item, generate_summary=False)

        import sqlite3
        conn = sqlite3.connect(self.tmp.name)
        row = conn.execute("SELECT ai_summary FROM hotspots WHERE id='tw1'").fetchone()
        conn.close()

        self.assertIsNotNone(row)
        self.assertEqual(row[0] or '', '')

    def test_parse_rss_backfills_short_sspai_summary_with_article_content(self):
        feed = b'''<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0"><channel><title>test</title>
        <item>
          <title>Short teaser</title>
          <link>https://sspai.com/post/123</link>
          <description><![CDATA[\u67e5\u770b\u5168\u6587]]></description>
          <pubDate>Tue, 11 Mar 2026 08:00:00 GMT</pubDate>
        </item>
        </channel></rss>'''

        with patch('src.scraper.requests.get') as mock_get, patch.object(self.scraper, 'fetch_web_content', return_value='完整正文' * 80):
            mock_resp = mock_get.return_value
            mock_resp.content = feed
            mock_resp.raise_for_status.return_value = None
            result = self.scraper.parse_rss_feed_with_status('https://sspai.com/feed')

        self.assertEqual(result['status'], 'success')
        self.assertEqual(len(result['items']), 1)
        self.assertGreater(len(result['items'][0]['content']), 200)
        self.assertEqual(result['items'][0]['published_at'], '2026-03-11 08:00:00')

    def test_parse_wewe_atom_uses_article_link_when_feed_content_is_ui_noise(self):
        atom = b'''<?xml version="1.0" encoding="utf-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>\u793a\u4f8b\u516c\u4f17\u53f7</title>
            <link href="https://mp.weixin.qq.com/s/example" />
            <updated>2026-03-11T03:35:39.000Z</updated>
            <content type="html"><![CDATA[<div>Video Mini Program</div><div>Like</div><div>Wow</div>]]></content>
          </entry>
        </feed>'''

        with patch.object(self.scraper, 'fetch_web_content', return_value='公众号完整正文' * 100):
            items = self.scraper._parse_wewe_atom('http://localhost:4000/feeds/demo.atom', atom)

        self.assertEqual(len(items), 1)
        self.assertGreater(len(items[0]['content']), 500)
        self.assertEqual(items[0]['published_at'], '2026-03-11 03:35:39')

    def test_identify_opportunities_uses_localtime_for_today_window(self):
        import sqlite3

        conn = sqlite3.connect(self.tmp.name)
        conn.execute(
            """
            INSERT INTO hotspots (
                id, title, content, url, source, category, tags,
                innovation_score, commercial_score, tech_score, investment_score, total_score,
                created_at, published_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
            """,
            (
                'today_local_1',
                '本地时间热点一',
                'A' * 200,
                'https://example.com/local-1',
                'feed',
                '产品发布',
                '["AI","SaaS"]',
                1,
                8,
                2,
                7,
                18,
            ),
        )
        conn.execute(
            """
            INSERT INTO hotspots (
                id, title, content, url, source, category, tags,
                innovation_score, commercial_score, tech_score, investment_score, total_score,
                created_at, published_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
            """,
            (
                'today_local_2',
                '本地时间热点二',
                'B' * 200,
                'https://example.com/local-2',
                'feed',
                '产品发布',
                '["AI","SaaS"]',
                2,
                7,
                3,
                6,
                18,
            ),
        )
        conn.commit()
        conn.close()

        opportunities = self.scraper.identify_opportunities()

        self.assertEqual(len(opportunities), 1)
        self.assertEqual(opportunities[0]['category'], '产品发布')


if __name__ == '__main__':
    unittest.main()
