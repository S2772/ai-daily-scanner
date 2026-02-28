import React, { useState, useRef, useEffect } from 'react';
import { Calendar, TrendingUp, TrendingDown, Activity, ChevronDown, ArrowRight, Zap, Target, RefreshCw } from 'lucide-react';
import { fetchSummaryStats, fetchTrend, fetchHotspots, fetchOpportunities, fetchSourceStatus, triggerCollect, Hotspot, Opportunity, SourceStatus, SummaryStats, TrendData } from '../api';

const StatCard = ({ title, value, subtitle, onClick }: { title: string; value: string; subtitle: string; onClick?: () => void }) => (
  <div
    onClick={onClick}
    className={`bg-white p-4 rounded-lg border border-[#EAEAEA] flex flex-col gap-1.5 transition-colors ${onClick ? 'cursor-pointer hover:border-purple-500/30 hover:shadow-sm' : ''}`}
  >
    <div className="text-xs text-gray-500 font-medium">{title}</div>
    <div className="text-2xl font-semibold tracking-tight text-gray-900">{value}</div>
    <div className="text-[10px] text-gray-400">{subtitle}</div>
  </div>
);

export function Overview({ setActiveTab, onSelectHotspot, onSelectOpp }: {
  setActiveTab: (tab: string) => void;
  onSelectHotspot?: (id?: string) => void;
  onSelectOpp?: (id?: string) => void;
}) {
  const [timeRange, setTimeRange] = useState('Today');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchSummaryStats(),
      fetchTrend(30),
      fetchHotspots(undefined, 10),
      fetchOpportunities(undefined, 5),
      fetchSourceStatus(),
    ]).then(([s, t, h, o, ss]) => {
      setStats(s);
      setTrend(t);
      setHotspots(h.hotspots);
      setOpportunities(o);
      setSourceStatuses(ss);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleCollect = async () => {
    setCollecting(true);
    setCollectMsg('');
    try {
      const res = await triggerCollect();
      setCollectMsg(`Collected: ${res.hotspots_count} hotspots, ${res.opportunities_count} opportunities`);
      const [s, h, o] = await Promise.all([fetchSummaryStats(), fetchHotspots(undefined, 10), fetchOpportunities(undefined, 5)]);
      setStats(s);
      setHotspots(h.hotspots);
      setOpportunities(o);
    } catch {
      setCollectMsg('Collection failed');
    }
    setCollecting(false);
  };

  const timeOptions = ['Today', 'Yesterday', 'This Week', 'This Month', 'All Time'];

  const seenSources = new Map<string, SourceStatus>();
  for (const s of sourceStatuses) {
    if (!seenSources.has(s.source)) seenSources.set(s.source, s);
  }
  const uniqueSources: SourceStatus[] = Array.from(seenSources.values()).slice(0, 4);

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-gray-500 text-xs">Real-time monitoring of AI analysis and data extraction.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCollect}
            disabled={collecting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-md text-xs font-medium hover:bg-purple-700 disabled:opacity-60 transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${collecting ? 'animate-spin' : ''}`} />
            {collecting ? 'Collecting...' : 'Collect Now'}
          </button>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#EAEAEA] rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
            >
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              {timeRange}
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            {isDropdownOpen && (
              <div className="absolute right-0 mt-1 w-36 bg-white border border-[#EAEAEA] rounded-md shadow-lg z-10 py-1">
                {timeOptions.map(option => (
                  <button
                    key={option}
                    onClick={() => { setTimeRange(option); setIsDropdownOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs ${timeRange === option ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {collectMsg && (
        <div className="mb-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-700">{collectMsg}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard title="Today's Hotspots" value={String(stats?.hotspot_count ?? 0)} subtitle="collected today" onClick={() => onSelectHotspot ? onSelectHotspot() : setActiveTab('feed')} />
            <StatCard title="Opportunities" value={String(stats?.opportunity_count ?? 0)} subtitle="discovered today" onClick={() => onSelectOpp ? onSelectOpp() : setActiveTab('discover')} />
            <StatCard title="Notes" value={String(stats?.note_count ?? 0)} subtitle="saved today" onClick={() => setActiveTab('notes')} />
            <StatCard title="Total Sources" value={String(trend?.total_sources ?? 0)} subtitle="active sources" onClick={() => setActiveTab('sources')} />
          </div>

          {/* Active Data Sources */}
          <div className="bg-white border border-[#EAEAEA] rounded-lg p-4 flex flex-col mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5 text-gray-900">
                <Activity className="w-4 h-4 text-blue-500" />
                Active Data Sources
              </h3>
              <button onClick={() => setActiveTab('sources')} className="text-xs font-medium text-purple-600 hover:text-purple-700 flex items-center gap-0.5">
                Manage <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {uniqueSources.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {uniqueSources.map(s => (
                  <div key={s.source} className="p-3 rounded-lg border border-gray-100 bg-gray-50 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700 truncate">{s.source}</span>
                      <div className={`w-2 h-2 rounded-full ${s.status === 'success' ? 'bg-emerald-500' : 'bg-red-400'}`}></div>
                    </div>
                    <div className="text-[10px] text-gray-500">{s.item_count} items · {s.source_type}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['Twitter', 'WeChat RSS', 'RSS Feeds', 'Official Blogs'].map(name => (
                  <div key={name} className="p-3 rounded-lg border border-gray-100 bg-gray-50 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700">{name}</span>
                      <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                    </div>
                    <div className="text-[10px] text-gray-500">No recent data</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Key Information</h2>
            <div className="h-px bg-[#EAEAEA] flex-1"></div>
          </div>

          <div className="flex flex-col gap-4">
            {/* Priority Insights */}
            <div className="bg-white border border-[#EAEAEA] rounded-lg p-4 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-1.5 text-gray-900">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Priority Insights
                </h3>
                <button onClick={() => onSelectHotspot ? onSelectHotspot() : setActiveTab('feed')} className="text-xs font-medium text-purple-600 hover:text-purple-700 flex items-center gap-0.5">
                  View All <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-4 flex-1">
                {hotspots.length === 0 ? (
                  <p className="text-xs text-gray-400">No hotspots today. Click "Collect Now" to fetch data.</p>
                ) : hotspots.slice(0, 4).map(h => (
                  <div
                    key={h.id}
                    className="group cursor-pointer flex items-start justify-between gap-4 border-b border-gray-50 pb-3 last:border-0 last:pb-0"
                    onClick={() => onSelectHotspot ? onSelectHotspot(h.id) : setActiveTab('feed')}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 group-hover:text-purple-600 transition-colors line-clamp-1 mb-1">
                        {h.title_zh || h.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{h.source}</span>
                        <span className="opacity-50">•</span>
                        <span>{new Date(h.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded shrink-0 border border-purple-100">
                      {h.total_score?.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Opportunities */}
            <div className="bg-white border border-[#EAEAEA] rounded-lg p-4 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-1.5 text-gray-900">
                  <Target className="w-4 h-4 text-emerald-500" />
                  Top Opportunities
                </h3>
                <button onClick={() => onSelectOpp ? onSelectOpp() : setActiveTab('discover')} className="text-xs font-medium text-purple-600 hover:text-purple-700 flex items-center gap-0.5">
                  View All <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-4 flex-1">
                {opportunities.length === 0 ? (
                  <p className="text-xs text-gray-400">No opportunities today.</p>
                ) : opportunities.slice(0, 3).map(opp => (
                  <div
                    key={opp.id}
                    className="group cursor-pointer border-b border-gray-50 pb-3 last:border-0 last:pb-0"
                    onClick={() => onSelectOpp ? onSelectOpp(opp.id) : setActiveTab('discover')}
                  >
                    <p className="text-sm font-medium text-gray-800 group-hover:text-purple-600 transition-colors line-clamp-1 mb-2">{opp.title}</p>
                    <div className="flex flex-wrap gap-2">
                      {opp.domains.slice(0, 4).map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 bg-gray-50 border border-gray-100 rounded-full text-gray-600">{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
