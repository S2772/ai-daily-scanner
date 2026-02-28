#!/usr/bin/env python3
"""
测试Twitter爬虫功能
"""

import sys
sys.path.insert(0, '/Users/s/.openclaw/workspace-jarvis/ai_daily_scanner')

from src.twitter_scraper import TwitterScraper

if __name__ == '__main__':
    scraper = TwitterScraper()
    print("测试Twitter爬虫...")
    print("="*50)

    # 测试单个用户
    print("\n测试获取 @karpathy 的推文...")
    tweets = scraper.fetch_twitter_profile_with_jina('karpathy')
    print(f"获取到 {len(tweets)} 条推文")

    if tweets:
        print("\n第一条推文示例:")
        print(f"  标题: {tweets[0]['title']}")
        print(f"  来源: {tweets[0]['source']}")
        print(f"  分类: {tweets[0]['category']}")
        print(f"  标签: {tweets[0]['tags']}")

    # 测试完整收集
    print("\n" + "="*50)
    print("测试完整Twitter热点收集...")
    count = scraper.run_twitter_collection()
    print(f"\n✓ 成功收集 {count} 条推文")
