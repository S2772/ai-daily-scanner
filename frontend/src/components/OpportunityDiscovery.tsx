import React, { useState, useEffect } from 'react';
import { fetchOpportunities, fetchLatestDate, fetchHotspots, Opportunity as ApiOpportunity, Hotspot } from '../api';
import { Lightbulb, TrendingUp, ArrowRight, ArrowLeft, Calendar, ChevronDown, FileText, CheckCircle2, Flame, Newspaper, Target } from 'lucide-react';

function getRelatedHotspots(opp: ApiOpportunity, hotspots: Hotspot[]): Hotspot[] {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'by', 'from', 'as', 'into', 'through', 'before', 'after', 'out', 'over', 'then', 'when', 'where', 'how', 'all', 'more', 'most', 'other', 'some', 'no', 'not', 'only', 'same', 'so', 'than', 'too', 'very', 'just', 'but', 'if', 'about', 'up', 'what', 'which', 'who']);
  const keywords = opp.title.toLowerCase()
    .split(/[\s\-_,./]+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
  const domainKeywords = opp.domains.map(d => d.toLowerCase());
  const allKeywords = [...new Set([...keywords, ...domainKeywords])].filter(k => k.length > 2);
  if (allKeywords.length === 0) return [];
  return hotspots.filter(h => {
    const title = (h.title_zh || h.title).toLowerCase();
    const tags = (h.tags || []).join(' ').toLowerCase();
    return allKeywords.some(kw => title.includes(kw) || tags.includes(kw));
  }).slice(0, 5);
}

interface OpportunityDiscoveryProps {
  setActiveTab?: (tab: string) => void;
  onSelectHotspot?: (id?: string) => void;
  selectedOppId?: string | null;
  onClearSelection?: () => void;
}

export function OpportunityDiscovery({ setActiveTab, onSelectHotspot, selectedOppId, onClearSelection }: OpportunityDiscoveryProps) {
  const [selectedOpp, setSelectedOpp] = useState<ApiOpportunity | null>(null);
  const [timeRange, setTimeRange] = useState('Today');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<ApiOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [intelligenceNote, setIntelligenceNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [relatedHotspots, setRelatedHotspots] = useState<Hotspot[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  useEffect(() => {
    fetchLatestDate().then(d => fetchOpportunities(d, 50))
      .then(opps => { setOpportunities(opps); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Auto-select opp when selectedOppId is provided
  useEffect(() => {
    if (selectedOppId && opportunities.length > 0) {
      const opp = opportunities.find(o => o.id === selectedOppId);
      if (opp) {
        setSelectedOpp(opp);
        onClearSelection?.();
      }
    }
  }, [selectedOppId, opportunities]);

  // Fetch related hotspots when an opp is selected
  useEffect(() => {
    if (!selectedOpp) { setRelatedHotspots([]); return; }
    setLoadingRelated(true);
    fetchLatestDate().then(d => fetchHotspots(d, 100))
      .then(({ hotspots }) => {
        setRelatedHotspots(getRelatedHotspots(selectedOpp, hotspots));
        setLoadingRelated(false);
      })
      .catch(() => setLoadingRelated(false));
  }, [selectedOpp]);

  const timeOptions = ['Today', 'Yesterday', 'This Week', 'This Month', 'All Time'];
  const allTags = Array.from(new Set(opportunities.flatMap(o => o.domains)));
  const filteredOpps = activeTag ? opportunities.filter(o => o.domains.includes(activeTag)) : opportunities;

  const handleSaveNote = async () => {
    if (!intelligenceNote.trim() || !selectedOpp) return;
    setSaving(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hotspot_id: selectedOpp.id, content: intelligenceNote, tags: selectedOpp.category }),
      });
      if (res.ok) { setSaved(true); setIntelligenceNote(''); setTimeout(() => setSaved(false), 3000); }
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (selectedOpp) {
    return (
      <div className="h-full flex flex-col bg-white rounded-lg overflow-hidden animate-in fade-in duration-300">
        <div className="flex items-center justify-between p-4 border-b border-[#EAEAEA] shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedOpp(null)} className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-gray-900">Opportunity Detail</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="space-y-6">
              <div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedOpp.domains.map(tag => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded-full font-medium">{tag}</span>
                  ))}
                  <span className="text-[10px] px-2 py-0.5 bg-gray-50 text-gray-600 border border-gray-100 rounded-full font-medium">{selectedOpp.category}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <h1 className="text-2xl font-semibold tracking-tight leading-tight text-gray-900">{selectedOpp.title}</h1>
                  <div className={`flex flex-col items-end shrink-0 ${selectedOpp.potential_score >= 90 ? 'text-red-600' : 'text-blue-600'}`}>
                    <div className="flex items-center gap-1">
                      <Flame className={`w-5 h-5 ${selectedOpp.potential_score >= 90 ? 'fill-red-100' : 'fill-blue-100'}`} />
                      <span className="text-2xl font-bold">{selectedOpp.potential_score}</span>
                    </div>
                    <span className="text-[10px] uppercase font-semibold tracking-wider opacity-70">Potential Score</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-purple-50/50 rounded-xl p-5 border border-purple-100">
                  <h3 className="text-sm font-semibold text-purple-900 mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-purple-600" />
                    Competition Level
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">{selectedOpp.competition_level || '—'}</p>
                </div>
                <div className="bg-amber-50/50 rounded-xl p-5 border border-amber-100">
                  <h3 className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-1.5">
                    <Lightbulb className="w-4 h-4 text-amber-600" />
                    Timeline
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">{selectedOpp.timeline || '—'}</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Opportunity Analysis</h3>
                {selectedOpp.pain_points && (
                  <div className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0"></div>
                    <div>
                      <span className="text-sm font-semibold text-gray-700 mr-2">Pain Points:</span>
                      <span className="text-sm text-gray-600 leading-relaxed">{selectedOpp.pain_points}</span>
                    </div>
                  </div>
                )}
                {selectedOpp.blue_ocean_opportunity && (
                  <div className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 shrink-0"></div>
                    <div>
                      <span className="text-sm font-semibold text-gray-900 mr-2">Blue Ocean:</span>
                      <span className="text-sm text-gray-800 leading-relaxed font-medium">{selectedOpp.blue_ocean_opportunity}</span>
                    </div>
                  </div>
                )}
                {selectedOpp.monetization_potential && (
                  <div className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0"></div>
                    <div>
                      <span className="text-sm font-semibold text-gray-700 mr-2">Monetization:</span>
                      <span className="text-sm text-gray-600 leading-relaxed">{selectedOpp.monetization_potential}</span>
                    </div>
                  </div>
                )}
                {selectedOpp.resources_needed && (
                  <div className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0"></div>
                    <div>
                      <span className="text-sm font-semibold text-gray-700 mr-2">Resources Needed:</span>
                      <span className="text-sm text-gray-600 leading-relaxed">{selectedOpp.resources_needed}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Related Insights */}
            <div className="pt-6 border-t border-[#EAEAEA]">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <Newspaper className="w-5 h-5 text-purple-600" />
                Related Insights
              </h3>
              {loadingRelated ? (
                <div className="text-xs text-gray-400 py-4">Loading related insights...</div>
              ) : relatedHotspots.length === 0 ? (
                <div className="text-xs text-gray-400 py-4">No related insights found for this opportunity.</div>
              ) : (
                <div className="space-y-2">
                  {relatedHotspots.map(h => (
                    <div
                      key={h.id}
                      onClick={() => onSelectHotspot ? onSelectHotspot(h.id) : setActiveTab?.('feed')}
                      className="group flex items-start justify-between gap-4 p-3 rounded-lg border border-gray-100 bg-gray-50 hover:border-purple-200 hover:bg-purple-50/30 cursor-pointer transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 group-hover:text-purple-700 transition-colors line-clamp-1">
                          {h.title_zh || h.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <span className="bg-white px-1.5 py-0.5 rounded border border-gray-100">{h.source}</span>
                          <span className="opacity-50">•</span>
                          <span>{new Date(h.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-100">
                          {h.total_score?.toFixed(1)}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-purple-600 transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-[#EAEAEA]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  Intelligence Notes
                </h3>
                <button
                  onClick={handleSaveNote}
                  disabled={saving || !intelligenceNote.trim()}
                  className="flex items-center gap-1.5 text-xs bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving ? (
                    <span className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</span>
                  ) : saved ? (
                    <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Saved</span>
                  ) : (
                    <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Save to Intelligence</span>
                  )}
                </button>
              </div>
              <textarea
                value={intelligenceNote}
                onChange={(e) => setIntelligenceNote(e.target.value)}
                placeholder="Write your thoughts, ideas, or analysis based on this opportunity..."
                className="w-full h-32 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 resize-none transition-all"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Opportunity</h1>
          <p className="text-gray-500 text-xs">AI-generated business trends based on high-frequency tags.</p>
        </div>
        <div className="relative">
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
                <button key={option} onClick={() => { setTimeRange(option); setIsDropdownOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs ${timeRange === option ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-purple-600" />
          <h2 className="text-sm font-semibold text-gray-900">Discovered Opportunities</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActiveTag(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeTag === null ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-[#EAEAEA] hover:bg-gray-50'}`}>
            All Opportunities
          </button>
          {allTags.map(tag => (
            <button key={tag} onClick={() => setActiveTag(tag)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeTag === tag ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-[#EAEAEA] hover:bg-gray-50'}`}>
              {tag}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : filteredOpps.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">No opportunities found for today.</div>
      ) : (
        <div className="space-y-4">
          {filteredOpps.map(opp => (
            <div key={opp.id} onClick={() => setSelectedOpp(opp)}
              className="bg-white border border-[#EAEAEA] rounded-xl p-6 hover:border-purple-500/40 hover:shadow-md transition-all group cursor-pointer relative">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1 pr-6">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-purple-700 transition-colors">{opp.title}</h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {opp.domains.map(tag => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 bg-purple-50/50 text-purple-600 border border-purple-100 rounded-full font-medium">{tag}</span>
                    ))}
                    <span className="text-[10px] px-2 py-0.5 bg-gray-50 text-gray-500 border border-gray-100 rounded-full">{opp.category}</span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{opp.description}</p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <div className={`flex items-center gap-1 ${opp.potential_score >= 90 ? 'text-red-500' : 'text-blue-500'}`}>
                    <Flame className={`w-5 h-5 ${opp.potential_score >= 90 ? 'fill-red-100' : 'fill-blue-100'}`} />
                    <span className="text-2xl font-bold">{opp.potential_score}</span>
                  </div>
                  <span className="text-[9px] uppercase font-semibold text-gray-400 tracking-wider mt-0.5">Score</span>
                </div>
              </div>
              {opp.pain_points && (
                <div className="bg-gray-50/50 rounded-lg p-4 border border-gray-100">
                  <p className="text-xs text-gray-600 line-clamp-2">{opp.pain_points}</p>
                </div>
              )}
              <div className="mt-4 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="text-xs font-medium text-purple-600 flex items-center gap-1 px-3 py-1.5 bg-purple-50 rounded-md">
                  Enter Workspace <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
