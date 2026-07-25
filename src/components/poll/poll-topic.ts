import type { Id } from "@/lib/types";

/**
 * 투표 Realtime Broadcast 토픽 빌더 — Task 033 (FR-042 AC2 "3초 이내 집계 갱신"). 채팅과 같은
 * 이유로 크루 단위 토픽을 쓴다(`realtime_messages_select_crew_broadcast` 정책, 029B §6.2가
 * `chat`·`polls` 두 entity를 이미 함께 허용해 뒀다) — `chat-topic.ts`와 대칭.
 */
export function getCrewPollsTopic(crewId: Id): string {
  return `crew:${crewId}:polls`;
}
