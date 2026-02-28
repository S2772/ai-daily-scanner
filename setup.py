#!/usr/bin/env python3
"""
安装脚本 - 一键安装AI热点日报系统
"""

import subprocess
import sys
import os

def run_command(cmd, description):
    """运行命令并显示进度"""
    print(f"🔧 {description}...")
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ {description}完成")
            return True
        else:
            print(f"❌ {description}失败: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ {description}异常: {e}")
        return False

def main():
    """主安装函数"""
    print("="*60)
    print("🚀 AI热点日报系统安装程序")
    print("="*60)
    
    # 1. 检查Python版本
    print("📋 检查系统环境...")
    if sys.version_info < (3, 8):
        print("❌ 需要Python 3.8或更高版本")
        return False
    
    print(f"✅ Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")
    
    # 2. 安装依赖
    if not run_command("pip install -r requirements.txt", "安装Python依赖"):
        return False
    
    # 3. 创建必要目录
    print("📁 创建目录结构...")
    os.makedirs("data", exist_ok=True)
    os.makedirs("logs", exist_ok=True)
    os.makedirs("reports", exist_ok=True)
    print("✅ 目录创建完成")
    
    # 4. 初始化数据库
    print("🗄️  初始化数据库...")
    try:
        from src.scraper import AIScraper
        scraper = AIScraper()
        print("✅ 数据库初始化完成")
    except Exception as e:
        print(f"❌ 数据库初始化失败: {e}")
        return False
    
    # 5. 创建快捷方式
    print("🔗 创建快捷方式...")
    if sys.platform == "win32":
        # Windows
        with open("ai_daily.bat", "w") as f:
            f.write('@echo off\npython main.py %*\n')
        print("✅ 创建了 ai_daily.bat 快捷方式")
    else:
        # Linux/Mac
        with open("ai_daily.sh", "w") as f:
            f.write('#!/bin/bash\npython3 main.py "$@"\n')
        os.chmod("ai_daily.sh", 0o755)
        print("✅ 创建了 ai_daily.sh 快捷方式")
    
    # 6. 测试运行
    print("🧪 测试系统运行...")
    try:
        import src.cli
        print("✅ 系统导入测试通过")
    except Exception as e:
        print(f"⚠️  导入测试警告: {e}")
    
    print("\n" + "="*60)
    print("🎉 安装完成！")
    print("="*60)
    print("\n📖 使用说明:")
    print("  1. 收集今日热点: python main.py collect")
    print("  2. 查看今日热点: python main.py today")
    print("  3. 查看热点详情: python main.py detail 1")
    print("  4. 机会挖掘分析: python main.py opportunities")
    print("  5. 搜索热点: python main.py search 'AI'")
    print("  6. 系统统计: python main.py stats")
    print("  7. 生成日报: python main.py report")
    print("  8. 查看所有命令: python main.py --help")
    
    if sys.platform != "win32":
        print("\n🚀 快捷方式:")
        print("  ./ai_daily.sh collect   # 使用快捷方式")
    
    print("\n💡 建议:")
    print("  1. 每天运行一次 'collect' 收集最新热点")
    print("  2. 使用 'report' 生成日报查看")
    print("  3. 使用 'notes' 记录个人认知")
    print("  4. 关注 'opportunities' 发现蓝海机会")
    
    print("\n📁 文件结构:")
    print("  data/           # 数据库文件")
    print("  reports/        # 生成的日报")
    print("  logs/           # 日志文件")
    print("  src/            # 源代码")
    print("  main.py         # 主程序")
    
    print("\n🔧 如需添加自定义信息源，编辑 src/scraper.py 中的 sources 配置")
    print("="*60)
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)