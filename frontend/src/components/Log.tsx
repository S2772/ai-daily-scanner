import React, { useState, useEffect } from 'react';
import { FileText, Calendar, Filter, ChevronDown, Activity, TrendingUp } from 'lucide-react';
import { fetchTrend, fetchSourceStatus, fetchLatestDate, SourceStatus, TrendData } from '../api';

export function Log() {
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'success' | 'error'>('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchTrend(30),
      fetchLatestDate().then(d => fetchSourceStatus(d)),
    ]).then(([t, ss]) => {
      setTrend(t);
      setSourceStatuses(ss);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filteredStatuses = sourceStatuses.filter(s =>
    filterType === 'all' || s.status === filterType
  );

  const successCount = sourceStatuses.filter(s => s.status === 'success').length;
  const errorCount = sourceStatuses.filter(s => s.status === 'error').length;
  const totalItems = sourceStatuses.reduce((sum, s) => sum + (s.item_count || 0), 0);

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Log</h1>
          <p className="text-gray-500 text-xs">Collection activity and source status from the latest run.</p>
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

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
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

          {/* Trend chart (text-based) */}
          {trend && trend.trend.length > 0 && (
            <div className="bg-white border border-[#EAEAEA] rounded-lg p-4 mb-6">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-4">
                <TrendingUp className="w-4 h-4 text-purple-600" />
                30-Day Collection Trend
              </h3>
              <div className="flex items-end gap-1 h-20 overflow-x-auto">
                {trend.trend.slice(-30).map(d => {
                  const max = Math.max(...trend.trend.map(x => x.count), 1);
                  const h = Math.max(4, Math.round((d.count / max) * 72));
                  return (
                    <div key={d.date} className="flex flex-col items-center gap-1 shrink-0" title={`${d.date}: ${d.count} items`}>
                      <div className="w-3 bg-purple-400 rounded-t hover:bg-purple-600 transition-colors" style={{ height: `${h}px` }}></div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>{trend.trend[0]?.date}</span>
                <span>{trend.trend[trend.trend.length - 1]?.date}</span>
              </div>
            </div>
          )}

          {/* Category breakdown */}
          {trend && trend.categories.length > 0 && (
            <div className="bg-white border border-[#EAEAEA] rounded-lg p-4 mb-6">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-4">
                <Activity className="w-4 h-4 text-blue-500" />
                Category Breakdown
              </h3>
              <div className="space-y-2">
                {trend.categories.slice(0, 8).map(cat => {
                  const max = trend.categories[0]?.count || 1;
                  const pct = Math.round((cat.count / max) * 100);
                  return (
                    <div key={cat.category} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-32 truncate shrink-0">{cat.category || '(unknown)'}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                      <span className="text-xs text-gray-500 w-8 text-right shrink-0">{cat.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Source status list */}
          <div className="bg-white border border-[#EAEAEA] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Source Status ({filteredStatuses.length})</h3>
            </div>
            {filteredStatuses.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                No collection data yet. Click "Collect Now" on the Overview page.
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredStatuses.map((s, i) => (
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
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
