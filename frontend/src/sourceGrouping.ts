export const SOURCE_GROUP_ORDER = [
  'Research',
  'Official / Blogs',
  'WeChat / 公众号',
  'Social',
  'News Media',
  'Developer',
  'Audio / Video',
  'Other',
] as const;

const SOURCE_GROUP_RULES: Array<{ group: typeof SOURCE_GROUP_ORDER[number]; keywords: string[] }> = [
  {
    group: 'Research',
    keywords: ['arxiv', 'openreview', 'paperswithcode', 'semanticscholar', 'acm', 'ieee', 'nature.com', 'science.org'],
  },
  {
    group: 'Developer',
    keywords: ['github', 'gitlab', 'huggingface', 'npmjs', 'pypi', 'stackoverflow'],
  },
  {
    group: 'Social',
    keywords: ['twitter', 'x.com', 'reddit', 'weibo', 'xiaohongshu', 'zhihu', 'discord'],
  },
  {
    group: 'News Media',
    keywords: ['techcrunch', 'reuters', 'bloomberg', 'wired', 'theverge', '36kr', 'ifanr', 'news.ycombinator'],
  },
  {
    group: 'Official / Blogs',
    keywords: ['openai.com', 'anthropic.com', 'deepmind', 'ai.googleblog', 'blog', 'substack', 'newsletter', 'rss'],
  },
  {
    group: 'Audio / Video',
    keywords: ['youtube', 'bilibili', 'podcast', 'spotify'],
  },
  {
    group: 'WeChat / 公众号',
    keywords: ['localhost:4000', 'mp_wxs', 'wechat', '公众号'],
  },
];

export function inferSourceGroup(source: string): typeof SOURCE_GROUP_ORDER[number] {
  const normalized = (source || '').toLowerCase();
  for (const rule of SOURCE_GROUP_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(kw))) {
      return rule.group;
    }
  }
  return 'Other';
}
