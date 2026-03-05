import React from 'react';
import { BarChart2, LayoutList, Compass, BookOpen, Settings, Sparkles, FileClock, Bookmark, Database } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'feed', label: 'News', icon: LayoutList },
    { id: 'discover', label: 'Opportunity', icon: Compass },
    { id: 'saved', label: 'Saved', icon: Bookmark },
    { id: 'notes', label: 'Insight', icon: BookOpen },
    { id: 'sources', label: 'Sources', icon: Database },
    { id: 'log', label: 'Log', icon: FileClock },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 h-screen border-r border-[#EAEAEA] bg-white flex flex-col fixed left-0 top-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-7 h-7 bg-purple-600 rounded-md flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-semibold text-base tracking-tight">AI Insight Hub</span>
      </div>

      <nav className="flex-1 px-4 py-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                isActive
                  ? 'bg-purple-50 text-purple-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 2} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#EAEAEA]">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-medium text-gray-600 border border-gray-200">
            ME
          </div>
          <div className="flex flex-col text-left">
            <span className="text-sm font-medium text-gray-900">Pro Plan</span>
            <span className="text-xs text-gray-500">12/50 AI Credits</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
