import React, { useState } from 'react';
import { mockNews } from '../data/mockData';
import { NewsCard } from './NewsCard';
import { NewsDetail } from './NewsDetail';
import { NewsItem } from '../types';
import { Search, Filter, Plus, X, Settings2 } from 'lucide-react';

export function NewsFeed() {
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sources, setSources] = useState<string[]>(['All', 'Twitter', 'WeChat', 'Official Blog', 'News Portal', 'Github', 'HackerNews']);
  const [activeSource, setActiveSource] = useState('All');
  const [isEditingSources, setIsEditingSources] = useState(false);
  const [newSource, setNewSource] = useState('');

  const handleAddSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSource.trim() && !sources.includes(newSource.trim())) {
      setSources([...sources, newSource.trim()]);
      setNewSource('');
    }
  };

  const handleRemoveSource = (sourceToRemove: string) => {
    setSources(sources.filter(s => s !== sourceToRemove));
    if (activeSource === sourceToRemove) {
      setActiveSource('All');
    }
  };

  const filteredNews = mockNews.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some(tag => tag.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesSource = activeSource === 'All' || item.sourcePlatform === activeSource;
    return matchesSearch && matchesSource;
  });

  return (
    <div className="h-full relative overflow-hidden">
      {selectedItem ? (
        <div className="h-full w-full max-w-4xl mx-auto animate-in fade-in duration-300">
          <NewsDetail item={selectedItem} onBack={() => setSelectedItem(null)} />
        </div>
      ) : (
        <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2 w-full max-w-4xl mx-auto animate-in fade-in duration-300">
          <div className="shrink-0 mb-4 space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Insight</h1>
            <p className="text-gray-500 text-xs">AI-filtered high-value intelligence from across the web.</p>
          </div>

          <div className="shrink-0 flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input 
                type="text"
                placeholder="Search titles, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#EAEAEA] rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all shadow-sm"
              />
            </div>
            <button className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#EAEAEA] rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
              <Filter className="w-3.5 h-3.5" />
              Filter
            </button>
          </div>

          {/* Source Filters */}
          <div className="shrink-0 mb-4 bg-white border border-[#EAEAEA] rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-purple-600" />
                Sources
              </h2>
              <button 
                onClick={() => setIsEditingSources(!isEditingSources)}
                className="text-[10px] font-medium text-purple-600 hover:text-purple-700"
              >
                {isEditingSources ? 'Done' : 'Edit'}
              </button>
            </div>
            
            <div className="flex flex-wrap gap-2 items-center">
              {sources.map(source => (
                <div key={source} className="relative group">
                  <button
                    onClick={() => !isEditingSources && setActiveSource(source)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-medium transition-all ${
                      activeSource === source && !isEditingSources
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                    } ${isEditingSources && source !== 'All' ? 'pr-6' : ''}`}
                  >
                    {source}
                  </button>
                  {isEditingSources && source !== 'All' && (
                    <button 
                      onClick={() => handleRemoveSource(source)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 bg-gray-200 hover:bg-red-100 hover:text-red-600 rounded-full text-gray-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              
              {isEditingSources && (
                <form onSubmit={handleAddSource} className="flex items-center gap-1.5 ml-1">
                  <input
                    type="text"
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    placeholder="Add source..."
                    className="w-24 px-2 py-1 text-[10px] border border-gray-200 rounded-md focus:outline-none focus:border-purple-500"
                  />
                  <button 
                    type="submit"
                    disabled={!newSource.trim()}
                    className="p-1 bg-purple-50 text-purple-600 rounded-md hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-3">
            {filteredNews.map(item => (
              <NewsCard 
                key={item.id} 
                item={item} 
                onClick={setSelectedItem} 
                isSelected={selectedItem?.id === item.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
