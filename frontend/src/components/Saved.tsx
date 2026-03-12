import React, { useState, useEffect } from 'react';
import { NewsItem } from '../types';
import { NewsCard } from './NewsCard';
import { NewsDetail } from './NewsDetail';
import { PaginationControls } from './PaginationControls';
import { DataStatusPanel } from './DataStatusPanel';
import { Bookmark, Upload, Link as LinkIcon, Plus, FileText, X } from 'lucide-react';
import { fetchSavedItems, fetchSourceStatus, SavedItem } from '../api';
import { SavedEditorModal } from './SavedEditorModal';
import { createNoDataHint, createRequestErrorHint, DataStatusHint } from '../dataStatus';
import { inferSourceGroup } from '../sourceGrouping';
import { controlUi, pageUi } from './designSystem';

function savedItemToNewsItem(item: SavedItem): NewsItem {
  return {
    id: item.id,
    title: item.title,
    source: item.source_name || 'Saved',
    sourcePlatform: inferSourceGroup(item.source_name || 'Saved'),
    sourceType: `Saved/${item.status || 'new'}`,
    score: 0,
    summary: item.note || '',
    ai_summary: '',
    content: '',
    url: item.url,
    tags: [{ id: `${item.id}-status`, name: item.status || 'new', type: 'manual' }],
    timestamp: item.created_at,
  };
}

export function Saved() {
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<'url' | 'file'>('url');
  const [importValue, setImportValue] = useState('');
  const [savedItems, setSavedItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [emptyStatus, setEmptyStatus] = useState<DataStatusHint | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SavedItem | null>(null);

  const reload = () => {
    setLoading(true);
    setEmptyStatus(null);
    fetchSavedItems(200, 0, statusFilter || undefined)
      .then(({ items }) => {
        const mapped = (items || []).map(savedItemToNewsItem);
        setSavedItems(mapped);
        if (mapped.length === 0) {
          fetchSourceStatus()
            .then(statuses => setEmptyStatus(createNoDataHint(statuses)))
            .catch(error => setEmptyStatus(createRequestErrorHint(error, 'Saved 数据状态检测失败')))
            .finally(() => setLoading(false));
          return;
        }
        setLoading(false);
      })
      .catch((error) => {
        setSavedItems([]);
        setEmptyStatus(createRequestErrorHint(error, 'Saved 数据加载失败'));
        setLoading(false);
      });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [savedItems, pageSize]);

  const totalPages = Math.max(1, Math.ceil(savedItems.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const pageItems = savedItems.slice(pageStart, pageStart + pageSize);

  if (selectedNews) {
    return (
      <div className="h-full w-full animate-in fade-in duration-300">
        <NewsDetail
          item={selectedNews}
          onBack={() => setSelectedNews(null)}
          allItems={savedItems}
          onSelectItem={setSelectedNews}
        />
      </div>
    );
  }

  return (
    <div className={`${pageUi.pageShell} relative`}>
      <div className={pageUi.pageHeader}>
        <div className="space-y-1">
          <h1 className={`${pageUi.pageTitle} flex items-center gap-2`}>
            <Bookmark className="w-5 h-5 text-purple-600" />
            Saved Content
          </h1>
          <p className={pageUi.pageSubtitle}>人工保存</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"
          >
            <option value="">All</option>
            <option value="new">New</option>
            <option value="reading">Reading</option>
            <option value="done">Done</option>
            <option value="archived">Archived</option>
          </select>

          <button
            onClick={() => {
              setEditingItem(null);
              setIsEditorOpen(true);
            }}
            className={controlUi.darkButton}
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className={controlUi.darkButton}
          >
            <Upload className="w-3.5 h-3.5" />
            Import
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : savedItems.length === 0 ? (
        <DataStatusPanel status={emptyStatus || createNoDataHint([])} />
      ) : (
        <div className="flex flex-col gap-4">
          {pageItems.map(item => (
            <div key={item.id} className="relative">
              <NewsCard
                item={item}
                onClick={setSelectedNews}
                isSelected={selectedNews?.id === item.id}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingItem({
                    id: item.id,
                    hotspot_id: null,
                    title: item.title,
                    url: item.url,
                    source_name: item.source,
                    origin_type: 'url',
                    status: String(item.tags?.[0]?.name || 'new'),
                    note: item.summary || '',
                    created_at: item.timestamp,
                    updated_at: item.timestamp,
                  });
                  setIsEditorOpen(true);
                }}
                className="absolute top-3 right-3 text-xs px-2 py-1 rounded bg-white/90 border border-gray-200 hover:bg-white"
              >
                Edit
              </button>
            </div>
          ))}
          <PaginationControls
            totalItems={savedItems.length}
            currentPage={safeCurrentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      <SavedEditorModal
        item={editingItem}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSaved={() => reload()}
      />

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
