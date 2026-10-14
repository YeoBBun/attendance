import { useMemo, useState } from 'react';
import { addDays, schoolYearOf, schoolYearRange, today } from '../domain/calendar';
import { summarize, type StudentSummary } from '../domain/stats';
import { KINDS, STATUSES } from '../domain/types';
import { downloadBlob } from '../storage/db';
import { useStore } from '../store';
import { KIND_SHORT, Modal, sortStudents } from './common';
import { RecordForm } from './RecordForm';
import { RecordItem } from './RecordItem';
import type { AttendanceRecord } from '../domain/types';

const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];

export function Dashboard() {
  const { state, holidays, warnings } = useStore();
  const [year, setYear] = useState(() => schoolYearOf(today()));
  const [month, setMonth] = useState<number | 'all'>('all');
  const [detail, setDetail] = useState<string | null>(null);

  const [from, to] = useMemo(() => {
    if (month === 'all') return schoolYearRange(year);
    const y = month >= 3 ? year : year + 1;
    const start = `${y}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? `${y + 1}-01-01` : `${y}-${String(month + 1).padStart(2, '0')}-01`;
    return [start, addDays(nextMonth, -1)];
  }, [year, month]);

  const rows = useMemo(
    () => summarize(sortStudents(state.students), state.records, holidays, warnings, from, to, today()),
    [state.students, state.records, holidays, warnings, from, to],
  );

  const years = useMemo(() => {
    const set = new Set([schoolYearOf(today()), ...state.records.map((r) => schoolYearOf(r.startDate))]);
    return [...set].sort((a, b) => b - a);
  }, [state.records]);

  if (state.students.length === 0) {
    return <p className="empty">설정 탭에서 학생 명단을 먼저 등록하세요.</p>;
  }

  return (
    <div>
      <div className="toolbar">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}학년도
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
          <option value="all">학년도 전체</option>
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {m}월
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button onClick={() => exportCsv(rows, `${year}${month === 'all' ? '' : `_${String(month).padStart(2, '0')}`}`)}>엑셀(CSV) 내보내기</button>
      </div>

      <div className="table-wrap">
        <table className="summary">
          <thead>
            <tr>
              <th rowSpan={2}>번호</th>
              <th rowSpan={2}>이름</th>
              {STATUSES.map((s) => (
                <th key={s} colSpan={4} className="group">
                  {s}
                  {s === '결석' ? '(일)' : '(회)'}
                </th>
              ))}
              <th rowSpan={2} title="질병+미인정+기타 결석일수">
                총결석
              </th>
              <th rowSpan={2}>출석인정</th>
              <th rowSpan={2} title="학년도 누적">
                체험학습
              </th>
              <th rowSpan={2}>누락서류</th>
              <th rowSpan={2}>경고</th>
            </tr>
            <tr>
              {STATUSES.map((s) =>
                KINDS.map((k) => (
                  <th key={s + k} className={k === '기타' ? 'sub group-end' : 'sub'}>
                    {KIND_SHORT[k]}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student.id} onClick={() => setDetail(r.student.id)} className="clickable">
                <td>{r.student.number}</td>
                <td className="name">{r.student.name}</td>
                {STATUSES.map((s) =>
                  KINDS.map((k) => (
                    <td key={s + k} className={`num${k === '기타' ? ' group-end' : ''}`}>
                      {r.counts[s][k] || ''}
                    </td>
                  )),
                )}
                <td className="num strong">{r.absenceDays || ''}</td>
                <td className="num">{r.approvedAbsenceDays || ''}</td>
                <td
                  className={`num${r.fieldTripDays + r.fieldTripPlanned > state.settings.fieldTripYearlyMax ? ' bad' : ''}`}
                  title="사용(+예정)/연간 한도"
                >
                  {r.fieldTripDays || r.fieldTripPlanned
                    ? `${r.fieldTripDays}${r.fieldTripPlanned ? `+${r.fieldTripPlanned}` : ''}/${state.settings.fieldTripYearlyMax}`
                    : ''}
                </td>
                <td className={`num${r.missingDocCount ? ' bad' : ''}`}>{r.missingDocCount || ''}</td>
                <td className={`num${r.warningCount ? ' warn' : ''}`}>{r.warningCount || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        총결석 = 질병·미인정·기타 결석일수 (출석인정 제외). 결석일수는 주말·공휴일·재량휴업일을 뺀 수업일 기준입니다. 체험학습은 학년도
        누적이고, "5+3"은 사용 5일·예정 3일입니다. 출결 통계는 오늘까지만 셉니다.
      </p>

      {detail && <StudentDetail studentId={detail} from={from} to={to} onClose={() => setDetail(null)} />}
    </div>
  );
}

function StudentDetail({ studentId, from, to, onClose }: { studentId: string; from: string; to: string; onClose: () => void }) {
  const { state } = useStore();
  const [editing, setEditing] = useState<AttendanceRecord | 'new' | null>(null);
  const student = state.students.find((s) => s.id === studentId);
  const records = state.records
    .filter((r) => r.studentId === studentId && r.endDate >= from && r.startDate <= to)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <Modal title={student ? `${student.number}. ${student.name}` : '학생'} onClose={onClose} wide>
      <div className="toolbar">
        <span className="muted">
          {from} ~ {to} · {records.length}건
        </span>
        <span className="spacer" />
        <button className="primary" onClick={() => setEditing('new')}>
          + 기록 추가
        </button>
      </div>
      {records.length === 0 ? (
        <p className="empty">기록이 없습니다.</p>
      ) : (
        <ul className="records">
          {records.map((r) => (
            <RecordItem key={r.id} record={r} onEdit={() => setEditing(r)} />
          ))}
        </ul>
      )}
      {editing && (
        <RecordForm
          initial={editing === 'new' ? undefined : editing}
          defaultStudentId={studentId}
          onClose={() => setEditing(null)}
        />
      )}
    </Modal>
  );
}

function exportCsv(rows: StudentSummary[], label: string) {
  const header = [
    '번호',
    '이름',
    ...STATUSES.flatMap((s) => KINDS.map((k) => `${s}_${k}`)),
    '총결석일수',
    '출석인정결석일수',
    '체험학습사용일수',
    '체험학습예정일수',
    '체험학습국내(사용)',
    '체험학습국외(사용)',
    '누락서류',
    '경고',
  ];
  const lines = rows.map((r) => [
    r.student.number,
    r.student.name,
    ...STATUSES.flatMap((s) => KINDS.map((k) => r.counts[s][k])),
    r.absenceDays,
    r.approvedAbsenceDays,
    r.fieldTripDays,
    r.fieldTripPlanned,
    r.fieldTripByPlace.국내.used,
    r.fieldTripByPlace.국외.used,
    r.missingDocCount,
    r.warningCount,
  ]);
  const csv = [header, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  // BOM 을 붙여야 엑셀에서 한글이 깨지지 않는다.
  downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `attendance_summary_${label}.csv`);
}
