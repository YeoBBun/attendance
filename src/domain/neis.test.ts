import { describe, expect, it } from 'vitest';
import { indexHolidays } from './calendar';
import { buildNeisFile } from './neis';
import { rebuildDocs } from './rules';
import type { AttendanceRecord } from './types';

const hol = indexHolidays([{ date: '2026-10-09', name: '한글날', type: '공휴일' }]);
const students = [
  { id: 'a', number: 7, name: '박지우' },
  { id: 'b', number: 2, name: '김철수' },
];

function rec(p: Partial<AttendanceRecord>): AttendanceRecord {
  const status = p.status ?? '결석';
  const kind = p.kind ?? '질병';
  const startDate = p.startDate ?? '2026-10-13';
  return { id: Math.random().toString(), studentId: 'a', status, kind, startDate, endDate: p.endDate ?? startDate, memo: '', docs: rebuildDocs([], status, kind), ...p };
}

describe('나이스 내보내기', () => {
  it('결석 기간을 수업일마다 한 줄로 풀고 주말·공휴일은 뺀다', () => {
    const f = buildNeisFile(students, [rec({ startDate: '2026-10-08', endDate: '2026-10-12' })], hol, '2026-10-01', '2026-10-31');
    expect(f.records.map((r) => r.date)).toEqual(['2026-10-08', '2026-10-12']);
    expect(f.records[0]).toMatchObject({ number: 7, name: '박지우', att_type: '질병결석', note: '' });
  });

  it('지각·조퇴는 키트 교시 표기로', () => {
    const f = buildNeisFile(
      students,
      [
        rec({ status: '지각', kind: '미인정', lateUntil: 2 }),
        rec({ studentId: 'b', status: '조퇴', leaveFrom: 5 }),
        rec({ status: '지각', kind: '질병', startDate: '2026-10-14', lateUntil: 0 }),
      ],
      hol,
      '2026-10-01',
      '2026-10-31',
    );
    expect(f.records.map((r) => [r.date, r.number, r.att_type, r.note])).toEqual([
      ['2026-10-13', 2, '질병조퇴', '5교시~'],
      ['2026-10-13', 7, '미인정지각', '~2교시'],
      ['2026-10-14', 7, '질병지각', '조회'],
    ]);
  });

  it('체험학습 첫날 오후부터는 출석인정조퇴, 나머지는 출석인정결석', () => {
    const r = rec({
      kind: '출석인정',
      reason: '체험학습',
      startDate: '2026-10-14',
      endDate: '2026-10-15',
      leaveFrom: 5,
      fieldTrip: { abroad: false, guardianAccompanied: true, startPM: true },
    });
    const f = buildNeisFile(students, [r], hol, '2026-10-01', '2026-10-31');
    expect(f.records.map((x) => [x.date, x.att_type, x.note])).toEqual([
      ['2026-10-14', '출석인정조퇴', '5교시~'],
      ['2026-10-15', '출석인정결석', ''],
    ]);
  });

  it('결과와 교시 없는 지각은 skipped 로 빼고, 기간 밖은 넣지 않는다', () => {
    const f = buildNeisFile(
      students,
      [rec({ status: '결과', periods: [3] }), rec({ status: '지각' }), rec({ startDate: '2026-11-02' })],
      hol,
      '2026-10-01',
      '2026-10-31',
    );
    expect(f.records).toEqual([]);
    expect(f.skipped.map((s) => s.label)).toEqual(['질병결과 (3교시)', '질병지각']);
  });
});
