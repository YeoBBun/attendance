import { useMemo, useState } from 'react';
import { monthKey, today } from '../domain/calendar';
import { missingDocs } from '../domain/rules';
import type { AttendanceRecord } from '../domain/types';
import { useStore } from '../store';
import { CalendarView } from './CalendarView';
import { sortStudents } from './common';
import { Icon } from './icons';
import { NeisExport } from './NeisExport';
import { RecordForm } from './RecordForm';
import { RecordItem } from './RecordItem';

type Filter = 'all' | 'missing' | 'warning';

type View = 'list' | 'calendar';

export function RecordList({ initialView = 'list' }: { initialView?: View }) {
  const { state, warnings } = useStore();
  const [view, setView] = useState<View>(initialView);
  const [studentId, setStudentId] = useState('');
  const [month, setMonth] = useState(() => monthKey(today()));
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<AttendanceRecord | 'new' | null>(null);
  const [neis, setNeis] = useState(false);

  const records = useMemo(
    () =>
      state.records
        .filter((r) => !studentId || r.studentId === studentId)
        .filter((r) => !month || monthKey(r.startDate) <= month && monthKey(r.endDate) >= month)
        .filter((r) => filter === 'all' || (filter === 'missing' ? missingDocs(r).length > 0 : warnings.has(r.id)))
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [state.records, studentId, month, filter, warnings],
  );

  return (
    <div className="records-page">
      <div className="page-head">
        <div className="seg" role="tablist" aria-label="보기">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
            <Icon name="list" size={16} /> 목록
          </button>
          <button className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>
            <Icon name="today" size={16} /> 달력
          </button>
        </div>
        <span className="spacer" />
        <button onClick={() => setNeis(true)}>
          <Icon name="upload" size={16} /> 나이스 파일
        </button>
        <button className="primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> 출결 추가
        </button>
      </div>

      {view === 'calendar' ? (
        <CalendarView />
      ) : (
        <>
          <div className="toolbar filters">
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">전체 학생</option>
              {sortStudents(state.students).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number}. {s.name}
                </option>
              ))}
            </select>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <button className={month ? 'ghost' : 'on'} onClick={() => setMonth('')}>
              전체 기간
            </button>
            <div className="seg">
              <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
                전체
              </button>
              <button className={filter === 'missing' ? 'on' : ''} onClick={() => setFilter('missing')}>
                서류 누락
              </button>
              <button className={filter === 'warning' ? 'on' : ''} onClick={() => setFilter('warning')}>
                경고
              </button>
            </div>
            <span className="spacer" />
            <span className="muted">{records.length}건</span>
          </div>

          {records.length === 0 ? (
            <p className="empty">조건에 맞는 기록이 없어요.</p>
          ) : (
            <ul className="records">
              {records.map((r) => (
                <RecordItem key={r.id} record={r} showStudent onEdit={() => setEditing(r)} />
              ))}
            </ul>
          )}
        </>
      )}

      {neis && <NeisExport onClose={() => setNeis(false)} />}
      {editing && (
        <RecordForm
          initial={editing === 'new' ? undefined : editing}
          defaultStudentId={studentId || undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
