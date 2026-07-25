import "server-only";

import type { MessageViewModel } from "@/components/chat/message-view-models";
import { resolvePostLinkCard } from "@/components/chat/resolve-post-link-card";
import { strings } from "@/lib/strings";
import type { ChatMessage, Id, Profile } from "@/lib/types";

/**
 * `MessageListContainer`(초기 조회)·`send-chat-message.ts`·`load-earlier-messages.ts`·
 * `resync-chat-messages.ts`(Server Action) 네 곳이 공유하는 조인 로직. 한 곳에서만 바뀌면
 * 되도록 여기 모아 둔다.
 *
 * **서버 전용 파일이다 — `message-view-models.ts`에서 분리했다(17일차 CORE, 빌드 경계 수정).**
 * `resolvePostLinkCard`가 `@/lib/data`를 조회하므로(서버 전용 `createSupabaseServerClient`를
 * 문 배럴), 이 함수를 `MessageViewModel` 타입·`createOptimisticTimelineItem`과 같은 파일에 두면
 * `MessageRoomContainer.tsx`(`"use client"`)가 값으로 import하는 `createOptimisticTimelineItem`을
 * 통해 `@/lib/data`가 클라이언트 번들 그래프로 전이(轉移) import된다 — `npm run build`가
 * 클라이언트 번들 트레이스로 실패했던 원인이다. 호출부는 전부 서버 컴포넌트(`MessageListContainer`)
 * 또는 `"use server"` Server Action이므로 여기서 `@/lib/data`를 조회해도 안전하다. 자세한 경위는
 * `docs/decisions/`(17일차 결정 문서) 참고.
 *
 * `crewId`는 이 메시지가 속한 채팅방의 크루다(`ChatRoom.crewId`, 방 하나는 크루 하나에
 * 고정) — `type === "post_link"`일 때 `resolvePostLinkCard`(Task 020C, FR-052)가 "다른 크루
 * 게시글인가"를 판정하는 기준으로 쓴다.
 */
export async function toMessageViewModel(
  message: ChatMessage,
  author: Pick<Profile, "displayName" | "avatarUrl"> | null,
  crewId: Id,
): Promise<MessageViewModel> {
  return {
    id: message.id,
    roomId: message.roomId,
    senderId: message.senderId,
    senderDisplayName: author?.displayName ?? strings.common.profile.unknownAuthor,
    senderAvatarUrl: author?.avatarUrl ?? null,
    type: message.type,
    body: message.body,
    refPostId: message.refPostId,
    postLinkCard:
      message.type === "post_link" && message.refPostId
        ? await resolvePostLinkCard(message.refPostId, crewId)
        : null,
    clientKey: message.clientKey,
    createdAt: message.createdAt,
    deletedAt: message.deletedAt,
  };
}
