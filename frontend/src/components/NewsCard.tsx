import React, { useState } from 'react';
import { NewsItem } from '../types';
import { Star, ArrowRight, Twitter, MessageCircle, Globe, Mic, Newspaper, Github, FileText, CheckCircle2, Bookmark, MoreHorizontal } from 'lucide-react';

interface NewsCardProps {
  key?: React.Key;
  item: NewsItem;
  onClick: (item: NewsItem) => void;
  isSelected?: boolean;
  isCompact?: boolean;
}

const getSourceIcon = (platform: string) => {
  switch (platform) {
    case 'Twitter': return <Twitter className="w-3.5 h-3.5" />;
    case 'WeChat': return <MessageCircle className="w-3.5 h-3.5" />;
    case 'Official Blog': return <Globe className="w-3.5 h-3.5" />;
    case 'Podcast': return <Mic className="w-3.5 h-3.5" />;
    case 'News Portal': return <Newspaper className="w-3.5 h-3.5" />;
    case 'Github': return <Github className="w-3.5 h-3.5" />;
    default: return <FileText className="w-3.5 h-3.5" />;
  }
};

export function NewsCard({ item, onClick, isSelected, isCompact }: NewsCardProps) {
  const [isRead, setIsRead] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <div 
      onClick={() => {
        setIsRead(true);
        onClick(item);
      }}
      className={`group relative border rounded-xl p-4 transition-all cursor-pointer flex flex-col gap-2 w-full ${
        isSelected 
          ? 'bg-purple-50/50 border-purple-200 shadow-sm' 
          : 'bg-white border-[#EAEAEA] hover:border-purple-500/40 hover:shadow-sm'
      } ${isRead && !isSelected ? 'opacity-75' : ''}`}
    >
      {/* Hover Actions */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm px-1.5 py-1 rounded-md border border-gray-100 shadow-sm z-10">
        <button 
          onClick={(e) => handleActionClick(e, () => setIsRead(!isRead))}
          className={`p-1 rounded hover:bg-gray-100 transition-colors ${isRead ? 'text-purple-600' : 'text-gray-400'}`}
          title={isRead ? "Mark as unread" : "Mark as read"}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={(e) => handleActionClick(e, () => setIsSaved(!isSaved))}
          className={`p-1 rounded hover:bg-gray-100 transition-colors ${isSaved ? 'text-amber-500' : 'text-gray-400'}`}
          title={isSaved ? "Remove from saved" : "Save for later"}
        >
          <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
        </button>
        <button 
          onClick={(e) => handleActionClick(e, () => {})}
          className="p-1 rounded hover:bg-gray-100 transition-colors text-gray-400"
          title="More options"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex justify-between items-start">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
          <div className={`flex items-center justify-center w-5 h-5 rounded-full ${isSelected ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
            {getSourceIcon(item.sourcePlatform)}
          </div>
          <span className="text-gray-700">{item.sourcePlatform}</span>
          <span className="opacity-40">-</span>
          <span>{item.sourceType}</span>
          <span className="opacity-40">-</span>
          <span>{formatDate(item.timestamp)}</span>
        </div>
        {!isCompact && (
          <div className="flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ml-2 group-hover:opacity-0 transition-opacity">
            <Star className="w-3 h-3 fill-current" />
            {item.score.toFixed(1)}
          </div>
        )}
      </div>

      <h3 className={`font-semibold leading-snug transition-colors pr-8 ${
        isSelected ? 'text-purple-900' : 'text-gray-900 group-hover:text-purple-700'
      } ${isCompact ? 'text-sm' : 'text-base'}`}>
        {item.title}
      </h3>

      <p className={`text-gray-600 line-clamp-2 leading-relaxed ${isCompact ? 'text-xs' : 'text-sm'}`}>
        {item.summary}
      </p>

      {!isCompact && (
        <div className="flex items-center justify-between mt-2">
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map(tag => (
              <span 
                key={tag.id} 
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  tag.type === 'ai' 
                    ? 'bg-purple-50 text-purple-700 border border-purple-100' 
                    : 'bg-gray-50 text-gray-600 border border-gray-100'
                }`}
              >
                {tag.name}
              </span>
            ))}
          </div>
          <div className="text-xs font-medium text-purple-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Read More <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      )}
    </div>
  );
}
