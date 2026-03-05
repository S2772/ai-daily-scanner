// API client for ai_daily_scanner backend (port 6003, proxied via Vite /api)

export interface Hotspot {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  category: string;
  tags: string[];
  ai_summary: string;
  title_zh: string;
  innovation_score: number;
  commercial_score: number;
  tech_score: number;
  investment_score: number;
  total_score: number;
  created_at: string;
}

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  category: string;
  potential_score: number;
  competition_level: string;
  resources_needed: string;
  timeline: string;
  pain_points: string;
  blue_ocean_opportunity: string;
  monetization_potential: string;
  domains: string[];
  priority: string;
  created_at: string;
}

export interface Source {
  id: string;
  type: string;
  category: string;
  name: string;
  url: string;
  note: string;
  tags: string[];
  status: string;
  notes: string;
}

export interface Note {
  id: string;
  hotspot_id: string;
  hotspot_title: string;
  content: string;
  tags: string;
  created_at: string;
}

export interface SourceStatus {
  source: string;
  source_type: string;
  status: string;
  item_count: number;
  error_message: string;
  created_at: string;
}

export interface SummaryStats {
  date?: string;
  start_date?: string;
  end_date?: string;
  all_time?: string;
  hotspot_count: number;
  opportunity_count: number;
  note_count: number;
}

export interface TrendData {
  trend: { date: string; count: number; avg_score: number }[];
  categories: { category: string; count: number }[];
  total_sources: number;
}

export interface HotspotSourceGroup {
  source: string;
  count: number;
}

export interface DateFilter {
  date?: string;
  startDate?: string;
  endDate?: string;
  allTime?: boolean;
}

async function requestJson(url: string, init?: RequestInit): Promise<any> {
  const timeoutMs = 15000;
  const controller = init?.signal ? null : new AbortController();
  const timeoutId = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: init?.signal || controller?.signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`请求超时（>${timeoutMs / 1000}s）: ${url}`);
    }
    throw error;
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
  const raw = await res.text();

  let data: any = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      const bodyPreview = raw.slice(0, 220).replace(/\s+/g, ' ').trim();
      throw new Error(`接口返回非JSON响应（HTTP ${res.status}）：${bodyPreview || 'empty body'}`);
    }
  }

  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    const ts = data?.timestamp ? ` @ ${data.timestamp}` : '';
    const detail = data?.detail ? ` | ${data.detail}` : '';
    throw new Error(`${msg}${ts}${detail}`);
  }

  if (data && typeof data === 'object' && data.ok === false) {
    const msg = data.error || '接口返回失败';
    const ts = data.timestamp ? ` @ ${data.timestamp}` : '';
    const detail = data.detail ? ` | ${data.detail}` : '';
    throw new Error(`${msg}${ts}${detail}`);
  }

  return data || {};
}

const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function buildDateParams(dateOrFilter?: string | DateFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (typeof dateOrFilter === 'string') {
    params.set('date', dateOrFilter);
    return params;
  }
  if (dateOrFilter) {
    if (dateOrFilter.allTime) {
      params.set('all_time', '1');
      return params;
    }
    if (dateOrFilter.date) {
      params.set('date', dateOrFilter.date);
      return params;
    }
    if (dateOrFilter.startDate || dateOrFilter.endDate) {
      const start = dateOrFilter.startDate || dateOrFilter.endDate || '';
      const end = dateOrFilter.endDate || dateOrFilter.startDate || '';
      if (start) params.set('start_date', start);
      if (end) params.set('end_date', end);
      return params;
    }
    return params;
  }
  params.set('date', today());
  return params;
}

export async function fetchHotspots(
  dateOrFilter?: string | DateFilter,
  limit = 50,
  fillMissing = true,
): Promise<{ hotspots: Hotspot[]; date: string }> {
  const params = buildDateParams(dateOrFilter);
  params.set('limit', String(limit));
  if (fillMissing) {
    params.set('fill_missing', '1');
  }
  const data = await requestJson(`/api/hotspots?${params.toString()}`);
  return { hotspots: data.hotspots || [], date: data.date || '' };
}

export async function fetchHotspotSourceGroups(dateOrFilter?: string | DateFilter): Promise<HotspotSourceGroup[]> {
  const params = buildDateParams(dateOrFilter);
  const data = await requestJson(`/api/hotspots-source-groups?${params.toString()}`);
  return data.sources || [];
}

export async function fetchHotspotDetail(id: string): Promise<Hotspot | null> {
  const res = await fetch(`/api/hotspots/${id}`);
  if (!res.ok) return null;
  const raw = await res.text();
  if (!raw) return null;
  const data = JSON.parse(raw);
  return data.hotspot || null;
}

export async function fetchOpportunities(dateOrFilter?: string | DateFilter, limit = 20): Promise<Opportunity[]> {
  const params = buildDateParams(dateOrFilter);
  params.set('limit', String(limit));
  const data = await requestJson(`/api/opportunities?${params.toString()}`);
  return data.opportunities || [];
}

export async function fetchSources(): Promise<{ sources: Source[]; categories: Record<string, Source[]>; total: number }> {
  const data = await requestJson('/api/sources');
  return { sources: data.sources || [], categories: data.categories || {}, total: data.total || 0 };
}

export async function fetchNotes(dateOrFilter?: string | DateFilter, limit = 50): Promise<Note[]> {
  const params = buildDateParams(dateOrFilter);
  params.set('limit', String(limit));
  const data = await requestJson(`/api/notes?${params.toString()}`);
  return data.notes || [];
}

export async function fetchSummaryStats(dateOrFilter?: string | DateFilter): Promise<SummaryStats> {
  const params = buildDateParams(dateOrFilter);
  return requestJson(`/api/summary?${params.toString()}`);
}

export async function fetchTrend(days = 30): Promise<TrendData> {
  return requestJson(`/api/trend?days=${days}`);
}

export async function fetchSourceStatus(dateOrFilter?: string | DateFilter): Promise<SourceStatus[]> {
  const params = buildDateParams(dateOrFilter);
  const data = await requestJson(`/api/source-status?${params.toString()}`);
  return data.source_status || [];
}

export async function fetchLatestDate(): Promise<string> {
  const data = await requestJson('/api/latest-date');
  return data.latest_date || today();
}

export async function triggerCollect(): Promise<{ ok: boolean; hotspots_count: number; opportunities_count: number; collected_at: string }> {
  return requestJson('/api/collect', { method: 'POST' });
}

export async function addNote(hotspot_id: string, content: string, tags = ''): Promise<{ ok: boolean; note_id: string }> {
  return requestJson('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hotspot_id, content, tags }),
  });
}

export async function deleteSource(id: string): Promise<void> {
  await requestJson(`/api/sources/${id}`, { method: 'DELETE' });
}

export async function addSource(name: string, url: string, type: string, note = ''): Promise<{ ok: boolean; id: string }> {
  return requestJson('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, url, type, note }),
  });
}

export async function updateSource(id: string, tags: string[], status: string, notes: string): Promise<void> {
  await requestJson(`/api/sources/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags, status, notes }),
  });
}
