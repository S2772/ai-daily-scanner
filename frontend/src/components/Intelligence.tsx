import React, { useState, useEffect } from 'react';
import { fetchNotes, Note, DateFilter } from '../api';
import { DateScopeDropdown } from './DateScopeDropdown';
import { PaginationControls } from './PaginationControls';
import { DataStatusPanel } from './DataStatusPanel';
import { createRequestErrorHint, DataStatusHint } from '../dataStatus';
import { FileText, Calendar, ArrowLeft } from 'lucide-react';
import { cardUi, controlUi, pageUi } from './designSystem';

export function Intelligence() {
  const now = new Date();
  const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [timeRange, setTimeRange] = useState('Today');
  const [dateFilter, setDateFilter] = useState<DateFilter>({ date: currentDate });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loadError, setLoadError] = useState<DataStatusHint | null>(null);

  const loadNotes = async (filter: DateFilter) => {
    setLoading(true);
    setLoadError(null);
    try {
      const n = await fetchNotes(filter, 500);
      setNotes(n);
    } catch (error) {
      setNotes([]);
      setLoadError(createRequestErrorHint(error, 'Insight 数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes(dateFilter);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [notes, pageSize]);

  const totalPages = Math.max(1, Math.ceil(notes.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const pageNotes = notes.slice(pageStart, pageStart + pageSize);

  if (selectedNote) {
    return (
      <div className={`${pageUi.pageShell} animate-in fade-in duration-300`}>
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setSelectedNote(null)}
            className={controlUi.secondaryButton}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Reports
          </button>
        </div>

        <div className={`${cardUi.base} max-w-3xl mx-auto w-full`}>
          <div className="mb-8 pb-6 border-b border-gray-100">
            <h1 className="text-2xl font-semibold text-gray-900 mb-3">
              {selectedNote.hotspot_title ? `Notes on: ${selectedNote.hotspot_title}` : 'Insight Note'}
            </h1>
            <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(selectedNote.created_at).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                User Note
              </span>
            </div>
            {selectedNote.hotspot_title && (
              <div className="flex flex-col gap-2 bg-gray-50 p-3 rounded-md border border-gray-100">
                <span className="text-xs font-semibold text-gray-700">Linked to:</span>
                <div className="text-xs text-gray-600 flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">Hotspot</span>
                  <span className="truncate">{selectedNote.hotspot_title}</span>
                </div>
              </div>
            )}
          </div>
          <div className="prose prose-sm prose-purple max-w-none text-gray-700 whitespace-pre-line leading-relaxed">
            {selectedNote.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={pageUi.pageShell}>
      <div className={pageUi.pageHeader}>
        <div className="space-y-1">
          <h1 className={pageUi.pageTitle}>Insight</h1>
          <p className={pageUi.pageSubtitle}>Your personal knowledge base of notes and deep dives.</p>
        </div>
        <DateScopeDropdown
          label={timeRange}
          onChange={(label, filter) => {
            setTimeRange(label);
            setDateFilter(filter);
            loadNotes(filter);
          }}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : notes.length === 0 ? (
        loadError ? (
          <DataStatusPanel status={loadError} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50 border border-dashed border-gray-200 rounded-xl">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 mb-4">
              <FileText className="w-5 h-5 text-gray-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">No notes yet</h3>
            <p className="text-xs text-gray-500 max-w-sm">
              Save notes from the News or Opportunity pages to build your knowledge base.
            </p>
          </div>
        )
      ) : (
        <div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pageNotes.map(note => (
              <div
                key={note.id}
                onClick={() => setSelectedNote(note)}
                className={`${cardUi.interactive} group flex h-52 flex-col`}
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-purple-50">
                    <FileText className="w-4 h-4 text-purple-600" />
                  </div>
                  <span className="text-[10px] text-gray-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(note.created_at).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="mb-2 line-clamp-2 text-base font-semibold text-gray-900 transition-colors group-hover:text-purple-700">
                  {note.hotspot_title ? `Notes on: ${note.hotspot_title}` : 'Insight Note'}
                </h3>

                <p className="flex-1 line-clamp-4 text-sm leading-relaxed text-gray-600">
                  {note.content.substring(0, 150)}
                </p>
              </div>
            ))}
          </div>

          <PaginationControls
            totalItems={notes.length}
            currentPage={safeCurrentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </div>
  );
}
