export const pageUi = {
  pageShell: 'h-full flex flex-col overflow-y-auto pb-8 pr-2',
  pageHeader: 'mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between',
  pageTitle: 'text-xl font-semibold tracking-tight text-gray-900',
  pageSubtitle: 'text-xs text-gray-500',
  sectionTitleRow: 'flex items-center gap-2',
  sectionTitle: 'text-sm font-semibold text-gray-900',
};

export const cardUi = {
  base: 'bg-white border border-[#EAEAEA] rounded-xl p-6',
  interactive:
    'bg-white border border-[#EAEAEA] rounded-xl p-6 transition-all cursor-pointer hover:border-purple-500/40 hover:shadow-md',
  subtle: 'bg-gray-50 border border-gray-200 rounded-lg p-4',
  selected: 'bg-purple-50/40 border-purple-200 shadow-sm',
};

export const controlUi = {
  searchInput:
    'w-full rounded-md border border-[#EAEAEA] bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500',
  secondaryButton:
    'inline-flex items-center gap-1.5 rounded-md border border-[#EAEAEA] bg-white px-3.5 py-2.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50',
  darkButton:
    'inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50',
  purpleButton:
    'inline-flex items-center gap-1.5 rounded-md bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100',
  chipActive: 'px-3 py-1.5 rounded-full text-xs font-medium bg-purple-600 text-white shadow-sm',
  chipInactive:
    'px-3 py-1.5 rounded-full text-xs font-medium bg-white text-gray-600 border border-[#EAEAEA] hover:bg-gray-50 transition-all',
};
