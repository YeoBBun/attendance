import { describe, expect, it } from 'vitest';
import { addSchoolDays, countSchoolDays, dayOfWeek, indexHolidays, schoolYearRange } from './calendar';
import {
  computeWarnings,
  DOC_FT_APPLICATION,
  DOC_FT_REPORT,
  fieldTripCumulative,
  fieldTripDays,
  missingDocs,
  rebuildDocs,
  statusOn,
} from './rules';
import { PUBLIC_HOLIDAYS } from './publicHolidays';
import { summarize } from './stats';
import { DEFAULT_SETTINGS, type AttendanceRecord, type Holiday } from './types';

const HOLIDAYS: Holiday[] = [{ date: '2026-10-09', name: '한글날', type: '공휴일' }];
const hol = indexHolidays(HOLIDAYS);

let seq = 0;
function rec(p: Partial<AttendanceRecord>): AttendanceRecord {
  const status = p.status ?? '결석';
  const kind = p.kind ?? '질병';
  const startDate = p.startDate ?? '2026-10-13';
  return {
    id: p.id ?? `r${++seq}`,
    studentId: 's1',
    status,
    kind,
    startDate,
    endDate: p.endDate ?? startDate,
    memo: '',
    ...p,
    docs: p.docs ?? rebuildDocs([], status, kind, p.reason),
  };
}

function warningsFor(records: AttendanceRecord[], today = '2026-10-14') {
  return computeWarnings({ records, holidays: hol, settings: DEFAULT_SETTINGS, today });
}

describe('calendar', () => {
  it('2026-10-19 는 월요일', () => {
    expect(dayOfWeek('2026-10-19')).toBe(1);
  });

  it('수업일 기준으로 이전 날짜를 센다 (주말 건너뜀)', () => {
    expect(addSchoolDays('2026-10-19', -2, hol)).toBe('2026-10-15');
  });

  it('공휴일도 건너뛴다', () => {
    expect(addSchoolDays('2026-10-12', -2, hol)).toBe('2026-10-07');
  });

  it('수업일 수 계산에서 주말·공휴일 제외', () => {
    // 10/5(월) ~ 10/16(금): 10일 중 한글날 1일 제외
    expect(countSchoolDays('2026-10-05', '2026-10-16', hol)).toBe(9);
  });

  it('학년도는 3월 1일 ~ 다음 해 2월 말', () => {
    expect(schoolYearRange(2027)).toEqual(['2027-03-01', '2028-02-29']);
  });
});

describe('필요서류', () => {
  it('출석인정 체험학습: 결석계 없이 신청서 + 보고서', () => {
    const docs = rebuildDocs([], '결석', '출석인정', '체험학습');
    expect(docs.map((d) => d.key)).toEqual([DOC_FT_APPLICATION, DOC_FT_REPORT]);
    expect(docs.every((d) => d.required)).toBe(true);
  });

  it('질병 결석은 결석계와 증빙 모두 필수', () => {
    const docs = rebuildDocs([], '결석', '질병');
    expect(docs.map((d) => [d.label, d.required])).toEqual([
      ['결석계', true],
      ['진료확인서 등 증빙', true],
    ]);
  });

  it('질병 지각은 결석계 없이 선택 증빙만', () => {
    const docs = rebuildDocs([], '지각', '질병');
    expect(docs.map((d) => d.required)).toEqual([false]);
  });

  it('미인정은 서류 없음', () => {
    expect(rebuildDocs([], '결석', '미인정')).toEqual([]);
  });

  it('종류를 바꿔도 받은 서류 상태와 직접 추가한 서류는 유지', () => {
    const before = rebuildDocs([], '결석', '질병').map((d) => ({ ...d, received: true, receivedDate: '2026-10-14' }));
    const custom = { key: 'custom:x', label: '기타', required: true, received: false };
    const after = rebuildDocs([...before, custom], '결석', '출석인정', '공문');
    expect(after.find((d) => d.key === 'absence-note')?.received).toBe(true);
    expect(after.find((d) => d.key === 'evidence:official')?.received).toBe(false);
    expect(after.find((d) => d.key === 'custom:x')).toBeTruthy();
    expect(after.find((d) => d.key === 'evidence:medical')).toBeUndefined();
  });
});

describe('경고', () => {
  it('생리는 상황과 관계없이 같은 달 두 번째부터 경고', () => {
    const a = rec({ id: 'a', status: '조퇴', kind: '출석인정', reason: '생리', startDate: '2026-10-02' });
    const b = rec({ id: 'b', status: '결석', kind: '출석인정', reason: '생리', startDate: '2026-10-20' });
    const c = rec({ id: 'c', status: '결석', kind: '출석인정', reason: '생리', startDate: '2026-11-02' });
    const w = warningsFor([a, b, c]);
    expect(w.get('a')).toBeUndefined();
    expect(w.get('b')?.[0]).toContain('이미 사용');
    expect(w.get('c')).toBeUndefined();
  });

  it('법정감염병은 소견서 기간 밖이면 경고', () => {
    const r = rec({
      id: 'x',
      kind: '출석인정',
      reason: '법정감염병',
      startDate: '2026-10-12',
      endDate: '2026-10-16',
      illness: { disease: '독감', certStart: '2026-10-12', certEnd: '2026-10-15' },
    });
    expect(warningsFor([r]).get('x')?.[0]).toContain('소견서 기간');
  });

  it('체험학습: 보호자 미동반은 경고, 국외 10 수업일은 허용', () => {
    const r = rec({
      id: 'x',
      kind: '출석인정',
      reason: '체험학습',
      startDate: '2026-11-02',
      endDate: '2026-11-13',
      fieldTrip: { abroad: true, guardianAccompanied: false },
    });
    expect(warningsFor([r], '2026-10-01').get('x')).toEqual(['보호자를 동반하지 않는 교외체험학습은 불가합니다.']);
  });

  it('체험학습: 국외 11 수업일이면 경고', () => {
    const r = rec({
      id: 'x',
      kind: '출석인정',
      reason: '체험학습',
      startDate: '2026-11-02',
      endDate: '2026-11-16',
      fieldTrip: { abroad: true, guardianAccompanied: true },
    });
    expect(warningsFor([r], '2026-10-01').get('x')).toEqual(['국외 체험학습은 1회 연속 10일 이내입니다 (현재 11일).']);
  });

  it('체험학습 신청서 기한(수업일 2일 전)이 지나면 경고', () => {
    const r = rec({
      id: 'x',
      kind: '출석인정',
      reason: '체험학습',
      startDate: '2026-10-19',
      fieldTrip: { abroad: false, guardianAccompanied: true },
    });
    expect(warningsFor([r], '2026-10-15').get('x')).toBeUndefined();
    expect(warningsFor([r], '2026-10-16').get('x')?.[0]).toContain('신청서 기한');
  });

  it('체험학습 연간 20일 초과 시 경고 (반일 0.5일 포함)', () => {
    const trips = [
      rec({ startDate: '2026-04-06', endDate: '2026-04-17' }), // 10일
      rec({ startDate: '2026-05-11', endDate: '2026-05-22' }), // 10일
      rec({ id: 'half', status: '조퇴', startDate: '2026-06-01' }), // 0.5일
    ].map((r) => ({ ...r, kind: '출석인정' as const, reason: '체험학습' as const, fieldTrip: { abroad: false, guardianAccompanied: true } }));
    const trips2 = trips.map((r) => ({ ...r, docs: rebuildDocs([], r.status, r.kind, r.reason).map((d) => ({ ...d, received: true })) }));
    expect(fieldTripCumulative(trips2, hol).get('half')).toBe(20.5);
    expect(warningsFor(trips2).get('half')).toEqual(['연간 체험학습 20일을 초과합니다 (누적 20.5일).']);
  });

  it('결석이 다른 기록과 겹치면 경고, 지각·조퇴끼리는 괜찮음', () => {
    const a = rec({ id: 'a', status: '지각', startDate: '2026-10-13' });
    const b = rec({ id: 'b', status: '조퇴', startDate: '2026-10-13' });
    expect(warningsFor([a, b]).size).toBe(0);
    const c = rec({ id: 'c', status: '결석', startDate: '2026-10-12', endDate: '2026-10-14' });
    expect(warningsFor([a, c]).get('c')?.[0]).toContain('겹칩니다');
  });
});

describe('요약', () => {
  it('출석인정 결석일수는 총결석일수와 따로 센다', () => {
    const records = [
      rec({ kind: '질병', startDate: '2026-10-05', endDate: '2026-10-06' }),
      rec({ kind: '미인정', startDate: '2026-10-07' }),
      rec({ kind: '출석인정', reason: '공문', startDate: '2026-10-08', endDate: '2026-10-12' }), // 10/9 공휴일, 주말 제외 → 2일
      rec({ kind: '질병', status: '지각', startDate: '2026-10-13' }),
    ];
    const [s] = summarize([{ id: 's1', number: 1, name: '가' }], records, hol, new Map(), '2026-03-01', '2027-02-28', '2027-02-28');
    expect(s.absenceDays).toBe(3);
    expect(s.approvedAbsenceDays).toBe(2);
    expect(s.counts['지각']['질병']).toBe(1);
    expect(s.missingDocCount).toBe(4); // 질병결석 결석계·증빙 + 출석인정 결석계·공문
  });
});

describe('기본 공휴일', () => {
  it('2027년 목록이 월력요항 총계와 맞는다 (공휴일 24일, 일요일 겹침 4일, 토요일 겹침 5일)', () => {
    const y2027 = PUBLIC_HOLIDAYS.filter((h) => h.date.startsWith('2027'));
    expect(y2027).toHaveLength(76 - 52);
    expect(y2027.filter((h) => dayOfWeek(h.date) === 0)).toHaveLength(76 - 72);
    expect(y2027.filter((h) => dayOfWeek(h.date) === 6)).toHaveLength(124 - 119);
  });

  it('대체공휴일은 모두 평일', () => {
    for (const h of PUBLIC_HOLIDAYS.filter((h) => h.name.startsWith('대체'))) {
      expect([0, 6]).not.toContain(dayOfWeek(h.date));
    }
  });
});

describe('저장 데이터 변환', () => {
  it('v1 데이터의 질병 결석 증빙을 필수로 바꾼다', async () => {
    const { normalize } = await import('../storage/db');
    const v1 = {
      version: 1,
      students: [],
      holidays: [],
      settings: {},
      records: [
        rec({ id: 'a', kind: '질병', status: '결석', docs: [{ key: 'evidence:medical', label: '증빙', required: false, received: false }] }),
        rec({ id: 'b', kind: '질병', status: '지각', docs: [{ key: 'evidence:medical', label: '증빙', required: false, received: false }] }),
      ],
    };
    const s = normalize(v1);
    expect(s.version).toBe(2);
    expect(s.records[0].docs[0].required).toBe(true);
    expect(s.records[1].docs[0].required).toBe(false);
  });
});

describe('체험학습 사전 입력', () => {
  const trip = (p: Partial<AttendanceRecord>) =>
    rec({ kind: '출석인정', reason: '체험학습', fieldTrip: { abroad: false, guardianAccompanied: true }, ...p });

  it('미래 날짜는 통계에 넣지 않고 체험학습 예정 일수로 따로 센다', () => {
    // 10/13(화)~10/16(금) 중 오늘이 10/14 → 사용 2일, 예정 2일
    const r = trip({ startDate: '2026-10-13', endDate: '2026-10-16' });
    const [s] = summarize([{ id: 's1', number: 1, name: '가' }], [r], hol, new Map(), '2026-03-01', '2027-02-28', '2026-10-14');
    expect(s.fieldTripDays).toBe(2);
    expect(s.fieldTripPlanned).toBe(2);
    expect(s.fieldTripByPlace).toEqual({ 국내: { used: 2, planned: 2 }, 국외: { used: 0, planned: 0 } });
    expect(s.approvedAbsenceDays).toBe(2);
  });

  it('보고서는 접수 때부터 받을 서류로 잡힌다', () => {
    const r = trip({ startDate: '2026-10-19', endDate: '2026-10-20' });
    expect(missingDocs(r).map((d) => d.key)).toEqual([DOC_FT_APPLICATION, DOC_FT_REPORT]);
  });

  it('신청서 없이 실시되었거나 기한 후 접수면 미인정 대상 경고', () => {
    const none = trip({ id: 'n', startDate: '2026-10-13' });
    expect(warningsFor([none], '2026-10-13').get('n')?.[0]).toContain('신청서 없이 실시');
    const late = trip({ id: 'l', startDate: '2026-10-19' });
    late.docs = late.docs.map((d) => (d.key === DOC_FT_APPLICATION ? { ...d, received: true, receivedDate: '2026-10-16' } : d));
    expect(warningsFor([late], '2026-10-16').get('l')?.[0]).toContain('미인정 처리 대상');
  });
});

describe('체험학습 1.5일·2.5일', () => {
  const trip = (p: Partial<AttendanceRecord>) =>
    rec({ kind: '출석인정', reason: '체험학습', status: '결석', ...p });

  it('첫날 오후부터 + 다음 날 종일 = 1.5일, 첫날은 인정조퇴', () => {
    const r = trip({ startDate: '2026-10-15', endDate: '2026-10-16', fieldTrip: { abroad: false, guardianAccompanied: true, startPM: true } });
    expect(fieldTripDays(r, hol)).toBe(1.5);
    expect(statusOn(r, '2026-10-15')).toBe('조퇴');
    expect(statusOn(r, '2026-10-16')).toBe('결석');
    const [s] = summarize([{ id: 's1', number: 1, name: '가' }], [r], hol, new Map(), '2026-03-01', '2027-02-28', '2026-12-31');
    expect(s.counts['결석']['출석인정']).toBe(1);
    expect(s.counts['조퇴']['출석인정']).toBe(1);
    expect(s.approvedAbsenceDays).toBe(1);
  });

  it('첫날 오후부터 ~ 마지막 날 오전까지, 사이 이틀 종일 = 3일', () => {
    // 10/13(화) 오후 ~ 10/16(금) 오전
    const r = trip({ startDate: '2026-10-13', endDate: '2026-10-16', fieldTrip: { abroad: false, guardianAccompanied: true, startPM: true, endAM: true } });
    expect(fieldTripDays(r, hol)).toBe(3);
    expect(statusOn(r, '2026-10-16')).toBe('지각');
  });

  it('하루짜리 기록에서는 반일 표시를 무시한다', () => {
    const r = trip({ startDate: '2026-10-15', fieldTrip: { abroad: false, guardianAccompanied: true, startPM: true } });
    expect(fieldTripDays(r, hol)).toBe(1);
  });
});
