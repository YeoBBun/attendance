import { useMemo, useState } from 'react';
import { formatKo, today } from '../domain/calendar';
import {
  applicationDeadline,
  computeWarnings,
  fieldTripCumulative,
  fieldTripDays,
  isCustomDoc,
  rebuildDocs,
  reportDeadline,
} from '../domain/rules';
import { APPROVED_REASONS, KINDS, STATUSES, type AttendanceRecord, type DocItem } from '../domain/types';
import { newId, useStore } from '../store';
import { Modal, sortStudents } from './common';

const PERIODS = [1, 2, 3, 4, 5, 6, 7];

function blankRecord(studentId: string, date: string): AttendanceRecord {
  return {
    id: newId(),
    studentId,
    status: '결석',
    kind: '질병',
    startDate: date,
    endDate: date,
    docs: rebuildDocs([], '결석', '질병'),
    memo: '',
  };
}

/** 저장 전에 상황·종류에 맞지 않는 필드를 정리한다. */
function clean(r: AttendanceRecord): AttendanceRecord {
  const out: AttendanceRecord = { ...r };
  if (out.status !== '결석') out.endDate = out.startDate;
  if (out.status !== '결과') delete out.periods;
  if (out.kind !== '출석인정') delete out.reason;
  if (out.reason !== '법정감염병') delete out.illness;
  if (out.reason !== '체험학습') delete out.fieldTrip;
  return out;
}

export function RecordForm({
  initial,
  defaultDate,
  defaultStudentId,
  onClose,
}: {
  initial?: AttendanceRecord;
  defaultDate?: string;
  defaultStudentId?: string;
  onClose: () => void;
}) {
  const { state, update, holidays } = useStore();
  const students = sortStudents(state.students);
  const isNew = !initial;
  const [draft, setDraft] = useState<AttendanceRecord>(
    () => initial ?? blankRecord(defaultStudentId ?? '', defaultDate ?? today()),
  );
  // 새 기록은 여러 학생에게 한 번에 넣을 수 있다 (예: 공문 대회 참가).
  const [selected, setSelected] = useState<string[]>(defaultStudentId ? [defaultStudentId] : []);
  const [customDoc, setCustomDoc] = useState('');
  const [error, setError] = useState('');

  const set = (patch: Partial<AttendanceRecord>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (patch.status || patch.kind || 'reason' in patch) {
        next.docs = rebuildDocs(d.docs, next.status, next.kind, next.kind === '출석인정' ? next.reason : undefined);
      }
      if (next.status !== '결석') next.endDate = next.startDate;
      if (next.endDate < next.startDate) next.endDate = next.startDate;
      return next;
    });
  };

  const setDoc = (key: string, patch: Partial<DocItem>) =>
    setDraft((d) => ({ ...d, docs: d.docs.map((doc) => (doc.key === key ? { ...doc, ...patch } : doc)) }));

  // 미리보기용: 첫 번째 선택 학생 기준으로 경고·누적 일수를 계산
  const previewStudent = isNew ? selected[0] : draft.studentId;
  const preview = useMemo(() => {
    if (!previewStudent) return null;
    const rec = clean({ ...draft, studentId: previewStudent });
    const records = [...state.records.filter((r) => r.id !== rec.id), rec];
    const warnings = computeWarnings({ records, holidays, settings: state.settings, today: today() }).get(rec.id) ?? [];
    return { rec, warnings, cumulative: fieldTripCumulative(records, holidays).get(rec.id) ?? 0 };
  }, [draft, previewStudent, state.records, state.settings, holidays]);

  const save = () => {
    const ids = isNew ? selected : [draft.studentId];
    if (ids.length === 0 || !ids[0]) return setError('학생을 선택하세요.');
    if (draft.kind === '출석인정' && !draft.reason) return setError('출석인정 세부 사유를 선택하세요.');
    const cleaned = clean(draft);
    update((s) => {
      if (!isNew) return { ...s, records: s.records.map((r) => (r.id === cleaned.id ? cleaned : r)) };
      const created = ids.map((studentId, i) => ({ ...cleaned, id: i === 0 ? cleaned.id : newId(), studentId }));
      return { ...s, records: [...s.records, ...created] };
    });
    onClose();
  };

  const remove = () => {
    if (!initial || !confirm('이 기록을 삭제할까요?')) return;
    update((s) => ({ ...s, records: s.records.filter((r) => r.id !== initial.id) }));
    onClose();
  };

  const isTrip = draft.kind === '출석인정' && draft.reason === '체험학습';

  return (
    <Modal title={isNew ? '출결 기록 추가' : '출결 기록 수정'} onClose={onClose} wide>
      <div className="form">
        <section>
          <label className="field-label">학생{isNew && ' (여러 명 선택 가능)'}</label>
          {isNew ? (
            <div className="chips">
              {students.length === 0 && <p className="muted">설정에서 학생 명단을 먼저 등록하세요.</p>}
              {students.map((s) => {
                const on = selected.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`chip${on ? ' on' : ''}`}
                    onClick={() => setSelected((sel) => (on ? sel.filter((x) => x !== s.id) : [...sel, s.id]))}
                  >
                    {s.number} {s.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <select value={draft.studentId} onChange={(e) => set({ studentId: e.target.value })}>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number}. {s.name}
                </option>
              ))}
            </select>
          )}
        </section>

        <section className="row">
          <div>
            <label className="field-label">출결 상황</label>
            <div className="seg">
              {STATUSES.map((st) => (
                <button key={st} type="button" className={draft.status === st ? 'on' : ''} onClick={() => set({ status: st })}>
                  {st}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">종류</label>
            <div className="seg">
              {KINDS.map((k) => (
                <button key={k} type="button" className={draft.kind === k ? 'on' : ''} onClick={() => set({ kind: k })}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        </section>

        {draft.kind === '출석인정' && (
          <section>
            <label className="field-label">출석인정 사유</label>
            <div className="seg">
              {APPROVED_REASONS.map((r) => (
                <button key={r} type="button" className={draft.reason === r ? 'on' : ''} onClick={() => set({ reason: r })}>
                  {r}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="row">
          <div>
            <label className="field-label">{draft.status === '결석' ? '시작일' : '날짜'}</label>
            <input type="date" value={draft.startDate} onChange={(e) => e.target.value && set({ startDate: e.target.value })} />
          </div>
          {draft.status === '결석' && (
            <div>
              <label className="field-label">종료일</label>
              <input
                type="date"
                value={draft.endDate}
                min={draft.startDate}
                onChange={(e) => e.target.value && set({ endDate: e.target.value })}
              />
            </div>
          )}
          {draft.status === '결과' && (
            <div>
              <label className="field-label">교시</label>
              <div className="seg">
                {PERIODS.map((p) => {
                  const on = draft.periods?.includes(p) ?? false;
                  return (
                    <button
                      key={p}
                      type="button"
                      className={on ? 'on' : ''}
                      onClick={() => {
                        const cur = draft.periods ?? [];
                        set({ periods: (on ? cur.filter((x) => x !== p) : [...cur, p]).sort((a, b) => a - b) });
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {draft.kind === '출석인정' && draft.reason === '법정감염병' && (
          <section className="row">
            <div>
              <label className="field-label">질병명</label>
              <input
                value={draft.illness?.disease ?? ''}
                placeholder="독감, 코로나19, 백일해 등"
                onChange={(e) => set({ illness: { ...draft.illness, disease: e.target.value } })}
              />
            </div>
            <div>
              <label className="field-label">소견서 인정 기간</label>
              <span className="inline">
                <input
                  type="date"
                  value={draft.illness?.certStart ?? ''}
                  onChange={(e) => set({ illness: { disease: '', ...draft.illness, certStart: e.target.value || undefined } })}
                />
                ~
                <input
                  type="date"
                  value={draft.illness?.certEnd ?? ''}
                  onChange={(e) => set({ illness: { disease: '', ...draft.illness, certEnd: e.target.value || undefined } })}
                />
              </span>
            </div>
          </section>
        )}

        {isTrip && (
          <section>
            <label className="field-label">체험학습</label>
            <div className="row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.fieldTrip?.abroad ?? false}
                  onChange={(e) => set({ fieldTrip: { guardianAccompanied: false, ...draft.fieldTrip, abroad: e.target.checked } })}
                />
                국외
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.fieldTrip?.guardianAccompanied ?? false}
                  onChange={(e) =>
                    set({ fieldTrip: { abroad: false, ...draft.fieldTrip, guardianAccompanied: e.target.checked } })
                  }
                />
                보호자 동반
              </label>
            </div>
            <p className="hint">
              반일(0.5일)은 상황을 <b>지각</b>(오전) 또는 <b>조퇴</b>(오후)로 선택하세요.
            </p>
            {preview && (
              <p className="info">
                이번 사용 {fieldTripDays(preview.rec, holidays)}일 · 학년도 누적 {preview.cumulative}/
                {state.settings.fieldTripYearlyMax}일 · 신청서 기한{' '}
                {formatKo(applicationDeadline(preview.rec, state.settings, holidays))} · 보고서 기한{' '}
                {formatKo(reportDeadline(preview.rec, state.settings, holidays))}
              </p>
            )}
          </section>
        )}

        <section>
          <label className="field-label">서류</label>
          {draft.docs.length === 0 && <p className="muted">필요한 서류가 없습니다.</p>}
          <ul className="doc-edit">
            {draft.docs.map((doc) => (
              <li key={doc.key}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={doc.received}
                    onChange={(e) =>
                      setDoc(doc.key, { received: e.target.checked, receivedDate: e.target.checked ? today() : undefined })
                    }
                  />
                  {doc.label}
                </label>
                {doc.received && (
                  <input
                    type="date"
                    value={doc.receivedDate ?? ''}
                    onChange={(e) => setDoc(doc.key, { receivedDate: e.target.value || undefined })}
                    title="받은 날짜"
                  />
                )}
                <button type="button" className="ghost small" onClick={() => setDoc(doc.key, { required: !doc.required })}>
                  {doc.required ? '필수' : '선택'}
                </button>
                {isCustomDoc(doc) && (
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => setDraft((d) => ({ ...d, docs: d.docs.filter((x) => x.key !== doc.key) }))}
                  >
                    삭제
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="inline">
            <input value={customDoc} placeholder="서류 직접 추가" onChange={(e) => setCustomDoc(e.target.value)} />
            <button
              type="button"
              disabled={!customDoc.trim()}
              onClick={() => {
                setDraft((d) => ({
                  ...d,
                  docs: [...d.docs, { key: `custom:${newId()}`, label: customDoc.trim(), required: true, received: false }],
                }));
                setCustomDoc('');
              }}
            >
              추가
            </button>
          </div>
        </section>

        <section>
          <label className="field-label">메모</label>
          <textarea rows={2} value={draft.memo} onChange={(e) => set({ memo: e.target.value })} />
        </section>

        {preview && preview.warnings.length > 0 && (
          <ul className="warnings">
            {preview.warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}
        {error && <p className="error">{error}</p>}

        <footer className="form-actions">
          {!isNew && (
            <button type="button" className="danger" onClick={remove}>
              삭제
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="button" className="primary" onClick={save}>
            저장{isNew && selected.length > 1 ? ` (${selected.length}명)` : ''}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
