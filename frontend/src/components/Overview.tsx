import React, { useState, useEffect, useMemo } from 'react';
import { Activity, ArrowRight, Zap, Target, RefreshCw } from 'lucide-react';
import { fetchSummaryStats, fetchTrend, fetchHotspots, fetchHotspotSourceGroups, fetchOpportunities, fetchSourceStatus, triggerCollect, Hotspot, HotspotSourceGroup, Opportunity, SummaryStats, TrendData, DateFilter } from '../api';
import { DateScopeDropdown } from './DateScopeDropdown';
import { DataStatusPanel } from './DataStatusPanel';
import { createNoDataHint, createRequestErrorHint, DataStatusHint } from '../dataStatus';
import { inferSourceGroup, SOURCE_GROUP_ORDER } from '../sourceGrouping';

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
  type SourceGroup = typeof SOURCE_GROUP_ORDER[number];
  const now = new Date();
  const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [timeRange, setTimeRange] = useState('Today');
  const [dateFilter, setDateFilter] = useState<DateFilter>({ date: currentDate });
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState('');

  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [sourceGroups, setSourceGroups] = useState<HotspotSourceGroup[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDate, setActiveDate] = useState<string>(currentDate);
  const [dataStatusHint, setDataStatusHint] = useState<DataStatusHint | null>(null);

  const formatActiveDate = (filter: DateFilter, summary: SummaryStats) => {
    if (summary.all_time === '1' || filter.allTime) return 'all time';
    if (summary.start_date && summary.end_date) return `${summary.start_date} ~ ${summary.end_date}`;
    if (summary.date) return summary.date;
    if (filter.startDate || filter.endDate) {
      const start = filter.startDate || filter.endDate || '';
      const end = filter.endDate || filter.startDate || '';
      return start && end ? `${start} ~ ${end}` : start || end || currentDate;
    }
    return filter.date || currentDate;
  };

  const loadOverviewData = async (filter: DateFilter) => {
    setLoading(true);
    setDataStatusHint(null);
    try {
      const [s, t, h, sg, o, ss] = await Promise.all([
        fetchSummaryStats(filter),
        fetchTrend(30),
        fetchHotspots(filter, 10),
        fetchHotspotSourceGroups(filter),
        fetchOpportunities(filter, 5),
        fetchSourceStatus(filter),
      ]);
      setStats(s);
      setTrend(t);
      setHotspots(h.hotspots);
      setSourceGroups(sg);
      setOpportunities(o);
      setActiveDate(formatActiveDate(filter, s));
      const total = (s.hotspot_count || 0) + (s.opportunity_count || 0) + (s.note_count || 0);
      if (total === 0) {
        setDataStatusHint(createNoDataHint(ss));
      }
    } catch (error) {
      setStats(null);
      setTrend(null);
      setHotspots([]);
      setSourceGroups([]);
      setOpportunities([]);
      setDataStatusHint(createRequestErrorHint(error, 'Overview 数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverviewData(dateFilter);
  }, []);

  const handleCollect = async () => {
    setCollecting(true);
    setCollectMsg('');
    try {
      const res = await triggerCollect();
      setCollectMsg(`Collected: ${res.hotspots_count} news, ${res.opportunities_count} opportunities`);
      await loadOverviewData(dateFilter);
    } catch {
      setCollectMsg('Collection failed');
    }
    setCollecting(false);
  };

  const sourceCategoryStats = useMemo(() => {
    const grouped = new Map<string, { newsCount: number; sourceCount: number }>();
    for (const sourceRow of sourceGroups) {
      const group = inferSourceGroup(sourceRow.source);
      if (!grouped.has(group)) {
        grouped.set(group, { newsCount: 0, sourceCount: 0 });
      }
      const stat = grouped.get(group)!;
      stat.newsCount += sourceRow.count || 0;
      stat.sourceCount += 1;
    }

    return SOURCE_GROUP_ORDER
      .map(group => {
        const stat = grouped.get(group);
        if (!stat) return null;
        return {
          group,
          newsCount: stat.newsCount,
          sourceCount: stat.sourceCount,
        };
      })
      .filter((item): item is { group: SourceGroup; newsCount: number; sourceCount: number } => item !== null)
      .sort((a, b) => b.newsCount - a.newsCount);
  }, [sourceGroups]);

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

          <DateScopeDropdown
            label={timeRange}
            onChange={(label, filter) => {
              setTimeRange(label);
              setDateFilter(filter);
              loadOverviewData(filter);
            }}
          />
        </div>
      </div>

      {collectMsg && (
        <div className="mb-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-700">{collectMsg}</div>
      )}
      {!loading && dataStatusHint && (
        <div className="mb-4">
          <DataStatusPanel status={dataStatusHint} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard title="News" value={String(stats?.hotspot_count ?? 0)} subtitle={activeDate} onClick={() => onSelectHotspot ? onSelectHotspot() : setActiveTab('feed')} />
            <StatCard title="Opportunities" value={String(stats?.opportunity_count ?? 0)} subtitle={activeDate} onClick={() => onSelectOpp ? onSelectOpp() : setActiveTab('discover')} />
            <StatCard title="Notes" value={String(stats?.note_count ?? 0)} subtitle={activeDate} onClick={() => setActiveTab('notes')} />
            <StatCard title="Total Sources" value={String(trend?.total_sources ?? 0)} subtitle="active sources" onClick={() => setActiveTab('sources')} />
          </div>

          {/* Source Categories */}
          <div className="bg-white border border-[#EAEAEA] rounded-lg p-4 flex flex-col mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5 text-gray-900">
                <Activity className="w-4 h-4 text-blue-500" />
                Source Categories
              </h3>
              <button onClick={() => onSelectHotspot ? onSelectHotspot() : setActiveTab('feed')} className="text-xs font-medium text-purple-600 hover:text-purple-700 flex items-center gap-0.5">
                View News <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {sourceCategoryStats.length > 0 ? (
              <div className="flex gap-6">
                {/* Left: Category List */}
                <div className="flex-1 grid grid-cols-2 gap-3">
                  {sourceCategoryStats.map(stat => (
                    <div 
                      key={stat.group} 
                      onClick={() => {
                        if (onSelectHotspot) {
                          onSelectHotspot();
                          // TODO: 传递 sourceType 筛选参数
                        } else {
                          setActiveTab('feed');
                        }
                      }}
                      className="p-3 rounded-lg border border-gray-100 bg-gray-50 hover:border-purple-300 hover:bg-purple-50/30 transition-all cursor-pointer flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-700 truncate">{stat.group}</span>
                        <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">{stat.newsCount}</span>
                      </div>
                      <div className="text-[10px] text-gray-500">{stat.newsCount} news · {stat.sourceCount} sources</div>
                    </div>
                  ))}
                </div>
                {/* Right: Pie Chart Placeholder */}
                <div className="w-48 h-48 flex items-center justify-center border border-gray-200 rounded-lg bg-gray-50">
                  <div className="text-xs text-gray-400 text-center">
                    <Activity className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    Chart Coming Soon
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['Research', 'Official / Blogs', 'WeChat / 公众号', 'Social'].map(name => (
                  <div key={name} className="p-3 rounded-lg border border-gray-100 bg-gray-50 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700">{name}</span>
                      <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                    </div>
                    <div className="text-[10px] text-gray-500">No recent news</div>
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
            {/* Priority News */}
            <div className="bg-white border border-[#EAEAEA] rounded-lg p-4 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-1.5 text-gray-900">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Priority News
                </h3>
                <button onClick={() => onSelectHotspot ? onSelectHotspot() : setActiveTab('feed')} className="text-xs font-medium text-purple-600 hover:text-purple-700 flex items-center gap-0.5">
                  View All <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-4 flex-1">
                {hotspots.length === 0 ? (
                  <p className="text-xs text-gray-400">No news for the selected period. Click "Collect Now" to fetch data.</p>
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
                  <p className="text-xs text-gray-400">No opportunities for the selected period.</p>
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
