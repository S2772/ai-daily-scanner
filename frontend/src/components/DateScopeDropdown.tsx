import React, { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { DateFilter } from '../api';

const PRESET_OPTIONS = ['Today', 'Yesterday', 'This Week', 'This Month', 'All Time', 'Custom'] as const;
type PresetOption = typeof PRESET_OPTIONS[number];

interface DateScopeDropdownProps {
  label: string;
  onChange: (label: string, filter: DateFilter) => void;
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function presetToFilter(option: Exclude<PresetOption, 'Custom'>): DateFilter {
  const now = new Date();
  const today = formatLocalDate(now);
  if (option === 'Today') {
    return { date: today };
  }
  if (option === 'Yesterday') {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return { date: formatLocalDate(date) };
  }
  if (option === 'This Week') {
    const date = new Date(now);
    const day = date.getDay();
    const diff = day === 0 ? 6 : day - 1;
    date.setDate(date.getDate() - diff);
    return { startDate: formatLocalDate(date), endDate: today };
  }
  if (option === 'This Month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: formatLocalDate(start), endDate: today };
  }
  return { allTime: true };
}

export function DateScopeDropdown({ label, onChange }: DateScopeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomPanel, setShowCustomPanel] = useState(false);
  const [customMode, setCustomMode] = useState<'single' | 'range'>('single');
  const [customDate, setCustomDate] = useState(formatLocalDate(new Date()));
  const [customStartDate, setCustomStartDate] = useState(formatLocalDate(new Date()));
  const [customEndDate, setCustomEndDate] = useState(formatLocalDate(new Date()));
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCustomPanel(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const applyCustomFilter = () => {
    if (customMode === 'single') {
      if (!customDate) return;
      onChange('Custom', { date: customDate });
      setIsOpen(false);
      setShowCustomPanel(false);
      return;
    }
    const start = customStartDate || customEndDate;
    const end = customEndDate || customStartDate;
    if (!start || !end) return;
    if (start <= end) {
      onChange('Custom', { startDate: start, endDate: end });
    } else {
      onChange('Custom', { startDate: end, endDate: start });
    }
    setIsOpen(false);
    setShowCustomPanel(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#EAEAEA] rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
      >
        <Calendar className="w-3.5 h-3.5 text-gray-400" />
        {label}
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-56 bg-white border border-[#EAEAEA] rounded-md shadow-lg z-20 py-1">
          {PRESET_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => {
                if (option === 'Custom') {
                  setShowCustomPanel(true);
                  return;
                }
                onChange(option, presetToFilter(option));
                setIsOpen(false);
                setShowCustomPanel(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs ${
                label === option ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {option}
            </button>
          ))}

          {showCustomPanel && (
            <div className="border-t border-[#EAEAEA] mt-1 pt-2 px-3 pb-2 space-y-2">
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={() => setCustomMode('single')}
                  className={`px-2 py-1 rounded border ${customMode === 'single' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'border-gray-200 text-gray-500'}`}
                >
                  One Day
                </button>
                <button
                  onClick={() => setCustomMode('range')}
                  className={`px-2 py-1 rounded border ${customMode === 'range' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'border-gray-200 text-gray-500'}`}
                >
                  Range
                </button>
              </div>

              {customMode === 'single' ? (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                />
              ) : (
                <div className="space-y-2">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                  />
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              )}

              <button
                onClick={applyCustomFilter}
                className="w-full px-2 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 transition-colors"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
