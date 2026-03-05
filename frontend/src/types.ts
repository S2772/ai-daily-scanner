export type SourcePlatform = 'Twitter' | '小红书' | 'WeChat' | 'Official Blog' | 'Podcast' | 'News Portal' | 'Github' | string;
export type SourceType = '投资类' | '新闻类' | '科研类' | '官方发布' | '行业评论' | '开源社区' | string;

export interface Tag {
  id: string;
  name: string;
  type: 'ai' | 'manual';
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  sourcePlatform: SourcePlatform;
  sourceType: SourceType;
  score: number; // 1-10
  summary: string;
  ai_summary?: string;
  content: string;
  url: string;
  tags: Tag[];
  timestamp: string;
  annotations?: string;
}

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  relatedTags: string[];
  relatedNewsIds: string[];
  analysis: string;
  date: string;
  potentialScore: number;
  goldenSummary: {
    background: string;
    coreViewpoint: string;
    actionableAdvice: string;
  };
  deepPrediction: {
    trend: string;
    actionGuide: string;
  };
  newsAnalysis: Record<string, {
    eventExtraction: string;
    microAnalysis: string;
    entities: string[];
  }>;
}

export interface IntelligenceReport {
  id: string;
  title: string;
  content: string;
  sourceOpportunityId?: string;
  sourceNewsId?: string;
  createdAt: string;
}
