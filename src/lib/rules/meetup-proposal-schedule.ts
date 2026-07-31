import type { ISODateString, ISODateTimeString } from "@/lib/types/common.types";

import {
  isPollClosingBeforeMeetupDate,
  isPollExpired,
  toZonedDateString,
  validatePollDuration,
} from "./poll-timezone";

/**
 * 모임 제안글 날짜 검증 — 순수 함수 (NFR-036, R-015, Task 018B, D-013).
 *
 * FR-034 예외 흐름 E1~E3(AC2·AC3)의 판정을 조립한다. **타임존 경계 처리를 새로 만들지
 * 않는다** — Task 009A가 만든 `poll-timezone.ts`의 `isPollExpired`(E3 — 마감이 이미
 * 과거)·`isPollClosingBeforeMeetupDate`(E2 — 마감이 예정일 이전이어야 한다, D-003
 * 원문 그대로)·`toZonedDateString`(E1 — "오늘" 판정)·`validatePollDuration`(D-003 투표
 * 기한 허용 범위 1시간~14일 — FR-034 E1~E3에는 명시되어 있지 않지만, 모임 제안글 등록이
 * Poll을 만드는 유일한 경로(FR-040 "행위자: 시스템, FR-034에 종속")라 이 지점 말고는
 * 이 규칙을 강제할 곳이 없다) 그대로를 조립만 한다.
 *
 * v0.1은 한국 단독 시장이고(D-011) `Profile`에 사용자별 타임존 필드가 없어(2026-07-24
 * 시점 스키마 확인), "오늘"·"과거" 판정 기준 타임존을 고정값 `Asia/Seoul`(KST)로 둔다 —
 * NFR-025가 교차 검증 대상으로 요구하는 3개 타임존(UTC·KST·UTC-8) 중 실제 서비스
 * 타임존이다. 사용자별 타임존이 나중에 생기면 `timeZone` 인자를 그 값으로 바꿔 호출하면
 * 된다 — 이 함수 자체는 고정값을 강제하지 않는다(선택적 인자, 기본값만 KST).
 *
 * React·Next·데이터 레이어를 import하지 않는다(zone 1, `eslint.config.mjs`).
 *
 * **기간 모임(다일) 검증(2026-07-31)** — 모임이 하루로 끝나지 않을 수 있게 되면서
 * `scheduledEndDate`·`endTime` 검증이 더해졌다. 이 둘은 **선택 입력**이라 비어 있으면
 * 위반이 아니다(비면 하루짜리 모임). 새로 도입한 값은 {@link MAX_MEETUP_DURATION_DAYS}
 * 하나뿐이고, 나머지 판정(종료일 >= 시작일, 같은 날이면 종료 시각 > 시작 시각, 종료 시각은
 * 시작 시각이 있을 때만)은 전부 DB CHECK와 1:1로 대응한다 — **여기서 통과한 입력은 DB에서
 * 거부되지 않아야 한다**는 것이 이 대응의 목적이다(DB가 던지면 사용자에게는 필드별 안내가
 * 아니라 알 수 없는 오류로 보인다). 투표 마감은 여전히 **시작일** 기준으로 판정한다
 * (D-003 "예정일 이전" — 기간 모임이라고 종료일까지 투표를 열어 두면 이미 시작한 모임의
 * 개최 여부를 정하게 된다).
 */

/** v0.1 고정 서비스 타임존(D-011). 사용자별 설정이 생기기 전까지의 기본값. */
export const MEETUP_PROPOSAL_TIME_ZONE = "Asia/Seoul";

/**
 * 모임 기간 상한(일). **요구사항에 명시된 값이 아니라 오타 방어선이다** — `2026-08-14`를
 * `2036-08-14`로 잘못 입력하면 캘린더 전 구간이 한 모임으로 덮인다. DB에도 같은 상한이
 * CHECK(`meetups_duration_days_check`·`posts_meetup_duration_days_check`)로 들어가 있으므로
 * **두 값은 함께 고쳐야 한다** — 여기만 늘리면 DB가 거부하고, DB만 늘리면 폼이 막는다.
 *
 * 시작일과 종료일이 같은 하루짜리는 기간 0일로 센다(즉 최대 31일에 걸친 모임까지 허용).
 */
export const MAX_MEETUP_DURATION_DAYS = 30;

export type MeetupProposalScheduleField =
  | "scheduledDate"
  | "scheduledEndDate"
  | "endTime"
  | "voteDeadline";

export type MeetupProposalScheduleReason =
  /** scheduledDate: FR-034 E1(예정일이 과거) / voteDeadline: E3(마감이 이미 과거). */
  | "in_past"
  /** voteDeadline: FR-034 E2·AC3 — 마감이 예정일 이후(D-003 "예정일 이전이어야 한다"). */
  | "after_schedule_date"
  /** voteDeadline: D-003 최소 투표 기간(1시간) 미달. */
  | "too_short"
  /** voteDeadline: D-003 최대 투표 기간(14일) 초과. */
  | "too_long"
  /** scheduledEndDate: 종료일이 시작일보다 앞. */
  | "before_schedule_date"
  /** scheduledEndDate: {@link MAX_MEETUP_DURATION_DAYS} 초과. */
  | "duration_too_long"
  /** endTime: 하루 안에 끝나는 모임인데 종료 시각이 시작 시각보다 앞이거나 같다. */
  | "before_start_time"
  /** endTime: 시작 시각 없이 종료 시각만 입력했다. */
  | "start_time_missing";

export interface MeetupProposalScheduleViolation {
  field: MeetupProposalScheduleField;
  reason: MeetupProposalScheduleReason;
}

export interface MeetupProposalScheduleInput {
  /** 모임 시작일. */
  scheduledDate: ISODateString;
  /**
   * 모임 종료일(선택). **비었으면 하루짜리 모임으로 본다** — 빈 문자열·undefined 둘 다
   * 미입력으로 취급한다(폼의 `<input type="date">`가 비어 있으면 `""`를 준다).
   */
  scheduledEndDate?: ISODateString | null;
  /** 모임 시작 시각 "HH:MM"(선택). 종료 시각 검증에만 쓴다. */
  startTime?: string | null;
  /** 모임 종료 시각 "HH:MM"(선택). */
  endTime?: string | null;
  /** 투표 마감 시각. */
  voteDeadline: ISODateTimeString;
  /** 판정 기준 "지금" — 순수 함수 유지를 위해 호출부가 넘긴다(Task 009A 원칙 그대로). */
  nowIso: ISODateTimeString;
  timeZone?: string;
}

/** ISO date 문자열 두 개의 일수 차(b - a). 둘 다 `YYYY-MM-DD`라고 가정한다. */
function diffDays(a: ISODateString, b: ISODateString): number {
  const MS_PER_DAY = 86_400_000;
  // UTC 자정으로 파싱해 DST·타임존 영향을 받지 않게 한다(날짜만 다루므로 충분하다).
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * 위반 목록을 반환한다(빈 배열이면 유효). **필드당 최우선 위반 하나만** 보고한다 —
 * 마감이 이미 과거면 "기간이 너무 짧다"(음수 duration)도 동시에 참이 되는 경우가 있어
 * 같은 필드에 원인이 다른 메시지를 동시에 띄우면 사용자가 무엇부터 고쳐야 할지
 * 혼란스럽다. 우선순위: in_past → after_schedule_date → too_short/too_long.
 */
export function validateMeetupProposalSchedule(
  input: MeetupProposalScheduleInput,
): MeetupProposalScheduleViolation[] {
  const timeZone = input.timeZone ?? MEETUP_PROPOSAL_TIME_ZONE;
  const violations: MeetupProposalScheduleViolation[] = [];

  const today = toZonedDateString(input.nowIso, timeZone);
  if (input.scheduledDate < today) {
    violations.push({ field: "scheduledDate", reason: "in_past" });
  }

  // 기간 모임(종료일 입력)의 검증. **종료일이 과거인지는 따로 보지 않는다** — 종료일이
  // 과거라면 시작일도 과거이므로(종료일 >= 시작일) 위의 `scheduledDate: in_past`가 이미
  // 잡는다. 여기서 새로 보는 것은 "시작일과의 관계"뿐이다.
  const scheduledEndDate = input.scheduledEndDate?.trim() ? input.scheduledEndDate.trim() : null;
  const isSingleDay = scheduledEndDate === null || scheduledEndDate === input.scheduledDate;
  if (scheduledEndDate !== null && !isSingleDay) {
    const spanDays = diffDays(input.scheduledDate, scheduledEndDate);
    if (Number.isNaN(spanDays) || spanDays < 0) {
      // 파싱 불가능한 값도 여기로 온다 — 어느 쪽이든 사용자가 고쳐야 하는 것은 종료일 입력이다.
      violations.push({ field: "scheduledEndDate", reason: "before_schedule_date" });
    } else if (spanDays > MAX_MEETUP_DURATION_DAYS) {
      violations.push({ field: "scheduledEndDate", reason: "duration_too_long" });
    }
  }

  const startTime = input.startTime?.trim() ? input.startTime.trim() : null;
  const endTime = input.endTime?.trim() ? input.endTime.trim() : null;
  if (endTime !== null) {
    if (startTime === null) {
      violations.push({ field: "endTime", reason: "start_time_missing" });
    } else if (isSingleDay && endTime <= startTime) {
      // 하루 안에 끝나는 모임에서만 역전을 따진다 — 날짜를 넘기면 "22:00 시작 → 다음 날
      // 02:00 종료"가 정상이라 문자열 비교로는 역전과 구분되지 않는다(DB CHECK
      // `meetups_same_day_time_order_check`도 같은 조건이다).
      violations.push({ field: "endTime", reason: "before_start_time" });
    }
  }

  // `voteDeadline`은 `toZonedDateString`(내부에서 `Intl.DateTimeFormat.format`을 쓴다)로
  // 넘어가는데, 파싱 불가능한 문자열(빈 값 포함)을 그 함수에 주면 `RangeError: Invalid time
  // value`로 **예외를 던진다**(Server Action은 페이지를 거치지 않고 직접 호출될 수 있어
  // 신뢰할 수 없는 입력이 들어올 수 있다 — 실측 확인함). `isPollExpired`(단순 epoch 비교)는
  // 이런 입력에도 조용히 `false`를 반환할 뿐 던지지 않지만, 그다음 분기에서 여전히
  // `toZonedDateString`을 타므로 이 함수 진입 시점에 먼저 걸러낸다.
  if (Number.isNaN(new Date(input.voteDeadline).getTime())) {
    violations.push({ field: "voteDeadline", reason: "in_past" });
  } else if (isPollExpired(input.voteDeadline, input.nowIso)) {
    violations.push({ field: "voteDeadline", reason: "in_past" });
  } else if (!isPollClosingBeforeMeetupDate(input.voteDeadline, input.scheduledDate, timeZone)) {
    violations.push({ field: "voteDeadline", reason: "after_schedule_date" });
  } else {
    const duration = validatePollDuration(input.nowIso, input.voteDeadline);
    if (!duration.valid) {
      violations.push({ field: "voteDeadline", reason: duration.reason });
    }
  }

  return violations;
}
