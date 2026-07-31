import {
  isMeetupAttendanceOpen,
  isMeetupFull,
} from "@/lib/rules/meetup-attendance-eligibility";
import type { AttendanceStatus, ISODateString, Meetup } from "@/lib/types";

/**
 * Meetup 상세의 "참석/불참 버튼 상태 기계" — 순수 함수(NFR-036, R-015, Task 022). 크루 홈의
 * `resolveJoinRequestButtonState`(`join-request-button-state.ts`)와 같은 자리 — 컨테이너가
 * Meetup·오늘 날짜·조회자의 현재 응답을 조합해 이 함수를 호출하고, 표현 컴포넌트
 * (`MeetupAttendanceActions`)는 `kind`만 보고 어떤 버튼을 그릴지 고른다. 판정을 컴포넌트에
 * 인라인하지 않는다.
 *
 * 크루원 여부 자체는 여기서 판정하지 않는다 — `MeetupDetailContainer`가 이미 그 관문을
 * 통과한 뒤에만(비소속이면 403으로 먼저 걸린다, FR-064 AC2) 이 함수를 호출하므로 입력에
 * "크루원인가"가 없다.
 */
export type MeetupAttendanceButtonState =
  /** FR-066 E4 — 취소된 Meetup, 응답 불가. */
  | { kind: "cancelled" }
  /** FR-066 E3 — 예정일 경과, 응답 변경 불가(읽기 전용). */
  | { kind: "closed" }
  /** 조회자가 이미 참석 중 — "불참"으로 전환 가능(FR-067, 정원과 무관하게 항상 가능). */
  | { kind: "attending" }
  /** 조회자가 불참/미응답이고 정원이 이미 찼다 — FR-066 E1, 참석 버튼 비활성. */
  | { kind: "full" }
  /** 조회자가 불참/미응답이고 참석 가능. */
  | { kind: "open" };

export interface MeetupAttendanceButtonStateInput {
  // `date`가 아니라 `endDate`를 받는다 — 참석 응답 마감 판정(`isMeetupAttendanceOpen`)이
  // 기간 모임의 마지막 날을 기준으로 하기 때문이다(다일 모임 지원, 2026-07-31).
  meetup: Pick<Meetup, "status" | "endDate" | "capacity" | "attendingCount">;
  todayIso: ISODateString;
  /** 조회자 본인의 현재 응답. 아직 응답하지 않았으면 `null`. */
  viewerAttendanceStatus: AttendanceStatus | null;
}

export function resolveMeetupAttendanceButtonState(
  input: MeetupAttendanceButtonStateInput,
): MeetupAttendanceButtonState {
  const { meetup, todayIso, viewerAttendanceStatus } = input;

  if (meetup.status === "cancelled") {
    return { kind: "cancelled" };
  }
  if (!isMeetupAttendanceOpen(meetup, todayIso)) {
    return { kind: "closed" };
  }
  if (viewerAttendanceStatus === "attending") {
    return { kind: "attending" };
  }
  if (isMeetupFull(meetup)) {
    return { kind: "full" };
  }
  return { kind: "open" };
}
