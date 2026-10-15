import {
  addDays,
  addSchoolDays,
  countSchoolDays,
  isSchoolDay,
  formatKo,
  monthKey,
  rangesOverlap,
  schoolYearOf,
  type HolidayIndex,
} from './calendar';
import { FAMILY_EVENTS, type ApprovedReason, type AttendanceRecord, type DateStr, type DocItem, type ExamPeriod, type Settings, type Status } from './types';

// ─── 필요서류 ─────────────────────────────────────────────
// 기준: 교내 출결 관리 기준표 (결석 유형별 확인 사항 및 증빙 서류)

export const DOC_ABSENCE_NOTE = 'absence-note';
export const DOC_FT_APPLICATION = 'fieldtrip:application';
export const DOC_FT_REPORT = 'fieldtrip:report';
export const DOC_MEDICAL = 'evidence:medical';

type DocSpec = Omit<DocItem, 'received'>;

const REASON_EVIDENCE: Record<ApprovedReason, DocSpec[]> = {
  법정감염병: [{ key: 'evidence:infection', label: '의사 소견서', required: true }],
  체험학습: [
    { key: DOC_FT_APPLICATION, label: '체험학습 신청서', required: true },
    // 근거자료(사진·항공권·입장권 등)는 보고서에 붙여서 낸다.
    { key: DOC_FT_REPORT, label: '체험학습 보고서(근거자료 첨부)', required: true },
  ],
  경조사: [{ key: 'evidence:family-event', label: '근거 서류(청첩장·사망진단서 등)', required: true }],
  생리: [],
  공문: [{ key: 'evidence:official', label: '공문', required: true }],
};

/** 서류 규칙에 필요한 기간 정보 (질병결석 일수, 시험 기간) */
export interface DocContext {
  holidays: HolidayIndex;
  exams: ExamPeriod[];
}

const NO_CONTEXT: DocContext = { holidays: new Map(), exams: [] };

export type DocInput = Pick<AttendanceRecord, 'status' | 'kind' | 'reason' | 'startDate' | 'endDate'>;

/** 질병결석에 진료확인서·처방전 등 근거 서류가 필요한가: 3일 이상이거나 시험 기간에 걸치면 필요 */
export function illnessNeedsEvidence(r: DocInput, ctx: DocContext = NO_CONTEXT): boolean {
  if (r.kind !== '질병' || r.status !== '결석') return false;
  if (countSchoolDays(r.startDate, r.endDate, ctx.holidays) >= 3) return true;
  return ctx.exams.some((e) => rangesOverlap(r.startDate, r.endDate, e.start, e.end));
}

/** 출결 상황·종류·사유(와 질병결석 기간)에 따라 기본 필요서류 목록을 만든다. */
export function docTemplate(r: DocInput, ctx: DocContext = NO_CONTEXT): DocSpec[] {
  const note = { key: DOC_ABSENCE_NOTE, label: '결석계', required: true };
  switch (r.kind) {
    case '출석인정':
      // 체험학습은 신청서·보고서로 대신하므로 결석계를 받지 않는다.
      return [...(r.reason === '체험학습' ? [] : [note]), ...(r.reason ? REASON_EVIDENCE[r.reason] : [])];
    case '질병':
      if (r.status !== '결석') {
        // 질병 지각·조퇴·결과는 담임 재량으로 증빙만 선택적으로 받는다.
        return [{ key: DOC_MEDICAL, label: '진료확인서 등 증빙', required: false }];
      }
      // 2일 이하: 결석계만으로 가능 (보호자 전화·문자 확인은 결석계 담임확인란에). 3일 이상·시험 기간: 진료확인서·처방전 등 필수.
      return [note, { key: DOC_MEDICAL, label: '진료확인서·처방전 등', required: illnessNeedsEvidence(r, ctx) }];
    case '기타':
      // 학교장이 인정한 부득이한 사유만 — 근거 서류 필수 (예: 부 병원 간병 → 입원 증빙)
      return [{ key: 'evidence:etc', label: '근거 서류', required: true }];
    case '미인정':
      return [{ key: 'check:student-sign', label: '출력물 학생 서명', required: true }];
  }
}

export function isCustomDoc(doc: DocItem): boolean {
  return doc.key.startsWith('custom:');
}

/**
 * 출결 정보가 바뀌었을 때 서류 목록을 다시 만든다.
 * 이미 있던 서류는 받은 상태를 유지하고, 직접 추가한 서류는 그대로 둔다.
 * 필수 여부는 선생님이 바꾼 값을 유지하되, resetRequired 면 기준표 값으로 되돌린다.
 */
export function rebuildDocs(
  prev: DocItem[],
  r: DocInput,
  ctx: DocContext = NO_CONTEXT,
  opts: { resetRequired?: boolean } = {},
): DocItem[] {
  const byKey = new Map(prev.map((d) => [d.key, d]));
  const fromTemplate = docTemplate(r, ctx).map((t) => {
    const old = byKey.get(t.key);
    if (!old) return { ...t, received: false };
    return { ...t, required: opts.resetRequired ? t.required : old.required, received: old.received, receivedDate: old.receivedDate };
  });
  return [...fromTemplate, ...prev.filter(isCustomDoc)];
}

/** 아직 받지 않은 필수 서류. 체험학습 보고서는 신청 접수 때부터 받을 서류로 잡힌다. */
export function missingDocs(r: AttendanceRecord): DocItem[] {
  return r.docs.filter((d) => d.required && !d.received);
}

// ─── 일수 계산 ─────────────────────────────────────────────

/** 여러 날 결석으로 기록된 체험학습에서 반일로 처리되는 날 (첫날 오후부터, 마지막 날 오전까지) */
export function halfDays(r: AttendanceRecord): DateStr[] {
  if (r.status !== '결석' || r.startDate === r.endDate || !r.fieldTrip) return [];
  const days: DateStr[] = [];
  if (r.fieldTrip.startPM) days.push(r.startDate);
  if (r.fieldTrip.endAM) days.push(r.endDate);
  return days;
}

/** 그날의 실제 출결 상황. 체험학습 첫날 오후부터는 조퇴, 마지막 날 오전까지는 지각. */
export function statusOn(r: AttendanceRecord, date: DateStr): Status {
  if (halfDays(r).includes(date)) return date === r.startDate ? '조퇴' : '지각';
  return r.status;
}

function clip(r: AttendanceRecord, from?: DateStr, to?: DateStr): [DateStr, DateStr] {
  return [from && from > r.startDate ? from : r.startDate, to && to < r.endDate ? to : r.endDate];
}

/** 범위 안에서 반일로 처리되는 수업일 */
export function halfDaysIn(r: AttendanceRecord, holidays: HolidayIndex, from?: DateStr, to?: DateStr): DateStr[] {
  const [start, end] = clip(r, from, to);
  return halfDays(r).filter((d) => d >= start && d <= end && isSchoolDay(d, holidays));
}

/** 결석 기록의 결석일수(수업일만, 반일 제외). 범위를 주면 그 안에 든 날만 센다. */
export function absenceDays(r: AttendanceRecord, holidays: HolidayIndex, from?: DateStr, to?: DateStr): number {
  if (r.status !== '결석') return 0;
  const [start, end] = clip(r, from, to);
  if (start > end) return 0;
  return countSchoolDays(start, end, holidays) - halfDaysIn(r, holidays, from, to).length;
}

/**
 * 체험학습 사용 일수. 종일은 1일, 반일(오전·오후)은 0.5일. 예) 첫날 오후부터 + 다음 날 종일 = 1.5일
 * from/to 를 주면 그 안에 든 날만 센다 (사용·예정 구분용).
 */
export function fieldTripDays(r: AttendanceRecord, holidays: HolidayIndex, from?: DateStr, to?: DateStr): number {
  if (r.kind !== '출석인정' || r.reason !== '체험학습') return 0;
  const [start, end] = clip(r, from, to);
  if (start > end) return 0;
  if (r.status === '결석') return countSchoolDays(start, end, holidays) - 0.5 * halfDaysIn(r, holidays, from, to).length;
  if (r.status === '지각' || r.status === '조퇴') return 0.5;
  return 0;
}

export function applicationDeadline(r: AttendanceRecord, s: Settings, holidays: HolidayIndex): DateStr {
  return s.applicationBasis === 'school'
    ? addSchoolDays(r.startDate, -s.applicationDaysBefore, holidays)
    : addDays(r.startDate, -s.applicationDaysBefore);
}

export function reportDeadline(r: AttendanceRecord, s: Settings, holidays: HolidayIndex): DateStr {
  return s.reportBasis === 'school'
    ? addSchoolDays(r.endDate, s.reportDaysAfter, holidays)
    : addDays(r.endDate, s.reportDaysAfter);
}

/** 학생별·학년도별 체험학습 누적 일수 (해당 기록까지 포함) */
export function fieldTripCumulative(records: AttendanceRecord[], holidays: HolidayIndex): Map<string, number> {
  const result = new Map<string, number>();
  const totals = new Map<string, number>();
  const trips = records
    .filter((r) => r.kind === '출석인정' && r.reason === '체험학습')
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
  for (const r of trips) {
    const key = `${r.studentId}|${schoolYearOf(r.startDate)}`;
    const total = (totals.get(key) ?? 0) + fieldTripDays(r, holidays);
    totals.set(key, total);
    result.set(r.id, total);
  }
  return result;
}

// ─── 경고 ─────────────────────────────────────────────────

export interface Warning {
  recordId: string;
  message: string;
}

export interface RuleContext {
  records: AttendanceRecord[];
  holidays: HolidayIndex;
  settings: Settings;
  today: DateStr;
}

/** 규칙 위반을 찾는다. 앱은 기록을 바꾸지 않고 경고만 띄운다. */
export function computeWarnings(ctx: RuleContext): Map<string, string[]> {
  const { records, holidays, settings, today } = ctx;
  const out = new Map<string, string[]>();
  const add = (id: string, msg: string) => {
    const list = out.get(id) ?? [];
    list.push(msg);
    out.set(id, list);
  };
  const cumulative = fieldTripCumulative(records, holidays);

  const byStudent = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    const list = byStudent.get(r.studentId) ?? [];
    list.push(r);
    byStudent.set(r.studentId, list);
  }

  for (const r of records) {
    const mine = byStudent.get(r.studentId) ?? [];

    if (r.status === '결석' && countSchoolDays(r.startDate, r.endDate, holidays) === 0) {
      add(r.id, '기간 안에 수업일이 없습니다 (주말·공휴일·재량휴업일).');
    }

    // 결석은 다른 기록과 날짜가 겹치면 안 된다. 지각·조퇴·결과끼리는 같은 날 있을 수 있다.
    for (const o of mine) {
      if (o.id === r.id) continue;
      if ((r.status === '결석' || o.status === '결석') && rangesOverlap(r.startDate, r.endDate, o.startDate, o.endDate)) {
        add(r.id, `${formatKo(o.startDate)} ${o.kind} ${o.status} 기록과 날짜가 겹칩니다.`);
      }
    }

    if (r.kind !== '출석인정') continue;
    if (!r.reason) {
      add(r.id, '출석인정 세부 사유를 선택하세요.');
      continue;
    }

    switch (r.reason) {
      case '생리': {
        if (r.status === '결석' && countSchoolDays(r.startDate, r.endDate, holidays) > 1) {
          add(r.id, '생리 인정은 월 1회(1일)만 가능합니다.');
        }
        const sameMonth = mine
          .filter((o) => o.kind === '출석인정' && o.reason === '생리' && monthKey(o.startDate) === monthKey(r.startDate))
          .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
        const first = sameMonth[0];
        if (first && first.id !== r.id) {
          add(r.id, `이번 달 생리 인정을 이미 사용했습니다 (${formatKo(first.startDate)} ${first.status}).`);
        }
        break;
      }
      case '경조사': {
        const ev = FAMILY_EVENTS.find((e) => e.key === r.familyEvent);
        if (!ev) {
          add(r.id, '경조사 종류를 고르세요 (종류마다 인정 일수가 다릅니다).');
        } else if (r.status === '결석') {
          const used = countSchoolDays(r.startDate, r.endDate, holidays);
          if (used > ev.days) {
            add(r.id, `경조사(${ev.key})는 ${ev.days}일까지 인정됩니다 (현재 ${used}일). 초과분은 미인정결석 처리 대상입니다.`);
          }
        }
        break;
      }
      case '법정감염병': {
        const ill = r.illness;
        if (!ill?.certStart || !ill?.certEnd) {
          add(r.id, '의사 소견서에 적힌 출석인정 기간을 입력하세요.');
        } else if (r.startDate < ill.certStart || r.endDate > ill.certEnd) {
          add(r.id, `소견서 기간(${formatKo(ill.certStart)}~${formatKo(ill.certEnd)}) 밖의 날짜가 포함되어 있습니다.`);
        }
        break;
      }
      case '체험학습': {
        const ft = r.fieldTrip;
        if (!ft?.guardianAccompanied) {
          add(r.id, '보호자를 동반하지 않는 교외체험학습은 불가합니다.');
        }
        if (r.status === '결과') {
          add(r.id, '체험학습은 결석(종일) 또는 지각(오전)·조퇴(오후)의 반일 단위로 기록합니다.');
        }
        const days = fieldTripDays(r, holidays);
        if (days > settings.tripMaxConsecutiveDays) {
          add(
            r.id,
            `체험학습은 국내·국외 모두 1회 연속 ${settings.tripMaxConsecutiveDays}일 이내입니다 (현재 ${days}일). 초과분은 미인정결석 처리 대상입니다.`,
          );
        }
        const total = cumulative.get(r.id) ?? 0;
        if (total > settings.fieldTripYearlyMax) {
          add(
            r.id,
            `연간 체험학습 ${settings.fieldTripYearlyMax}일을 초과합니다 (누적 ${total}일). 초과분은 미인정결석 처리 대상입니다.`,
          );
        }
        checkApplication(r, applicationDeadline(r, settings, holidays), today, add);
        checkDeadline(r, DOC_FT_REPORT, reportDeadline(r, settings, holidays), '보고서', today, add);
        break;
      }
    }
  }
  return out;
}

/** 사후 신청은 불가하므로, 기한을 넘긴 신청서는 미인정 처리 대상이다. */
function checkApplication(r: AttendanceRecord, deadline: DateStr, today: DateStr, add: (id: string, msg: string) => void) {
  const doc = r.docs.find((d) => d.key === DOC_FT_APPLICATION);
  if (!doc || !doc.required) return;
  if (doc.received) {
    if (doc.receivedDate && doc.receivedDate > deadline) {
      add(r.id, `신청서를 기한(${formatKo(deadline)}) 이후에 받았습니다 (${formatKo(doc.receivedDate)}). 사후 신청은 불가하므로 미인정 처리 대상입니다.`);
    }
  } else if (today >= r.startDate) {
    add(r.id, '신청서 없이 실시되었습니다. 사후 신청은 불가하므로 미인정 처리 대상입니다.');
  } else if (today > deadline) {
    add(r.id, `신청서 기한(${formatKo(deadline)})이 지났습니다. 사후 신청은 불가하므로 미인정 처리 대상입니다.`);
  }
}

function checkDeadline(
  r: AttendanceRecord,
  docKey: string,
  deadline: DateStr,
  label: string,
  today: DateStr,
  add: (id: string, msg: string) => void,
) {
  const doc = r.docs.find((d) => d.key === docKey);
  if (!doc || !doc.required) return;
  if (doc.received) {
    if (doc.receivedDate && doc.receivedDate > deadline) {
      add(r.id, `${label}를 기한(${formatKo(deadline)}) 이후에 제출했습니다 (${formatKo(doc.receivedDate)}).`);
    }
  } else if (today > deadline) {
    add(r.id, `${label} 기한(${formatKo(deadline)})이 지났습니다.`);
  }
}
