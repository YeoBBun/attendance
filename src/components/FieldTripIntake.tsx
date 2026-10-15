import { useMemo, useState } from 'react';
import { addDays, formatKo, schoolYearOf, schoolYearRange, today } from '../domain/calendar';
import { applicationDeadline, computeWarnings, DOC_FT_APPLICATION, fieldTripDays, rebuildDocs, reportDeadline } from '../domain/rules';
import type { AttendanceRecord, Status } from '../domain/types';
import { newId, useStore } from '../store';
import { Modal, PeriodPicker, sortStudents } from './common';

type Part = '종일' | '오전' | '오후';
const PART_STATUS: Record<Part, Status> = { 종일: '결석', 오전: '지각', 오후: '조퇴' };

/** 학생이 신청서를 낸 날 체험학습을 접수한다. 신청서는 접수일로 받음 처리된다. */
export function FieldTripIntake({ onClose }: { onClose: () => void }) {
  const { state, update, holidays, docContext } = useStore();
  const now = today();
  const [studentId, setStudentId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [part, setPart] = useState<Part>('종일');
  const [abroad, setAbroad] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [receivedDate, setReceivedDate] = useState(now);
  const [startPM, setStartPM] = useState(false);
  const [endAM, setEndAM] = useState(false);
  const [leaveFrom, setLeaveFrom] = useState<number | undefined>(undefined);
  const [lateUntil, setLateUntil] = useState<number | undefined>(undefined);

  const endDate = end && end >= start ? end : start;
  const singleDay = start && endDate === start;
  const effectivePart: Part = singleDay ? part : '종일';

  const draft = useMemo<AttendanceRecord | null>(() => {
    if (!studentId || !start) return null;
    const status = PART_STATUS[effectivePart];
    // 반일은 나이스 입력에 교시가 필요하다: 오전(지각)은 몇 교시까지, 오후(조퇴)는 몇 교시부터
    const useLate = singleDay ? status === '지각' : endAM;
    const useLeave = singleDay ? status === '조퇴' : startPM;
    if ((useLate && lateUntil === undefined) || (useLeave && leaveFrom === undefined)) return null;
    const docs = rebuildDocs(
      [],
      { status, kind: '출석인정', reason: '체험학습', startDate: start, endDate: status === '결석' ? endDate : start },
      docContext,
    ).map((d) =>
      d.key === DOC_FT_APPLICATION ? { ...d, received: true, receivedDate } : d,
    );
    return {
      id: newId(),
      studentId,
      status,
      kind: '출석인정',
      reason: '체험학습',
      startDate: start,
      endDate: status === '결석' ? endDate : start,
      fieldTrip: singleDay
        ? { abroad, guardianAccompanied: guardian }
        : { abroad, guardianAccompanied: guardian, startPM, endAM },
      ...(useLate ? { lateUntil } : {}),
      ...(useLeave ? { leaveFrom } : {}),
      docs,
      memo: '',
    };
  }, [studentId, start, endDate, singleDay, effectivePart, abroad, guardian, receivedDate, startPM, endAM, lateUntil, leaveFrom, docContext]);

  const preview = useMemo(() => {
    if (!draft) return null;
    const [ys, ye] = schoolYearRange(schoolYearOf(draft.startDate));
    const others = state.records.filter(
      (r) => r.studentId === draft.studentId && r.startDate >= ys && r.startDate <= ye,
    );
    const used = others.reduce((n, r) => n + fieldTripDays(r, holidays, undefined, now), 0);
    const planned = others.reduce((n, r) => n + fieldTripDays(r, holidays, addDays(now, 1)), 0);
    const thisTrip = fieldTripDays(draft, holidays);
    const warnings =
      computeWarnings({ records: [...state.records, draft], holidays, settings: state.settings, today: now }).get(draft.id) ?? [];
    return {
      used,
      planned,
      thisTrip,
      left: state.settings.fieldTripYearlyMax - used - planned - thisTrip,
      appDeadline: applicationDeadline(draft, state.settings, holidays),
      reportDue: reportDeadline(draft, state.settings, holidays),
      warnings,
    };
  }, [draft, state.records, state.settings, holidays, now]);

  const save = () => {
    if (!draft) return;
    update((s) => ({ ...s, records: [...s.records, draft] }));
    onClose();
  };

  return (
    <Modal title="체험학습 신청 접수" onClose={onClose}>
      <div className="form">
        <section>
          <label className="field-label">학생</label>
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">선택하세요</option>
            {sortStudents(state.students).map((s) => (
              <option key={s.id} value={s.id}>
                {s.number}. {s.name}
              </option>
            ))}
          </select>
        </section>

        <section className="row">
          <div>
            <label className="field-label">시작일</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="field-label">종료일 (하루면 비워두세요)</label>
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </section>

        {start && !singleDay && (
          <section className="row">
            <div>
              <label className="field-label">첫날 ({formatKo(start)})</label>
              <div className="big-seg">
                <button className={!startPM ? 'on' : ''} onClick={() => setStartPM(false)}>
                  종일
                </button>
                <button className={startPM ? 'on' : ''} onClick={() => setStartPM(true)}>
                  오후부터 <small>(0.5일)</small>
                </button>
              </div>
            </div>
            <div>
              <label className="field-label">마지막 날 ({formatKo(endDate)})</label>
              <div className="big-seg">
                <button className={!endAM ? 'on' : ''} onClick={() => setEndAM(false)}>
                  종일
                </button>
                <button className={endAM ? 'on' : ''} onClick={() => setEndAM(true)}>
                  오전까지 <small>(0.5일)</small>
                </button>
              </div>
            </div>
            {startPM && <PeriodPicker mode="조퇴" label="첫날 몇 교시부터?" value={leaveFrom} onChange={setLeaveFrom} />}
            {endAM && <PeriodPicker mode="지각" label="마지막 날 몇 교시까지?" value={lateUntil} onChange={setLateUntil} />}
            {(startPM || endAM) && (
              <p className="hint">
                {[startPM && '첫날은 인정조퇴', endAM && '마지막 날은 인정지각'].filter(Boolean).join(', ')}으로 기록됩니다.
              </p>
            )}
          </section>
        )}

        {singleDay && (
          <section>
            <label className="field-label">시간</label>
            <div className="big-seg">
              {(['종일', '오전', '오후'] as Part[]).map((p) => (
                <button key={p} className={part === p ? 'on' : ''} onClick={() => setPart(p)}>
                  {p}
                  {p !== '종일' && <small> (0.5일)</small>}
                </button>
              ))}
            </div>
            {part === '오전' && <PeriodPicker mode="지각" label="몇 교시까지?" value={lateUntil} onChange={setLateUntil} />}
            {part === '오후' && <PeriodPicker mode="조퇴" label="몇 교시부터?" value={leaveFrom} onChange={setLeaveFrom} />}
            {part !== '종일' && <p className="hint">{part === '오전' ? '인정지각' : '인정조퇴'}으로 기록됩니다.</p>}
          </section>
        )}

        <section className="row">
          <div className="big-seg">
            <button className={!abroad ? 'on' : ''} onClick={() => setAbroad(false)}>
              국내
            </button>
            <button className={abroad ? 'on' : ''} onClick={() => setAbroad(true)}>
              국외
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} />
            보호자 동반 확인
          </label>
        </section>

        <section>
          <label className="field-label">신청서 받은 날</label>
          <input type="date" value={receivedDate} onChange={(e) => e.target.value && setReceivedDate(e.target.value)} />
        </section>

        {studentId && start && !draft && <p className="hint">반일 교시를 고르면 접수할 수 있어요.</p>}
        {preview && (
          <p className="info">
            올해 사용 {preview.used}일{preview.planned ? ` · 예정 ${preview.planned}일` : ''} · 이번 {preview.thisTrip}일 → 남은{' '}
            <b>{preview.left}일</b> (연간 {state.settings.fieldTripYearlyMax}일)
            <br />
            신청 기한 {formatKo(preview.appDeadline)} · 보고서 기한 {formatKo(preview.reportDue)}
          </p>
        )}
        {preview && preview.warnings.length > 0 && (
          <ul className="warnings">
            {preview.warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}

        <footer className="form-actions">
          <span className="spacer" />
          <button onClick={onClose}>취소</button>
          <button className="primary big" disabled={!draft} onClick={save}>
            접수
          </button>
        </footer>
      </div>
    </Modal>
  );
}
