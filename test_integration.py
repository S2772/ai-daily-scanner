#!/usr/bin/env python3
"""
完整集成测试 - 包括Twitter数据收集
"""

import sys
sys.path.insert(0, '/Users/s/.openclaw/workspace-jarvis/ai_daily_scanner')

from src.scraper import AIScraper

if __name__ == '__main__':
    scraper = AIScraper()
    print("\n" + "="*60)
    print("🚀 AI热点日报 - 完整数据收集测试")
    print("="*60)

    # 执行每日收集
    total_items, opportunities = scraper.run_daily_collection()

    print("\n" + "="*60)
    print("✅ 收集完成！")
    print(f"   📊 总热点数: {total_items}")
    print(f"   💡 发现机会: {opportunities}")
    print("="*60 + "\n")
