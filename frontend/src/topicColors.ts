export function getTopicFilterChipClass(active: boolean): string {
  return active
    ? 'bg-purple-50 text-purple-700 border border-purple-200 shadow-sm'
    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50';
}

const categoryColorMap: Record<string, string> = {
  '技术突破': 'bg-blue-50 text-blue-700 border-blue-200',
  '产品发布': 'bg-purple-50 text-purple-700 border-purple-200',
  '市场机会': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '投资融资': 'bg-orange-50 text-orange-700 border-orange-200',
  '行业动态': 'bg-gray-50 text-gray-700 border-gray-200',
  '人才流动': 'bg-pink-50 text-pink-700 border-pink-200',
};

export function getTopicTagClass(category?: string): string {
  if (!category) return 'bg-white text-gray-600 border border-gray-200';
  return categoryColorMap[category] || 'bg-white text-gray-600 border border-gray-200';
}
