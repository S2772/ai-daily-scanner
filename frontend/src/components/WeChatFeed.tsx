import React, { useEffect, useMemo, useState } from 'react';
import { fetchWeChatLatest, fetchSources, Hotspot } from '../api';
import { NewsCard } from './NewsCard';
import { PaginationControls } from './PaginationControls';
import { NewsItem } from '../types';
import { inferSourceGroup } from '../sourceGrouping';

type WeChatItem = Hotspot;

type WeChatFilters = {
  startDate: string;
  endDate: string;
  blogger: string;
  category: string;
  tag: string;
  q: string;
};

const DEFAULT_LIMIT = 20;

function isWeChatSource(source: string): boolean {
  return (source || '').startsWith('http://localhost:4000/feeds/MP_WXS_');
}

function wechatItemToNewsItem(item: WeChatItem): NewsItem {
  const sourceTopic = (item.category || '').trim();
  const sourceGroup = inferSourceGroup(item.source);
  const raw = String(item.ai_summary || item.content || '').trim();
  const summary = raw ? `${raw.slice(0, 220)}${raw.length > 220 ? '…' : ''}` : 'No summary available yet.';
  const rawTags = Array.isArray(item.tags) ? item.tags : [];

  const tagSeed: Array<{ name: string; type: 'ai' | 'manual' }> = [];
  if (sourceTopic) {
    tagSeed.push({ name: sourceTopic, type: 'manual' });
  }
  for (const rawTag of rawTags) {
    const name = (String(rawTag || '') || '').trim();
    if (name) tagSeed.push({ name, type: 'ai' });
  }
  const dedupedTags = Array.from(
    tagSeed
      .reduce((map, tag) => {
        if (!map.has(tag.name)) map.set(tag.name, tag);
        return map;
      }, new Map<string, { name: string; type: 'ai' | 'manual' }>())
      .values(),
  );

  return {
    id: item.id,
    title: item.title_zh || item.title,
    source: item.source,
    sourcePlatform: sourceGroup,
    sourceType: sourceTopic || 'General',
    score: item.total_score || 0,
    summary,
    ai_summary: item.ai_summary,
    content: item.content,
    url: item.url,
    tags: dedupedTags.map((t, i) => ({ id: `${item.id}-t${i}`, name: t.name, type: t.type })),
    timestamp: item.created_at,
  };
}

export function WeChatFeed() {
  const [filters, setFilters] = useState<WeChatFilters>({
    startDate: '',
    endDate: '',
    blogger: '',
    category: '',
    tag: '',
    q: '',
  });
  const [activeCategory, setActiveCategory] = useState('All');
  const [items, setItems] = useState<WeChatItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_LIMIT);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bloggerOptions, setBloggerOptions] = useState<Array<{ label: string; value: string }>>([]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (currentPage - 1) * pageSize;

  const queryParams = useMemo(
    () => ({
      limit: pageSize,
      offset,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      blogger: filters.blogger || undefined,
      category: activeCategory !== 'All' ? activeCategory : undefined,
      tag: filters.tag || undefined,
      q: filters.q || undefined,
    }),
    [filters, activeCategory, pageSize, offset],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadBloggers() {
      try {
        const data = await fetchSources();
        const sources = data?.sources || [];
        const wechat = sources.filter((s: any) => isWeChatSource(String(s.url || '')));
        const options = wechat
          .map((s: any) => ({ label: String(s.name || s.id || s.url || ''), value: String(s.url || '') }))
          .filter((o: any) => o.value);
        if (!cancelled) setBloggerOptions(options);
      } catch {
        if (!cancelled) setBloggerOptions([]);
      }
    }
    loadBloggers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchWeChatLatest(queryParams);
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [queryParams]);

  const updateFilter = (patch: Partial<WeChatFilters>) => {
    setCurrentPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WeChat</h1>
          <p className="text-sm text-gray-500 mt-1">公众号最新内容（不受日期影响）</p>
        </div>
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-3">
        <div className="shrink-0 mb-3 flex items-start gap-3">
          <span className="w-20 shrink-0 pt-1 text-xs font-medium text-gray-500">Category:</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCategory('All')}
              className={activeCategory === 'All' ? controlUi.chipActive : controlUi.chipInactive}
            >
              All
            </button>
            {['技术突破', '产品发布', '投资融资', '行业动态', '人才流动', '市场机会'].map((name) => (
              <button
                key={name}
                onClick={() => setActiveCategory(name)}
                className={activeCategory === name ? controlUi.chipActive : controlUi.chipInactive}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Start</label>
            <input
              type="date"
              className="border border-gray-200 rounded-md px-3 py-2 text-sm"
              value={filters.startDate}
              onChange={(e) => updateFilter({ startDate: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">End</label>
            <input
              type="date"
              className="border border-gray-200 rounded-md px-3 py-2 text-sm"
              value={filters.endDate}
              onChange={(e) => updateFilter({ endDate: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Blogger</label>
            <select
              className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
              value={filters.blogger}
              onChange={(e) => updateFilter({ blogger: e.target.value })}
            >
              <option value="">All</option>
              {bloggerOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Tag</label>
            <input
              type="text"
              placeholder="e.g. 多模态"
              className="border border-gray-200 rounded-md px-3 py-2 text-sm"
              value={filters.tag}
              onChange={(e) => updateFilter({ tag: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Search</label>
            <input
              type="text"
              placeholder="标题 / 作者（模糊）"
              className="border border-gray-200 rounded-md px-3 py-2 text-sm"
              value={filters.q}
              onChange={(e) => updateFilter({ q: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {loading ? 'Loading…' : `Total ${total}`}
            {error ? <span className="text-red-600"> · {error}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            <select
              className="border border-gray-200 rounded-md px-2 py-1 text-sm bg-white"
              value={pageSize}
              onChange={(e) => {
                const next = Number(e.target.value);
                setCurrentPage(1);
                setPageSize(next);
              }}
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <NewsCard
            key={item.id}
            item={wechatItemToNewsItem(item)}
            onClick={() => {
              window.open(item.url, '_blank', 'noopener,noreferrer');
            }}
          />
        ))}

        <PaginationControls
          totalItems={total}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={(nextPage) => {
            const clampedPage = Math.min(Math.max(1, nextPage), totalPages);
            setCurrentPage(clampedPage);
          }}
          onPageSizeChange={(nextSize) => {
            setCurrentPage(1);
            setPageSize(nextSize);
          }}
        />
      </div>
    </div>
  );
}
