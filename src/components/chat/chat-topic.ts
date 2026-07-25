import type { Id } from "@/lib/types";

/**
 * 채팅 Realtime Broadcast 토픽 빌더 — Task 033. `subscribeToRoom`(`@/lib/realtime`)에 넘기는
 * 방 id는 Task 033부터 곧 Broadcast 토픽 문자열이라, `realtime.messages`의
 * `realtime_messages_select_crew_broadcast` 정책(029B §6.2, 정규식
 * `^crew:[0-9a-fA-F-]{36}:(chat|polls)$`)과 정확히 같은 모양이어야 한다.
 *
 * **`chat_rooms.id`(방 UUID)가 아니라 `crewId`로 만든다** — Mock 단계(Task 020A)에는
 * `subscribeToRoom(roomId, ...)`가 `chat_rooms.id`를 그대로 방 id로 썼지만, 실데이터
 * Authorization 정책은 크루 단위로 인가한다(`private.is_active_crew_member(crewId)`). 이
 * 파일은 그 변환 지점을 한 곳에 모아 둔다 — `MessageRoomContainer`가 여기서만 가져다 쓴다.
 */
export function getCrewChatTopic(crewId: Id): string {
  return `crew:${crewId}:chat`;
}
