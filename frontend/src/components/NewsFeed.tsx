import React, { useState, useEffect, useMemo } from 'react';
import { NewsCard } from './NewsCard';
import { NewsDetail } from './NewsDetail';
import { NewsItem } from '../types';
import { Search, RefreshCw } from 'lucide-react';
import { DateScopeDropdown } from './DateScopeDropdown';
import { DateFieldToggle } from './DateFieldToggle';
import { PaginationControls } from './PaginationControls';
import { DataStatusPanel } from './DataStatusPanel';
import { createSavedItem, fetchHotspots, fetchSourceStatus, fetchSummaryStats, DateFilter, Hotspot, SummaryStats } from '../api';
import { createNoDataHint, createRequestErrorHint, DataStatusHint } from '../dataStatus';
import { inferSourceGroup } from '../sourceGrouping';
import { controlUi, pageUi } from './designSystem';
import { useAppState } from '../appState';

function hotspotToNewsItem(h: Hotspot): NewsItem {
  const titleZh = (h.title_zh || '').trim();
  const titleFallbackPlaceholder = titleZh === '外文标题（请查看原文）';
  const displayTitle = titleZh && !titleFallbackPlaceholder ? titleZh : h.title;
  const sourceGroup = inferSourceGroup(h.source);
  const sourceTopic = (h.category || '').trim();

  const rawContent = (h.content || '').trim();
  const rawSummary = (h.ai_summary || '').trim();
  const contentLooksBroken = /the media could not be played|temporarily unavailable|access denied|unsupported browser/i.test(rawContent);
  let displaySummary = rawSummary;
  const looksLikeRawExcerpt = displaySummary && rawContent && displaySummary.slice(0, 120) === rawContent.slice(0, 120);
  if (!displaySummary || displaySummary.includes('AI摘要服务暂时繁忙') || displaySummary.includes('内容太短，无法生成摘要') || looksLikeRawExcerpt) {
    displaySummary = 'AI summary is being generated. Please refresh in a moment.';
  }
  if (contentLooksBroken) {
    displaySummary = '该条内容抓取失败（源站返回错误文案），请稍后重试抓取或检查数据源配置。';
  }

  const tagSeed: Array<{ name: string; type: 'ai' | 'manual' }> = [];
  if (sourceTopic) {
    tagSeed.push({ name: sourceTopic, type: 'manual' });
  }
  for (const rawTag of h.tags || []) {
    const name = (rawTag || '').trim();
    if (name) tagSeed.push({ name, type: 'ai' });
  }
  const dedupedTags = Array.from(
    tagSeed.reduce((map, tag) => {
      if (!map.has(tag.name)) map.set(tag.name, tag);
      return map;
    }, new Map<string, { name: string; type: 'ai' | 'manual' }>())
      .values(),
  );

  return {
    id: h.id,
    title: displayTitle,
    source: h.source,
    sourcePlatform: sourceGroup,
    sourceType: sourceTopic || 'General',
    score: h.total_score || 0,
    summary: displaySummary,
    ai_summary: h.ai_summary,
    content: h.content,
    url: h.url,
    tags: dedupedTags.map((t, i) => ({ id: `${h.id}-t${i}`, name: t.name, type: t.type })),
    timestamp: h.created_at,
  };
}

interface NewsFeedProps {
  selectedHotspotId?: string | null;
  onClearSelection?: () => void;
}

export function NewsFeed({ selectedHotspotId, onClearSelection }: NewsFeedProps) {
  const now = new Date();
  const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const { dateScopeLabel, dateScopeFilter, setDateScope, applyGlobalFilters } = useAppState();
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSource, setActiveSource] = useState('All');
  const [activeTopic, setActiveTopic] = useState('All');
  const [allItems, setAllItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(dateScopeLabel);
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => dateScopeFilter);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [emptyStatus, setEmptyStatus] = useState<DataStatusHint | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const loadHotspots = async (filter: DateFilter) => {
    const effectiveFilter = applyGlobalFilters(filter);
    setLoading(true);
    setEmptyStatus(null);
    try {
      const [hsRes, summary] = await Promise.all([
        // Fetch enough for filtering + display; allow backend to fill missing summaries.
        fetchHotspots(effectiveFilter, 80, true, 0),
        fetchSummaryStats(effectiveFilter),
      ]);
      setSummaryStats(summary);
      const items = (hsRes.hotspots || [])
        .filter((h) => !(h.source || '').startsWith('http://localhost:4000/feeds/MP_WXS_'))
        .map(hotspotToNewsItem);
      setAllItems(items);
      if ((hsRes.hotspots || []).length === 0) {
        const statuses = await fetchSourceStatus(effectiveFilter);
        setEmptyStatus(createNoDataHint(statuses));
      }
    } catch (error) {
      setSummaryStats(null);
      setAllItems([]);
      setActiveSource('All');
      setActiveTopic('All');
      setEmptyStatus(createRequestErrorHint(error, 'News 数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const effectiveFilter = applyGlobalFilters(dateFilter);
    setDateFilter(effectiveFilter);
    loadHotspots(effectiveFilter);
  }, [dateFilter.date, dateFilter.startDate, dateFilter.endDate, dateFilter.allTime, applyGlobalFilters]);

  // Auto-select item when selectedHotspotId is provided
  useEffect(() => {
    if (selectedHotspotId && allItems.length > 0) {
      const item = allItems.find(i => i.id === selectedHotspotId);
      if (item) {
        setSelectedItem(item);
        onClearSelection?.();
      }
    }
  }, [selectedHotspotId, allItems]);

  const handleRefresh = () => {
    const effectiveFilter = applyGlobalFilters(dateFilter);
    setDateFilter(effectiveFilter);
    loadHotspots(effectiveFilter);
  };

  const handleQuickSave = async (item: NewsItem) => {
    if (savingIds.has(item.id) || savedIds.has(item.id)) return;
    setSavingIds(prev => new Set([...prev, item.id]));
    try {
      await createSavedItem({ origin_type: 'hotspot', hotspot_id: item.id, status: 'new' });
      setSavedIds(prev => new Set([...prev, item.id]));
    } catch {
      // ignore for now
    }
    setSavingIds(prev => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  };

  const sourceFilters = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const item of allItems) {
      grouped.set(item.sourcePlatform, (grouped.get(item.sourcePlatform) || 0) + 1);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [allItems]);

  const topicFilters = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const item of allItems) {
      const name = (item.sourceType || '').trim();
      if (!name || name === 'General') continue;
      grouped.set(name, (grouped.get(name) || 0) + 1);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [allItems]);

  useEffect(() => {
    if (activeSource !== 'All' && !sourceFilters.some(filter => filter.name === activeSource)) {
      setActiveSource('All');
    }
  }, [sourceFilters, activeSource]);

  useEffect(() => {
    if (activeTopic !== 'All' && !topicFilters.some(filter => filter.name === activeTopic)) {
      setActiveTopic('All');
    }
  }, [topicFilters, activeTopic]);

  const filteredNews = allItems.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some(tag => tag.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesSource = activeSource === 'All' || item.sourcePlatform === activeSource;
    const matchesTopic = activeTopic === 'All' || item.sourceType === activeTopic;
    return matchesSearch && matchesSource && matchesTopic;
  });

  const totalNewsCount = summaryStats?.hotspot_count;
  const totalNewsLabel = typeof totalNewsCount === 'number' ? totalNewsCount : allItems.length;
  // Use backend summary count for the "All" chip; list data may be paged/limited.
  const totalPages = Math.max(1, Math.ceil(filteredNews.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const pageNews = filteredNews.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeSource, activeTopic, pageSize, allItems]);

  return (
    <div className="h-full relative overflow-hidden">
      {selectedItem ? (
        <NewsDetail
          item={selectedItem}
          onBack={() => setSelectedItem(null)}
          allItems={allItems}
          onSelectItem={setSelectedItem}
        />
      ) : (
      <div className={`${pageUi.pageShell} w-full animate-in fade-in duration-300`}>
          <div className={`shrink-0 ${pageUi.pageHeader}`}>
            <div className="space-y-1">
              <h1 className={pageUi.pageTitle}>News</h1>
              <p className={pageUi.pageSubtitle}>AI-filtered high-value news from across the web.</p>
            </div>
            <div className="flex items-center gap-2">
              <DateFieldToggle />
              <DateScopeDropdown
                label={timeRange}
                onChange={(label, filter) => {
                  setTimeRange(label);
                  setDateFilter(filter);
                  setDateScope(label, filter);
                  loadHotspots(filter);
                }}
              />
            </div>
          </div>

          <div className="shrink-0 mb-6 flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search titles, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={controlUi.searchInput}
              />
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className={controlUi.secondaryButton}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="shrink-0 mb-3 flex items-start gap-3">
            <span className="w-14 shrink-0 pt-1 text-xs font-medium text-gray-500">Source:</span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveSource('All')}
                className={`${
                  activeSource === 'All'
                    ? controlUi.chipActive
                    : controlUi.chipInactive
                }`}
              >
                All ({totalNewsLabel})
              </button>
              {sourceFilters.map(source => (
                <button
                  key={source.name}
                  onClick={() => setActiveSource(source.name)}
                  className={`${
                    activeSource === source.name
                      ? controlUi.chipActive
                      : controlUi.chipInactive
                  }`}
                >
                  {source.name} ({source.count})
                </button>
              ))}
            </div>
          </div>

          <div className="shrink-0 mb-6 flex items-start gap-3">
            <span className="w-14 shrink-0 pt-1 text-xs font-medium text-gray-500">Topic:</span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTopic('All')}
                className={activeTopic === 'All' ? controlUi.chipActive : controlUi.chipInactive}
              >
                All ({totalNewsLabel})
              </button>
              {topicFilters.map(tag => (
                <button
                  key={tag.name}
                  onClick={() => setActiveTopic(tag.name)}
                  className={activeTopic === tag.name ? controlUi.chipActive : controlUi.chipInactive}
                >
                  {tag.name} ({tag.count})
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
          ) : allItems.length === 0 ? (
            <DataStatusPanel status={emptyStatus || createNoDataHint([])} />
          ) : filteredNews.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              No items match your search/filter.
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4">
              {pageNews.map(item => (
                <NewsCard
                  key={item.id}
                  item={item}
                  onClick={setSelectedItem}
                  isSelected={selectedItem?.id === item.id}
                  onSave={handleQuickSave}
                  isSaved={savedIds.has(item.id) || savingIds.has(item.id)}
                />
              ))}
              <PaginationControls
                totalItems={filteredNews.length}
                currentPage={safeCurrentPage}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          )}
      </div>
      )}
    </div>
  );
}
