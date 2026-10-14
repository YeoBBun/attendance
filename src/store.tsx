import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { indexHolidays, today, type HolidayIndex } from './domain/calendar';
import { computeWarnings } from './domain/rules';
import type { AppState } from './domain/types';
import { loadState, requestPersistence, saveState } from './storage/db';

interface Store {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  replace: (s: AppState) => void;
  holidays: HolidayIndex;
  warnings: Map<string, string[]>;
  saveError: string | null;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    loadState()
      .then((s) => {
        loaded.current = true;
        setState(s);
      })
      .catch((e) => setLoadError(String(e)));
    void requestPersistence();
  }, []);

  useEffect(() => {
    if (!state || !loaded.current) return;
    saveState(state)
      .then(() => setSaveError(null))
      .catch((e) => setSaveError(`저장 실패: ${e}`));
  }, [state]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => (s ? fn(s) : s)), []);
  const replace = useCallback((s: AppState) => setState(s), []);

  const holidays = useMemo(() => indexHolidays(state?.holidays ?? []), [state?.holidays]);
  const warnings = useMemo(
    () =>
      state
        ? computeWarnings({ records: state.records, holidays, settings: state.settings, today: today() })
        : new Map<string, string[]>(),
    [state, holidays],
  );

  if (loadError) return <div className="fatal">데이터를 불러오지 못했습니다: {loadError}</div>;
  if (!state) return <div className="fatal">불러오는 중…</div>;

  return (
    <StoreContext.Provider value={{ state, update, replace, holidays, warnings, saveError }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreProvider 밖에서 사용됨');
  return s;
}

export function newId(): string {
  // randomUUID 는 https/localhost 에서만 있으므로 대체 경로를 둔다.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
