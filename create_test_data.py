#!/usr/bin/env python3
"""
创建测试数据脚本
用于在没有爬虫数据的情况下测试Web界面
"""

import sqlite3
import json
from datetime import datetime, timedelta
import random

def init_database():
    """初始化数据库并创建测试数据"""
    conn = sqlite3.connect('ai_daily.db')
    cursor = conn.cursor()
    
    # 创建表（如果不存在）
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS hotspots (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT,
            content TEXT,
            score REAL,
            innovation INTEGER,
            commercial INTEGER,
            tags TEXT,
            date TEXT,
            source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS opportunities (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT,
            description TEXT,
            score REAL,
            market_size TEXT,
            competition TEXT,
            innovation INTEGER,
            commercial INTEGER,
            tags TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            hotspot_id TEXT,
            content TEXT NOT NULL,
            tags TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (hotspot_id) REFERENCES hotspots (id)
        )
    ''')
    
    # 清空现有数据
    cursor.execute('DELETE FROM hotspots')
    cursor.execute('DELETE FROM opportunities')
    cursor.execute('DELETE FROM notes')
    
    # 创建测试热点数据
    test_hotspots = [
        {
            'id': 'hotspot_001',
            'title': '多模态AI模型实现突破性进展',
            'category': '技术突破',
            'content': '最新研究显示，多模态AI模型在理解和生成跨模态内容方面取得显著进展，支持文本、图像、音频的深度融合。',
            'score': 9.2,
            'innovation': 9,
            'commercial': 8,
            'tags': ['多模态', '技术突破', 'AI模型'],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'source': '测试数据'
        },
        {
            'id': 'hotspot_002',
            'title': 'AI在医疗诊断中的应用加速',
            'category': '医疗健康',
            'content': '多家医疗机构开始部署AI辅助诊断系统，在影像识别和疾病预测方面表现优异，准确率超过人类专家。',
            'score': 8.7,
            'innovation': 8,
            'commercial': 9,
            'tags': ['医疗AI', '诊断', '健康科技'],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'source': '测试数据'
        },
        {
            'id': 'hotspot_003',
            'title': '边缘AI芯片性能大幅提升',
            'category': '硬件',
            'content': '新一代边缘AI芯片在能效比和计算能力方面实现突破，为物联网和移动设备AI应用提供强大支持。',
            'score': 8.5,
            'innovation': 9,
            'commercial': 8,
            'tags': ['边缘计算', 'AI芯片', '硬件'],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'source': '测试数据'
        },
        {
            'id': 'hotspot_004',
            'title': 'AI生成内容监管政策出台',
            'category': '政策法规',
            'content': '多国政府开始制定AI生成内容的监管政策，旨在平衡创新发展和风险防控，对行业产生深远影响。',
            'score': 7.8,
            'innovation': 6,
            'commercial': 7,
            'tags': ['政策', '监管', 'AIGC'],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'source': '测试数据'
        },
        {
            'id': 'hotspot_005',
            'title': 'AI辅助编程工具普及加速',
            'category': '开发工具',
            'content': 'AI编程助手在开发社区中快速普及，能够显著提升代码质量和开发效率，改变软件开发工作流程。',
            'score': 8.9,
            'innovation': 8,
            'commercial': 9,
            'tags': ['编程', '开发工具', '效率提升'],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'source': '测试数据'
        },
        {
            'id': 'hotspot_006',
            'title': 'AI在气候变化预测中的应用',
            'category': '环境科学',
            'content': '研究人员利用AI模型改进气候变化预测精度，为政策制定和灾害预防提供更准确的数据支持。',
            'score': 8.3,
            'innovation': 9,
            'commercial': 7,
            'tags': ['气候变化', '预测模型', '环境AI'],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'source': '测试数据'
        }
    ]
    
    # 创建测试机会数据
    test_opportunities = [
        {
            'id': 'opp_001',
            'title': '个性化AI教育平台',
            'category': '教育科技',
            'description': '基于大语言模型的个性化学习平台，能够根据学生的学习进度、兴趣和能力提供定制化教学内容，解决教育资源不均问题。',
            'score': 8.8,
            'market_size': '千亿级',
            'competition': '中等',
            'innovation': 8,
            'commercial': 9,
            'tags': ['教育', '个性化', '学习平台']
        },
        {
            'id': 'opp_002',
            'title': 'AI驱动的供应链优化',
            'category': '企业服务',
            'description': '利用AI预测市场需求、优化库存管理和物流路线，帮助企业降低运营成本，提高供应链韧性。',
            'score': 8.5,
            'market_size': '万亿级',
            'competition': '高',
            'innovation': 7,
            'commercial': 9,
            'tags': ['供应链', '企业服务', '优化']
        },
        {
            'id': 'opp_003',
            'title': 'AI辅助药物研发平台',
            'category': '生物医药',
            'description': '结合AI和计算生物学，加速新药发现和临床试验设计，大幅降低研发成本和时间。',
            'score': 9.1,
            'market_size': '千亿级',
            'competition': '低',
            'innovation': 9,
            'commercial': 8,
            'tags': ['药物研发', '生物医药', 'AI制药']
        }
    ]
    
    # 创建测试笔记数据
    test_notes = [
        {
            'id': 'note_001',
            'hotspot_id': 'hotspot_001',
            'content': '多模态AI是未来发展方向，值得重点关注。可以探索在内容创作、教育等领域的应用机会。',
            'tags': ['重点关注', '多模态', '机会']
        },
        {
            'id': 'note_002',
            'hotspot_id': 'hotspot_002',
            'content': '医疗AI商业化路径清晰，但需要关注监管政策和数据隐私问题。可以考虑与医疗机构合作。',
            'tags': ['医疗', '商业化', '合作']
        },
        {
            'id': 'note_003',
            'hotspot_id': 'opp_001',
            'content': '教育市场空间巨大，但竞争激烈。需要找到差异化定位，比如专注于特定学科或年龄段。',
            'tags': ['教育', '差异化', '市场']
        }
    ]
    
    # 插入热点数据
    for hotspot in test_hotspots:
        cursor.execute('''
            INSERT INTO hotspots (id, title, category, content, score, innovation, commercial, tags, date, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            hotspot['id'],
            hotspot['title'],
            hotspot['category'],
            hotspot['content'],
            hotspot['score'],
            hotspot['innovation'],
            hotspot['commercial'],
            json.dumps(hotspot['tags'], ensure_ascii=False),
            hotspot['date'],
            hotspot['source']
        ))
    
    # 插入机会数据
    for opp in test_opportunities:
        cursor.execute('''
            INSERT INTO opportunities (id, title, category, description, score, market_size, competition, innovation, commercial, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            opp['id'],
            opp['title'],
            opp['category'],
            opp['description'],
            opp['score'],
            opp['market_size'],
            opp['competition'],
            opp['innovation'],
            opp['commercial'],
            json.dumps(opp['tags'], ensure_ascii=False)
        ))
    
    # 插入笔记数据
    for note in test_notes:
        cursor.execute('''
            INSERT INTO notes (id, hotspot_id, content, tags)
            VALUES (?, ?, ?, ?)
        ''', (
            note['id'],
            note['hotspot_id'],
            note['content'],
            json.dumps(note['tags'], ensure_ascii=False)
        ))
    
    conn.commit()
    conn.close()
    
    print("✅ 测试数据创建完成")
    print(f"   热点数据: {len(test_hotspots)} 条")
    print(f"   机会数据: {len(test_opportunities)} 条")
    print(f"   笔记数据: {len(test_notes)} 条")
    print(f"   数据库文件: ai_daily.db")
    print("")
    print("📊 数据概览:")
    print("   今日热点: 多模态AI、医疗AI、边缘AI芯片等")
    print("   商业机会: AI教育、供应链优化、药物研发")
    print("   系统笔记: 重点关注领域和商业建议")
    print("")
    print("🚀 现在可以启动Web服务器查看效果:")
    print("   python webapp.py")
    print("   或")
    print("   ./start.sh")

if __name__ == '__main__':
    print("=" * 50)
    print("AI热点日报系统 - 测试数据生成器")
    print("=" * 50)
    print("")
    print("正在创建测试数据...")
    print("")
    
    try:
        init_database()
        print("")
        print("=" * 50)
        print("✅ 测试数据生成成功！")
        print("=" * 50)
    except Exception as e:
        print(f"❌ 创建测试数据失败: {e}")
        print("请检查数据库权限和Python环境")