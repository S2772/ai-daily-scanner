#!/usr/bin/env python3
import sqlite3
import sys
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.scraper import AIScraper, normalize_published_at

DB_PATH = 'data/ai_hotspots.db'
TODAY_SQL = "date('now','localtime')"


def count_metrics(conn):
    row = conn.execute(f'''
        SELECT
          SUM(CASE WHEN date(created_at,'localtime') = {TODAY_SQL} THEN 1 ELSE 0 END) AS created_today,
          SUM(CASE WHEN date(COALESCE(NULLIF(published_at,''), created_at),'localtime') = {TODAY_SQL} THEN 1 ELSE 0 END) AS published_today,
          SUM(CASE WHEN date(created_at,'localtime') = {TODAY_SQL} AND length(trim(COALESCE(content,''))) < 120 THEN 1 ELSE 0 END) AS short_content_today,
          SUM(CASE WHEN date(created_at,'localtime') = {TODAY_SQL} AND (published_at IS NULL OR trim(published_at)='') THEN 1 ELSE 0 END) AS missing_published_today
        FROM hotspots
    ''').fetchone()
    return dict(zip(['created_today','published_today','short_content_today','missing_published_today'], row))


def main():
    scraper = AIScraper(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    before = count_metrics(conn)

    rows = conn.execute(f'''
        SELECT id, title, url, source, content, published_at, created_at
        FROM hotspots
        WHERE date(created_at,'localtime') = {TODAY_SQL}
          AND (
            length(trim(COALESCE(content,''))) < 120
            OR published_at IS NULL
            OR trim(published_at) = ''
            OR published_at LIKE '%T%'
            OR published_at LIKE '%Z%'
          )
        ORDER BY created_at DESC
    ''').fetchall()

    fixed_content = 0
    fixed_published = 0
    still_failed = 0

    for row in rows:
        hotspot_id = row['id']
        current_content = (row['content'] or '').strip()
        current_published = (row['published_at'] or '').strip()
        new_content = current_content
        new_published = normalize_published_at(current_published)

        needs_content = len(current_content) < 120
        needs_published = new_published != current_published

        if needs_content and row['url']:
            try:
                fetched = scraper.fetch_web_content(row['url'])
            except Exception:
                fetched = ''
            if fetched and len(fetched.strip()) > len(current_content):
                new_content = fetched.strip()[:20000]
                needs_content = len(new_content) < 120

        if not needs_published and not current_published and row['url'] and 'localhost:4000/feeds/' in (row['source'] or ''):
            new_published = normalize_published_at(current_published)

        conn.execute(
            'UPDATE hotspots SET content = ?, published_at = ? WHERE id = ?',
            (new_content, new_published, hotspot_id),
        )

        changed = False
        if new_content != current_content:
            fixed_content += 1
            changed = True
        if new_published != current_published:
            fixed_published += 1
            changed = True
        if (len((new_content or '').strip()) < 120) or ((row['published_at'] or '').strip() == '' and (new_published or '').strip() == ''):
            still_failed += 1
        elif not changed and (len(current_content) < 120 or not current_published):
            still_failed += 1

    conn.commit()
    after = count_metrics(conn)
    conn.close()

    print({
        'before': before,
        'after': after,
        'fixed_content': fixed_content,
        'fixed_published': fixed_published,
        'still_failed': still_failed,
        'checked': len(rows),
        'finished_at': datetime.now().isoformat(timespec='seconds'),
    })


if __name__ == '__main__':
    main()
