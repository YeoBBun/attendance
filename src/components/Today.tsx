import { useMemo, useState } from 'react';
import { addDays, formatKo, isWeekend, today } from '../domain/calendar';
import {
  applicationDeadline,
  computeWarnings,
  DOC_FT_APPLICATION,
  DOC_FT_REPORT,
  missingDocs,
  rebuildDocs,
  reportDeadline,
} from '../domain/rules';
import {
  APPROVED_REASONS,
  KINDS,
  STATUSES,
  type ApprovedReason,
  type AttendanceRecord,
  type DocItem,
  type Kind,
  type Status,
} from '../domain/types';
import { newId, useStore } from '../store';
import { kindClass, KIND_SHORT, Modal, recordDates, recordTitle, sortStudents, studentLabel } from './common';
import { clean, RecordForm } from './RecordForm';
import { RecordItem } from './RecordItem';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7];
/** 기간·기한 정보가 꼭 필요해서 간편 입력 대신 자세히 입력으로 보내는 사유 */
const NEEDS_DETAIL: ApprovedReason[] = ['체험학습', '법정감염병'];

function bigDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${y}년 ${m}월 ${day}일 ${WEEKDAY[new Date(y, m - 1, day).getDay()]}요일`;
}

export function Today() {
  const { state, holidays, warnings } = useStore();
  const [date, setDate] = useState(today);
  const [entryFor, setEntryFor] = useState<string | null>(null);
  const now = today();
  const students = sortStudents(state.students);
  const holiday = holidays.get(date);

  const todays = useMemo(() => {
    const map = new Map<string, AttendanceRecord[]>();
    for (const r of state.records) {
      if (r.startDate <= date && date <= r.endDate) {
        const list = map.get(r.studentId) ?? [];
        list.push(r);
        map.set(r.studentId, list);
      }
    }
    return map;
  }, [state.records, date]);

  const warningCount = useMemo(() => [...warnings.values()].reduce((n, w) => n + w.length, 0), [warnings]);

  return (
    <div className="today">
      <header className="today-head">
        <button className="ghost" onClick={() => setDate(addDays(date, -1))} aria-label="전날">
          ◀
        </button>
        <div>
          <h2>{bigDate(date)}</h2>
          {holiday ? (
            <p className="muted">{holiday.name} · 쉬는 날</p>
          ) : isWeekend(date) ? (
            <p className="muted">주말</p>
          ) : (
            date !== now && <p className="muted">오늘이 아닌 날짜를 보고 있어요</p>
          )}
        </div>
        <button className="ghost" onClick={() => setDate(addDays(date, 1))} aria-label="다음날">
          ▶
        </button>
        {date !== now && (
          <button className="small" onClick={() => setDate(now)}>
            오늘로
          </button>
        )}
      </header>

      {students.length === 0 ? (
        <p className="empty">
          먼저 <a href="#settings">설정</a>에서 학생 명단을 등록하세요.
        </p>
      ) : (
        <section className="card">
          <h3>
            출결 입력 <span className="muted">학생을 누르세요 · {todays.size ? `${todays.size}명 기록됨` : '모두 출석'}</span>
          </h3>
          <div className="student-grid">
            {students.map((s) => {
              const recs = todays.get(s.id) ?? [];
              return (
                <button key={s.id} className={`student-btn${recs.length ? ' has' : ''}`} onClick={() => setEntryFor(s.id)}>
                  <span className="num">{s.number}</span>
                  <span className="nm">{s.name}</span>
                  {recs.map((r) => (
                    <span key={r.id} className={`tag ${kindClass(r.kind)}`}>
                      {r.kind === '출석인정' && r.reason ? r.reason : KIND_SHORT[r.kind]} {r.status}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <PendingDocs />

      {warningCount > 0 && (
        <p className="banner">
          ⚠ 규칙 확인이 필요한 기록이 {warningCount}건 있어요. <a href="#records">기록 탭</a>에서 "경고"를 눌러 확인하세요.
        </p>
      )}

      {entryFor && <QuickEntry studentId={entryFor} date={date} onClose={() => setEntryFor(null)} />}
    </div>
  );
}

/** 학생 한 명의 그날 출결을 몇 번의 터치로 입력한다. */
function QuickEntry({ studentId, date, onClose }: { studentId: string; date: string; onClose: () => void }) {
  const { state, update, holidays } = useStore();
  const [status, setStatus] = useState<Status | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [reason, setReason] = useState<ApprovedReason | null>(null);
  const [periods, setPeriods] = useState<number[]>([]);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [detail, setDetail] = useState(false);
  const student = state.students.find((s) => s.id === studentId);
  const existing = state.records.filter((r) => r.studentId === studentId && r.startDate <= date && date <= r.endDate);

  const ready = status && kind && (kind !== '출석인정' || reason);
  const needsDetail = kind === '출석인정' && reason && NEEDS_DETAIL.includes(reason);

  const draft = useMemo<AttendanceRecord | null>(() => {
    if (!ready) return null;
    const r = reason ?? undefined;
    return clean({
      id: newId(),
      studentId,
      status: status!,
      kind: kind!,
      reason: r,
      startDate: date,
      endDate: date,
      periods: status === '결과' ? periods : undefined,
      docs: rebuildDocs([], status!, kind!, kind === '출석인정' ? r : undefined),
      memo: '',
    });
  }, [ready, status, kind, reason, periods, studentId, date]);

  const preview = useMemo(
    () =>
      draft
        ? computeWarnings({ records: [...state.records, draft], holidays, settings: state.settings, today: today() }).get(draft.id) ?? []
        : [],
    [draft, state.records, state.settings, holidays],
  );

  const save = () => {
    if (!draft) return;
    update((s) => ({ ...s, records: [...s.records, draft] }));
    onClose();
  };

  if (detail) {
    return (
      <RecordForm
        defaultStudentId={studentId}
        defaultDate={date}
        prefill={{ status: status ?? undefined, kind: kind ?? undefined, reason: reason ?? undefined }}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal title={`${studentLabel(student)} · ${formatKo(date)}`} onClose={onClose}>
      {existing.length > 0 && (
        <section className="quick-existing">
          <ul className="records">
            {existing.map((r) => (
              <RecordItem key={r.id} record={r} onEdit={() => setEditing(r)} />
            ))}
          </ul>
          <p className="hint">기록을 누르면 고치거나 지울 수 있어요. 아래에서 기록을 더 추가할 수 있어요.</p>
        </section>
      )}

      <div className="quick">
        <Choice label="상황" options={STATUSES} value={status} onChange={setStatus} />
        <Choice
          label="종류"
          options={KINDS}
          value={kind}
          onChange={(k) => {
            setKind(k);
            if (k !== '출석인정') setReason(null);
          }}
        />
        {kind === '출석인정' && <Choice label="사유" options={APPROVED_REASONS} value={reason} onChange={setReason} />}
        {status === '결과' && (
          <div>
            <span className="field-label">교시</span>
            <div className="big-seg">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  className={periods.includes(p) ? 'on' : ''}
                  onClick={() => setPeriods((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p].sort()))}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {draft && !needsDetail && draft.docs.some((d) => d.required) && (
          <p className="info">받을 서류: {draft.docs.filter((d) => d.required).map((d) => d.label).join(', ')}</p>
        )}
        {needsDetail && <p className="info">{reason}은 기간과 서류 정보를 함께 입력해야 해요. "자세히 입력"을 눌러 주세요.</p>}
        {!needsDetail && preview.length > 0 && (
          <ul className="warnings">
            {preview.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}

        <footer className="form-actions">
          <button onClick={() => setDetail(true)}>자세히 입력 (여러 날·메모 등)</button>
          <span className="spacer" />
          <button className="primary big" disabled={!ready || !!needsDetail} onClick={save}>
            저장
          </button>
        </footer>
      </div>

      {editing && <RecordForm initial={editing} onClose={() => setEditing(null)} />}
    </Modal>
  );
}

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="big-seg">
        {options.map((o) => (
          <button key={o} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

interface PendingRow {
  record: AttendanceRecord;
  doc: DocItem;
  deadline?: string;
}

/** 아직 받지 않은 필수 서류. 기한 지난 것을 위로. */
function PendingDocs() {
  const { state, update, holidays } = useStore();
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const now = today();

  const rows = useMemo(() => {
    const out: PendingRow[] = [];
    for (const record of state.records) {
      for (const doc of missingDocs(record)) {
        // 체험학습 보고서는 체험학습이 끝난 뒤부터 받을 서류로 보여준다.
        if (doc.key === DOC_FT_REPORT && now <= record.endDate) continue;
        let deadline: string | undefined;
        if (doc.key === DOC_FT_APPLICATION) deadline = applicationDeadline(record, state.settings, holidays);
        if (doc.key === DOC_FT_REPORT) deadline = reportDeadline(record, state.settings, holidays);
        out.push({ record, doc, deadline });
      }
    }
    const overdue = (r: PendingRow) => (r.deadline && r.deadline < now ? 0 : 1);
    return out.sort((a, b) => overdue(a) - overdue(b) || a.record.startDate.localeCompare(b.record.startDate));
  }, [state.records, state.settings, holidays, now]);

  const receive = (recordId: string, key: string) =>
    update((s) => ({
      ...s,
      records: s.records.map((r) =>
        r.id === recordId ? { ...r, docs: r.docs.map((d) => (d.key === key ? { ...d, received: true, receivedDate: now } : d)) } : r,
      ),
    }));

  const nameOf = (id: string) => {
    const s = state.students.find((x) => x.id === id);
    return s ? `${s.number}. ${s.name}` : '?';
  };

  return (
    <section className="card">
      <h3>
        받아야 할 서류 <span className="muted">{rows.length ? `${rows.length}건` : ''}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="muted">모두 받았어요 👍</p>
      ) : (
        <ul className="pending">
          {rows.map(({ record, doc, deadline }) => (
            <li key={record.id + doc.key} className={deadline && deadline < now ? 'over' : ''}>
              <button className="link who" onClick={() => setEditing(record)}>
                {nameOf(record.studentId)}
              </button>
              <span className="what">
                <b>{doc.label}</b>
                <span className="muted">
                  {' '}
                  · {recordDates(record)} {recordTitle(record)}
                  {deadline && ` · 기한 ${formatKo(deadline)}`}
                </span>
              </span>
              <button className="primary small" onClick={() => receive(record.id, doc.key)}>
                받음
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <RecordForm initial={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
