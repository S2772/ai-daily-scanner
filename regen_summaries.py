#!/usr/bin/env python3
"""批量重新生成所有热点的 AI 摘要（使用 summary agent）"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from webapp import generate_ai_summary, connect_db

def regen_all(force: bool = False):
    conn = connect_db()
    cursor = conn.cursor()

    if force:
        cursor.execute("UPDATE hotspots SET ai_summary = NULL, title_zh = NULL")
        conn.commit()
        print(f"已清空所有摘要，准备重新生成...")

    cursor.execute("""
        SELECT id, title, content FROM hotspots
        WHERE (ai_summary IS NULL OR ai_summary = '')
        AND content IS NOT NULL AND length(content) > 20
        ORDER BY created_at DESC
    """)
    rows = cursor.fetchall()
    total = len(rows)
    print(f"待生成摘要: {total} 条")

    for i, row in enumerate(rows, 1):
        rid, title, content = row["id"], row["title"], row["content"]
        print(f"[{i}/{total}] {title[:50]}...")
        result = generate_ai_summary(content, title)
        cursor.execute(
            "UPDATE hotspots SET ai_summary = ?, title_zh = ? WHERE id = ?",
            (result["summary"], result["title_zh"], rid)
        )
        conn.commit()
        print(f"  ✓ {result['summary'][:60]}...")

    conn.close()
    print(f"\n完成！共生成 {total} 条摘要。")

if __name__ == "__main__":
    force = "--force" in sys.argv
    regen_all(force=force)
