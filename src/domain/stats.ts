import { schoolYearOf, schoolYearRange, type HolidayIndex } from './calendar';
import { absenceDays, fieldTripDays, missingDocs } from './rules';
import { KINDS, STATUSES, type AttendanceRecord, type DateStr, type Kind, type Status, type Student } from './types';

export interface StudentSummary {
  student: Student;
  /** 결석은 일수, 지각·조퇴·결과는 횟수 */
  counts: Record<Status, Record<Kind, number>>;
  /** 질병 + 미인정 + 기타 결석일수 (출석인정 제외) */
  absenceDays: number;
  /** 출석인정 결석일수 */
  approvedAbsenceDays: number;
  /** 해당 학년도 체험학습 사용 일수 */
  fieldTripDays: number;
  missingDocCount: number;
  warningCount: number;
}

function emptyCounts(): Record<Status, Record<Kind, number>> {
  const c = {} as Record<Status, Record<Kind, number>>;
  for (const s of STATUSES) {
    c[s] = {} as Record<Kind, number>;
    for (const k of KINDS) c[s][k] = 0;
  }
  return c;
}

/** 기간(from~to)에 걸친 기록으로 학생별 요약을 만든다. 체험학습 일수는 from 이 속한 학년도 전체 기준. */
export function summarize(
  students: Student[],
  records: AttendanceRecord[],
  holidays: HolidayIndex,
  warnings: Map<string, string[]>,
  from: DateStr,
  to: DateStr,
): StudentSummary[] {
  const [yearStart, yearEnd] = schoolYearRange(schoolYearOf(from));
  return students.map((student) => {
    const mine = records.filter((r) => r.studentId === student.id);
    const counts = emptyCounts();
    let absence = 0;
    let approved = 0;
    let missing = 0;
    let warn = 0;
    for (const r of mine) {
      if (r.endDate < from || r.startDate > to) continue;
      if (r.status === '결석') {
        const days = absenceDays(r, holidays, from, to);
        counts[r.status][r.kind] += days;
        if (r.kind === '출석인정') approved += days;
        else absence += days;
      } else {
        counts[r.status][r.kind] += 1;
      }
      missing += missingDocs(r).length;
      warn += warnings.get(r.id)?.length ?? 0;
    }
    const ft = mine
      .filter((r) => r.startDate >= yearStart && r.startDate <= yearEnd)
      .reduce((sum, r) => sum + fieldTripDays(r, holidays), 0);
    return {
      student,
      counts,
      absenceDays: absence,
      approvedAbsenceDays: approved,
      fieldTripDays: ft,
      missingDocCount: missing,
      warningCount: warn,
    };
  });
}
