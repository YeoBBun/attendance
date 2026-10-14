import { useEffect, useRef, type ReactNode } from 'react';
import type { AttendanceRecord, Kind, Student } from '../domain/types';
import { countSchoolDays, formatKo, type HolidayIndex } from '../domain/calendar';
import { periodNote } from '../domain/neis';
import { statusOn } from '../domain/rules';

const modalStack: object[] = [];

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    // 모달이 겹치면 Esc 는 맨 위 모달만 닫는다.
    const token = {};
    modalStack.push(token);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && modalStack.at(-1) === token && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(token), 1);
    };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="닫기">✕</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export const KIND_SHORT: Record<Kind, string> = { 출석인정: '인정', 질병: '질병', 미인정: '미인정', 기타: '기타' };

export function kindClass(kind: Kind): string {
  return { 출석인정: 'k-approved', 질병: 'k-ill', 미인정: 'k-unexcused', 기타: 'k-etc' }[kind];
}

/** 예: "인정(체험학습) 결석" */
export function recordTitle(r: AttendanceRecord): string {
  const kind = r.kind === '출석인정' && r.reason ? `인정(${r.reason})` : KIND_SHORT[r.kind];
  const periods = r.status === '결과' && r.periods?.length ? ` ${r.periods.join('·')}교시` : '';
  const halves = r.fieldTrip && r.status === '결석' && r.startDate !== r.endDate
    ? [r.fieldTrip.startPM && '첫날 오후부터', r.fieldTrip.endAM && '마지막 날 오전까지'].filter(Boolean).join('·')
    : '';
  return `${kind} ${r.status}${periods}${halves ? ` (${halves})` : ''}`;
}

export function recordDates(r: AttendanceRecord): string {
  return r.startDate === r.endDate ? formatKo(r.startDate) : `${formatKo(r.startDate)}~${formatKo(r.endDate)}`;
}

export function studentLabel(s: Student | undefined): string {
  return s ? `${s.number}. ${s.name}` : '(삭제된 학생)';
}

export function sortStudents(students: Student[]): Student[] {
  return [...students].sort((a, b) => a.number - b.number);
}

/**
 * 그날 출결 한 줄 요약. 예: { label: '질병결석', detail: '감기' }, { label: '인정결석', detail: '체험학습 2/3일차' }
 * 괄호 안 내용은 출석인정 사유와 메모.
 */
export function dayStatus(r: AttendanceRecord, date: string, holidays: HolidayIndex): { label: string; detail: string } {
  const kind = r.kind === '출석인정' ? '인정' : r.kind;
  const status = statusOn(r, date);
  const periods = status === '결과' && r.periods?.length ? ` ${r.periods.join('·')}교시` : '';
  // 출석인정은 사유를 기본으로 보이고, 메모가 사유를 이미 담고 있으면(예: 생리통) 메모만 보인다.
  const memo = r.memo.trim();
  const parts = [r.reason && !memo.includes(r.reason) ? [r.reason, memo].filter(Boolean).join(', ') : memo];
  const period = periodNote(r, date);
  if (period) parts.push(period);
  if (r.status === '결석' && r.startDate !== r.endDate) {
    // 몇째 날인지 (반일 포함 수업일 기준)
    const total = countSchoolDays(r.startDate, r.endDate, holidays);
    const nth = countSchoolDays(r.startDate, date, holidays);
    if (total > 1) parts.push(`${nth}/${total}일차`);
  }
  return { label: `${kind}${status}${periods}`, detail: parts.filter(Boolean).join(' ') };
}

const PERIOD_CHOICES = [1, 2, 3, 4, 5, 6, 7];

/**
 * 지각·조퇴 교시 고르기. 지각은 "몇 교시까지 빠졌나" (조회만 = 0), 조퇴는 "몇 교시부터 빠졌나".
 * 나이스 자동 입력에 꼭 필요하다.
 */
export function PeriodPicker({
  mode,
  value,
  onChange,
  label,
}: {
  mode: '지각' | '조퇴';
  value: number | undefined;
  onChange: (n: number) => void;
  label?: string;
}) {
  const options = mode === '지각' ? [0, ...PERIOD_CHOICES] : PERIOD_CHOICES;
  return (
    <div>
      <span className="field-label">
        {label ?? (mode === '지각' ? '몇 교시까지 빠졌나요?' : '몇 교시부터 빠졌나요?')}
      </span>
      <div className="big-seg">
        {options.map((n) => (
          <button key={n} type="button" className={value === n ? 'on' : ''} onClick={() => onChange(n)}>
            {n === 0 ? '조회만' : mode === '지각' ? `~${n}교시` : `${n}교시~`}
          </button>
        ))}
      </div>
    </div>
  );
}
