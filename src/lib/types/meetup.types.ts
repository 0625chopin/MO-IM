import type { Id, ISODateString, ISODateTimeString } from "./common.types";

/** D-034 — 별도 'scheduled' 중간 상태를 두지 않는다. 투표 가결로 생성되면 즉시 confirmed. */
export type MeetupStatus = "confirmed" | "cancelled";

export interface Meetup {
  id: Id;
  crewId: Id;
  pollId: Id;
  /** 제목·설명. FR-064 AC1의 상세 표시 요구로 PRD §7에 복구된 필드(D-035). */
  title: string;
  description: string | null;
  date: ISODateString;
  startTime: string | null;
  place: string | null;
  /** 정원(선택, D-013). null이면 정원 제한 없음 — 조건부 UPDATE 판정을 거치지 않는다. */
  capacity: number | null;
  /** 참석 확정 인원. `attendingCount < capacity` 조건부 UPDATE로 원자성을 보장한다(D-019). */
  attendingCount: number;
  status: MeetupStatus;
  createdAt: ISODateTimeString;
}

export type AttendanceStatus = "attending" | "absent";

/**
 * D-013 신규 엔티티. UNIQUE(meetupId, profileId)는 FR-067 E2 멱등성(upsert)의
 * 전제다(D-019) — 스키마 제약이며 이 타입 자체가 강제하지는 않는다.
 */
export interface MeetupAttendance {
  meetupId: Id;
  profileId: Id;
  status: AttendanceStatus;
  respondedAt: ISODateTimeString;
}

/**
 * 참석/불참 응답 처리 결과. `Meetup.capacity`가 null(정원 없음)이면 이 타입을 거치지
 * 않고 바로 성공 처리한다 — 호출부(데이터 접근 레이어)의 책임.
 *
 * - `success: false, reason: "full"` — 정원 조건부 UPDATE(D-019) 판정에 의한 **실제
 *   실패**(FR-066 E1·E2, AC1·AC2).
 * - `success: false, reason: "forbidden"` — 크루원이 아닌데도 호출된 경우(Task 032
 *   교차검증 major 1 수정, 18일차). Server Action이 호출 전에 이미 활성 멤버십을
 *   확인하므로 정상 UI 흐름에서는 도달하지 않는다 — publishable key로 RPC를 직접
 *   호출하는 경로(TOCTOU 포함)에 대한 데이터 레이어의 2차 방어선이다.
 * - `success: true, changed: false` — 이미 같은 상태로 응답한 요청을 멱등 처리한
 *   결과(예: 이미 "불참"인데 다시 "불참" 요청). FR-067 E2 "이미 불참 상태 → 무시
 *   (멱등)"가 이를 실패가 아니라 조용한 성공으로 요구하므로 `success: false`로
 *   표현하지 않는다 — 이전 `reason: "already_responded"`는 이 요구와 충돌해 제거했다.
 *   `unique(meetupId, profileId)` 제약이 이 멱등 처리(upsert)의 전제다(D-019).
 * - `success: true, changed: true` — 실제로 상태가 바뀐 정상 처리.
 */
export type AttendanceJoinResult =
  | { success: true; changed: boolean }
  | { success: false; reason: "full" | "forbidden" };
