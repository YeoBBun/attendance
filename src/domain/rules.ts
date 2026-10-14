import {
  addDays,
  addSchoolDays,
  countSchoolDays,
  formatKo,
  monthKey,
  rangesOverlap,
  schoolYearOf,
  type HolidayIndex,
} from './calendar';
import type { ApprovedReason, AttendanceRecord, DateStr, DocItem, Kind, Settings, Status } from './types';

// ─── 필요서류 ─────────────────────────────────────────────

export const DOC_ABSENCE_NOTE = 'absence-note';
export const DOC_FT_APPLICATION = 'fieldtrip:application';
export const DOC_FT_REPORT = 'fieldtrip:report';
export const DOC_MEDICAL = 'evidence:medical';

const REASON_EVIDENCE: Record<ApprovedReason, Omit<DocItem, 'received'>[]> = {
  법정감염병: [{ key: 'evidence:infection', label: '의사 소견서', required: true }],
  체험학습: [
    { key: DOC_FT_APPLICATION, label: '체험학습 신청서', required: true },
    { key: DOC_FT_REPORT, label: '체험학습 보고서(사진 등 첨부)', required: true },
  ],
  경조사: [{ key: 'evidence:family-event', label: '증빙서류(청첩장·사망진단서 등)', required: true }],
  생리: [],
  공문: [{ key: 'evidence:official', label: '공문', required: true }],
};

/** 출결 상황·종류·사유에 따라 기본 필요서류 목록을 만든다. */
export function docTemplate(status: Status, kind: Kind, reason?: ApprovedReason): Omit<DocItem, 'received'>[] {
  switch (kind) {
    case '출석인정':
      // 체험학습은 신청서·보고서로 대신하므로 결석계를 받지 않는다.
      return [
        ...(reason === '체험학습' ? [] : [{ key: DOC_ABSENCE_NOTE, label: '결석계', required: true }]),
        ...(reason ? REASON_EVIDENCE[reason] : []),
      ];
    case '질병': {
      // 질병 결석은 결석계와 증빙 모두 필수. 질병 지각·조퇴·결과는 담임 재량으로 증빙만 선택적으로 받는다.
      return status === '결석'
        ? [
            { key: DOC_ABSENCE_NOTE, label: '결석계', required: true },
            { key: DOC_MEDICAL, label: '진료확인서 등 증빙', required: true },
          ]
        : [{ key: DOC_MEDICAL, label: '진료확인서 등 증빙', required: false }];
    }
    default:
      return [];
  }
}

export function isCustomDoc(doc: DocItem): boolean {
  return doc.key.startsWith('custom:');
}

/**
 * 출결 정보가 바뀌었을 때 서류 목록을 다시 만든다.
 * 이미 있던 서류는 받은 상태와 필수 여부를 유지하고, 직접 추가한 서류는 그대로 둔다.
 */
export function rebuildDocs(prev: DocItem[], status: Status, kind: Kind, reason?: ApprovedReason): DocItem[] {
  const byKey = new Map(prev.map((d) => [d.key, d]));
  const fromTemplate = docTemplate(status, kind, reason).map((t) => {
    const old = byKey.get(t.key);
    return old ? { ...t, required: old.required, received: old.received, receivedDate: old.receivedDate } : { ...t, received: false };
  });
  return [...fromTemplate, ...prev.filter(isCustomDoc)];
}

export function missingDocs(r: AttendanceRecord): DocItem[] {
  return r.docs.filter((d) => d.required && !d.received);
}

// ─── 일수 계산 ─────────────────────────────────────────────

/** 결석 기록의 결석일수(수업일만). 범위를 주면 그 안에 든 날만 센다. */
export function absenceDays(r: AttendanceRecord, holidays: HolidayIndex, from?: DateStr, to?: DateStr): number {
  if (r.status !== '결석') return 0;
  const start = from && from > r.startDate ? from : r.startDate;
  const end = to && to < r.endDate ? to : r.endDate;
  if (start > end) return 0;
  return countSchoolDays(start, end, holidays);
}

/** 체험학습 사용 일수. 결석은 수업일 수, 지각(오전)·조퇴(오후)는 반일 0.5일. */
export function fieldTripDays(r: AttendanceRecord, holidays: HolidayIndex): number {
  if (r.kind !== '출석인정' || r.reason !== '체험학습') return 0;
  if (r.status === '결석') return countSchoolDays(r.startDate, r.endDate, holidays);
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
        if (ft?.abroad && days > settings.abroadMaxDays) {
          add(r.id, `국외 체험학습은 1회 연속 ${settings.abroadMaxDays}일 이내입니다 (현재 ${days}일).`);
        }
        const total = cumulative.get(r.id) ?? 0;
        if (total > settings.fieldTripYearlyMax) {
          add(r.id, `연간 체험학습 ${settings.fieldTripYearlyMax}일을 초과합니다 (누적 ${total}일).`);
        }
        checkDeadline(r, DOC_FT_APPLICATION, applicationDeadline(r, settings, holidays), '신청서', today, add);
        checkDeadline(r, DOC_FT_REPORT, reportDeadline(r, settings, holidays), '보고서', today, add);
        break;
      }
    }
  }
  return out;
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
