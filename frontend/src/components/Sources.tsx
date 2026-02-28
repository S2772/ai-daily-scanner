import React, { useState } from 'react';
import { Twitter, MessageCircle, Globe, Plus, X, Search, Trash2, CheckCircle2 } from 'lucide-react';

interface Subscription {
  id: string;
  name: string;
  platform: string;
  enabled: boolean;
  description?: string;
}

export function Sources() {
  const [activeTab, setActiveTab] = useState('twitter');
  const [searchQuery, setSearchQuery] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([
    { id: '1', name: '@elonmusk', platform: 'twitter', enabled: true, description: 'Tech & AI updates' },
    { id: '2', name: '@sama', platform: 'twitter', enabled: true, description: 'OpenAI CEO' },
    { id: '3', name: '@karpathy', platform: 'twitter', enabled: false, description: 'AI Researcher' },
    { id: '4', name: '晚点LatePost', platform: 'wechat', enabled: true, description: 'In-depth tech news' },
    { id: '5', name: '机器之心', platform: 'wechat', enabled: true, description: 'AI industry news' },
    { id: '6', name: 'HackerNews', platform: 'web', enabled: true, description: 'news.ycombinator.com' },
    { id: '7', name: 'TechCrunch', platform: 'web', enabled: true, description: 'techcrunch.com' },
  ]);

  const platforms = [
    { id: 'twitter', name: 'Twitter', icon: <Twitter className="w-4 h-4" /> },
    { id: 'wechat', name: 'WeChat', icon: <MessageCircle className="w-4 h-4" /> },
    { id: 'web', name: 'Web & RSS', icon: <Globe className="w-4 h-4" /> },
  ];

  const filteredSubs = subscriptions.filter(sub => 
    sub.platform === activeTab && 
    sub.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggle = (id: string) => {
    setSubscriptions(subs => subs.map(sub => 
      sub.id === id ? { ...sub, enabled: !sub.enabled } : sub
    ));
  };

  const handleDelete = (id: string) => {
    setSubscriptions(subs => subs.filter(sub => sub.id !== id));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim()) return;
    
    const newSub: Subscription = {
      id: Date.now().toString(),
      name: newSubName.trim(),
      platform: activeTab,
      enabled: true,
      description: 'Newly added source'
    };
    
    setSubscriptions([newSub, ...subscriptions]);
    setNewSubName('');
    setIsAdding(false);
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2">
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Sources</h1>
        <p className="text-gray-500 text-xs">Manage your content subscriptions and specific accounts to track.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {platforms.map(platform => (
          <button
            key={platform.id}
            onClick={() => setActiveTab(platform.id)}
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

      <div className="flex-1 max-w-4xl">
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

        {isAdding && (
          <div className="mb-4 bg-purple-50 border border-purple-100 rounded-lg p-4 animate-in fade-in slide-in-from-top-2">
            <form onSubmit={handleAdd} className="flex gap-3">
              <input 
                type="text"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                placeholder={
                  activeTab === 'twitter' ? "Enter Twitter handle (e.g., @username)" :
                  activeTab === 'wechat' ? "Enter WeChat Official Account name" :
                  "Enter Website URL or RSS feed"
                }
                autoFocus
                className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
              <button 
                type="submit"
                disabled={!newSubName.trim()}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50"
              >
                Add
              </button>
              <button 
                type="button"
                onClick={() => { setIsAdding(false); setNewSubName(''); }}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden">
          {filteredSubs.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              No sources found. Click "Add Source" to track new content.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredSubs.map(sub => (
                <div key={sub.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      sub.enabled ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {platforms.find(p => p.id === activeTab)?.icon}
                    </div>
                    <div>
                      <div className="font-medium text-sm text-gray-900 flex items-center gap-2">
                        {sub.name}
                        {sub.enabled && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{sub.description}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => handleToggle(sub.id)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        sub.enabled ? 'bg-purple-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        sub.enabled ? 'translate-x-4' : 'translate-x-1'
                      }`} />
                    </button>
                    
                    <button 
                      onClick={() => handleDelete(sub.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete Source"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
