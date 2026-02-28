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
  date: string;
  hotspot_count: number;
  opportunity_count: number;
  note_count: number;
}

export interface TrendData {
  trend: { date: string; count: number; avg_score: number }[];
  categories: { category: string; count: number }[];
  total_sources: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export async function fetchHotspots(date?: string, limit = 50): Promise<{ hotspots: Hotspot[]; date: string }> {
  const d = date || today();
  const res = await fetch(`/api/hotspots?date=${d}&limit=${limit}`);
  const data = await res.json();
  return { hotspots: data.hotspots || [], date: data.date };
}

export async function fetchHotspotDetail(id: string): Promise<Hotspot | null> {
  const res = await fetch(`/api/hotspots/${id}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.hotspot || null;
}

export async function fetchOpportunities(date?: string, limit = 20): Promise<Opportunity[]> {
  const d = date || today();
  const res = await fetch(`/api/opportunities?date=${d}&limit=${limit}`);
  const data = await res.json();
  return data.opportunities || [];
}

export async function fetchSources(): Promise<{ sources: Source[]; categories: Record<string, Source[]>; total: number }> {
  const res = await fetch('/api/sources');
  const data = await res.json();
  return { sources: data.sources || [], categories: data.categories || {}, total: data.total || 0 };
}

export async function fetchNotes(date?: string, limit = 50): Promise<Note[]> {
  const d = date || today();
  const res = await fetch(`/api/notes?date=${d}&limit=${limit}`);
  const data = await res.json();
  return data.notes || [];
}

export async function fetchSummaryStats(date?: string): Promise<SummaryStats> {
  const d = date || today();
  const res = await fetch(`/api/summary?date=${d}`);
  const data = await res.json();
  return data;
}

export async function fetchTrend(days = 30): Promise<TrendData> {
  const res = await fetch(`/api/trend?days=${days}`);
  const data = await res.json();
  return data;
}

export async function fetchSourceStatus(date?: string): Promise<SourceStatus[]> {
  const d = date || today();
  const res = await fetch(`/api/source-status?date=${d}`);
  const data = await res.json();
  return data.source_status || [];
}

export async function fetchLatestDate(): Promise<string> {
  const res = await fetch('/api/latest-date');
  const data = await res.json();
  return data.latest_date || today();
}

export async function triggerCollect(): Promise<{ ok: boolean; hotspots_count: number; opportunities_count: number; collected_at: string }> {
  const res = await fetch('/api/collect', { method: 'POST' });
  return res.json();
}

export async function addNote(hotspot_id: string, content: string, tags = ''): Promise<{ ok: boolean; note_id: string }> {
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hotspot_id, content, tags }),
  });
  return res.json();
}

export async function deleteSource(id: string): Promise<void> {
  await fetch(`/api/sources/${id}`, { method: 'DELETE' });
}

export async function addSource(name: string, url: string, type: string, note = ''): Promise<{ ok: boolean; id: string }> {
  const res = await fetch('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, url, type, note }),
  });
  return res.json();
}

export async function updateSource(id: string, tags: string[], status: string, notes: string): Promise<void> {
  await fetch(`/api/sources/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags, status, notes }),
  });
}
