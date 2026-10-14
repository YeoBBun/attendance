import { useMemo, useState } from 'react';
import { addDays, dayOfWeek, formatKo, isSchoolDay, isWeekend, monthKey, today } from '../domain/calendar';
import { statusOn } from '../domain/rules';
import type { AttendanceRecord, HolidayType } from '../domain/types';
import { useStore } from '../store';
import { kindClass, KIND_SHORT, Modal } from './common';
import { RecordForm } from './RecordForm';
import { RecordItem } from './RecordItem';
import { Icon } from './icons';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function CalendarView() {
  const { state, holidays } = useStore();
  const [month, setMonth] = useState(() => monthKey(today()));
  const [openDay, setOpenDay] = useState<string | null>(null);

  const cells = useMemo(() => {
    const first = `${month}-01`;
    const start = addDays(first, -dayOfWeek(first));
    const days: string[] = [];
    for (let d = start; days.length < 42; d = addDays(d, 1)) days.push(d);
    // 마지막 주가 다음 달뿐이면 잘라낸다.
    while (days.length > 28 && monthKey(days[days.length - 7]) !== month) days.splice(-7);
    return days;
  }, [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, AttendanceRecord[]>();
    for (const r of state.records) {
      for (let d = r.startDate; d <= r.endDate; d = addDays(d, 1)) {
        if (r.status === '결석' && !isSchoolDay(d, holidays)) continue;
        const list = map.get(d) ?? [];
        list.push(r);
        map.set(d, list);
      }
    }
    return map;
  }, [state.records, holidays]);

  const studentName = (id: string) => state.students.find((s) => s.id === id)?.name ?? '?';
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    const dt = new Date(y, m - 1 + n, 1);
    setMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  };
  const now = today();

  return (
    <div>
      <div className="toolbar">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="이전 달">
          <Icon name="left" />
        </button>
        <strong className="month-title">
          {month.slice(0, 4)}년 {Number(month.slice(5))}월
        </strong>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="다음 달">
          <Icon name="right" />
        </button>
        <button className="pill" onClick={() => setMonth(monthKey(now))}>
          이번 달
        </button>
        <span className="hint">날짜를 누르면 출결 추가·재량휴업일 지정을 할 수 있어요.</span>
      </div>
      <div className="calendar">
        {WEEK.map((w, i) => (
          <div key={w} className={`cal-head${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const holiday = holidays.get(d);
          const recs = byDay.get(d) ?? [];
          const cls = [
            'cal-cell',
            monthKey(d) !== month && 'other',
            (isWeekend(d) || holiday) && 'off',
            d === now && 'today',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button key={d} className={cls} onClick={() => setOpenDay(d)}>
              <span className={`cal-day${dayOfWeek(d) === 0 || holiday?.type === '공휴일' ? ' sun' : ''}`}>
                {Number(d.slice(8))}
              </span>
              {holiday && <span className={`holiday ${holiday.type === '재량휴업일' ? 'disc' : ''}`}>{holiday.name}</span>}
              {recs.slice(0, 4).map((r) => (
                <span key={r.id} className={`cal-rec ${kindClass(r.kind)}`}>
                  {studentName(r.studentId)} {r.kind === '출석인정' && r.reason ? r.reason : KIND_SHORT[r.kind]} {statusOn(r, d)}
                </span>
              ))}
              {recs.length > 4 && <span className="more">+{recs.length - 4}</span>}
            </button>
          );
        })}
      </div>
      {openDay && <DayDialog date={openDay} records={byDay.get(openDay) ?? []} onClose={() => setOpenDay(null)} />}
    </div>
  );
}

function DayDialog({ date, records, onClose }: { date: string; records: AttendanceRecord[]; onClose: () => void }) {
  const { update, holidays } = useStore();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [name, setName] = useState('');
  const holiday = holidays.get(date);

  const setHoliday = (type: HolidayType) =>
    update((s) => ({
      ...s,
      holidays: [...s.holidays.filter((h) => h.date !== date), { date, type, name: name.trim() || type }].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    }));
  const clearHoliday = () => update((s) => ({ ...s, holidays: s.holidays.filter((h) => h.date !== date) }));

  return (
    <Modal title={formatKo(date)} onClose={onClose}>
      <section className="day-holiday">
        {holiday ? (
          <p>
            <b>{holiday.type}</b>: {holiday.name}{' '}
            <button className="small" onClick={clearHoliday}>
              해제
            </button>
          </p>
        ) : isWeekend(date) ? (
          <p className="muted">주말</p>
        ) : (
          <div className="inline">
            <input value={name} placeholder="이름 (예: 개교기념일)" onChange={(e) => setName(e.target.value)} />
            <button className="small" onClick={() => setHoliday('재량휴업일')}>
              재량휴업일 지정
            </button>
            <button className="small" onClick={() => setHoliday('공휴일')}>
              공휴일 지정
            </button>
          </div>
        )}
      </section>
      <div className="toolbar">
        <strong>출결 {records.length}건</strong>
        <span className="spacer" />
        <button className="primary" onClick={() => setAdding(true)}>
          + 출결 추가
        </button>
      </div>
      <ul className="records">
        {records.map((r) => (
          <RecordItem key={r.id} record={r} showStudent onEdit={() => setEditing(r)} />
        ))}
      </ul>
      {adding && <RecordForm defaultDate={date} onClose={() => setAdding(false)} />}
      {editing && <RecordForm initial={editing} onClose={() => setEditing(null)} />}
    </Modal>
  );
}
