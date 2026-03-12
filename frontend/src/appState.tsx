import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DateFilter, fetchSettings } from './api';

export type DateFieldMode = 'published_at' | 'created_at';

type AppState = {
  dateFieldMode: DateFieldMode;
  setDateFieldMode: (mode: DateFieldMode) => void;

  dateScopeLabel: string;
  dateScopeFilter: DateFilter;
  setDateScope: (label: string, filter: DateFilter) => void;

  applyGlobalFilters: <T extends DateFilter>(filter: T) => T;

  dailyDeadlineHour: number;
  setDailyDeadlineHour: (hour: number) => void;
  reloadSettings: () => Promise<void>;
};

const AppStateContext = createContext<AppState | null>(null);

const STORAGE_KEYS = {
  dateFieldMode: 'insight.dateFieldMode',
  dateScopeLabel: 'insight.dateScopeLabel',
  dateScopeFilter: 'insight.dateScopeFilter',
} as const;

function loadStoredDateFieldMode(): DateFieldMode {
  const raw = (localStorage.getItem(STORAGE_KEYS.dateFieldMode) || '').trim();
  if (raw === 'created_at' || raw === 'published_at') return raw;
  return 'published_at';
}

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

function loadStoredDateScope(): { label: string; filter: DateFilter } {
  const label = (localStorage.getItem(STORAGE_KEYS.dateScopeLabel) || '').trim() || 'Today';
  const rawFilter = (localStorage.getItem(STORAGE_KEYS.dateScopeFilter) || '').trim();
  const filter = rawFilter ? safeParseJson<DateFilter>(rawFilter, {}) : {};
  // default to today if empty
  if (!filter.date && !filter.startDate && !filter.endDate && !filter.allTime) {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return { label: 'Today', filter: { date: `${y}-${m}-${day}` } };
  }
  return { label, filter };
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [dateFieldMode, setDateFieldModeInternal] = useState<DateFieldMode>(() => loadStoredDateFieldMode());
  const storedScope = loadStoredDateScope();
  const [dateScopeLabel, setDateScopeLabel] = useState<string>(storedScope.label);
  const [dateScopeFilter, setDateScopeFilter] = useState<DateFilter>(storedScope.filter);
  const [dailyDeadlineHour, setDailyDeadlineHour] = useState<number>(10);

  const setDateFieldMode = (mode: DateFieldMode) => {
    setDateFieldModeInternal(mode);
    try {
      localStorage.setItem(STORAGE_KEYS.dateFieldMode, mode);
    } catch {
      // ignore storage failures
    }
  };

  const setDateScope = (label: string, filter: DateFilter) => {
    setDateScopeLabel(label);
    setDateScopeFilter(filter);
    try {
      localStorage.setItem(STORAGE_KEYS.dateScopeLabel, label);
      localStorage.setItem(STORAGE_KEYS.dateScopeFilter, JSON.stringify(filter));
    } catch {
      // ignore
    }
  };

  const applyGlobalFilters = <T extends DateFilter>(filter: T): T => {
    // per-page filter takes precedence for date range, but always inject global dateField
    return { ...filter, dateField: dateFieldMode };
  };

  const reloadSettings = async () => {
    const res = await fetchSettings();
    if (typeof res?.daily_deadline_hour === 'number') {
      setDailyDeadlineHour(res.daily_deadline_hour);
    }
  };

  useEffect(() => {
    reloadSettings().catch(() => {
      // ignore initial settings load failure
    });
  }, []);

  const value = useMemo<AppState>(() => ({
    dateFieldMode,
    setDateFieldMode,
    dateScopeLabel,
    dateScopeFilter,
    setDateScope,
    applyGlobalFilters,
    dailyDeadlineHour,
    setDailyDeadlineHour,
    reloadSettings,
  }), [dateFieldMode, dateScopeLabel, dateScopeFilter, dailyDeadlineHour]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
