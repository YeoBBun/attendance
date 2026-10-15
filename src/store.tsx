import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { indexHolidays, today, type HolidayIndex } from './domain/calendar';
import { computeWarnings, type DocContext } from './domain/rules';
import type { AppState, AttendanceRecord } from './domain/types';
import { loadState, requestPersistence, saveState } from './storage/db';

interface Store {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  replace: (s: AppState) => void;
  holidays: HolidayIndex;
  /** 서류 규칙(질병결석 일수·시험 기간)에 쓰는 정보 */
  docContext: DocContext;
  warnings: Map<string, string[]>;
  saveError: string | null;
  /** 기록을 바로 지우고, 잠깐 동안 '되돌리기'를 보여준다. label 은 안내에 쓰는 설명 */
  removeRecord: (id: string, label: string) => void;
}

interface Undo {
  record: AttendanceRecord;
  index: number;
  label: string;
}

const UNDO_MS = 8000;

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loaded = useRef(false);
  const stateRef = useRef<AppState | null>(null);
  stateRef.current = state;
  const [undo, setUndo] = useState<Undo | null>(null);

  const removeRecord = useCallback((id: string, label: string) => {
    const s = stateRef.current;
    const index = s?.records.findIndex((r) => r.id === id) ?? -1;
    if (!s || index < 0) return;
    setState({ ...s, records: s.records.filter((r) => r.id !== id) });
    setUndo({ record: s.records[index], index, label });
  }, []);

  const restore = () => {
    if (!undo) return;
    setState((s) =>
      s && !s.records.some((r) => r.id === undo.record.id)
        ? { ...s, records: [...s.records.slice(0, undo.index), undo.record, ...s.records.slice(undo.index)] }
        : s,
    );
    setUndo(null);
  };

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

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
  const docContext = useMemo(
    () => ({ holidays, exams: state?.settings.examPeriods ?? [] }),
    [holidays, state?.settings.examPeriods],
  );
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
    <StoreContext.Provider value={{ state, update, replace, holidays, docContext, warnings, saveError, removeRecord }}>
      {children}
      {undo && (
        <div className="toast" role="status">
          <span>{undo.label} 삭제했어요</span>
          <button onClick={restore}>되돌리기</button>
        </div>
      )}
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

export const BACKUP_REMIND_DAYS = 7;

/** 기록이 있는데 마지막 백업 후 BACKUP_REMIND_DAYS 일이 지났는가 */
export function useNeedBackup(): boolean {
  const { state } = useStore();
  const last = state.settings.lastBackupAt ? Date.parse(state.settings.lastBackupAt) : 0;
  return state.records.length > 0 && Date.now() - last > BACKUP_REMIND_DAYS * 86_400_000;
}
