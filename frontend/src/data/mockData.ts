import { NewsItem, Opportunity, IntelligenceReport } from '../types';

export const mockNews: NewsItem[] = [
  {
    id: '1',
    title: 'OpenAI 发布新一代推理模型 o3-mini',
    source: 'OpenAI Blog',
    sourcePlatform: 'Official Blog',
    sourceType: '官方发布',
    score: 9.5,
    summary: 'OpenAI 推出 o3-mini 模型，在数学、编程和科学推理任务上表现卓越，同时成本大幅降低，响应速度更快。',
    content: 'OpenAI 今日宣布推出 o3-mini，这是一款专注于高级推理任务的小型模型。与之前的模型相比，o3-mini 在保持极高推理能力的同时，大幅降低了 API 调用成本，并提升了响应速度。该模型特别适合需要深度思考的编程辅助、数学问题求解以及复杂的科学分析。',
    url: 'https://openai.com/blog',
    tags: [
      { id: 't1', name: 'OpenAI', type: 'ai' },
      { id: 't2', name: '推理模型', type: 'ai' },
      { id: 't3', name: '重点跟进', type: 'manual' }
    ],
    timestamp: new Date().toISOString(),
    annotations: '重点关注其 API 定价策略，可能对现有 RAG 应用的成本结构产生重大影响。'
  },
  {
    id: '2',
    title: 'Anthropic Claude 3.5 Sonnet 迎来重大更新，支持计算机使用',
    source: 'Anthropic News',
    sourcePlatform: 'Official Blog',
    sourceType: '官方发布',
    score: 9.2,
    summary: 'Claude 3.5 Sonnet 升级，新增 Computer Use 功能，AI 代理现在可以直接操作计算机界面，执行复杂任务。',
    content: 'Anthropic 为其广受欢迎的 Claude 3.5 Sonnet 模型发布了突破性更新：Computer Use（计算机使用）能力。这项功能允许 Claude 像人类一样查看屏幕、移动光标、点击按钮和输入文本。这一进展为 RPA（机器人流程自动化）和个人 AI 助理领域带来了革命性的变化。',
    url: 'https://anthropic.com/news',
    tags: [
      { id: 't4', name: 'Anthropic', type: 'ai' },
      { id: 't5', name: 'Agent', type: 'ai' },
      { id: 't6', name: 'RPA', type: 'ai' },
      { id: 't7', name: '竞品参考', type: 'manual' }
    ],
    timestamp: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: '3',
    title: 'AI 视频生成赛道再添猛将：Sora 开放内测',
    source: '@OpenAI',
    sourcePlatform: 'Twitter',
    sourceType: '新闻类',
    score: 8.8,
    summary: '备受瞩目的 AI 视频生成模型 Sora 开始向部分创作者和开发者开放内测，展现出惊人的物理世界模拟能力。',
    content: '经过数月的等待，OpenAI 的 Sora 终于开始向有限的创作者群体开放内测。早期测试者分享的视频显示，Sora 不仅能生成高画质的视频，还能在一定程度上理解物理规律，保持物体在多视角下的一致性。这预示着影视制作和广告行业即将迎来巨变。',
    url: 'https://twitter.com/openai',
    tags: [
      { id: 't8', name: '多模态', type: 'ai' },
      { id: 't9', name: '视频生成', type: 'ai' },
      { id: 't10', name: 'Sora', type: 'ai' }
    ],
    timestamp: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: '4',
    title: '如何利用 RAG 技术优化企业内部知识库？',
    source: 'AI 探索者',
    sourcePlatform: 'WeChat',
    sourceType: '行业评论',
    score: 8.5,
    summary: '详细解析了 RAG（检索增强生成）技术在企业知识库中的实际应用场景和优化策略。',
    content: '文章深入探讨了 RAG 架构的最新进展，包括如何通过混合检索（语义+关键词）提升召回率，以及如何利用大模型进行重排（Rerank）以提高最终回答的准确性。作者还分享了几个低成本落地的开源方案。',
    url: 'https://mp.weixin.qq.com/',
    tags: [
      { id: 't11', name: 'RAG', type: 'ai' },
      { id: 't12', name: '企业服务', type: 'ai' }
    ],
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '5',
    title: 'a16z 最新投资笔记：AI Native 应用的下一个爆发点',
    source: 'a16z',
    sourcePlatform: 'News Portal',
    sourceType: '投资类',
    score: 9.0,
    summary: '顶级风投 a16z 发布长文，预测下一代 AI 原生应用将从“效率工具”转向“情感陪伴”和“复杂工作流自动化”。',
    content: 'a16z 认为，目前的 AI 应用大多停留在“套壳”阶段，真正的 AI Native 应用需要彻底重构交互逻辑。文章指出了两个极具潜力的方向：一是能够提供长期记忆和情感价值的 AI 伴侣；二是能够自主规划并执行多步骤任务的垂直领域 Agent。',
    url: 'https://a16z.com/',
    tags: [
      { id: 't13', name: 'a16z', type: 'ai' },
      { id: 't14', name: '投资趋势', type: 'ai' },
      { id: 't15', name: 'Agent', type: 'ai' }
    ],
    timestamp: new Date(Date.now() - 7200000).toISOString(),
  }
];

export const mockOpportunities: Opportunity[] = [
  {
    id: 'o1',
    title: '基于 Computer Use 的新一代 RPA 平台',
    description: '利用 Claude 3.5 的计算机操作能力，构建无需复杂 API 对接的视觉 RPA 工具。',
    relatedTags: ['蓝海市场', '风口爆发', '巨头入局'],
    relatedNewsIds: ['2', '5'],
    analysis: '当前痛点：传统 RPA 需要复杂的选择器配置和 API 对接，维护成本高。\n蓝海机会：开发基于视觉理解和自然语言指令的“傻瓜式” RPA 平台，赋能中小企业非技术人员。\n变现潜力：SaaS 订阅模式，按执行任务时长或次数收费。',
    date: new Date().toISOString(),
    potentialScore: 95,
    goldenSummary: {
      background: '传统 RPA 需要复杂的选择器配置和 API 对接，维护成本高，且对非结构化数据处理能力弱。',
      coreViewpoint: '基于视觉理解和自然语言指令的“傻瓜式” RPA 平台将彻底颠覆传统工作流，赋能中小企业非技术人员。',
      actionableAdvice: '切入特定垂直行业（如财税、法务、客服），构建具备行业Know-how的专属Agent，而非做通用平台。'
    },
    deepPrediction: {
      trend: '未来3-6个月，B端市场将涌现大量针对特定岗位的“数字员工”SaaS服务，传统RPA厂商将加速向Agent架构转型。',
      actionGuide: '细分赛道：自动化数据录入与审核、智能客服与工单处理。防坑避雷：避免在没有深厚行业数据积累的领域盲目开发通用工具。'
    },
    newsAnalysis: {
      '2': {
        eventExtraction: 'Anthropic 推出 Claude 3.5 Sonnet，并引入了“Computer Use”功能，允许 AI 像人类一样操作电脑。',
        microAnalysis: 'Computer Use 是 Agent 替代 RPA 的关键技术突破，使得 AI 可以直接操作现有软件，无需复杂的 API 对接，极大降低了自动化门槛。',
        entities: ['Anthropic', 'Claude 3.5 Sonnet', 'Computer Use']
      },
      '5': {
        eventExtraction: 'a16z 预测下一代 AI 原生应用将从“效率工具”转向“情感陪伴”和“复杂工作流自动化”。',
        microAnalysis: '顶级风投的判断印证了复杂工作流自动化（即新一代 RPA）是极具商业价值的赛道，资本市场对此方向高度认可。',
        entities: ['a16z', 'AI Native', 'Agent']
      }
    }
  },
  {
    id: 'o2',
    title: '低成本高推理能力的垂直领域 AI 导师',
    description: '结合 o3-mini 的低成本推理优势，打造针对特定学科（如高数、物理）的深度辅导 AI。',
    relatedTags: ['教育科技', '降本增效', '垂直应用'],
    relatedNewsIds: ['1'],
    analysis: '当前痛点：现有 AI 辅导工具在复杂数理逻辑上容易产生幻觉，且深度推理成本过高。\n蓝海机会：利用 o3-mini 的强推理和低成本特性，开发能够展示完整解题思路、引导式提问的垂直教育产品。\n变现潜力：面向 C 端学生的订阅制，或 B 端学校/培训机构的 API 接入。',
    date: new Date(Date.now() - 86400000).toISOString(),
    potentialScore: 82,
    goldenSummary: {
      background: '现有 AI 辅导工具在复杂数理逻辑上容易产生幻觉，且深度推理成本过高，难以普及。',
      coreViewpoint: '低成本、高推理模型（如 o3-mini）的出现，使得针对特定学科（如高数、物理）的深度辅导 AI 成为可能。',
      actionableAdvice: '利用强推理和低成本特性，开发能够展示完整解题思路、引导式提问的垂直教育产品，面向 C 端学生提供订阅服务。'
    },
    deepPrediction: {
      trend: '未来3-6个月，教育类 AI 应用将从“拍照搜题”向“深度辅导”演进，强调逻辑推理和个性化教学。',
      actionGuide: '细分赛道：K12 理科辅导、职业技能培训（如编程）。防坑避雷：避免仅仅做简单的 API 套壳，需结合教育心理学设计交互。'
    },
    newsAnalysis: {
      '1': {
        eventExtraction: 'OpenAI 发布了全新的 o3-mini 模型，专注于数学和编程领域的复杂推理，且成本大幅降低。',
        microAnalysis: 'o3-mini 的发布直接解决了教育 AI 的核心痛点（推理能力弱、成本高），为垂直领域 AI 导师的落地提供了基础设施。',
        entities: ['OpenAI', 'o3-mini']
      }
    }
  }
];

export const mockReports: IntelligenceReport[] = [
  {
    id: 'r1',
    title: 'Intelligence Report: AI Agents in Enterprise',
    content: `This is an AI-generated intelligence report based on the opportunity: AI Agents in Enterprise.

Analysis:
The adoption of AI agents in enterprise environments is accelerating. Companies are moving beyond simple chatbots to autonomous agents capable of executing complex, multi-step workflows.

Strategic Recommendations:
1. Focus on integration capabilities with existing enterprise software (ERP, CRM).
2. Prioritize security and data privacy, as agents will handle sensitive corporate data.
3. Develop robust monitoring and audit trails for agent actions.

Key Players:
- Anthropic (Claude 3.5 Sonnet with Computer Use)
- OpenAI (Custom GPTs and upcoming agent frameworks)
- Microsoft (Copilot Studio)`,
    sourceOpportunityId: 'o1',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: 'r2',
    title: 'Intelligence Report: Specialized Reasoning Models',
    content: `This is an AI-generated intelligence report based on the opportunity: Specialized Reasoning Models.

Analysis:
With the release of models like o3-mini, the cost of advanced reasoning has dropped significantly. This opens up new possibilities for vertical-specific applications that require deep logic but were previously economically unviable.

Strategic Recommendations:
1. Identify niche domains with high reasoning requirements (e.g., legal contract analysis, advanced mathematics tutoring).
2. Leverage the lower cost to implement multi-agent debate and self-reflection patterns.
3. Build proprietary evaluation datasets for these specific niches to maintain a competitive edge.`,
    sourceOpportunityId: 'o2',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString()
  }
];
