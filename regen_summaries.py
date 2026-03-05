#!/usr/bin/env python3
"""批量补全热点的 AI 摘要与中文标题（使用 summary agent）"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from webapp import _translate_title_to_chinese, connect_db, generate_ai_summary

def regen_all(force: bool = False):
    conn = connect_db()
    cursor = conn.cursor()

    if force:
        cursor.execute("UPDATE hotspots SET ai_summary = NULL, title_zh = NULL")
        conn.commit()
        print(f"已清空所有摘要，准备重新生成...")

    cursor.execute("""
        SELECT id, title, content, ai_summary, title_zh FROM hotspots
        WHERE (
            ai_summary IS NULL
            OR ai_summary = ''
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
    """)
    rows = cursor.fetchall()
    total = len(rows)
    print(f"待补全摘要/翻译: {total} 条")

    for i, row in enumerate(rows, 1):
        rid, title, content = row["id"], row["title"], row["content"]
        summary_text = str(row["ai_summary"] or "").strip()
        title_zh = str(row["title_zh"] or "").strip()
        needs_summary = (
            (not summary_text)
            or summary_text.startswith("API错误")
            or summary_text.startswith("生成失败")
            or ("AI摘要服务暂时繁忙" in summary_text)
        )
        needs_title_zh = not title_zh

        print(f"[{i}/{total}] {title[:50]}...")
        summary_input = content if content and len(content) > 20 else title
        if needs_summary and summary_input:
            result = generate_ai_summary(summary_input, title)
            summary_text = result.get("summary", summary_text)
            title_zh = result.get("title_zh", title_zh)
        if needs_summary and not summary_text:
            fallback = (content or title or "").strip()
            summary_text = (fallback[:220] + "...") if len(fallback) > 220 else fallback

        if needs_title_zh and not title_zh:
            title_zh = _translate_title_to_chinese(title)

        cursor.execute(
            "UPDATE hotspots SET ai_summary = ?, title_zh = ? WHERE id = ?",
            (summary_text, title_zh, rid)
        )
        conn.commit()
        preview = summary_text or title_zh or "已补全"
        print(f"  ✓ {preview[:60]}...")

    conn.close()
    print(f"\n完成！共处理 {total} 条记录。")

if __name__ == "__main__":
    force = "--force" in sys.argv
    regen_all(force=force)
