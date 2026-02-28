#!/usr/bin/env python3
"""
测试数据生成 - 用于验证系统功能
"""

import sqlite3
import json
from datetime import datetime, timedelta
import random

def create_test_data():
    """创建测试数据"""
    conn = sqlite3.connect("data/ai_hotspots.db")
    cursor = conn.cursor()
    
    # 清空现有数据
    cursor.execute("DELETE FROM hotspots")
    cursor.execute("DELETE FROM opportunities")
    cursor.execute("DELETE FROM notes")
    
    # 测试热点数据
    test_hotspots = [
        {
            "title": "OpenAI发布新一代多模态模型GPT-5",
            "content": "OpenAI今天发布了GPT-5，支持文本、图像、音频的多模态理解，在多项基准测试中刷新记录。",
            "url": "https://openai.com/blog/gpt5",
            "source": "OpenAI官方博客",
            "category": "产品发布",
            "tags": json.dumps(["大语言模型", "多模态", "NLP"]),
            "innovation_score": 9,
            "commercial_score": 10,
            "tech_score": 8,
            "investment_score": 9,
            "total_score": 9
        },
        {
            "title": "谷歌DeepMind突破性论文登上Nature",
            "content": "DeepMind团队在Nature发表论文，提出新的强化学习算法，在复杂游戏环境中达到人类专家水平。",
            "url": "https://www.nature.com/articles/deepmind-rl",
            "source": "Nature期刊",
            "category": "技术突破",
            "tags": json.dumps(["强化学习", "学术研究", "游戏AI"]),
            "innovation_score": 10,
            "commercial_score": 7,
            "tech_score": 6,
            "investment_score": 8,
            "total_score": 8
        },
        {
            "title": "AI医疗初创公司获1亿美元B轮融资",
            "content": "专注于癌症早期诊断的AI公司MedAI完成1亿美元B轮融资，由红杉资本领投。",
            "url": "https://techcrunch.com/medai-funding",
            "source": "TechCrunch",
            "category": "投资融资",
            "tags": json.dumps(["医疗AI", "创业公司", "计算机视觉"]),
            "innovation_score": 7,
            "commercial_score": 9,
            "tech_score": 7,
            "investment_score": 10,
            "total_score": 8
        },
        {
            "title": "Meta开源750亿参数大语言模型",
            "content": "Meta宣布开源LLaMA 3模型，包含750亿参数，性能接近GPT-4但完全免费商用。",
            "url": "https://ai.meta.com/blog/llama3",
            "source": "Meta AI博客",
            "category": "开源项目",
            "tags": json.dumps(["开源", "大语言模型", "商业化"]),
            "innovation_score": 8,
            "commercial_score": 10,
            "tech_score": 9,
            "investment_score": 8,
            "total_score": 9
        },
        {
            "title": "英伟达发布新一代AI芯片H200",
            "content": "英伟达推出H200 GPU，专为大规模AI训练设计，性能比前代提升40%。",
            "url": "https://nvidia.com/news/h200",
            "source": "英伟达新闻",
            "category": "硬件发布",
            "tags": json.dumps(["AI芯片", "硬件", "算力"]),
            "innovation_score": 8,
            "commercial_score": 9,
            "tech_score": 10,
            "investment_score": 9,
            "total_score": 9
        }
    ]
    
    # 插入测试热点
    for i, hotspot in enumerate(test_hotspots):
        hotspot_id = f"test_{i:03d}"
        cursor.execute('''
        INSERT INTO hotspots 
        (id, title, content, url, source, category, tags, 
         innovation_score, commercial_score, tech_score, investment_score, total_score, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
        ''', (
            hotspot_id,
            hotspot["title"],
            hotspot["content"],
            hotspot["url"],
            hotspot["source"],
            hotspot["category"],
            hotspot["tags"],
            hotspot["innovation_score"],
            hotspot["commercial_score"],
            hotspot["tech_score"],
            hotspot["investment_score"],
            hotspot["total_score"],
            f"-{random.randint(0, 2)} days"  # 随机时间，模拟最近几天的数据
        ))
    
    # 测试机会数据
    test_opportunities = [
        {
            "title": "AI医疗诊断工具",
            "description": "基于计算机视觉的自动诊断系统，市场潜力巨大但竞争相对较少",
            "category": "医疗AI",
            "potential_score": 85,
            "competition_level": "低竞争",
            "resources_needed": "医疗数据、AI算法专家、合规认证",
            "timeline": "6-12个月产品化，2-3年规模化"
        },
        {
            "title": "教育个性化AI助手",
            "description": "自适应学习路径推荐系统，解决教育资源不均问题",
            "category": "教育科技",
            "potential_score": 78,
            "competition_level": "中等竞争",
            "resources_needed": "教育内容、AI模型、用户数据",
            "timeline": "3-6个月MVP，1-2年用户增长"
        },
        {
            "title": "AI内容创作平台",
            "description": "一站式AI内容生成工具，覆盖文案、图像、视频创作",
            "category": "内容创作",
            "potential_score": 82,
            "competition_level": "高竞争",
            "resources_needed": "多模态AI技术、内容模板、分发渠道",
            "timeline": "4-8个月开发，1年商业化"
        }
    ]
    
    # 插入测试机会
    for i, opportunity in enumerate(test_opportunities):
        opp_id = f"opp_{i:03d}"
        cursor.execute('''
        INSERT INTO opportunities 
        (id, title, description, category, potential_score, competition_level, resources_needed, timeline)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            opp_id,
            opportunity["title"],
            opportunity["description"],
            opportunity["category"],
            opportunity["potential_score"],
            opportunity["competition_level"],
            opportunity["resources_needed"],
            opportunity["timeline"]
        ))
    
    # 测试笔记数据
    test_notes = [
        {
            "hotspot_id": "test_000",
            "content": "GPT-5的多模态能力很强大，但商业化路径需要观察",
            "tags": "重要,商业化"
        },
        {
            "hotspot_id": "test_001",
            "content": "DeepMind的强化学习研究很有启发性，可以应用到机器人控制",
            "tags": "技术研究,机器人"
        }
    ]
    
    # 插入测试笔记
    for i, note in enumerate(test_notes):
        note_id = f"note_{i:03d}"
        cursor.execute('''
        INSERT INTO notes (id, hotspot_id, content, tags)
        VALUES (?, ?, ?, ?)
        ''', (
            note_id,
            note["hotspot_id"],
            note["content"],
            note["tags"]
        ))
    
    conn.commit()
    conn.close()
    
    print("✅ 测试数据创建完成！")
    print(f"  添加了 {len(test_hotspots)} 个测试热点")
    print(f"  添加了 {len(test_opportunities)} 个测试机会")
    print(f"  添加了 {len(test_notes)} 个测试笔记")

if __name__ == "__main__":
    create_test_data()