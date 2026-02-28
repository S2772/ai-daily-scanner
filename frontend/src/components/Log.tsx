import React, { useState } from 'react';
import { FileText, Calendar, Filter, ChevronDown, Download, Share2, ArrowLeft, Zap, Target } from 'lucide-react';
import { mockNews, mockOpportunities } from '../data/mockData';
import { NewsCard } from './NewsCard';
import { NewsDetail } from './NewsDetail';
import { NewsItem } from '../types';

interface LogReport {
  id: string;
  type: 'daily' | 'weekly' | 'monthly';
  date: string;
  title: string;
  summary: string;
  analysis: string;
  stats: {
    processed: number;
    highValue: number;
    opportunities: number;
  };
}

const mockLogs: LogReport[] = [
  {
    id: 'l1',
    type: 'daily',
    date: '2023-10-27',
    title: 'Daily Intelligence Brief',
    summary: 'Analyzed 1,284 items. Key trends include a surge in AI agent frameworks and new developments in multimodal models.',
    analysis: 'Today\'s data shows a significant pivot towards agentic workflows. We observed 42 high-value articles discussing frameworks like AutoGen and LangGraph being deployed in production environments. Additionally, multimodal capabilities are becoming standard, with new releases focusing on unified vision-language understanding.',
    stats: { processed: 1284, highValue: 42, opportunities: 3 }
  },
  {
    id: 'l2',
    type: 'daily',
    date: '2023-10-26',
    title: 'Daily Intelligence Brief',
    summary: 'Analyzed 1,150 items. Focus on enterprise AI adoption and cost reduction strategies in cloud computing.',
    analysis: 'Enterprise adoption is maturing. The focus has shifted from "what is AI" to "how to deploy AI cost-effectively." We tracked 38 high-value discussions around model quantization, efficient serving (vLLM), and hybrid cloud-edge deployments.',
    stats: { processed: 1150, highValue: 38, opportunities: 2 }
  },
  {
    id: 'l3',
    type: 'weekly',
    date: '2023-10-20',
    title: 'Weekly Strategic Overview',
    summary: 'This week saw a significant shift towards open-source models outperforming proprietary ones in specific vertical tasks. 3 major opportunities identified in the RPA sector.',
    analysis: 'The open-source ecosystem is accelerating. Models like Llama 3 and Mistral are being fine-tuned for specific verticals (legal, medical, coding) and are matching or beating GPT-4 class models in those narrow domains. This commoditization of intelligence is creating massive opportunities in the application layer, particularly in replacing legacy RPA (Robotic Process Automation) systems with intelligent, adaptable agents.',
    stats: { processed: 8450, highValue: 215, opportunities: 12 }
  },
  {
    id: 'l4',
    type: 'monthly',
    date: '2023-09-30',
    title: 'September Monthly Analysis',
    summary: 'September was dominated by hardware announcements and the release of new foundational models. The landscape is shifting towards edge computing AI.',
    analysis: 'September marked a turning point for AI hardware. With new specialized silicon announcements, the bottleneck is shifting from compute to memory bandwidth. We also observed a strong trend of "small language models" (SLMs) designed specifically for edge devices (phones, IoT), indicating a future where inference is highly distributed rather than centralized in the cloud.',
    stats: { processed: 35200, highValue: 890, opportunities: 45 }
  }
];

export function Log() {
  const [filterType, setFilterType] = useState<'all' | 'daily' | 'weekly' | 'monthly'>('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogReport | null>(null);
  const [activeTab, setActiveTab] = useState<'insights' | 'opportunities'>('insights');
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  const filteredLogs = mockLogs.filter(log => filterType === 'all' || log.type === filterType);

  if (selectedNews) {
    return <NewsDetail item={selectedNews} onBack={() => setSelectedNews(null)} />;
  }

  if (selectedLog) {
    return (
      <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2">
        <button 
          onClick={() => setSelectedLog(null)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors mb-4 w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Logs
        </button>

        <div className="bg-white border border-[#EAEAEA] rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                selectedLog.type === 'daily' ? 'bg-blue-50 text-blue-600' :
                selectedLog.type === 'weekly' ? 'bg-purple-50 text-purple-600' :
                'bg-emerald-50 text-emerald-600'
              }`}>
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{selectedLog.title}</h1>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(selectedLog.date).toLocaleDateString()}</span>
                  <span className="opacity-50">•</span>
                  <span className="capitalize">{selectedLog.type} Report</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors">
                <Share2 className="w-4 h-4" />
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors">
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex gap-6 py-4 border-y border-gray-100 mb-5">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 mb-1">Items Processed</span>
              <span className="text-lg font-semibold text-gray-900">{selectedLog.stats.processed.toLocaleString()}</span>
            </div>
            <div className="w-px bg-gray-100"></div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 mb-1">High Value Insights</span>
              <span className="text-lg font-semibold text-gray-900">{selectedLog.stats.highValue.toLocaleString()}</span>
            </div>
            <div className="w-px bg-gray-100"></div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 mb-1">Opportunities Found</span>
              <span className="text-lg font-semibold text-gray-900">{selectedLog.stats.opportunities.toLocaleString()}</span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Executive Summary & Analysis</h3>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {selectedLog.analysis}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4 border-b border-[#EAEAEA]">
          <button
            onClick={() => setActiveTab('insights')}
            className={`pb-2 text-sm font-medium flex items-center gap-1.5 transition-colors relative ${
              activeTab === 'insights' ? 'text-purple-700' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Zap className="w-4 h-4" />
            Top 10 Insights
            {activeTab === 'insights' && (
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-600 rounded-t-full"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('opportunities')}
            className={`pb-2 text-sm font-medium flex items-center gap-1.5 transition-colors relative ${
              activeTab === 'opportunities' ? 'text-purple-700' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Target className="w-4 h-4" />
            Top Opportunities
            {activeTab === 'opportunities' && (
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-600 rounded-t-full"></span>
            )}
          </button>
        </div>

        {activeTab === 'insights' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockNews.slice(0, 10).map(item => (
              <NewsCard key={item.id} item={item} onClick={setSelectedNews} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {mockOpportunities.slice(0, 5).map(opp => (
              <div key={opp.id} className="bg-white border border-[#EAEAEA] rounded-lg p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">{opp.title}</h3>
                  <span className="text-[10px] text-gray-500">{new Date(opp.date).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-gray-600 mb-3 line-clamp-2">{opp.description}</p>
                <div className="flex gap-1.5">
                  {opp.relatedTags.map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-gray-600 font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Log</h1>
          <p className="text-gray-500 text-xs">Automated daily, weekly, and monthly intelligence summaries.</p>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#EAEAEA] rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
          >
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            {filterType === 'all' ? 'All Reports' : filterType.charAt(0).toUpperCase() + filterType.slice(1)}
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
          
          {isDropdownOpen && (
            <div className="absolute right-0 mt-1 w-36 bg-white border border-[#EAEAEA] rounded-md shadow-lg z-10 py-1">
              {['all', 'daily', 'weekly', 'monthly'].map(option => (
                <button
                  key={option}
                  onClick={() => {
                    setFilterType(option as any);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs ${
                    filterType === option ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {option === 'all' ? 'All Reports' : option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {filteredLogs.map(log => (
          <div 
            key={log.id} 
            onClick={() => setSelectedLog(log)}
            className="bg-white border border-[#EAEAEA] rounded-lg p-5 hover:border-purple-500/30 transition-all group cursor-pointer"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
                  log.type === 'daily' ? 'bg-blue-50 text-blue-600' :
                  log.type === 'weekly' ? 'bg-purple-50 text-purple-600' :
                  'bg-emerald-50 text-emerald-600'
                }`}>
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-purple-700 transition-colors">{log.title}</h3>
                  <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(log.date).toLocaleDateString()}</span>
                    <span className="opacity-50">•</span>
                    <span className="capitalize">{log.type}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            
            <p className="text-gray-600 text-xs leading-relaxed mb-4">
              {log.summary}
            </p>
            
            <div className="flex gap-4 pt-3 border-t border-gray-100">
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500">Processed</span>
                <span className="text-xs font-semibold text-gray-900">{log.stats.processed.toLocaleString()}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500">High Value</span>
                <span className="text-xs font-semibold text-gray-900">{log.stats.highValue.toLocaleString()}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500">Opportunities</span>
                <span className="text-xs font-semibold text-gray-900">{log.stats.opportunities.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
