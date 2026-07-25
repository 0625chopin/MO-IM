import { subscribeToRoom } from "@/lib/realtime";
import type {
  RealtimeErrorHandler,
  RealtimeEventHandler,
  Unsubscribe,
} from "@/lib/realtime";
import type { Id, Notification } from "@/lib/types";

/**
 * 알림 채널 추상화(Task 023, D-030 ②) — `subscribeToNotifications(profileId, onEvent): Unsubscribe`.
 * 새 구독 계층을 만들지 않고 Task 008이 만든 방(room) 기반 `subscribeToRoom`(`@/lib/realtime`)을
 * 그대로 다중화한다 — 알림도 "사용자 하나에 이벤트가 흘러드는 방"이라는 점에서 채팅방·투표
 * 집계와 같은 모양이기 때문이다. 방 id는 `profileId` 자체가 아니라 `notification:{profileId}`로
 * 접두사를 둔다 — 나중에 다른 도메인이 우연히 같은 문자열의 profileId를 room id로 써도 채널이
 * 섞이지 않는다.
 *
 * **Task 033(19일차)부터 방 id가 곧 Realtime Broadcast 토픽이다** — `getNotificationRoomId`가
 * 만드는 문자열이 `realtime.messages`의 `realtime_messages_select_own_notifications` 정책(029B
 * §6.2)이 매치하는 정규식 `^user:[0-9a-fA-F-]{36}:notifications$`와 정확히 같은 모양이어야
 * 구독이 인가된다. **Mock 단계 문자열(`notification:{profileId}`)은 이 정규식과 형태가 달라
 * 실데이터에서는 항상 거부됐다** — 이번에 `user:{profileId}:notifications`로 고쳤다(19일차,
 * Task 033 실측으로 발견).
 */
export const NOTIFICATION_CREATED_EVENT = "notification_created";

export function getNotificationRoomId(profileId: Id): string {
  return `user:${profileId}:notifications`;
}

export type SubscribeToNotifications = (
  profileId: Id,
  onEvent: RealtimeEventHandler,
  onError?: RealtimeErrorHandler,
) => Unsubscribe;

/** `@/lib/realtime`의 `subscribeToRoom`을 알림 전용 room id로 다중화한 얇은 래퍼. */
export const subscribeToNotifications: SubscribeToNotifications = (profileId, onEvent, onError) =>
  subscribeToRoom(getNotificationRoomId(profileId), onEvent, onError);

/**
 * 수신한 realtime payload가 실제 `Notification`인지 런타임에 좁힌다. `RealtimeEvent.payload`가
 * `unknown`이라(전송 계층은 도메인을 해석하지 않는다, `lib/realtime/types.ts`) 소비자가 직접
 * 검증해야 한다 — `MessageRoomContainer`의 `isMessageViewModel`과 같은 자리.
 */
export function isNotificationPayload(payload: unknown): payload is Notification {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "id" in payload &&
    "type" in payload &&
    "recipientId" in payload &&
    "payload" in payload
  );
}
