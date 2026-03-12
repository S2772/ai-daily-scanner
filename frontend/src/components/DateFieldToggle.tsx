import React from 'react';
import { useAppState } from '../appState';

export function DateFieldToggle({ compact = false }: { compact?: boolean }) {
  const { dateFieldMode, setDateFieldMode } = useAppState();

  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'bg-white border border-[#EAEAEA] rounded-md shadow-sm p-1'}`}>
      <span className={`text-[11px] text-gray-500 ${compact ? '' : 'px-1'}`}>Date:</span>
      <div className={`flex items-center ${compact ? 'gap-1' : 'bg-gray-50 rounded-md border border-gray-200 overflow-hidden'}`}>
        <button
          onClick={() => setDateFieldMode('published_at')}
          className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
            dateFieldMode === 'published_at'
              ? 'bg-gray-900 text-white'
              : 'text-gray-700 hover:bg-white'
          }`}
          title="按内容发布时间筛选"
        >
          Published
        </button>
        <button
          onClick={() => setDateFieldMode('created_at')}
          className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
            dateFieldMode === 'created_at'
              ? 'bg-gray-900 text-white'
              : 'text-gray-700 hover:bg-white'
          }`}
          title="按抓取入库时间筛选"
        >
          Collected
        </button>
      </div>
    </div>
  );
}
