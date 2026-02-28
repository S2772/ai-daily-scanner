import React, { useState } from 'react';
import { mockNews } from '../data/mockData';
import { NewsItem } from '../types';
import { NewsDetail } from './NewsDetail';
import { Bookmark, Upload, Link as LinkIcon, Plus, FileText, Globe, Twitter, MessageCircle, Newspaper, Github, Droplets, Mic, X } from 'lucide-react';

const getSourceIcon = (platform: string) => {
  switch (platform) {
    case 'Twitter': return <Twitter className="w-3.5 h-3.5" />;
    case 'WeChat': return <MessageCircle className="w-3.5 h-3.5" />;
    case '小红书': return <Droplets className="w-3.5 h-3.5" />;
    case 'Official Blog': return <Globe className="w-3.5 h-3.5" />;
    case 'Podcast': return <Mic className="w-3.5 h-3.5" />;
    case 'News Portal': return <Newspaper className="w-3.5 h-3.5" />;
    case 'Github': return <Github className="w-3.5 h-3.5" />;
    default: return <FileText className="w-3.5 h-3.5" />;
  }
};

export function Saved() {
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<'url' | 'file'>('url');
  const [importValue, setImportValue] = useState('');
  
  // For demonstration, we'll just use the first 3 items from mockNews as "saved"
  const [savedItems, setSavedItems] = useState<NewsItem[]>(mockNews.slice(0, 3));

  const handleImport = () => {
    if (!importValue.trim()) return;
    
    const newItem: NewsItem = {
      id: `imported-${Date.now()}`,
      title: importType === 'url' ? `Imported from URL: ${importValue}` : `Imported File: ${importValue}`,
      source: importType === 'url' ? 'Web' : 'Local File',
      sourcePlatform: importType === 'url' ? 'Official Blog' : 'News Portal',
      sourceType: 'Imported',
      score: 8.0,
      summary: 'This is an imported item. The AI is currently processing the content to generate a full summary and extract key insights.',
      content: `Content imported from ${importValue}.\n\nProcessing...`,
      url: importType === 'url' ? importValue : '#',
      tags: [{ id: 't-imported', name: 'Imported', type: 'manual' }],
      timestamp: new Date().toISOString()
    };

    setSavedItems([newItem, ...savedItems]);
    setIsImportModalOpen(false);
    setImportValue('');
  };

  if (selectedNews) {
    return (
      <div className="h-full w-full max-w-4xl mx-auto animate-in fade-in duration-300">
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
          <p className="text-gray-500 text-xs">Your personal collection of bookmarked insights and imported documents.</p>
        </div>
        
        <button 
          onClick={() => setIsImportModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-md text-xs font-medium hover:bg-gray-800 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Import Content
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {savedItems.map(item => (
          <div 
            key={item.id}
            onClick={() => setSelectedNews(item)}
            className="bg-white border border-[#EAEAEA] rounded-lg p-5 hover:border-purple-500/30 hover:shadow-sm transition-all cursor-pointer group flex flex-col h-48"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="text-gray-400 group-hover:text-purple-600 transition-colors">
                  {getSourceIcon(item.sourcePlatform)}
                </div>
                <span>{item.sourcePlatform}</span>
              </div>
              <span className="text-[10px] text-gray-400">
                {new Date(item.timestamp).toLocaleDateString()}
              </span>
            </div>
            
            <h3 className="text-sm font-semibold text-gray-900 mb-2 group-hover:text-purple-700 transition-colors line-clamp-2">
              {item.title}
            </h3>
            
            <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed flex-1">
              {item.summary}
            </p>
          </div>
        ))}
      </div>

      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Import Content</h3>
              <button 
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setImportType('url')}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${
                    importType === 'url' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" /> URL
                </button>
                <button
                  onClick={() => setImportType('file')}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${
                    importType === 'file' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" /> File Upload
                </button>
              </div>

              <div>
                {importType === 'url' ? (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">Article or Document URL</label>
                    <input 
                      type="url" 
                      value={importValue}
                      onChange={(e) => setImportValue(e.target.value)}
                      placeholder="https://example.com/article"
                      className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">Upload Document (PDF, DOCX, TXT)</label>
                    <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer">
                      <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600 font-medium">Click to browse or drag file here</p>
                      <p className="text-xs text-gray-400 mt-1">Max file size: 10MB</p>
                      {/* Hidden input for real implementation */}
                      <input 
                        type="file" 
                        className="hidden" 
                        onChange={(e) => setImportValue(e.target.files?.[0]?.name || '')}
                      />
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
              <button 
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleImport}
                disabled={!importValue.trim()}
                className="px-4 py-2 text-xs font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
