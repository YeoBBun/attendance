/** 날짜는 모두 'YYYY-MM-DD' 문자열로 다룬다. */
export type DateStr = string;

export const STATUSES = ['결석', '지각', '조퇴', '결과'] as const;
export type Status = (typeof STATUSES)[number];

export const KINDS = ['출석인정', '질병', '미인정', '기타'] as const;
export type Kind = (typeof KINDS)[number];

/** 출석인정 세부 사유 */
export const APPROVED_REASONS = ['법정감염병', '체험학습', '경조사', '생리', '공문'] as const;
export type ApprovedReason = (typeof APPROVED_REASONS)[number];

export interface Student {
  id: string;
  number: number;
  name: string;
}

export type HolidayType = '공휴일' | '재량휴업일';

export interface Holiday {
  date: DateStr;
  name: string;
  type: HolidayType;
}

export interface DocItem {
  /** 같은 서류를 식별하는 키. 출결 종류를 바꿔 서류 목록을 다시 만들 때 받은 상태를 유지하는 데 쓴다. */
  key: string;
  label: string;
  required: boolean;
  received: boolean;
  receivedDate?: DateStr;
}

export interface IllnessInfo {
  /** 질병명 (독감, 코로나19 등) */
  disease: string;
  /** 의사 소견서에 적힌 출석인정 기간 */
  certStart?: DateStr;
  certEnd?: DateStr;
}

export interface FieldTripInfo {
  abroad: boolean;
  guardianAccompanied: boolean;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  status: Status;
  kind: Kind;
  /** kind === '출석인정' 일 때만 */
  reason?: ApprovedReason;
  startDate: DateStr;
  /** 결석은 기간 입력 가능. 지각·조퇴·결과는 startDate 와 같다. */
  endDate: DateStr;
  /** 결과일 때 해당 교시 */
  periods?: number[];
  illness?: IllnessInfo;
  fieldTrip?: FieldTripInfo;
  docs: DocItem[];
  memo: string;
}

export type DeadlineBasis = 'school' | 'calendar';

export interface Settings {
  className: string;
  /** 체험학습 신청서: 실시 N일 전까지 */
  applicationDaysBefore: number;
  applicationBasis: DeadlineBasis;
  /** 체험학습 보고서: 종료 후 N일 이내 */
  reportDaysAfter: number;
  reportBasis: DeadlineBasis;
  /** 국외 체험학습 1회 최대 일수 */
  abroadMaxDays: number;
  /** 체험학습 연간 최대 일수 */
  fieldTripYearlyMax: number;
  lastBackupAt?: string;
}

export interface AppState {
  version: 1;
  students: Student[];
  records: AttendanceRecord[];
  holidays: Holiday[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  className: '',
  applicationDaysBefore: 2,
  applicationBasis: 'school',
  reportDaysAfter: 7,
  reportBasis: 'calendar',
  abroadMaxDays: 10,
  fieldTripYearlyMax: 20,
};

export function emptyState(): AppState {
  return { version: 1, students: [], records: [], holidays: [], settings: { ...DEFAULT_SETTINGS } };
}
