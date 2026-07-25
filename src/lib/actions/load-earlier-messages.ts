"use server";

import type { MessageViewModel } from "@/components/chat/message-view-models";
import { toMessageViewModel } from "@/components/chat/resolve-message-view-model";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getChatRoomByCrewId, getCrewMembership, getProfileById, listMessages } from "@/lib/data";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import type { Id } from "@/lib/types";

export interface LoadEarlierMessagesInput {
  crewId: Id;
  roomId: Id;
  /** 현재 화면에 로드된 메시지 중 가장 오래된 것의 id — 이보다 오래된 다음 페이지를 요청한다. */
  beforeMessageId: Id;
}

export interface LoadEarlierMessagesResult {
  /** 최신순(내림차순) — `listMessages`와 같은 순서. 호출부가 화면 표시 순서(오름차순)로
   *  뒤집는다(`MessageRoomContainer` 참고). */
  items: MessageViewModel[];
  nextCursor: Id | null;
}

const EMPTY_RESULT: LoadEarlierMessagesResult = { items: [], nextCursor: null };

/**
 * 위로 이어 로드(FR-051 AC3, D-023 윈도잉) — 폼이 없는 Server Action이라 `MessageRoomContainer`
 * (클라이언트 컨테이너)가 `startTransition` 안에서 직접 함수처럼 호출한다(D-029 렌더링 전략).
 *
 * 읽기 전용이지만 `sendChatMessageAction`과 동일하게 `getAuthSession()` + `checkPermission`
 * 게이트를 통과해야 한다 — Server Action은 페이지를 거치지 않고 직접 호출될 수 있으므로,
 * 이 방의 크루원이 아닌 사용자가 `beforeMessageId`만 바꿔가며 다른 크루의 메시지를 훑어보는
 * 경로를 막는다(팀장 지침 6번). 실패하면 예외를 던지지 않고 빈 페이지를 반환한다 — 호출부는
 * 이를 "더 불러올 것 없음"으로 처리한다(fail-closed, 다른 크루 메시지가 새지 않는다).
 */
export async function loadEarlierMessagesAction(
  input: LoadEarlierMessagesInput,
): Promise<LoadEarlierMessagesResult> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") return EMPTY_RESULT;

  const membership = await getCrewMembership(input.crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);
  if (!checkPermission({ role, action: "chat:send_message" }).allowed) return EMPTY_RESULT;

  const room = await getChatRoomByCrewId(input.crewId);
  if (!room || room.id !== input.roomId) return EMPTY_RESULT;

  const page = await listMessages(room.id, { beforeMessageId: input.beforeMessageId, limit: 50 });
  const items = await Promise.all(
    page.items.map(async (message) =>
      toMessageViewModel(message, await getProfileById(message.senderId), input.crewId),
    ),
  );
  return { items, nextCursor: page.nextCursor };
}
