import React, { useState, useEffect } from 'react';
import { NewsCard } from './NewsCard';
import { NewsDetail } from './NewsDetail';
import { NewsItem } from '../types';
import { Search, RefreshCw } from 'lucide-react';
import { fetchHotspots, fetchLatestDate, Hotspot } from '../api';

function hotspotToNewsItem(h: Hotspot): NewsItem {
  return {
    id: h.id,
    title: h.title_zh || h.title,
    source: h.source,
    sourcePlatform: h.category || h.source,
    sourceType: h.category || '新闻类',
    score: h.total_score || 0,
    summary: h.ai_summary || h.content?.slice(0, 200) || '',
    content: h.content,
    url: h.url,
    tags: (h.tags || []).map((t, i) => ({ id: `${h.id}-t${i}`, name: t, type: 'ai' as const })),
    timestamp: h.created_at,
  };
}

interface NewsFeedProps {
  selectedHotspotId?: string | null;
  onClearSelection?: () => void;
}

export function NewsFeed({ selectedHotspotId, onClearSelection }: NewsFeedProps) {
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSource, setActiveSource] = useState('All');
  const [allItems, setAllItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [categories, setCategories] = useState<string[]>(['All']);

  useEffect(() => {
    fetchLatestDate().then(d => {
      setDate(d);
      return fetchHotspots(d, 100);
    }).then(({ hotspots }) => {
      const items = hotspots.map(hotspotToNewsItem);
      setAllItems(items);
      const cats = Array.from(new Set(hotspots.map(h => h.category).filter(Boolean)));
      setCategories(['All', ...cats]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Auto-select item when selectedHotspotId is provided
  useEffect(() => {
    if (selectedHotspotId && allItems.length > 0) {
      const item = allItems.find(i => i.id === selectedHotspotId);
      if (item) {
        setSelectedItem(item);
        onClearSelection?.();
      }
    }
  }, [selectedHotspotId, allItems]);

  const handleRefresh = () => {
    if (!date) return;
    setLoading(true);
    fetchHotspots(date, 100).then(({ hotspots }) => {
      setAllItems(hotspots.map(hotspotToNewsItem));
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  const filteredNews = allItems.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some(tag => tag.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesSource = activeSource === 'All' || item.sourcePlatform === activeSource;
    return matchesSearch && matchesSource;
  });

  return (
    <div className="h-full relative overflow-hidden">
      {selectedItem ? (
        <div className="h-full w-full animate-in fade-in duration-300">
          <NewsDetail item={selectedItem} onBack={() => setSelectedItem(null)} />
        </div>
      ) : (
        <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2 w-full animate-in fade-in duration-300">
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
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#EAEAEA] rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="shrink-0 mb-4 flex flex-wrap gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveSource(cat)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-medium transition-all ${
                  activeSource === cat
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
          ) : filteredNews.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              No items found. Try a different date or click Collect Now on the Overview page.
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}
