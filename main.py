#!/usr/bin/env python3
"""
AI热点日报系统 - 主入口
本地版本，零成本，包含所有核心功能
"""

import sys
import os
from src.cli import cli

def main():
    """主函数"""
    print("="*60)
    print("🤖 AI热点日报系统 v1.0")
    print("="*60)
    print("功能列表:")
    print("  1. 每日热点收集 (python main.py collect)")
    print("  2. 查看今日热点 (python main.py today)")
    print("  3. 查看热点详情 (python main.py detail <编号>)")
    print("  4. 机会挖掘分析 (python main.py opportunities)")
    print("  5. 搜索热点 (python main.py search <关键词>)")
    print("  6. 系统统计 (python main.py stats)")
    print("  7. 生成日报 (python main.py report)")
    print("  8. 笔记管理 (python main.py notes)")
    print("  9. 添加笔记 (python main.py add-note <热点ID> <内容>)")
    print("="*60)
    
    # 检查数据库是否存在，如果不存在则初始化
    if not os.path.exists("data/ai_hotspots.db"):
        print("⚠️  首次使用，正在初始化数据库...")
        from src.scraper import AIScraper
        scraper = AIScraper()
        print("✅ 数据库初始化完成")
    
    # 运行CLI
    if len(sys.argv) > 1:
        cli()
    else:
        print("💡 使用 'python main.py --help' 查看所有命令")
        print("💡 示例: python main.py collect  # 收集今日热点")
        print("💡 示例: python main.py today    # 查看今日热点")
        print("="*60)

if __name__ == "__main__":
    main()
