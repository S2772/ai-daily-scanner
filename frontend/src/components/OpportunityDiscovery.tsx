import React, { useState, useRef, useEffect } from 'react';
import { mockOpportunities, mockNews, mockReports } from '../data/mockData';
import { Lightbulb, TrendingUp, ArrowRight, ArrowLeft, Calendar, ChevronDown, Filter, FileText, CheckCircle2, Flame, Droplets, Twitter, MessageCircle, FileCode, Globe, Mic, Newspaper, Github, Box, Target } from 'lucide-react';
import { NewsCard } from './NewsCard';
import { NewsDetail } from './NewsDetail';
import { NewsItem, Opportunity, SourcePlatform } from '../types';

const getSourceIcon = (platform: SourcePlatform) => {
  switch (platform) {
    case 'Twitter': return <Twitter className="w-3.5 h-3.5" />;
    case 'WeChat': return <MessageCircle className="w-3.5 h-3.5" />;
    case '小红书': return <Droplets className="w-3.5 h-3.5" />; // Placeholder for Xiaohongshu
    case 'Official Blog': return <Globe className="w-3.5 h-3.5" />;
    case 'Podcast': return <Mic className="w-3.5 h-3.5" />;
    case 'News Portal': return <Newspaper className="w-3.5 h-3.5" />;
    case 'Github': return <Github className="w-3.5 h-3.5" />;
    default: return <FileText className="w-3.5 h-3.5" />;
  }
};

export function OpportunityDiscovery() {
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [selectedDetailNewsId, setSelectedDetailNewsId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('This Week');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [generatedFor, setGeneratedFor] = useState<string[]>([]);
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

  const [selectedNewsForDetail, setSelectedNewsForDetail] = useState<NewsItem | null>(null);

  // When an opportunity is selected, default to the first related news item
  useEffect(() => {
    if (selectedOpp && selectedOpp.relatedNewsIds.length > 0) {
      setSelectedDetailNewsId(selectedOpp.relatedNewsIds[0]);
    } else {
      setSelectedDetailNewsId(null);
    }
  }, [selectedOpp]);

  const timeOptions = ['Today', 'Yesterday', 'This Week', 'This Month', 'All Time'];
  const allTags = Array.from(new Set(mockOpportunities.flatMap(opp => opp.relatedTags)));

  const filteredOpps = mockOpportunities.filter(opp => {
    if (activeTag && !opp.relatedTags.includes(activeTag)) return false;
    return true;
  });

  const handleGenerateReport = (e: React.MouseEvent, opp: Opportunity) => {
    e.stopPropagation();
    if (generatedFor.includes(opp.id)) return;
    
    setGeneratingFor(opp.id);
    setTimeout(() => {
      mockReports.push({
        id: `r${Date.now()}`,
        title: `Intelligence Report: ${opp.title}`,
        content: `This is an AI-generated intelligence report based on the opportunity: ${opp.title}.\n\nAnalysis:\n${opp.analysis}\n\nStrategic Recommendations:\n1. Early market entry is advised.\n2. Focus on core pain points identified in the analysis.\n3. Monitor competitors closely.`,
        sourceOpportunityId: opp.id,
        createdAt: new Date().toISOString()
      });
      setGeneratingFor(null);
      setGeneratedFor(prev => [...prev, opp.id]);
    }, 1500);
  };

  const [intelligenceNote, setIntelligenceNote] = useState('');

  const handleSaveNote = () => {
    if (!intelligenceNote.trim() || !selectedOpp) return;
    
    setGeneratingFor(selectedOpp.id);
    setTimeout(() => {
      mockReports.unshift({
        id: `r${Date.now()}`,
        title: `Notes on: ${selectedOpp.title}`,
        content: intelligenceNote,
        sourceOpportunityId: selectedOpp.id,
        createdAt: new Date().toISOString()
      });
      setGeneratingFor(null);
      setGeneratedFor(prev => [...prev, selectedOpp.id]);
      setIntelligenceNote('');
    }, 500);
  };

  if (selectedNewsForDetail) {
    return (
      <div className="h-full w-full max-w-4xl mx-auto animate-in fade-in duration-300">
        <NewsDetail item={selectedNewsForDetail} onBack={() => setSelectedNewsForDetail(null)} />
      </div>
    );
  }

  if (selectedOpp) {
    const relatedNews = mockNews.filter(n => selectedOpp.relatedNewsIds.includes(n.id));

    return (
      <div className="h-full flex flex-col bg-white rounded-lg overflow-hidden animate-in fade-in duration-300">
        <div className="flex items-center justify-between p-4 border-b border-[#EAEAEA] shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSelectedOpp(null)}
              className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-gray-900">Opportunity Detail</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-8">
            
            {/* Module 1: Core Information */}
            <div className="space-y-6">
              <div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedOpp.relatedTags.map(tag => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded-full font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-start justify-between gap-4">
                  <h1 className="text-2xl font-semibold tracking-tight leading-tight text-gray-900">
                    {selectedOpp.title}
                  </h1>
                  <div className={`flex flex-col items-end shrink-0 ${selectedOpp.potentialScore >= 90 ? 'text-red-600' : 'text-blue-600'}`}>
                    <div className="flex items-center gap-1">
                      <Flame className={`w-5 h-5 ${selectedOpp.potentialScore >= 90 ? 'fill-red-100' : 'fill-blue-100'}`} />
                      <span className="text-2xl font-bold">{selectedOpp.potentialScore}</span>
                    </div>
                    <span className="text-[10px] uppercase font-semibold tracking-wider opacity-70">Potential Score</span>
                  </div>
                </div>
              </div>

              {/* Trend & Action Guide */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-purple-50/50 rounded-xl p-5 border border-purple-100">
                  <h3 className="text-sm font-semibold text-purple-900 mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-purple-600" />
                    Trend Prediction (3-6 Months)
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">{selectedOpp.deepPrediction?.trend}</p>
                </div>
                <div className="bg-amber-50/50 rounded-xl p-5 border border-amber-100">
                  <h3 className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-1.5">
                    <Lightbulb className="w-4 h-4 text-amber-600" />
                    Action Guide
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">{selectedOpp.deepPrediction?.actionGuide}</p>
                </div>
              </div>

              {/* Golden Summary */}
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Opportunity Analysis</h3>
                <div className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0"></div>
                  <div>
                    <span className="text-sm font-semibold text-gray-700 mr-2">Industry Background:</span>
                    <span className="text-sm text-gray-600 leading-relaxed">{selectedOpp.goldenSummary?.background}</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 shrink-0"></div>
                  <div>
                    <span className="text-sm font-semibold text-gray-900 mr-2">Core Viewpoint:</span>
                    <span className="text-sm text-gray-800 leading-relaxed font-medium">{selectedOpp.goldenSummary?.coreViewpoint}</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0"></div>
                  <div>
                    <span className="text-sm font-semibold text-gray-700 mr-2">Actionable Advice:</span>
                    <span className="text-sm text-gray-600 leading-relaxed">{selectedOpp.goldenSummary?.actionableAdvice}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Module 2: Related News */}
            <div className="pt-6 border-t border-[#EAEAEA]">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Newspaper className="w-5 h-5 text-blue-600" />
                Related News
              </h3>
              <div className="space-y-3">
                {relatedNews.map(news => (
                  <div 
                    key={news.id}
                    className="group border border-gray-200 rounded-lg p-4 hover:border-purple-300 hover:bg-purple-50/30 transition-all cursor-pointer flex flex-col gap-2"
                    onClick={() => setSelectedNewsForDetail(news)}
                  >
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <div className="text-gray-400 group-hover:text-purple-600 transition-colors">
                        {getSourceIcon(news.sourcePlatform)}
                      </div>
                      <span>{news.sourcePlatform}</span>
                      <span>•</span>
                      <span>{new Date(news.timestamp).toLocaleDateString()}</span>
                    </div>
                    <h4 className="text-sm font-medium text-gray-900 group-hover:text-purple-700 transition-colors">
                      {news.title}
                    </h4>
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {news.summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Module 3: Intelligence (Thoughts) */}
            <div className="pt-6 border-t border-[#EAEAEA]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  Intelligence Notes
                </h3>
                <button 
                  onClick={handleSaveNote}
                  disabled={generatingFor === selectedOpp.id || !intelligenceNote.trim()}
                  className="flex items-center gap-1.5 text-xs bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
                >
                  {generatingFor === selectedOpp.id ? (
                    <span className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</span>
                  ) : generatedFor.includes(selectedOpp.id) && !intelligenceNote.trim() ? (
                    <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Saved to Intelligence</span>
                  ) : (
                    <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Save to Intelligence</span>
                  )}
                </button>
              </div>
              <textarea
                value={intelligenceNote}
                onChange={(e) => setIntelligenceNote(e.target.value)}
                placeholder="Write your thoughts, ideas, or analysis based on this opportunity..."
                className="w-full h-32 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 resize-none transition-all"
              />
              <p className="text-xs text-gray-500 mt-2">
                Notes saved here will appear in your Intelligence list, linked to this Opportunity.
              </p>
            </div>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Opportunity</h1>
          <p className="text-gray-500 text-xs">AI-generated business trends based on high-frequency tags.</p>
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

      <div className="flex flex-col gap-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-semibold text-gray-900">Discovered Opportunities</h2>
          </div>
        </div>
        
        {/* Tag Filters */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeTag === null
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-[#EAEAEA] hover:bg-gray-50'
            }`}
          >
            All Opportunities
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeTag === tag
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-[#EAEAEA] hover:bg-gray-50'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
      
      <div className="space-y-4">
        {filteredOpps.map(opp => (
          <div 
            key={opp.id} 
            onClick={() => setSelectedOpp(opp)}
            className="bg-white border border-[#EAEAEA] rounded-xl p-6 hover:border-purple-500/40 hover:shadow-md transition-all group cursor-pointer relative"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1 pr-6">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-purple-700 transition-colors">{opp.title}</h3>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {opp.relatedTags.map(tag => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 bg-purple-50/50 text-purple-600 border border-purple-100 rounded-full font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col items-end shrink-0">
                <div className={`flex items-center gap-1 ${opp.potentialScore >= 90 ? 'text-red-500' : 'text-blue-500'}`}>
                  <Flame className={`w-5 h-5 ${opp.potentialScore >= 90 ? 'fill-red-100' : 'fill-blue-100'}`} />
                  <span className="text-2xl font-bold">{opp.potentialScore}</span>
                </div>
                <span className="text-[9px] uppercase font-semibold text-gray-400 tracking-wider mt-0.5">Score</span>
              </div>
            </div>
            
            {/* Golden Summary */}
            <div className="bg-gray-50/50 rounded-lg p-4 border border-gray-100 space-y-3">
              <div className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 shrink-0"></div>
                <div>
                  <span className="text-xs font-semibold text-gray-700 mr-1">Industry Background:</span>
                  <span className="text-xs text-gray-600 leading-relaxed">{opp.goldenSummary?.background}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0"></div>
                <div>
                  <span className="text-xs font-semibold text-gray-900 mr-1">Core Viewpoint:</span>
                  <span className="text-xs text-gray-800 leading-relaxed font-medium">{opp.goldenSummary?.coreViewpoint}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0"></div>
                <div>
                  <span className="text-xs font-semibold text-gray-700 mr-1">Actionable Advice:</span>
                  <span className="text-xs text-gray-600 leading-relaxed">{opp.goldenSummary?.actionableAdvice}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="text-xs font-medium text-purple-600 flex items-center gap-1 px-3 py-1.5 bg-purple-50 rounded-md">
                Enter Workspace <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
