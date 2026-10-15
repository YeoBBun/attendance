import { today } from '../domain/calendar';
import type { AttendanceRecord } from '../domain/types';
import { useStore } from '../store';
import { kindClass, recordDates, recordTitle, studentLabel } from './common';

/** 기록 한 줄: 날짜·학생·상황, 서류 체크 칩, 경고 */
export function RecordItem({ record, showStudent, onEdit }: { record: AttendanceRecord; showStudent?: boolean; onEdit: () => void }) {
  const { state, update, warnings, removeRecord } = useStore();
  const student = state.students.find((s) => s.id === record.studentId);
  const warns = warnings.get(record.id) ?? [];

  const toggleDoc = (key: string) =>
    update((s) => ({
      ...s,
      records: s.records.map((r) =>
        r.id !== record.id
          ? r
          : {
              ...r,
              docs: r.docs.map((d) =>
                d.key === key ? { ...d, received: !d.received, receivedDate: d.received ? undefined : today() } : d,
              ),
            },
      ),
    }));

  return (
    <li className="record">
      <div className="record-head">
        <button className="record-main" onClick={onEdit} title="눌러서 고치기">
          <span className="date">{recordDates(record)}</span>
          {showStudent && <span className="who">{studentLabel(student)}</span>}
          <span className={`tag ${kindClass(record.kind)}`}>{recordTitle(record)}</span>
          {record.memo && <span className="memo">{record.memo}</span>}
        </button>
        <button
          className="del-btn"
          onClick={() => removeRecord(record.id, `${student?.name ?? ''} ${recordDates(record)} ${recordTitle(record)}`)}
          aria-label="삭제"
        >
          삭제
        </button>
      </div>
      {record.docs.length > 0 && (
        <div className="doc-chips">
          {record.docs.map((d) => (
            <button
              key={d.key}
              className={`doc-chip${d.received ? ' got' : d.required ? ' need' : ''}`}
              onClick={() => toggleDoc(d.key)}
              title={d.received ? `받음 ${d.receivedDate ?? ''} (누르면 취소)` : '누르면 받음 처리'}
            >
              {d.received ? '✓' : d.required ? '○' : '·'} {d.label}
            </button>
          ))}
        </div>
      )}
      {warns.length > 0 && (
        <ul className="warnings compact">
          {warns.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
