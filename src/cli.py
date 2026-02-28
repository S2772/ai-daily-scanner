#!/usr/bin/env python3
"""
AI热点日报命令行界面
提供查看、搜索、管理功能
"""

import click
import sqlite3
import json
from datetime import datetime
from tabulate import tabulate
import webbrowser
import os
from .scraper import AIScraper

class AICLI:
    def __init__(self, db_path: str = "data/ai_hotspots.db"):
        self.db_path = db_path
        self.scraper = AIScraper(db_path)
        
    def connect_db(self):
        """连接数据库"""
        return sqlite3.connect(self.db_path)
    
    def show_today_hotspots(self, limit: int = 20):
        """显示今日热点"""
        conn = self.connect_db()
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT 
            title, 
            category, 
            tags,
            innovation_score,
            commercial_score,
            total_score,
            url,
            created_at
        FROM hotspots
        WHERE date(created_at) = date('now')
        ORDER BY total_score DESC
        LIMIT ?
        ''', (limit,))
        
        rows = cursor.fetchall()
        conn.close()
        
        if not rows:
            print("今日暂无热点信息")
            return
        
        # 格式化显示
        table_data = []
        for i, row in enumerate(rows, 1):
            title, category, tags_json, innovation, commercial, total, url, created_at = row
            
            # 解析标签
            tags = json.loads(tags_json) if tags_json else []
            tags_str = ", ".join(tags[:2])  # 只显示前2个标签
            
            # 截断标题
            short_title = title[:40] + "..." if len(title) > 40 else title
            
            table_data.append([
                i,
                short_title,
                category,
                tags_str,
                f"{innovation}/10",
                f"{commercial}/10",
                f"{total}/10",
                created_at[:10]
            ])
        
        headers = ["#", "标题", "分类", "标签", "创新度", "商业潜力", "总分", "日期"]
        print("\n" + "="*100)
        print("📊 今日AI热点TOP 20")
        print("="*100)
        print(tabulate(table_data, headers=headers, tablefmt="grid"))
        print("\n💡 提示: 使用 'python main.py detail <编号>' 查看详细信息")
    
    def show_hotspot_detail(self, index: int):
        """显示热点详细信息"""
        conn = self.connect_db()
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT 
            title, 
            content,
            category, 
            tags,
            innovation_score,
            commercial_score,
            tech_score,
            investment_score,
            total_score,
            url,
            source,
            created_at
        FROM hotspots
        WHERE date(created_at) = date('now')
        ORDER BY total_score DESC
        LIMIT 20
        ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        if index < 1 or index > len(rows):
            print(f"编号 {index} 无效，请输入1-{len(rows)}之间的数字")
            return
        
        row = rows[index-1]
        title, content, category, tags_json, innovation, commercial, tech, investment, total, url, source, created_at = row
        
        # 解析标签
        tags = json.loads(tags_json) if tags_json else []
        
        print("\n" + "="*100)
        print(f"📋 热点详情")
        print("="*100)
        print(f"标题: {title}")
        print(f"分类: {category}")
        print(f"标签: {', '.join(tags)}")
        print(f"来源: {source}")
        print(f"时间: {created_at}")
        print(f"链接: {url}")
        print("\n📊 评分:")
        print(f"  创新度: {innovation}/10")
        print(f"  商业潜力: {commercial}/10")
        print(f"  技术成熟度: {tech}/10")
        print(f"  投资热度: {investment}/10")
        print(f"  综合评分: {total}/10")
        print("\n📝 内容摘要:")
        print(content[:500] + "..." if len(content) > 500 else content)
        print("\n" + "="*100)
        
        # 询问是否打开链接
        if click.confirm("是否在浏览器中打开链接？"):
            webbrowser.open(url)
    
    def show_opportunities(self):
        """显示机会挖掘结果"""
        conn = self.connect_db()
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT 
            title,
            description,
            category,
            potential_score,
            competition_level,
            resources_needed,
            timeline,
            created_at
        FROM opportunities
        WHERE date(created_at) = date('now')
        ORDER BY potential_score DESC
        LIMIT 10
        ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        if not rows:
            print("暂无机会挖掘结果")
            return
        
        table_data = []
        for i, row in enumerate(rows, 1):
            title, desc, category, score, competition, resources, timeline, created_at = row
            
            # 截断描述
            short_desc = desc[:60] + "..." if len(desc) > 60 else desc
            
            table_data.append([
                i,
                title,
                category,
                f"{score}/100",
                competition,
                short_desc,
                created_at[:10]
            ])
        
        headers = ["#", "机会标题", "领域", "潜力分", "竞争级别", "描述", "识别时间"]
        print("\n" + "="*100)
        print("💡 今日TOP 10机会蓝海")
        print("="*100)
        print(tabulate(table_data, headers=headers, tablefmt="grid"))
    
    def search_hotspots(self, keyword: str):
        """搜索热点"""
        conn = self.connect_db()
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT 
            title, 
            category, 
            tags,
            total_score,
            url,
            created_at
        FROM hotspots
        WHERE title LIKE ? OR content LIKE ?
        ORDER BY total_score DESC
        LIMIT 20
        ''', (f"%{keyword}%", f"%{keyword}%"))
        
        rows = cursor.fetchall()
        conn.close()
        
        if not rows:
            print(f"未找到包含 '{keyword}' 的热点")
            return
        
        table_data = []
        for i, row in enumerate(rows, 1):
            title, category, tags_json, score, url, created_at = row
            
            # 解析标签
            tags = json.loads(tags_json) if tags_json else []
            tags_str = ", ".join(tags[:2])
            
            # 截断标题
            short_title = title[:40] + "..." if len(title) > 40 else title
            
            table_data.append([
                i,
                short_title,
                category,
                tags_str,
                f"{score}/10",
                created_at[:10]
            ])
        
        headers = ["#", "标题", "分类", "标签", "评分", "日期"]
        print(f"\n🔍 搜索 '{keyword}' 的结果 ({len(rows)}条)")
        print("="*80)
        print(tabulate(table_data, headers=headers, tablefmt="grid"))
    
    def show_statistics(self):
        """显示统计数据"""
        conn = self.connect_db()
        cursor = conn.cursor()
        
        # 总热点数
        cursor.execute("SELECT COUNT(*) FROM hotspots")
        total_hotspots = cursor.fetchone()[0]
        
        # 今日热点数
        cursor.execute("SELECT COUNT(*) FROM hotspots WHERE date(created_at) = date('now')")
        today_hotspots = cursor.fetchone()[0]
        
        # 分类统计
        cursor.execute('''
        SELECT category, COUNT(*) as count, AVG(total_score) as avg_score
        FROM hotspots
        WHERE date(created_at) >= date('now', '-7 days')
        GROUP BY category
        ORDER BY count DESC
        ''')
        category_stats = cursor.fetchall()
        
        # 机会统计
        cursor.execute("SELECT COUNT(*) FROM opportunities")
        total_opportunities = cursor.fetchone()[0]
        
        conn.close()
        
        print("\n" + "="*100)
        print("📈 系统统计")
        print("="*100)
        print(f"总热点数: {total_hotspots}")
        print(f"今日热点: {today_hotspots}")
        print(f"识别机会: {total_opportunities}")
        
        if category_stats:
            print("\n📊 最近7天分类统计:")
            cat_data = []
            for category, count, avg_score in category_stats:
                cat_data.append([category, count, f"{avg_score:.1f}/10"])
            
            print(tabulate(cat_data, headers=["分类", "数量", "平均评分"], tablefmt="grid"))
    
    def export_daily_report(self):
        """导出日报"""
        conn = self.connect_db()
        cursor = conn.cursor()
        
        # 获取今日热点
        cursor.execute('''
        SELECT title, content, category, tags, total_score, url
        FROM hotspots
        WHERE date(created_at) = date('now')
        ORDER BY total_score DESC
        LIMIT 10
        ''')
        hotspots = cursor.fetchall()
        
        # 获取今日机会
        cursor.execute('''
        SELECT title, description, category, potential_score
        FROM opportunities
        WHERE date(created_at) = date('now')
        ORDER BY potential_score DESC
        LIMIT 5
        ''')
        opportunities = cursor.fetchall()
        
        conn.close()
        
        # 生成Markdown格式日报
        today = datetime.now().strftime("%Y-%m-%d")
        report = f"""# AI热点日报 - {today}

## 📊 今日TOP 10热点

"""
        
        for i, (title, content, category, tags_json, score, url) in enumerate(hotspots, 1):
            tags = json.loads(tags_json) if tags_json else []
            tags_str = " | ".join(tags)
            
            report += f"""### {i}. {title}
- **分类**: {category}
- **标签**: {tags_str}
- **评分**: {score}/10
- **链接**: {url}

{content[:200]}...

---
"""
        
        report += """
## 💡 今日TOP 5机会蓝海

"""
        
        for i, (title, desc, category, score) in enumerate(opportunities, 1):
            report += f"""### {i}. {title}
- **领域**: {category}
- **潜力分**: {score}/100
- **描述**: {desc}

"""
        
        report += f"""
## 📈 统计信息
- 今日收集热点: {len(hotspots)}个
- 今日识别机会: {len(opportunities)}个
- 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

---
*本报告由AI热点日报系统自动生成*
"""
        
        # 保存文件
        filename = f"reports/ai_daily_report_{today}.md"
        os.makedirs("reports", exist_ok=True)
        
        with open(filename, "w", encoding="utf-8") as f:
            f.write(report)
        
        print(f"📄 日报已保存到: {filename}")
        print(f"📝 共 {len(hotspots)} 个热点，{len(opportunities)} 个机会")
        
        # 询问是否打开文件
        if click.confirm("是否打开日报文件？"):
            webbrowser.open(f"file://{os.path.abspath(filename)}")
    
    def add_note(self, hotspot_id: str, content: str, tags: str = ""):
        """添加笔记"""
        conn = self.connect_db()
        cursor = conn.cursor()
        
        # 生成笔记ID
        import hashlib
        note_id = hashlib.md5(f"{hotspot_id}{content}{datetime.now()}".encode()).hexdigest()[:12]
        
        cursor.execute('''
        INSERT INTO notes (id, hotspot_id, content, tags)
        VALUES (?, ?, ?, ?)
        ''', (note_id, hotspot_id, content, tags))
        
        conn.commit()
        conn.close()
        print(f"✅ 笔记已添加 (ID: {note_id})")
    
    def show_notes(self):
        """显示所有笔记"""
        conn = self.connect_db()
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT n.id, h.title, n.content, n.tags, n.created_at
        FROM notes n
        LEFT JOIN hotspots h ON n.hotspot_id = h.id
        ORDER BY n.created_at DESC
        LIMIT 20
        ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        if not rows:
            print("暂无笔记")
            return
        
        table_data = []
        for i, row in enumerate(rows, 1):
            note_id, title, content, tags, created_at = row
            
            # 截断内容
            short_content = content[:50] + "..." if len(content) > 50 else content
            short_title = title[:30] + "..." if title and len(title) > 30 else title or "N/A"
            
            table_data.append([
                i,
                short_title,
                short_content,
                tags or "",
                created_at[:10]
            ])
        
        headers = ["#", "关联热点", "笔记内容", "标签", "创建时间"]
        print("\n📝 我的笔记")
        print("="*80)
        print(tabulate(table_data, headers=headers, tablefmt="grid"))

@click.group()
def cli():
    """AI热点日报系统 - 本地命令行版本"""
    pass

@cli.command()
def collect():
    """执行每日收集任务"""
    scraper = AIScraper()
    count, opportunities = scraper.run_daily_collection()
    click.echo(f"✅ 收集完成: {count}个热点, {opportunities}个机会")

@cli.command()
@click.option('--limit', default=20, help='显示数量限制')
def today(limit):
    """显示今日热点"""
    ai_cli = AICLI()
    ai_cli.show_today_hotspots(limit)

@cli.command()
@click.argument('index', type=int)
def detail(index):
    """查看热点详细信息"""
    ai_cli = AICLI()
    ai_cli.show_hotspot_detail(index)

@cli.command()
def opportunities():
    """显示机会挖掘结果"""
    ai_cli = AICLI()
    ai_cli.show_opportunities()

@cli.command()
@click.argument('keyword')
def search(keyword):
    """搜索热点"""
    ai_cli = AICLI()
    ai_cli.search_hotspots(keyword)

@cli.command()
def stats():
    """显示统计信息"""
    ai_cli = AICLI()
    ai_cli.show_statistics()

@cli.command()
def report():
    """生成并导出日报"""
    ai_cli = AICLI()
    ai_cli.export_daily_report()

@cli.command()
def notes():
    """显示我的笔记"""
    ai_cli = AICLI()
    ai_cli.show_notes()

@cli.command()
@click.argument('hotspot_id')
@click.argument('content')
@click.option('--tags', default='', help='笔记标签，用逗号分隔')
def add_note(hotspot_id, content, tags):
    """添加笔记到热点"""
    ai_cli = AICLI()
    ai_cli.add_note(hotspot_id, content, tags)

if __name__ == '__main__':
    cli()
