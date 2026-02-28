import React, { useState, useRef, useEffect } from 'react';
import { Calendar, TrendingUp, TrendingDown, Activity, ChevronDown, ArrowRight, Zap, Target } from 'lucide-react';
import { mockNews, mockOpportunities } from '../data/mockData';

const StatCard = ({ title, value, trend, trendUp, subtitle }: { title: string, value: string, trend: string, trendUp: boolean, subtitle: string }) => (
  <div className="bg-white p-4 rounded-lg border border-[#EAEAEA] flex flex-col gap-1.5 hover:border-purple-500/30 transition-colors">
    <div className="text-xs text-gray-500 font-medium">{title}</div>
    <div className="text-2xl font-semibold tracking-tight text-gray-900">{value}</div>
    <div className="flex items-center gap-1.5 mt-0.5">
      <div className={`flex items-center gap-0.5 text-[10px] font-medium px-1 py-0.5 rounded ${trendUp ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>
        {trendUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
        {trend}
      </div>
      <span className="text-[10px] text-gray-400">{subtitle}</span>
    </div>
  </div>
);

const ActivityHeatmap = () => {
  const weeks = 14;
  const daysPerWeek = 7;
  
  const getColor = (intensity: number) => {
    switch (intensity) {
      case 0: return 'bg-gray-50';
      case 1: return 'bg-purple-100';
      case 2: return 'bg-purple-300';
      case 3: return 'bg-purple-500';
      case 4: return 'bg-purple-700';
      default: return 'bg-gray-50';
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg border border-[#EAEAEA] h-full flex flex-col hover:border-purple-500/30 transition-colors">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xs font-semibold flex items-center gap-1.5 text-gray-700">
          <Activity className="w-3.5 h-3.5" />
          Processing Activity
        </h3>
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <span>Less</span>
          <div className="flex gap-0.5">
            <div className="w-2 h-2 rounded-[2px] bg-gray-50"></div>
            <div className="w-2 h-2 rounded-[2px] bg-purple-100"></div>
            <div className="w-2 h-2 rounded-[2px] bg-purple-300"></div>
            <div className="w-2 h-2 rounded-[2px] bg-purple-500"></div>
            <div className="w-2 h-2 rounded-[2px] bg-purple-700"></div>
          </div>
          <span>More</span>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1 mt-auto scrollbar-hide">
        {Array.from({ length: weeks }).map((_, w) => (
          <div key={w} className="flex flex-col gap-1">
            {Array.from({ length: daysPerWeek }).map((_, d) => {
              const isWeekend = d === 0 || d === 6;
              const base = isWeekend ? 0 : 1;
              const intensity = Math.min(4, base + Math.floor(Math.random() * 4));
              return (
                <div 
                  key={d} 
                  className={`w-2.5 h-2.5 rounded-[2px] ${getColor(intensity)} hover:ring-1 hover:ring-purple-500/50 transition-all cursor-pointer`}
                  title={`Activity: ${intensity}`}
                ></div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export function Overview({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const [timeRange, setTimeRange] = useState('Today');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const timeOptions = ['Today', 'Yesterday', 'This Week', 'This Month', 'All Time'];

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-gray-500 text-xs">Real-time monitoring of AI analysis and data extraction.</p>
        </div>
        
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#EAEAEA] rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
          >
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            {timeRange}
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
          
          {isDropdownOpen && (
            <div className="absolute right-0 mt-1 w-36 bg-white border border-[#EAEAEA] rounded-md shadow-lg z-10 py-1">
              {timeOptions.map(option => (
                <button
                  key={option}
                  onClick={() => {
                    setTimeRange(option);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs ${
                    timeRange === option ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          <StatCard 
            title="Processed Items" 
            value="1,284" 
            trend="+12.5%" 
            trendUp={true} 
            subtitle="vs yesterday" 
          />
          <StatCard 
            title="High Score (8+)" 
            value="42" 
            trend="+5.2%" 
            trendUp={true} 
            subtitle="vs yesterday" 
          />
          <StatCard 
            title="Noise Filtered" 
            value="1,242" 
            trend="-2.1%" 
            trendUp={false} 
            subtitle="vs yesterday" 
          />
          <StatCard 
            title="Opportunities" 
            value="3" 
            trend="+1" 
            trendUp={true} 
            subtitle="vs yesterday" 
          />
        </div>
        <div className="lg:col-span-1">
          <ActivityHeatmap />
        </div>
      </div>

      {/* System Status / Data Sources */}
      <div className="bg-white border border-[#EAEAEA] rounded-lg p-4 flex flex-col mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 text-gray-900">
            <Activity className="w-4 h-4 text-blue-500" />
            Active Data Sources
          </h3>
          <button 
            onClick={() => setActiveTab('sources')}
            className="text-xs font-medium text-purple-600 hover:text-purple-700 flex items-center gap-0.5"
          >
            Manage <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['Twitter API', 'WeChat RSS', 'HackerNews', 'Github Trending'].map((source, idx) => (
            <div key={source} className="p-3 rounded-lg border border-gray-100 bg-gray-50 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">{source}</span>
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              </div>
              <div className="text-[10px] text-gray-500">
                Last sync: {idx === 0 ? 'Just now' : `${idx * 5 + 2} mins ago`}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Key Information</h2>
        <div className="h-px bg-[#EAEAEA] flex-1"></div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Top Insights */}
        <div className="bg-white border border-[#EAEAEA] rounded-lg p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 text-gray-900">
              <Zap className="w-4 h-4 text-amber-500" />
              Priority Insights
            </h3>
            <button 
              onClick={() => setActiveTab('feed')}
              className="text-xs font-medium text-purple-600 hover:text-purple-700 flex items-center gap-0.5"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-4 flex-1">
            {mockNews.slice(0, 4).map(news => (
              <div key={news.id} className="group cursor-pointer flex items-start justify-between gap-4 border-b border-gray-50 pb-3 last:border-0 last:pb-0" onClick={() => setActiveTab('feed')}>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800 group-hover:text-purple-600 transition-colors line-clamp-1 mb-1">
                    {news.title}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{news.sourcePlatform}</span>
                    <span className="opacity-50">•</span>
                    <span>{new Date(news.timestamp).toLocaleDateString()}</span>
                  </div>
                </div>
                <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded shrink-0 border border-purple-100">
                  Score: {news.score}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Opportunities */}
        <div className="bg-white border border-[#EAEAEA] rounded-lg p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 text-gray-900">
              <Target className="w-4 h-4 text-emerald-500" />
              Top Opportunities
            </h3>
            <button 
              onClick={() => setActiveTab('discover')}
              className="text-xs font-medium text-purple-600 hover:text-purple-700 flex items-center gap-0.5"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-4 flex-1">
            {mockOpportunities.slice(0, 3).map(opp => (
              <div key={opp.id} className="group cursor-pointer border-b border-gray-50 pb-3 last:border-0 last:pb-0" onClick={() => setActiveTab('discover')}>
                <p className="text-sm font-medium text-gray-800 group-hover:text-purple-600 transition-colors line-clamp-1 mb-2">
                  {opp.title}
                </p>
                <div className="flex flex-wrap gap-2">
                  {opp.relatedTags.slice(0, 4).map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 bg-gray-50 border border-gray-100 rounded-full text-gray-600">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
