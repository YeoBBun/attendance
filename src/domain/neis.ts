import { eachDay, isSchoolDay, type HolidayIndex } from './calendar';
import { statusOn } from './rules';
import type { AttendanceRecord, DateStr, Status, Student } from './types';

/**
 * 나이스 자동 입력 키트(neis-automation-kit)에 넘길 파일.
 * 키트는 원래 구글 캘린더 일정 "번호 이름 분류 (교시)" 를 읽는데,
 * 같은 내용을 날짜별 한 줄씩 담는다. 연결 스크립트: public/neis-kit/app_to_neis.py
 */
export const NEIS_FILE_FORMAT = 'attendance-app/neis-v1';

export interface NeisRow {
  date: DateStr;
  number: number;
  name: string;
  /** 키트의 분류 이름. 예: 질병결석, 출석인정조퇴 */
  att_type: string;
  /** 교시. 지각 "~2교시"/"조회", 조퇴 "5교시~", 결석은 빈 문자열 */
  note: string;
}

export interface NeisSkipped {
  date: DateStr;
  number: number;
  name: string;
  label: string;
  reason: string;
}

export interface NeisFile {
  format: typeof NEIS_FILE_FORMAT;
  generatedAt: string;
  from: DateStr;
  to: DateStr;
  records: NeisRow[];
  skipped: NeisSkipped[];
}

/** 지각·조퇴의 교시 표기 (키트 규칙: 지각 "~N교시", 조퇴 "N교시~"). 모르면 null */
export function periodNote(r: AttendanceRecord, date: DateStr): string | null {
  const status = statusOn(r, date);
  if (status === '지각') {
    if (r.lateUntil === undefined) return null;
    return r.lateUntil === 0 ? '조회' : `~${r.lateUntil}교시`;
  }
  if (status === '조퇴') return r.leaveFrom === undefined ? null : `${r.leaveFrom}교시~`;
  return '';
}

function attType(kind: AttendanceRecord['kind'], status: Status): string {
  return `${kind}${status}`;
}

/** from~to 의 수업일마다 한 줄씩 만든다. 키트가 못 넣는 건(결과, 교시 없는 지각·조퇴)은 skipped 로. */
export function buildNeisFile(
  students: Student[],
  records: AttendanceRecord[],
  holidays: HolidayIndex,
  from: DateStr,
  to: DateStr,
  now = new Date(),
): NeisFile {
  const byId = new Map(students.map((s) => [s.id, s]));
  const rows: NeisRow[] = [];
  const skipped: NeisSkipped[] = [];
  for (const r of records) {
    const student = byId.get(r.studentId);
    if (!student || r.endDate < from || r.startDate > to) continue;
    const start = r.startDate < from ? from : r.startDate;
    const end = r.endDate > to ? to : r.endDate;
    for (const date of eachDay(start, end)) {
      if (!isSchoolDay(date, holidays)) continue;
      const status = statusOn(r, date);
      const base = { date, number: student.number, name: student.name };
      const label = attType(r.kind, status);
      if (status === '결과') {
        skipped.push({ ...base, label, reason: '결과는 자동 입력을 지원하지 않아요. 나이스에서 직접 넣어 주세요.' });
        continue;
      }
      const note = periodNote(r, date);
      if (note === null) {
        skipped.push({ ...base, label, reason: `${status} 교시가 없어요. 앱에서 교시를 넣거나 나이스에서 직접 넣어 주세요.` });
        continue;
      }
      rows.push({ ...base, att_type: label, note });
    }
  }
  const order = (a: { date: string; number: number }, b: { date: string; number: number }) =>
    a.date.localeCompare(b.date) || a.number - b.number;
  return {
    format: NEIS_FILE_FORMAT,
    generatedAt: now.toISOString(),
    from,
    to,
    records: rows.sort(order),
    skipped: skipped.sort(order),
  };
}
