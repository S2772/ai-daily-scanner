import React, { useState } from 'react';
import { NewsItem } from '../types';
import { ExternalLink, Sparkles, Save, X, Maximize2, CheckCircle2, FileText } from 'lucide-react';
import { mockReports } from '../data/mockData';

interface NewsDetailProps {
  item: NewsItem;
  onBack: () => void;
}

export function NewsDetail({ item, onBack }: NewsDetailProps) {
  const [annotation, setAnnotation] = useState(item.annotations || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showFullArticle, setShowFullArticle] = useState(false);

  const handleSave = () => {
    if (!annotation.trim()) return;
    setIsSaving(true);
    setTimeout(() => {
      mockReports.unshift({
        id: `r${Date.now()}`,
        title: `Notes on: ${item.title}`,
        content: annotation,
        sourceNewsId: item.id,
        createdAt: new Date().toISOString()
      });
      setIsSaving(false);
      setIsSaved(true);
      setAnnotation('');
      setTimeout(() => setIsSaved(false), 3000);
    }, 500);
  };

  if (showFullArticle) {
    return (
      <div className="h-full flex flex-col bg-white rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[#EAEAEA] shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowFullArticle(false)}
              className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-gray-900 truncate max-w-[300px]">{item.title}</span>
          </div>
          <a 
            href={item.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 transition-colors bg-purple-50 px-3 py-1.5 rounded-md"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in Browser
          </a>
        </div>
        <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
          <div className="max-w-3xl mx-auto bg-white p-10 rounded-xl shadow-sm border border-gray-100">
            <h1 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">{item.title}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-500 mb-8 pb-8 border-b border-gray-100">
              <span className="font-medium text-gray-700">{item.source}</span>
              <span>•</span>
              <span>{new Date(item.timestamp).toLocaleString()}</span>
            </div>
            <div className="prose prose-gray max-w-none">
              <p className="text-gray-800 text-base leading-relaxed whitespace-pre-line">
                {item.content}
                {/* Mocking extra content for the "full" view */}
                {"\n\n"}
                This is a simulated full article view. In a real application, this would either render the full HTML content extracted from the source, or embed an iframe if permitted by the source's CORS policy.
                {"\n\n"}
                The AI Insight Hub automatically extracts the core text content to provide a clean, distraction-free reading experience directly within the platform.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-[#EAEAEA] shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-900">Article Detail</span>
        </div>
        <button 
          onClick={() => setShowFullArticle(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 transition-colors bg-purple-50 px-3 py-1.5 rounded-md"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Read Full Article
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map(tag => (
                <span 
                  key={tag.id} 
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    tag.type === 'ai' 
                      ? 'bg-purple-50 text-purple-700 border border-purple-100' 
                      : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}
                >
                  {tag.name}
                </span>
              ))}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight leading-tight text-gray-900">
              {item.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-gray-700 font-medium">{item.sourcePlatform}</span>
              <span className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-gray-700 font-medium">{item.sourceType}</span>
              <span className="font-medium text-gray-600">{item.source}</span>
              <span>{new Date(item.timestamp).toLocaleDateString()}</span>
              <span className="flex items-center gap-1 font-bold text-purple-700 ml-auto bg-purple-50 px-2 py-1 rounded-md border border-purple-100">
                AI Score: {item.score}
              </span>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-white rounded-xl p-5 border border-purple-100/50 shadow-sm">
            <div className="flex items-center gap-1.5 mb-3 text-sm font-semibold text-purple-900">
              <Sparkles className="w-4 h-4 text-purple-600" />
              AI Summary
            </div>
            <p className="text-gray-700 text-sm leading-relaxed">
              {item.summary}
            </p>
          </div>

          <div className="prose prose-sm prose-gray max-w-none">
            <p className="text-gray-800 text-sm leading-loose whitespace-pre-line line-clamp-[10]">
              {item.content}
            </p>
            <button 
              onClick={() => setShowFullArticle(true)}
              className="text-purple-600 text-sm font-medium hover:text-purple-700 mt-2"
            >
              Continue reading...
            </button>
          </div>

          <div className="pt-8 border-t border-[#EAEAEA]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                Intelligence Notes
              </h3>
              <button 
                onClick={handleSave}
                disabled={isSaving || !annotation.trim()}
                className="flex items-center gap-1.5 text-xs bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
              >
                {isSaving ? (
                  <span className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</span>
                ) : isSaved ? (
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Saved to Intelligence</span>
                ) : (
                  <span className="flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> Save to Intelligence</span>
                )}
              </button>
            </div>
            <textarea
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              placeholder="Record your thoughts, ideas, or to-dos here..."
              className="w-full h-32 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 resize-none transition-all"
            />
            <p className="text-xs text-gray-500 mt-2">
              Notes saved here will appear in your Intelligence list, linked to this News item.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
