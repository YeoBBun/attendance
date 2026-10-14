import { DOC_MEDICAL } from '../domain/rules';
import { DEFAULT_SETTINGS, emptyState, type AppState } from '../domain/types';

// 모든 데이터는 이 브라우저의 IndexedDB 에만 저장한다. 외부 서버로 보내지 않는다.
const DB_NAME = 'attendance-app';
const STORE = 'kv';
const KEY = 'state';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadState(): Promise<AppState> {
  const db = await openDb();
  const raw = await new Promise<unknown>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return raw ? normalize(raw) : emptyState();
}

export async function saveState(state: AppState): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(state, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** 브라우저가 저장공간 부족 시 데이터를 임의로 지우지 않도록 요청한다. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

/** 백업 파일이나 이전 버전 데이터를 현재 형식으로 맞춘다. */
export function normalize(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') throw new Error('올바른 백업 파일이 아닙니다.');
  // 이전 버전 파일도 받으므로 version 은 숫자로 넓혀 읽는다.
  const s = raw as Partial<Omit<AppState, 'version'>> & { version?: number };
  if ((s.version !== 1 && s.version !== 2) || !Array.isArray(s.students) || !Array.isArray(s.records) || !Array.isArray(s.holidays)) {
    throw new Error('올바른 백업 파일이 아닙니다.');
  }
  let records = s.records;
  if (s.version === 1) {
    // v1 에서는 질병 결석의 증빙이 '선택'이었다. 지금 규정(필수)에 맞춘다.
    records = records.map((r) =>
      r.kind === '질병' && r.status === '결석'
        ? { ...r, docs: r.docs.map((d) => (d.key === DOC_MEDICAL ? { ...d, required: true } : d)) }
        : r,
    );
  }
  return {
    version: 2,
    students: s.students,
    records,
    holidays: s.holidays,
    settings: { ...DEFAULT_SETTINGS, ...s.settings },
  };
}

export function exportBackup(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  // 파일 이름은 영문으로 (한글 이름을 무시하는 브라우저가 있다)
  downloadBlob(blob, `attendance_backup_${stamp}.json`);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // 문서에 붙여서 눌러야 일부 브라우저가 파일 이름을 지킨다. URL 은 다운로드가 시작된 뒤에 해제한다.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
