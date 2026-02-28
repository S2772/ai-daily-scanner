import React, { useState, useEffect } from 'react';
import { NewsItem } from '../types';
import { NewsCard } from './NewsCard';
import { NewsDetail } from './NewsDetail';
import { Bookmark, Upload, Link as LinkIcon, Plus, FileText, X } from 'lucide-react';
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

export function Saved() {
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<'url' | 'file'>('url');
  const [importValue, setImportValue] = useState('');
  const [savedItems, setSavedItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLatestDate().then(d => fetchHotspots(d, 50))
      .then(({ hotspots }) => {
        const topItems = hotspots
          .filter(h => (h.total_score || 0) >= 7)
          .slice(0, 12)
          .map(hotspotToNewsItem);
        setSavedItems(topItems);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  const handleImport = () => {
    if (!importValue.trim()) return;
    const newItem: NewsItem = {
      id: `imported-${Date.now()}`,
      title: importType === 'url' ? `Imported: ${importValue}` : `Imported File: ${importValue}`,
      source: importType === 'url' ? 'Web' : 'Local File',
      sourcePlatform: 'Official Blog',
      sourceType: 'Imported',
      score: 8.0,
      summary: 'Imported item. AI is processing the content.',
      content: `Content imported from ${importValue}.`,
      url: importType === 'url' ? importValue : '#',
      tags: [{ id: 't-imported', name: 'Imported', type: 'manual' }],
      timestamp: new Date().toISOString(),
    };
    setSavedItems([newItem, ...savedItems]);
    setIsImportModalOpen(false);
    setImportValue('');
  };

  if (selectedNews) {
    return (
      <div className="h-full w-full animate-in fade-in duration-300">
        <NewsDetail item={selectedNews} onBack={() => setSelectedNews(null)} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-purple-600" />
            Saved Content
          </h1>
          <p className="text-gray-500 text-xs">High-score insights (7+) from today's collection.</p>
        </div>
        <button
          onClick={() => setIsImportModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-md text-xs font-medium hover:bg-gray-800 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Import Content
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : savedItems.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          No high-score items today. Try collecting data first.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {savedItems.map(item => (
            <NewsCard
              key={item.id}
              item={item}
              onClick={setSelectedNews}
              isSelected={selectedNews?.id === item.id}
            />
          ))}
        </div>
      )}

      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Import Content</h3>
              <button onClick={() => setIsImportModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button onClick={() => setImportType('url')}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${importType === 'url' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  <LinkIcon className="w-3.5 h-3.5" /> URL
                </button>
                <button onClick={() => setImportType('file')}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${importType === 'file' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  <Upload className="w-3.5 h-3.5" /> File Upload
                </button>
              </div>
              <div>
                {importType === 'url' ? (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">Article or Document URL</label>
                    <input type="url" value={importValue} onChange={(e) => setImportValue(e.target.value)}
                      placeholder="https://example.com/article"
                      className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">Upload Document (PDF, DOCX, TXT)</label>
                    <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer">
                      <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600 font-medium">Click to browse or drag file here</p>
                      <p className="text-xs text-gray-400 mt-1">Max file size: 10MB</p>
                      <input type="file" className="hidden" onChange={(e) => setImportValue(e.target.files?.[0]?.name || '')} />
                    </div>
                    {importValue && (
                      <div className="text-xs text-emerald-600 font-medium flex items-center gap-1 mt-2">
                        <FileText className="w-3.5 h-3.5" /> Selected: {importValue}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50">
              <button onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors">Cancel</button>
              <button onClick={handleImport} disabled={!importValue.trim()}
                className="px-4 py-2 text-xs font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50">Import</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
