import React, { useState, useEffect } from 'react';
import { Twitter, MessageCircle, Globe, Plus, X, Search, Trash2, CheckCircle2, Tag, Pencil } from 'lucide-react';
import { fetchSources, addSource, deleteSource, updateSource, Source } from '../api';

const PLATFORM_MAP: Record<string, string> = {
  twitter: 'twitter',
  wechat: 'wechat',
  rss: 'web',
  official_blog: 'web',
  cn_model_lab: 'web',
  thought_leader: 'twitter',
  podcast: 'web',
  industry: 'web',
  investment: 'web',
};

const CATEGORY_TAB_MAP: Record<string, string> = {
  'Twitter博主': 'twitter',
  '微信公众号': 'wechat',
  'RSS订阅': 'web',
  '官方研究博客': 'web',
  '国内模型实验室': 'web',
  '思想领袖': 'twitter',
  '播客/平台': 'web',
  '产业分析': 'web',
  '投资机构': 'web',
};

const TAG_COLORS = [
  'bg-blue-50 text-blue-700 border-blue-100',
  'bg-green-50 text-green-700 border-green-100',
  'bg-amber-50 text-amber-700 border-amber-100',
  'bg-purple-50 text-purple-700 border-purple-100',
  'bg-pink-50 text-pink-700 border-pink-100',
  'bg-cyan-50 text-cyan-700 border-cyan-100',
];

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export function Sources() {
  const [activeTab, setActiveTab] = useState('twitter');
  const [searchQuery, setSearchQuery] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newSubUrl, setNewSubUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');

  const platforms = [
    { id: 'twitter', name: 'Twitter / KOL', icon: <Twitter className="w-4 h-4" /> },
    { id: 'wechat', name: 'WeChat', icon: <MessageCircle className="w-4 h-4" /> },
    { id: 'web', name: 'Web & RSS', icon: <Globe className="w-4 h-4" /> },
  ];

  useEffect(() => {
    fetchSources().then(({ sources: s }) => {
      setSources(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const getTab = (src: Source) => CATEGORY_TAB_MAP[src.category] || PLATFORM_MAP[src.type] || 'web';

  const tabSources = sources.filter(src => getTab(src) === activeTab);

  // All unique tags across current tab
  const allTabTags: string[] = Array.from(new Set(tabSources.flatMap(s => (s.tags as string[]) || [])));

  const filteredSubs = tabSources.filter(src => {
    const matchesSearch = src.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = !activeTagFilter || (src.tags || []).includes(activeTagFilter);
    return matchesSearch && matchesTag;
  });

  const handleToggle = async (src: Source) => {
    const newStatus = src.status === 'active' ? 'paused' : 'active';
    await updateSource(src.id, src.tags, newStatus, src.notes);
    setSources(prev => prev.map(s => s.id === src.id ? { ...s, status: newStatus } : s));
  };

  const handleDelete = async (id: string) => {
    await deleteSource(id);
    setSources(prev => prev.filter(s => s.id !== id));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim()) return;
    setSaving(true);
    const type = activeTab === 'twitter' ? 'twitter' : activeTab === 'wechat' ? 'rss' : 'rss';
    try {
      const res = await addSource(newSubName.trim(), newSubUrl.trim(), type);
      if (res.ok) {
        const { sources: s } = await fetchSources();
        setSources(s);
      }
    } catch { /* ignore */ }
    setNewSubName('');
    setNewSubUrl('');
    setIsAdding(false);
    setSaving(false);
  };

  const handleAddTag = async (src: Source, tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || (src.tags || []).includes(trimmed)) return;
    const newTags = [...(src.tags || []), trimmed];
    await updateSource(src.id, newTags, src.status, src.notes);
    setSources(prev => prev.map(s => s.id === src.id ? { ...s, tags: newTags } : s));
    setTagInput('');
  };

  const handleRemoveTag = async (src: Source, tag: string) => {
    const newTags = (src.tags || []).filter(t => t !== tag);
    await updateSource(src.id, newTags, src.status, src.notes);
    setSources(prev => prev.map(s => s.id === src.id ? { ...s, tags: newTags } : s));
    if (activeTagFilter === tag) setActiveTagFilter(null);
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2">
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Sources</h1>
        <p className="text-gray-500 text-xs">Manage your content subscriptions and specific accounts to track.</p>
      </div>

      <div className="flex border-b border-gray-200 mb-6">
        {platforms.map(platform => (
          <button
            key={platform.id}
            onClick={() => { setActiveTab(platform.id); setActiveTagFilter(null); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === platform.id
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {platform.icon}
            {platform.name}
          </button>
        ))}
      </div>

      <div className="flex-1">
        <div className="flex items-center justify-between mb-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${platforms.find(p => p.id === activeTab)?.name} sources...`}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </div>
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-md text-xs font-medium hover:bg-purple-700 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Source
          </button>
        </div>

        {/* Tag filter pills */}
        {allTabTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setActiveTagFilter(null)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${
                activeTagFilter === null ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              <Tag className="w-3 h-3" /> All
            </button>
            {allTabTags.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${
                  activeTagFilter === tag ? 'ring-2 ring-offset-1 ring-purple-400 ' : ''
                }${tagColor(tag)}`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {isAdding && (
          <div className="mb-4 bg-purple-50 border border-purple-100 rounded-lg p-4">
            <form onSubmit={handleAdd} className="flex flex-col gap-3">
              <input
                type="text"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                placeholder={activeTab === 'twitter' ? 'Name (e.g. @username)' : activeTab === 'wechat' ? 'WeChat account name' : 'Source name'}
                autoFocus
                className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
              <input
                type="text"
                value={newSubUrl}
                onChange={(e) => setNewSubUrl(e.target.value)}
                placeholder={activeTab === 'twitter' ? 'Twitter URL (optional)' : 'RSS/URL'}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={!newSubName.trim() || saving}
                  className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50">
                  {saving ? 'Adding...' : 'Add'}
                </button>
                <button type="button" onClick={() => { setIsAdding(false); setNewSubName(''); setNewSubUrl(''); }}
                  className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading sources...</div>
          ) : filteredSubs.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              No sources found. Click "Add Source" to track new content.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredSubs.map(src => (
                <div key={src.id} className="p-4 hover:bg-gray-50 transition-colors group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        src.status === 'active' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {platforms.find(p => p.id === activeTab)?.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 flex items-center gap-2">
                          {src.name}
                          {src.status === 'active' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{src.category}{src.note ? ` · ${src.note}` : ''}</div>
                        {/* Tag pills */}
                        {(src.tags || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(src.tags || []).map(tag => (
                              <span
                                key={tag}
                                onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border cursor-pointer transition-all hover:opacity-80 ${tagColor(tag)} ${activeTagFilter === tag ? 'ring-1 ring-offset-1 ring-purple-400' : ''}`}
                              >
                                {tag}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRemoveTag(src, tag); }}
                                  className="ml-0.5 hover:text-red-600 transition-colors"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Inline tag editor */}
                        {editingTagsId === src.id && (
                          <form
                            onSubmit={(e) => { e.preventDefault(); handleAddTag(src, tagInput); }}
                            className="flex items-center gap-2 mt-2"
                          >
                            <input
                              autoFocus
                              type="text"
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              placeholder="Add tag..."
                              className="px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 w-32"
                            />
                            <button type="submit" className="text-xs px-2 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700">Add</button>
                            <button type="button" onClick={() => { setEditingTagsId(null); setTagInput(''); }} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700">Done</button>
                          </form>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <button
                        onClick={() => { setEditingTagsId(editingTagsId === src.id ? null : src.id); setTagInput(''); }}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                        title="Edit tags"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggle(src)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                          src.status === 'active' ? 'bg-purple-600' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          src.status === 'active' ? 'translate-x-4' : 'translate-x-1'
                        }`} />
                      </button>
                      <button
                        onClick={() => handleDelete(src.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete Source"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
