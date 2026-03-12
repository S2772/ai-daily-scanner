import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { SavedItem, createSavedItem, updateSavedItem, fetchSavedStatusOptions } from '../api';

export function SavedEditorModal({
  item,
  isOpen,
  onClose,
  onSaved,
}: {
  item?: SavedItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [status, setStatus] = useState('new');
  const [note, setNote] = useState('');
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const originType = item?.origin_type || 'url';

  useEffect(() => {
    if (!isOpen) return;
    fetchSavedStatusOptions()
      .then((res) => setOptions(res.options || []))
      .catch(() => setOptions([]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setTitle(item?.title || '');
    setUrl(item?.url || '');
    setSourceName(item?.source_name || '');
    setStatus(item?.status || 'new');
    setNote(item?.note || '');
  }, [isOpen, item?.id]);

  const statusOptions = useMemo(() => {
    if (options.length > 0) return options;
    return [
      { value: 'new', label: 'New' },
      { value: 'reading', label: 'Reading' },
      { value: 'done', label: 'Done' },
      { value: 'archived', label: 'Archived' },
    ];
  }, [options]);

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!url.trim()) {
      setErrorMsg('URL 不能为空');
      return;
    }
    setSaving(true);
    try {
      await (item?.id
        ? updateSavedItem(item.id, {
            title: title.trim() || undefined,
            url: url.trim(),
            source_name: sourceName.trim() || undefined,
            status: status.trim() || undefined,
            note: note.trim() || undefined,
          })
        : createSavedItem({
            origin_type: originType,
            hotspot_id: item?.hotspot_id || undefined,
            title: title.trim() || undefined,
            url: url.trim(),
            source_name: sourceName.trim() || undefined,
            status: status.trim() || undefined,
            note: note.trim() || undefined,
          }));
      onSaved();
      onClose();
    } catch (e: any) {
      setErrorMsg(e?.message || '保存失败');
    }
    setSaving(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h3 className="font-semibold text-gray-900">Saved Item</h3>
            <div className="text-[11px] text-gray-500 mt-0.5">Edit status, source, and metadata.</div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-700">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                placeholder="Optional"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-700">URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Source</label>
              <input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                placeholder="e.g. TechCrunch"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-700">Note</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full h-24 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 resize-none"
                placeholder="Optional"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="text-xs text-red-600 font-medium">{errorMsg}</div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-xs font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
