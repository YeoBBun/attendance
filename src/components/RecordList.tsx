import { useMemo, useState } from 'react';
import { addDays, monthKey, schoolYearOf, schoolYearRange, today } from '../domain/calendar';
import { missingDocs } from '../domain/rules';
import { summarize, type StudentSummary } from '../domain/stats';
import { KINDS, STATUSES, type AttendanceRecord } from '../domain/types';
import { useStore } from '../store';
import { KIND_SHORT, sortStudents } from './common';
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

      <MonthOverview month={month} studentId={studentId} />
      <TripTotals studentId={studentId} />

      <h3 className="section-title">기록 목록</h3>
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

function monthRange(month: string): [string, string] {
  if (!month) return schoolYearRange(schoolYearOf(today()));
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return [`${month}-01`, addDays(next, -1)];
}

/** 예: "결석 2일(질병 2) · 지각 1회(미인정 1)" */
function describeCounts(s: StudentSummary): string {
  return STATUSES.flatMap((st) => {
    const total = KINDS.reduce((n, k) => n + s.counts[st][k], 0);
    if (!total) return [];
    const detail = KINDS.filter((k) => s.counts[st][k]).map((k) => `${KIND_SHORT[k]} ${s.counts[st][k]}`).join(', ');
    return [`${st} ${total}${st === '결석' ? '일' : '회'}(${detail})`];
  }).join(' · ');
}

/** 월별 출결 현황: 그달 결석·지각·조퇴·결과가 있었던 학생만 보여준다. */
function MonthOverview({ month, studentId }: { month: string; studentId: string }) {
  const { state, holidays, warnings } = useStore();
  const [from, to] = monthRange(month);
  const rows = useMemo(() => {
    const students = sortStudents(state.students).filter((s) => !studentId || s.id === studentId);
    return summarize(students, state.records, holidays, warnings, from, to, today());
  }, [state.students, state.records, holidays, warnings, from, to, studentId]);
  const active = rows.filter((r) => describeCounts(r));
  const totals = STATUSES.map((st) => {
    const n = rows.reduce((sum, r) => sum + KINDS.reduce((m, k) => m + r.counts[st][k], 0), 0);
    return n ? `${st} ${n}${st === '결석' ? '일' : '회'}` : '';
  }).filter(Boolean);

  return (
    <section className="card overview">
      <h3>
        {month ? `${Number(month.slice(5))}월` : `${schoolYearOf(today())}학년도`} 출결 현황
        <span className="muted">{totals.join(' · ')}</span>
      </h3>
      {active.length === 0 ? (
        <p className="muted">결석·지각·조퇴·결과가 없어요.</p>
      ) : (
        <ul className="overview-list">
          {active.map((r) => (
            <li key={r.student.id}>
              <span className="who">
                {r.student.number}. {r.student.name}
              </span>
              <span>{describeCounts(r)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 체험학습 누계 (학년도): 국내·국외별 사용 일수와 예정 일수 */
function TripTotals({ studentId }: { studentId: string }) {
  const { state, holidays, warnings } = useStore();
  const year = schoolYearOf(today());
  const [from, to] = schoolYearRange(year);
  const max = state.settings.fieldTripYearlyMax;
  const rows = useMemo(() => {
    const students = sortStudents(state.students).filter((s) => !studentId || s.id === studentId);
    return summarize(students, state.records, holidays, warnings, from, to, today()).filter(
      (r) => r.fieldTripDays + r.fieldTripPlanned > 0,
    );
  }, [state.students, state.records, holidays, warnings, from, to, studentId]);

  const place = (label: '국내' | '국외', r: StudentSummary) => {
    const p = r.fieldTripByPlace[label];
    if (!p.used && !p.planned) return null;
    return `${label} ${p.used}일${p.planned ? `(+예정 ${p.planned})` : ''}`;
  };

  return (
    <section className="card overview">
      <h3>
        체험학습 누계 <span className="muted">{year}학년도 · 연간 {max}일</span>
      </h3>
      {rows.length === 0 ? (
        <p className="muted">체험학습 기록이 없어요.</p>
      ) : (
        <ul className="overview-list">
          {rows.map((r) => {
            const total = r.fieldTripDays + r.fieldTripPlanned;
            return (
              <li key={r.student.id} className={total > max ? 'over' : ''}>
                <span className="who">
                  {r.student.number}. {r.student.name}
                </span>
                <span>{[place('국내', r), place('국외', r)].filter(Boolean).join(' · ')}</span>
                <b className="total">
                  {total}/{max}일 · 남은 {max - total}일
                </b>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
