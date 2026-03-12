import React, { useState } from 'react';
import { NewsItem } from '../types';
import { Star, ArrowRight, Twitter, MessageCircle, Globe, Mic, Newspaper, Github, FileText, ExternalLink, Bookmark } from 'lucide-react';
import { getTopicTagClass } from '../topicColors';
import { cardUi } from './designSystem';

interface NewsCardProps {
  key?: React.Key;
  item: NewsItem;
  onClick: (item: NewsItem) => void;
  isSelected?: boolean;
  isCompact?: boolean;
  onSave?: (item: NewsItem) => void;
  isSaved?: boolean;
}

const getSourceIcon = (platform: string) => {
  switch (platform) {
    case 'Twitter': return <Twitter className="w-3.5 h-3.5" />;
    case 'WeChat': return <MessageCircle className="w-3.5 h-3.5" />;
    case 'Official Blog': return <Globe className="w-3.5 h-3.5" />;
    case 'Podcast': return <Mic className="w-3.5 h-3.5" />;
    case 'News Portal': return <Newspaper className="w-3.5 h-3.5" />;
    case 'Github': return <Github className="w-3.5 h-3.5" />;
    case 'Social': return <Twitter className="w-3.5 h-3.5" />;
    case 'News Media': return <Newspaper className="w-3.5 h-3.5" />;
    case 'Official / Blogs': return <Globe className="w-3.5 h-3.5" />;
    case 'Audio / Video': return <Mic className="w-3.5 h-3.5" />;
    case 'Developer': return <Github className="w-3.5 h-3.5" />;
    default: return <FileText className="w-3.5 h-3.5" />;
  }
};

export function NewsCard({ item, onClick, isSelected, isCompact, onSave, isSaved }: NewsCardProps) {
  const [isRead, setIsRead] = useState(false);
  const primaryTopic = (item.sourceType || '').trim() && item.sourceType !== 'General'
    ? item.sourceType
    : '';

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  return (
    <div
      onClick={() => {
        setIsRead(true);
        onClick(item);
      }}
      className={`group relative flex w-full cursor-pointer flex-col gap-4 ${cardUi.interactive} ${
        isSelected ? cardUi.selected : ''
      } ${isRead && !isSelected ? 'opacity-80' : ''} ${isCompact ? 'p-4' : ''}`}
    >
      <div className="flex justify-between items-start">
        {onSave && !isCompact && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSave(item);
            }}
            className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium shadow-sm transition-all opacity-0 group-hover:opacity-100 ${
              isSaved
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            title="Save"
          >
            <Bookmark className={`h-3.5 w-3.5 ${isSaved ? 'fill-current' : ''}`} />
            {isSaved ? 'Saved' : 'Save'}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2 pr-4 text-xs font-medium text-gray-500">
          <div className={`flex h-6 w-6 items-center justify-center rounded-full ${isSelected ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
            {getSourceIcon(item.sourcePlatform)}
          </div>
          <span className="text-gray-700">{item.sourcePlatform}</span>
          <span className="opacity-40">-</span>
          <span className="max-w-[220px] truncate">{item.source}</span>
          <span className="opacity-40">-</span>
          <span>{formatDate(item.timestamp)}</span>
        </div>
        {!isCompact && (
          <div className="ml-2 flex shrink-0 items-center gap-1 rounded-md border border-purple-100 bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700">
            <Star className="h-3.5 w-3.5 fill-current" />
            {item.score.toFixed(1)}
          </div>
        )}
      </div>

      {!isCompact && primaryTopic && (
        <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getTopicTagClass(primaryTopic)}`}>
            {primaryTopic}
          </span>
        </div>
      )}

      <h3 className={`pr-2 font-semibold leading-snug transition-colors ${
        isSelected ? 'text-purple-900' : 'text-gray-900 group-hover:text-purple-700'
      } ${isCompact ? 'text-sm' : 'text-lg'}`}>
        {item.title}
      </h3>

      <p className={`text-gray-600 ${isCompact ? 'text-xs leading-relaxed' : 'text-sm leading-relaxed'}`}>
        {item.summary}
      </p>

      {!isCompact && (
        <div className="mt-1 flex items-center justify-between">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex max-w-[72%] items-center gap-1 rounded px-1.5 py-1 text-xs text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 hover:underline"
            title={item.url}
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            {item.url}
          </a>
          <div className="flex items-center gap-1 text-xs font-medium text-purple-600 opacity-0 transition-opacity group-hover:opacity-100">
            Read More <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>
      )}
    </div>
  );
}
