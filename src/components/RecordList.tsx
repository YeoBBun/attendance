import { useMemo, useState } from 'react';
import { monthKey, today } from '../domain/calendar';
import { missingDocs } from '../domain/rules';
import type { AttendanceRecord } from '../domain/types';
import { useStore } from '../store';
import { sortStudents } from './common';
import { RecordForm } from './RecordForm';
import { RecordItem } from './RecordItem';

type Filter = 'all' | 'missing' | 'warning';

export function RecordList() {
  const { state, warnings } = useStore();
  const [studentId, setStudentId] = useState('');
  const [month, setMonth] = useState(() => monthKey(today()));
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<AttendanceRecord | 'new' | null>(null);

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
    <div>
      <div className="toolbar">
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">전체 학생</option>
          {sortStudents(state.students).map((s) => (
            <option key={s.id} value={s.id}>
              {s.number}. {s.name}
            </option>
          ))}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className={month ? '' : 'on'} onClick={() => setMonth('')}>
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
        <button className="primary" onClick={() => setEditing('new')}>
          + 출결 추가
        </button>
      </div>

      {records.length === 0 ? (
        <p className="empty">기록이 없습니다.</p>
      ) : (
        <ul className="records">
          {records.map((r) => (
            <RecordItem key={r.id} record={r} showStudent onEdit={() => setEditing(r)} />
          ))}
        </ul>
      )}

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
