import React, { useState, useEffect } from 'react';
import { fetchNotes, fetchLatestDate, Note } from '../api';
import { FileText, Calendar, ArrowLeft, Trash2 } from 'lucide-react';

export function Intelligence() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  useEffect(() => {
    // Fetch notes for all time by using a very old date range — use today and fall back
    fetchLatestDate().then(d => fetchNotes(d, 100))
      .then(n => { setNotes(n); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (selectedNote) {
    return (
      <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2 animate-in fade-in duration-300">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setSelectedNote(null)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Reports
          </button>
        </div>

        <div className="bg-white border border-[#EAEAEA] rounded-lg p-8 max-w-3xl mx-auto w-full">
          <div className="mb-8 pb-6 border-b border-gray-100">
            <h1 className="text-2xl font-semibold text-gray-900 mb-3">
              {selectedNote.hotspot_title ? `Notes on: ${selectedNote.hotspot_title}` : 'Intelligence Note'}
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
    <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2">
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Intelligence</h1>
        <p className="text-gray-500 text-xs">Your personal knowledge base of notes and deep dives.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : notes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50 border border-dashed border-gray-200 rounded-lg">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 mb-4">
            <FileText className="w-5 h-5 text-gray-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">No notes yet</h3>
          <p className="text-xs text-gray-500 max-w-sm">
            Save notes from the Insight or Opportunity pages to build your knowledge base.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map(note => (
            <div
              key={note.id}
              onClick={() => setSelectedNote(note)}
              className="bg-white border border-[#EAEAEA] rounded-lg p-5 hover:border-purple-500/30 hover:shadow-sm transition-all cursor-pointer group flex flex-col h-48"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded bg-purple-50 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-purple-600" />
                </div>
                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(note.created_at).toLocaleDateString()}
                </span>
              </div>

              <h3 className="text-sm font-semibold text-gray-900 mb-2 group-hover:text-purple-700 transition-colors line-clamp-2">
                {note.hotspot_title ? `Notes on: ${note.hotspot_title}` : 'Intelligence Note'}
              </h3>

              <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed flex-1">
                {note.content.substring(0, 150)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
