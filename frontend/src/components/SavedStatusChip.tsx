import React from 'react';

const STATUS_STYLE: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-100',
  reading: 'bg-amber-50 text-amber-700 border-amber-100',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  archived: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function SavedStatusChip({ status }: { status: string }) {
  const key = (status || '').trim().toLowerCase() || 'new';
  const cls = STATUS_STYLE[key] || STATUS_STYLE.new;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${cls}`}>
      {key}
    </span>
  );
}
