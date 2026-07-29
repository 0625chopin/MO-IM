import type { NotificationType } from "@/lib/types";

/**
 * FR-072 AC3 — "투표 종료·강퇴 알림은 끌 수 없다"(권리·의무에 영향을 주는 필수 알림). 이
 * 집합이 앱 레이어(Server Action)·DB 레벨(`notification_preferences_guard_mandatory_types`
 * 트리거, `docs/decisions/remaining-c-features-044.md` 참고) 양쪽에서 같은 판정을 쓴다 —
 * 마이그레이션의 SQL 리터럴과 이 값이 어긋나면 안 되므로 여기가 TS 쪽 단일 소스다(NFR-036).
 */
const MANDATORY_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set([
  "poll_closed",
  "member_removed",
]);

export function isNotificationTypeMandatory(type: NotificationType): boolean {
  return MANDATORY_NOTIFICATION_TYPES.has(type);
}

/**
 * `NotificationType`(13종) 전부를 키로 갖는 `Record` — 하나라도 빠지면 컴파일 에러로 잡는다
 * (`notification-routing.ts`의 `NOTIFICATION_ROUTE_RESOLVERS`와 같은 관용구, R-015). 값 자체는
 * 쓰지 않고 `Object.keys` 순회 대상으로만 쓴다.
 */
const NOTIFICATION_TYPE_EXHAUSTIVENESS_CHECK: Record<NotificationType, true> = {
  poll_closed: true,
  join_request_received: true,
  join_request_approved: true,
  join_request_rejected: true,
  invitation_received: true,
  staff_appointed: true,
  member_removed: true,
  meetup_created: true,
  meetup_cancelled: true,
  post_commented: true,
  ownership_transferred: true,
  crew_disbanded: true,
  poll_withdrawn: true,
};

/**
 * `NotificationType`(13종) 중 필수 2종을 뺀 11종 — 설정 화면(AC1 유형별 토글)과 크루별 일괄
 * 음소거(AC2, "그 크루의 알림 끄기"가 이 목록 전부를 크루 스코프로 disable 행을 만드는 것)가
 * 공유하는 목록이다.
 */
export const MUTABLE_NOTIFICATION_TYPES: readonly NotificationType[] = (
  Object.keys(NOTIFICATION_TYPE_EXHAUSTIVENESS_CHECK) as NotificationType[]
).filter((type) => !isNotificationTypeMandatory(type));
