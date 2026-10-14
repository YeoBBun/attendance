import { useMemo, useState } from 'react';
import { formatKo, today } from '../domain/calendar';
import { applicationDeadline, DOC_FT_APPLICATION, DOC_FT_REPORT, missingDocs, reportDeadline } from '../domain/rules';
import type { AttendanceRecord, DocItem } from '../domain/types';
import { useStore } from '../store';
import { recordDates, recordTitle } from './common';
import { RecordForm } from './RecordForm';

interface Row {
  record: AttendanceRecord;
  doc: DocItem;
  deadline?: string;
}

/** 아직 받지 않은 필수 서류를 학생별로 모아 본다. */
export function DocsView() {
  const { state, update, holidays } = useStore();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const now = today();

  const groups = useMemo(() => {
    const rows: Row[] = [];
    for (const record of state.records) {
      for (const doc of missingDocs(record)) {
        let deadline: string | undefined;
        if (doc.key === DOC_FT_APPLICATION) deadline = applicationDeadline(record, state.settings, holidays);
        if (doc.key === DOC_FT_REPORT) deadline = reportDeadline(record, state.settings, holidays);
        rows.push({ record, doc, deadline });
      }
    }
    const filtered = overdueOnly ? rows.filter((r) => r.deadline && r.deadline < now) : rows;
    const byStudent = new Map<string, Row[]>();
    for (const r of filtered) {
      const list = byStudent.get(r.record.studentId) ?? [];
      list.push(r);
      byStudent.set(r.record.studentId, list);
    }
    return [...state.students]
      .sort((a, b) => a.number - b.number)
      .map((s) => ({ student: s, rows: (byStudent.get(s.id) ?? []).sort((a, b) => a.record.startDate.localeCompare(b.record.startDate)) }))
      .filter((g) => g.rows.length > 0);
  }, [state.records, state.students, state.settings, holidays, overdueOnly, now]);

  const receive = (recordId: string, key: string) =>
    update((s) => ({
      ...s,
      records: s.records.map((r) =>
        r.id === recordId ? { ...r, docs: r.docs.map((d) => (d.key === key ? { ...d, received: true, receivedDate: now } : d)) } : r,
      ),
    }));

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div>
      <div className="toolbar">
        <strong>미제출 서류 {total}건</strong>
        <label className="check">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          기한 지난 것만 (체험학습 신청서·보고서)
        </label>
      </div>
      {groups.length === 0 ? (
        <p className="empty">받아야 할 서류가 없습니다.</p>
      ) : (
        groups.map((g) => (
          <section key={g.student.id} className="doc-group">
            <h3>
              {g.student.number}. {g.student.name} <span className="muted">{g.rows.length}건</span>
            </h3>
            <ul>
              {g.rows.map(({ record, doc, deadline }) => (
                <li key={record.id + doc.key} className="doc-row">
                  <button className="link" onClick={() => setEditing(record)}>
                    {recordDates(record)} {recordTitle(record)}
                  </button>
                  <span className="doc-name">{doc.label}</span>
                  {deadline && (
                    <span className={deadline < now ? 'due over' : 'due'}>기한 {formatKo(deadline)}</span>
                  )}
                  <span className="spacer" />
                  <button className="small" onClick={() => receive(record.id, doc.key)}>
                    받음
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {editing && <RecordForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
