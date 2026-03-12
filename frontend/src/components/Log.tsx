import React, { useMemo, useState, useEffect } from 'react';
import { FileText, Filter, ChevronDown, Activity, TrendingUp } from 'lucide-react';
import { fetchTrend, fetchSourceStatus, fetchLatestDate, fetchCollectRuns, fetchLogDaily, CollectRun, LogDailySummary, SourceStatus, TrendData } from '../api';

export function Log() {
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [dailySummary, setDailySummary] = useState<LogDailySummary | null>(null);
  const [trendDays, setTrendDays] = useState<1 | 7 | 30>(30);
  const [collectRuns, setCollectRuns] = useState<CollectRun[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const latestRun = useMemo(() => (collectRuns && collectRuns.length > 0 ? collectRuns[0] : null), [collectRuns]);
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'success' | 'error'>('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [runsCollapsed, setRunsCollapsed] = useState(false);
  const [runsPreviewExpanded, setRunsPreviewExpanded] = useState(false);
  const [sourceCollapsed, setSourceCollapsed] = useState(true);
  const [dailyCollapsed, setDailyCollapsed] = useState(false);
  const sourcePreviewCount = 5;
  const runPreviewCount = 5;

  const loadLogData = () => {
    setLoading(true);
    return Promise.all([
      fetchTrend(trendDays),
      fetchLatestDate().then(d => fetchSourceStatus(d)),
      fetchCollectRuns(30),
      fetchLogDaily({ date: new Date().toISOString().slice(0, 10), dateField: 'created_at' }),
    ])
      .then(([t, ss, runs, daily]) => {
        setTrend(t);
        setSourceStatuses(ss);
        setCollectRuns(runs);
        setDailySummary(daily);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadLogData();
  }, [trendDays]);

  useEffect(() => {
    if (!latestRun || latestRun.status !== 'running') return;
    const timer = window.setInterval(() => {
      fetchCollectRuns(30)
        .then((runs) => setCollectRuns(runs))
        .catch(() => {
          // ignore polling errors
        });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [latestRun?.id, latestRun?.status]);

  const filteredStatuses = sourceStatuses.filter(s =>
    filterType === 'all' || s.status === filterType
  );

  const successCount = sourceStatuses.filter(s => s.status === 'success').length;
  const errorCount = sourceStatuses.filter(s => s.status === 'error').length;
  const totalItems = sourceStatuses.reduce((sum, s) => sum + (s.item_count || 0), 0);

  return (
    <div className="min-h-0 flex-1 flex flex-col overflow-x-hidden overflow-y-visible pb-24 pr-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Log</h1>
          <p className="text-gray-500 text-xs">Daily collection runs, content-date distribution, and source health.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-[#EAEAEA] rounded-md shadow-sm overflow-hidden">
            {([1, 7, 30] as const).map(d => (
              <button
                key={d}
                onClick={() => setTrendDays(d)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${trendDays === d ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {d === 1 ? '1D' : d === 7 ? '7D' : '30D'}
              </button>
            ))}
          </div>

          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#EAEAEA] rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
            >
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              {filterType === 'all' ? 'All Sources' : filterType === 'success' ? 'Success' : 'Errors'}
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            {isDropdownOpen && (
              <div className="absolute right-0 mt-1 w-36 bg-white border border-[#EAEAEA] rounded-md shadow-lg z-10 py-1">
                {(['all', 'success', 'error'] as const).map(opt => (
                  <button key={opt} onClick={() => { setFilterType(opt); setIsDropdownOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs ${filterType === opt ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                    {opt === 'all' ? 'All Sources' : opt === 'success' ? 'Success' : 'Errors'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="flex flex-col">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 mb-6 order-2">
            <div className="bg-white border border-[#EAEAEA] rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Total Items Collected</div>
              <div className="text-2xl font-semibold text-gray-900">{totalItems.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-[#EAEAEA] rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Sources OK</div>
              <div className="text-2xl font-semibold text-emerald-600">{successCount}</div>
            </div>
            <div className="bg-white border border-[#EAEAEA] rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Sources Failed</div>
              <div className="text-2xl font-semibold text-red-500">{errorCount}</div>
            </div>
          </div>

          {/* Collection runs */}
          <div className="bg-white border border-[#EAEAEA] rounded-lg overflow-hidden mb-6 order-4">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-gray-700" />
                  Collection Runs
                </h3>
                <div className="text-[11px] text-gray-500 mt-0.5">Shows what was collected and how it distributes by content date.</div>
              </div>
              <div className="flex items-center gap-3">
                {!runsCollapsed && collectRuns.length > runPreviewCount && (
                  <button
                    onClick={() => setRunsPreviewExpanded(!runsPreviewExpanded)}
                    className="text-xs text-purple-700 hover:underline"
                  >
                    {runsPreviewExpanded ? 'Show less' : 'Expand'}
                  </button>
                )}
                <button
                  onClick={() => setRunsCollapsed(!runsCollapsed)}
                  className="text-xs text-purple-700 hover:underline"
                >
                  {runsCollapsed ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>
            {collectRuns.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No runs yet. Trigger collection from Overview.</div>
            ) : (
              <div className="px-4 py-2 border-b border-gray-50 bg-gray-50/40 text-[11px] text-gray-500 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-700">Latest:</span>
                  <span>Run #{collectRuns[0].id}</span>
                  <span className="opacity-50">·</span>
                  <span className="capitalize">{collectRuns[0].status}</span>
                  {collectRuns[0].status === 'running' && <span className="text-gray-400">(auto refresh every 10s)</span>}
                </div>
                <button onClick={() => loadLogData()} className="text-purple-700 hover:underline">Refresh now</button>
              </div>
            )}

            {runsCollapsed ? null : collectRuns.length > 0 && (
              <div className="divide-y divide-gray-50">
                {(runsPreviewExpanded ? collectRuns : collectRuns.slice(0, runPreviewCount)).map(r => {
                  const isExpanded = expandedRunId === r.id;
                  return (
                    <div key={r.id} className="px-4 py-3">
                      <button
                        className="w-full flex items-start justify-between gap-4 text-left"
                        onClick={() => setExpandedRunId(isExpanded ? null : r.id)}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">Run #{r.id}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.status === 'success' ? 'bg-emerald-50 text-emerald-700' : r.status === 'running' ? 'bg-gray-100 text-gray-700' : 'bg-red-50 text-red-600'}`}>{r.status}</span>
                          </div>
                          <div className="text-[11px] text-gray-500 truncate">
                            {r.started_at}{r.finished_at ? ` → ${r.finished_at}` : ''}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-xs text-gray-500">Items</div>
                            <div className="text-sm font-semibold text-gray-900">{(r.hotspots_inserted || 0).toLocaleString()}</div>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="mt-3 bg-gray-50 rounded-md p-3">
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div>
                              <div className="text-[10px] text-gray-500">Sources</div>
                              <div className="text-xs text-gray-700">OK {r.sources_success} / Empty {r.sources_empty} / Err {r.sources_error}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-500">Opportunities</div>
                              <div className="text-xs text-gray-700">{r.opportunities_count}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-500">Notes</div>
                              <div className="text-xs text-gray-700 truncate">{r.notes || '-'}</div>
                            </div>
                          </div>

                          <div className="text-[10px] text-gray-500 mb-2">Content date breakdown</div>
                          {r.date_breakdown && r.date_breakdown.length > 0 ? (
                            <div className="space-y-1">
                              {r.date_breakdown.map(b => (
                                <div key={b.content_date} className="flex items-center justify-between text-xs text-gray-700">
                                  <span>{b.content_date}</span>
                                  <span className="font-medium">{b.item_count}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">No breakdown data. (If you expect multi-day breakdown, check older runs.)</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!runsPreviewExpanded && collectRuns.length > runPreviewCount && (
                  <div className="px-4 py-3 text-xs text-gray-500 bg-gray-50/40">
                    Showing {runPreviewCount} of {collectRuns.length}. Click Expand to view all.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Trend + Daily breakdown */}
          {trend && trend.trend.length > 0 && (
            <div className="bg-white border border-[#EAEAEA] rounded-lg overflow-hidden mb-6 order-2">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-purple-600" />
                    Collection Trend ({trendDays}D)
                  </h3>
                  <div className="text-[11px] text-gray-500 mt-0.5">Recent daily collection volume and average score.</div>
                </div>
              </div>

              <div className="px-4 pt-4">
                <div className="flex items-end gap-1 h-28 overflow-x-auto overflow-y-visible px-1">
                  {trend.trend.slice(-trendDays).map((d, idx, arr) => {
                    const max = Math.max(...trend.trend.map(x => x.count), 1);
                    const h = Math.max(4, Math.round((d.count / max) * 104));
                    const isLast = idx === arr.length - 1;
                    return (
                      <div key={d.date} className="flex flex-col items-center gap-1 shrink-0 group">
                        <div className={`relative ${isLast ? 'pr-16' : ''}`}>
                          <div className="absolute -top-12 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow-lg z-40 pointer-events-none">
                            <div className="font-medium">{d.date}</div>
                            <div>{d.count} items · avg {d.avg_score}</div>
                          </div>
                          <div className="w-4 bg-purple-400 rounded-t hover:bg-purple-600 transition-colors" style={{ height: `${h}px` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>{trend.trend[Math.max(0, trend.trend.length - trendDays)]?.date}</span>
                  <span>{trend.trend[trend.trend.length - 1]?.date}</span>
                </div>
              </div>

              {dailySummary && (
                <div className="mt-4 border-t border-gray-100">
                  <div className="px-4 py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900">Daily Breakdown</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">Default shows today only. Expand to see recent days.</div>
                    </div>
                    <div className="shrink-0 flex items-center gap-3">
                      <div className="text-xs text-gray-600">Total: <span className="font-semibold text-gray-900">{dailySummary.total.toLocaleString()}</span></div>
                      <button
                        onClick={() => setDailyCollapsed(!dailyCollapsed)}
                        className="text-xs text-purple-700 hover:underline"
                        aria-expanded={!dailyCollapsed}
                      >
                        {dailyCollapsed ? 'Expand' : 'Collapse'}
                      </button>
                    </div>
                  </div>

                  {dailyCollapsed ? null : (
                    <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                      {dailySummary.breakdown.slice(0, 1).map(row => (
                        <div key={row.date} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-100 rounded px-2.5 py-1.5">
                          <div className="font-medium text-gray-800">{row.date}</div>
                          <div className="text-gray-700">{row.count.toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Category breakdown */}
          {trend && trend.categories.length > 0 && (
            <div className="bg-white border border-[#EAEAEA] rounded-lg p-4 mb-6 order-2">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-4">
                <Activity className="w-4 h-4 text-blue-500" />
                Category Breakdown
              </h3>
              <div className="space-y-2">
                {trend.categories.slice(0, 8).map(cat => {
                  const max = trend.categories[0]?.count || 1;
                  const pct = Math.round((cat.count / max) * 100);
                  return (
                    <button
                      key={cat.category}
                      className="w-full flex items-center gap-3 hover:bg-gray-50 rounded px-2 py-1 text-left"
                      title="Click to filter Source Status by category"
                      onClick={() => {
                        // minimal interaction: jump to Source Status list and highlight via filterType reset
                        setFilterType('all');
                        setIsDropdownOpen(false);
                        const el = document.getElementById('source-status-list');
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      <span className="text-xs text-gray-600 w-32 truncate shrink-0">{cat.category || '(unknown)'}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                      <span className="text-xs text-gray-500 w-8 text-right shrink-0">{cat.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Source status list */}
          <div id="source-status-list" className="bg-white border border-[#EAEAEA] rounded-lg overflow-hidden mb-6 order-5">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Source Status ({filteredStatuses.length})</h3>
              <button
                onClick={() => setSourceCollapsed(!sourceCollapsed)}
                className="text-xs text-purple-700 hover:underline"
              >
                {sourceCollapsed ? 'Expand' : 'Collapse'}
              </button>
            </div>
            {filteredStatuses.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                No collection data yet. Click "Collect Now" on the Overview page.
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {(sourceCollapsed ? filteredStatuses.slice(0, sourcePreviewCount) : filteredStatuses).map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${s.status === 'success' ? 'bg-emerald-500' : 'bg-red-400'}`}></div>
                      <div>
                        <div className="text-sm font-medium text-gray-800">{s.source}</div>
                        <div className="text-[10px] text-gray-400">{s.source_type} · {new Date(s.created_at).toLocaleString()}</div>
                        {s.error_message && (
                          <div className="text-[10px] text-red-500 mt-0.5">{s.error_message}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-gray-500">{s.item_count} items</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        s.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                      }`}>{s.status}</span>
                    </div>
                  </div>
                ))}
                {sourceCollapsed && filteredStatuses.length > sourcePreviewCount && (
                  <div className="px-4 py-3 text-xs text-gray-500 bg-gray-50/40">
                    Showing {sourcePreviewCount} of {filteredStatuses.length}. Click Expand to view all.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
