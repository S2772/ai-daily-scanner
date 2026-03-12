import React, { useEffect, useMemo, useState } from 'react';
import { NewsItem } from '../types';
import { ExternalLink, Sparkles, Save, ArrowLeft, CheckCircle2, FileText, Lightbulb, ArrowRight } from 'lucide-react';
import { addNote, createSavedItem } from '../api';
import { cardUi, controlUi } from './designSystem';

interface NewsDetailProps {
  item: NewsItem;
  onBack: () => void;
  allItems?: NewsItem[];
  onSelectItem?: (item: NewsItem) => void;
}

interface RecommendationItem {
  item: NewsItem;
  reason: string;
}

function normalizeTopicName(news: NewsItem): string {
  const topic = (news.sourceType || '').trim();
  if (!topic || topic === 'General') return '';
  return topic;
}

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[\u4e00-\u9fa5a-z0-9]+/g) || [];
  return matches.filter(token => token.length > 1);
}

function cosineSimilarity(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const freqA = new Map<string, number>();
  const freqB = new Map<string, number>();
  for (const token of tokensA) freqA.set(token, (freqA.get(token) || 0) + 1);
  for (const token of tokensB) freqB.set(token, (freqB.get(token) || 0) + 1);

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const value of freqA.values()) magA += value * value;
  for (const value of freqB.values()) magB += value * value;
  for (const [token, value] of freqA.entries()) {
    dot += value * (freqB.get(token) || 0);
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function NewsDetail({ item, onBack, allItems = [], onSelectItem }: NewsDetailProps) {
  const [annotation, setAnnotation] = useState(item.annotations || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [showFullArticle, setShowFullArticle] = useState(false);
  const aiSummary = (item.ai_summary || '').trim();
  const originalContent = (item.content || '').trim();
  const articlePreview = originalContent.slice(0, 500);
  const hasLongArticle = originalContent.length > 500;

  useEffect(() => {
    setAnnotation(item.annotations || '');
    setShowFullArticle(false);
  }, [item.id, item.annotations]);

  const recommendations = useMemo<RecommendationItem[]>(() => {
    const candidates = allItems.filter(candidate => candidate.id !== item.id);
    if (candidates.length === 0) return [];

    const currentTopic = normalizeTopicName(item);
    const baseText = `${item.title} ${item.summary} ${item.content}`;
    const scored = candidates.map((candidate) => {
      const targetText = `${candidate.title} ${candidate.summary} ${candidate.content}`;
      const similarity = cosineSimilarity(baseText, targetText);
      const sameTopic = currentTopic && normalizeTopicName(candidate) === currentTopic;
      return { candidate, similarity, sameTopic: Boolean(sameTopic) };
    });

    const sameTopic = scored
      .filter(row => row.sameTopic)
      .sort((a, b) => b.similarity - a.similarity || b.candidate.score - a.candidate.score);
    const similar = scored
      .filter(row => !row.sameTopic)
      .sort((a, b) => b.similarity - a.similarity || b.candidate.score - a.candidate.score);

    const merged = [...sameTopic, ...similar].slice(0, Math.min(2, scored.length));
    return merged.map((row) => ({
      item: row.candidate,
      reason: row.sameTopic
        ? `Same topic: ${currentTopic}`
        : 'Related by content similarity',
    }));
  }, [item, allItems]);

  const handleOpenRecommendation = (nextItem: NewsItem) => {
    if (onSelectItem) {
      onSelectItem(nextItem);
      return;
    }
    window.open(nextItem.url, '_blank', 'noopener,noreferrer');
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSavedMsg('');
    try {
      await createSavedItem({
        origin_type: 'hotspot',
        hotspot_id: item.id,
        status: 'new',
        note: annotation.trim(),
      });
      setIsSaved(true);
      setSavedMsg('Saved');
      setTimeout(() => setIsSaved(false), 2500);
    } catch (error: any) {
      setSavedMsg(`Save failed${error?.message ? `: ${error.message}` : ''}`);
    }
    setIsSaving(false);
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-[#EAEAEA] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-900">Article Detail</span>
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={controlUi.purpleButton}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in Browser
        </a>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map(tag => (
                <span
                  key={tag.id}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    tag.type === 'ai'
                      ? 'bg-purple-50 text-purple-700 border border-purple-100'
                      : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}
                >
                  {tag.name}
                </span>
              ))}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight leading-tight text-gray-900">
              {item.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-gray-700 font-medium">{item.sourcePlatform}</span>
              <span className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-gray-700 font-medium">{item.sourceType}</span>
              <span className="font-medium text-gray-600">{item.source}</span>
              <span>{new Date(item.timestamp).toLocaleDateString()}</span>
              <span className="flex items-center gap-1 font-bold text-purple-700 ml-auto bg-purple-50 px-2 py-1 rounded-md border border-purple-100">
                AI Score: {item.score.toFixed(1)}
              </span>
            </div>
          </div>

          {aiSummary && (
            <div className={`${cardUi.base} bg-gradient-to-br from-purple-50 to-white border-purple-100/80 shadow-sm`}>
              <div className="flex items-center gap-1.5 mb-3 text-sm font-semibold text-purple-900">
                <Sparkles className="w-4 h-4 text-purple-600" />
                AI Summary
              </div>
              <p className="text-gray-700 text-sm leading-relaxed">
                {aiSummary}
              </p>
            </div>
          )}

          <div className={cardUi.base}>
            <div className="mb-3 text-sm font-semibold text-gray-900">Original Content</div>
            <p className="text-gray-700 text-sm leading-loose whitespace-pre-wrap">
              {originalContent
                ? showFullArticle || !hasLongArticle
                  ? originalContent
                  : `${articlePreview}...`
                : 'No original text available.'}
            </p>
            {hasLongArticle && (
              <div className="mt-4">
                <button onClick={() => setShowFullArticle((prev) => !prev)} className={controlUi.purpleButton}>
                  {showFullArticle ? 'Show Less' : 'Read Full Article'}
                </button>
              </div>
            )}
          </div>

          {recommendations.length > 0 && (
            <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl p-5 border border-amber-100/80 shadow-sm">
              <div className="flex items-center gap-1.5 mb-2 text-sm font-semibold text-amber-900">
                <Lightbulb className="w-4 h-4 text-amber-600" />
                Recommendations
              </div>
              <div className="space-y-3">
                {recommendations.map((recommendation) => (
                  <button
                    key={recommendation.item.id}
                    onClick={() => handleOpenRecommendation(recommendation.item)}
                    className="w-full text-left rounded-lg border border-amber-200 bg-white px-4 py-3 hover:border-purple-300 hover:bg-purple-50/40 transition-colors"
                  >
                    <div className="text-[11px] text-amber-800 mb-1">{recommendation.reason}</div>
                    <div className="text-sm font-semibold text-gray-900 line-clamp-2">{recommendation.item.title}</div>
                    <div className="mt-1 text-xs text-gray-500">{recommendation.item.source} · {recommendation.item.sourceType}</div>
                    <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-purple-700">
                      Open Recommended News <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-[#EAEAEA] pt-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                Insight Notes
              </h3>
              <button
                onClick={handleSave}
                disabled={isSaving || !annotation.trim()}
                className={controlUi.darkButton}
              >
                {isSaving ? (
                  <span className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</span>
                ) : isSaved ? (
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Saved</span>
                ) : (
                  <span className="flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> Save to Insight</span>
                )}
              </button>
            </div>
            <textarea
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              placeholder="Record your thoughts, ideas, or to-dos here..."
              className="w-full h-32 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 resize-none transition-all"
            />
            <p className="text-xs text-gray-500 mt-2">
              Saved items appear in the Saved list, linked to this News item.
            </p>
            {savedMsg && (
              <div className={`mt-2 text-xs ${savedMsg.startsWith('Save failed') ? 'text-red-600' : 'text-emerald-600'} font-medium`}>
                {savedMsg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
