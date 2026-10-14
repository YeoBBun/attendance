import { useEffect, useState } from 'react';
import { CalendarView } from './components/CalendarView';
import { Dashboard } from './components/Dashboard';
import { RecordList } from './components/RecordList';
import { SettingsView } from './components/SettingsView';
import { Today } from './components/Today';
import { StoreProvider, useStore } from './store';

const TABS = [
  { id: 'today', label: '오늘' },
  { id: 'dashboard', label: '현황판' },
  { id: 'records', label: '출결 기록' },
  { id: 'calendar', label: '달력' },
  { id: 'settings', label: '설정' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const BACKUP_REMIND_DAYS = 7;

function readTab(): TabId {
  const h = location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as TabId) : 'today';
}

function Shell() {
  const { state, saveError } = useStore();
  const [tab, setTab] = useState<TabId>(readTab);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const last = state.settings.lastBackupAt ? Date.parse(state.settings.lastBackupAt) : 0;
  const needBackup = state.records.length > 0 && Date.now() - last > BACKUP_REMIND_DAYS * 86_400_000;

  return (
    <div className="app">
      <header className="top">
        <h1>
          출결·서류 관리{state.settings.className && <span className="class-name"> · {state.settings.className}</span>}
        </h1>
        <nav>
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={tab === t.id ? 'on' : ''}>
              {t.label}
            </a>
          ))}
        </nav>
      </header>
      {saveError && <div className="banner error">{saveError}</div>}
      {needBackup && (
        <div className="banner">
          {last ? `마지막 백업 후 ${BACKUP_REMIND_DAYS}일이 지났습니다.` : '아직 백업한 적이 없습니다.'}{' '}
          <a href="#settings">설정 → 백업</a>에서 백업 파일을 저장하세요.
        </div>
      )}
      <main>
        {tab === 'today' && <Today />}
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'records' && <RecordList />}
        {tab === 'calendar' && <CalendarView />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
