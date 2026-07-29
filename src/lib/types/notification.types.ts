import type { Id, ISODateTimeString } from "./common.types";

/**
 * FR-070 "대상 이벤트" 목록과 1:1 대응. `post_commented`는 Comment(v0.2)에
 * 의존하는 이벤트라 v0.1에서는 발생하지 않지만, 타입은 지금 확정해 둔다.
 *
 * `ownership_transferred`·`crew_disbanded`는 Task 040(크루 생애주기, FR-025·FR-013)이
 * 추가했다 — 원문 FR-070 목록에는 없지만 D-030 정상 흐름이 "양측 알림"·"전 크루원에게 알림"을
 * 명시해 필요했다.
 *
 * `poll_withdrawn`은 Task 044(FR-046 AC1, 제안 철회)가 추가했다 — 제안자·임원·오너가 진행 중
 * 투표를 철회하면 대상자 전원에게 이 유형으로 알림이 간다(`poll_closed`와는 구분되는 값 —
 * 판정 없이 취소됐다는 사실 자체가 다른 정보다).
 */
export type NotificationType =
  | "poll_closed"
  | "join_request_received"
  | "join_request_approved"
  | "join_request_rejected"
  | "invitation_received"
  | "staff_appointed"
  | "member_removed"
  | "meetup_created"
  | "meetup_cancelled"
  | "post_commented"
  | "ownership_transferred"
  | "crew_disbanded"
  | "poll_withdrawn";

/**
 * 채널 추상화(NFR-038). v0.1에서 실제로 발송하는 채널은 `in_app`뿐이며
 * `web_push`·`native_push`는 차기 발송 어댑터를 위한 자리다(FR-073 AC1·AC2 —
 * 어댑터 추가 시 알림 생성 지점의 코드 변경이 없어야 한다).
 */
export type NotificationChannel = "in_app" | "web_push" | "native_push";

export interface Notification {
  id: Id;
  recipientId: Id;
  type: NotificationType;
  channel: NotificationChannel;
  /** 알림 유형별로 형태가 다른 페이로드 — 라우팅·표시에 필요한 최소 정보만 담는다. */
  payload: Record<string, unknown>;
  readAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
}

/** FR-072, v1.0 대상 — 모델만 선반영. */
export interface NotificationPreference {
  profileId: Id;
  type: NotificationType;
  /** null이면 전역 설정(모든 크루), 값이 있으면 해당 크루에서만 끈다. */
  crewId: Id | null;
  enabled: boolean;
}

/** FR-073, 차기(v1.0+) — 이번 릴리스에서 테이블을 만들지 않고 타입 자리만 확보한다. */
export interface DevicePushToken {
  profileId: Id;
  /** 값 집합 미확정(원본 문서에 정의 없음) — 발송 어댑터 도입 시점에 확정한다. */
  platform: string;
  token: string;
}
