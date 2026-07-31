import type { ISODateString } from "@/lib/types";

/**
 * 월간 캘린더 격자 순수 함수 — Task 021A(FR-061, `MonthCalendar`). React·`lib/data` 어디에도
 * 의존하지 않는다 — `MonthCalendarContainer`(실 데이터)와 `/sample`의 `calendar.tsx`(표현
 * 전용 구역, `@/lib/data` import가 금지된다 — `docs/CONVENTIONS.md` zone 4)가 같은 격자
 * 생성 로직을 공유해야 하기 때문이다. 날짜 계산은 전부 **UTC** 기준이다 — Mock 시드
 * (`src/lib/data/mock/seed/time.ts`의 `SEED_NOW`)도 UTC 자정 기준 `ISODateString`이고,
 * 로컬 타임존으로 계산하면 서버 타임존에 따라 하루가 밀릴 수 있다.
 */

export interface BareCalendarDay {
  /** YYYY-MM-DD (UTC). */
  iso: ISODateString;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

const DAYS_PER_WEEK = 7;
/** 6주 고정 — 그 달이 4주로 끝나든 6주로 걸치든 격자 높이가 흔들리지 않는다. */
const WEEKS_PER_GRID = 6;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatIsoDate(year: number, month: number, day: number): ISODateString {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** UTC 기준 오늘의 `{year, month}`(month는 1-based) — `?month=` 파라미터가 없을 때 기본값. */
export function currentYearMonthUtc(now: Date): { year: number; month: number } {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

export function todayIsoUtc(now: Date): ISODateString {
  return formatIsoDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

/**
 * `?month=YYYY-MM` 쿼리 파라미터를 파싱한다(Next.js 16 — 호출부가 이미 `await searchParams`
 * 했다는 전제). 형식이 다르거나 월이 범위를 벗어나면 `fallback`(보통 오늘)으로 되돌아간다 —
 * 잘못된 쿼리 문자열이 오류 화면을 띄우지 않고 조용히 안전한 기본값으로 복구된다.
 */
export function parseMonthParam(
  param: string | undefined,
  fallback: { year: number; month: number },
): { year: number; month: number } {
  if (!param) return fallback;
  const match = /^(\d{4})-(\d{2})$/.exec(param);
  if (!match) return fallback;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return fallback;
  return { year, month };
}

export function formatMonthParam(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

/** 월 이동(이전/다음 달 링크). `delta`는 음수(이전)·양수(다음) 모두 받는다. */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

/** 월간 뷰 조회 구간(양끝 포함) — `listMeetupsByCrews`의 `from`/`to` 인자로 그대로 쓴다. */
export function getMonthRangeIso(
  year: number,
  month: number,
): { from: ISODateString; to: ISODateString } {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: formatIsoDate(year, month, 1),
    to: formatIsoDate(year, month, daysInMonth),
  };
}

/**
 * 6주(42칸) 고정 격자를 만든다 — 일요일 시작. 앞뒤 달의 날짜도 채워 항상 42칸을 반환한다
 * (`isCurrentMonth: false`로 표시). 컨테이너가 이 배열에 `bars`/`overflowCount`를 덧붙여
 * `MonthCalendar`에 넘긴다 — 이 함수 자체는 Meetup을 전혀 모른다(날짜 격자 계산만 한다).
 */
export function buildMonthWeeks(
  year: number,
  month: number,
  todayIso?: ISODateString,
): BareCalendarDay[][] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sunday
  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(firstOfMonth.getUTCDate() - startWeekday);

  const days: BareCalendarDay[] = [];
  for (let i = 0; i < DAYS_PER_WEEK * WEEKS_PER_GRID; i++) {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    const iso = formatIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    days.push({
      iso,
      day: d.getUTCDate(),
      isCurrentMonth: d.getUTCMonth() + 1 === month && d.getUTCFullYear() === year,
      isToday: todayIso !== undefined && iso === todayIso,
    });
  }

  const weeks: BareCalendarDay[][] = [];
  for (let w = 0; w < WEEKS_PER_GRID; w++) {
    weeks.push(days.slice(w * DAYS_PER_WEEK, w * DAYS_PER_WEEK + DAYS_PER_WEEK));
  }
  return weeks;
}

/**
 * 날짜 셀 `aria-label`에 쓰는 한글 날짜 문구(예: "8월 14일 금요일"). `Intl.DateTimeFormat`의
 * 산출물이라 `ko.ts` 하드코딩 금지 규칙(NFR-023) 대상이 아니다 — `lib/rules/poll-timezone.ts`가
 * 이미 같은 근거로 Intl을 직접 쓰는 전례다.
 */
export function formatDayLabelKo(iso: ISODateString): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
}

/**
 * 홈 대시보드 캘린더 요약(Task 021B, PRD "홈 대시보드 캘린더 요약")에 쓰는 짧은 날짜 문구
 * (예: "8월 14일(금)") — `formatDayLabelKo`의 전체 문구("8월 14일 금요일")보다 좁은 폭에
 * 맞춘다. 별도 `Intl.DateTimeFormat` 호출 없이 `formatDayLabelKo`가 이미 계산한 요일을
 * 재사용한다 — 요일 계산 로직을 두 곳에 두지 않는다.
 */
export function formatShortDayLabelKo(iso: ISODateString): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekdayShort = new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
  return `${m}월 ${d}일(${weekdayShort})`;
}

/**
 * `Meetup.startTime`("HH:MM" 24시간제, `generate-meetups.ts`의 `START_TIMES` 시드 형식)을
 * "오전/오후 h:mm"로 바꾼다. 타임존 변환이 필요 없는 순수 문자열 가공이라(시각 자체가 이미
 * 크루 로컬 표기) `Intl.DateTimeFormat`을 쓰지 않고 직접 계산한다 — `poll-timezone.ts`가
 * 실제 시각 계산에 `Intl`을 쓰는 것과는 다른 종류의 문제(여기는 타임존 변환이 아니라 표기
 * 변환뿐)다. `null`(시각 미정)은 그대로 `null`을 돌려준다 — 호출부가 "시각 미정" 문구를 낸다.
 */
export function formatStartTimeKo(startTime: string | null): string | null {
  if (!startTime) return null;
  const [hourStr, minuteStr] = startTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour < 12 ? "오전" : "오후";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${hour12}:${String(minute).padStart(2, "0")}`;
}

// ---- 기간(다일) 모임 표시 (2026-07-31) --------------------------------------
//
// 아래 세 함수의 구분자 "~"와 "일간" 같은 조각은 위 `formatShortDayLabelKo`가 이미 "월"·"일"을
// 직접 쓰는 것과 같은 자리에 있다(Intl 산출물에 인접한 날짜 표기 가공) — `ko.ts` 하드코딩
// 금지(NFR-023)의 대상은 화면 문구이고, 여기는 날짜 포맷터다. 새 문구가 필요해지면(예: "종일")
// 그것은 `ko.ts`로 간다.

/** 시작일 ≠ 종료일이면 기간(다일) 모임이다. `endDate`는 non-null 규약(`Meetup.endDate`)이지만
 *  방어적으로 빈 값도 하루짜리로 본다. */
export function isMultiDayMeetup(startIso: ISODateString, endIso: ISODateString | null): boolean {
  return Boolean(endIso) && endIso !== startIso;
}

/** 며칠에 걸치는지(양끝 포함). 하루짜리면 1. */
export function countMeetupDays(startIso: ISODateString, endIso: ISODateString | null): number {
  if (!isMultiDayMeetup(startIso, endIso)) return 1;
  const MS_PER_DAY = 86_400_000;
  const diff = Date.parse(`${endIso}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`);
  return Math.max(1, Math.round(diff / MS_PER_DAY) + 1);
}

/**
 * 시작일부터 종료일까지의 ISO 날짜를 **양끝 포함**으로 전개한다. 하루짜리면 원소 1개.
 *
 * 기간 모임을 "걸치는 날짜마다" 인덱싱해야 하는 곳(`MonthCalendarContainer`의 날짜별 상세
 * 패널)이 쓴다. 종료일이 시작일보다 앞서는 비정상 입력은 시작일 하루만 돌려준다 — 목록 화면이
 * 잘못된 데이터 하나 때문에 빈 배열이나 무한 루프로 무너지지 않게 하는 방어다.
 */
export function eachDateIso(
  startIso: ISODateString,
  endIso: ISODateString | null,
): ISODateString[] {
  if (!isMultiDayMeetup(startIso, endIso) || endIso! < startIso) return [startIso];
  const result: ISODateString[] = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const last = Date.parse(`${endIso}T00:00:00Z`);
  while (cursor.getTime() <= last) {
    result.push(
      formatIsoDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()),
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

/** 상세 화면용 날짜 문구 — 하루짜리면 {@link formatDayLabelKo}와 같은 결과다. */
export function formatDateRangeLabelKo(
  startIso: ISODateString,
  endIso: ISODateString | null,
): string {
  if (!isMultiDayMeetup(startIso, endIso)) return formatDayLabelKo(startIso);
  return `${formatDayLabelKo(startIso)} ~ ${formatDayLabelKo(endIso!)}`;
}

/** 목록·요약용 짧은 날짜 문구 — 하루짜리면 {@link formatShortDayLabelKo}와 같은 결과다. */
export function formatShortDateRangeLabelKo(
  startIso: ISODateString,
  endIso: ISODateString | null,
): string {
  if (!isMultiDayMeetup(startIso, endIso)) return formatShortDayLabelKo(startIso);
  return `${formatShortDayLabelKo(startIso)} ~ ${formatShortDayLabelKo(endIso!)}`;
}

/**
 * 시각 문구 — 시작만 있으면 "오전 7:00", 둘 다 있으면 "오전 7:00 ~ 오전 9:00".
 * 시작 시각이 없으면 종료 시각도 표시하지 않는다(`null`) — 데이터 계약상 그 조합은
 * 만들어질 수 없고(DB CHECK), 만에 하나 들어와도 "언제부터인지 모르는 종료 시각"은
 * 사용자에게 의미가 없다.
 */
export function formatTimeRangeKo(
  startTime: string | null,
  endTime: string | null,
): string | null {
  const start = formatStartTimeKo(startTime);
  if (!start) return null;
  const end = formatStartTimeKo(endTime);
  return end ? `${start} ~ ${end}` : start;
}
