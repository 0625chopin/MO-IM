"use server";

import type { MessageViewModel } from "@/components/chat/message-view-models";
import { toMessageViewModel } from "@/components/chat/resolve-message-view-model";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getChatRoomByCrewId, getCrewMembership, getProfileById, listMessages } from "@/lib/data";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import type { Id } from "@/lib/types";

export interface ResyncChatMessagesInput {
  crewId: Id;
  roomId: Id;
  /** 뷰어가 마지막으로 받은 메시지 id — 이보다 최신인 메시지만 반환한다. */
  afterMessageId: Id;
}

export interface ResyncChatMessagesResult {
  /** 최신순(`listMessages`와 동일) — 호출부가 오름차순으로 뒤집어 뒤에 붙인다. */
  items: MessageViewModel[];
}

const EMPTY_RESULT: ResyncChatMessagesResult = { items: [] };

/**
 * 재연결 시 누락분 보충 조회(FR-051 E3·AC2) — Task 020B. `load-earlier-messages.ts`(뒤로 =
 * 과거 방향)와 대칭인 "앞으로(= 최신 방향)" 조회다. 같은 권한 게이트(팀장 지침 6번 — Server
 * Action은 페이지를 거치지 않고 직접 호출될 수 있으므로 `MessageListContainer`의 게이트에
 * 기대지 않고 다시 검사한다)를 그대로 반복한다. 실패하면 예외 대신 빈 목록을 반환한다
 * (fail-closed, 다른 크루 메시지가 새지 않는다).
 *
 * **Mock 단계의 구조적 한계(버그 아님)**: 이 방의 다른 참여자가 보낸 메시지는 애초에 이
 * 브라우저 탭에 도달하지 않는다 — Mock에는 탭 간 전송 계층이 없다(I-042, `lib/realtime/mock.ts`
 * 모듈 docstring 참고). 그래서 이 회차의 Mock 환경에서는 재연결해도 보통 빈 배열이 돌아온다.
 * 이 액션이 실제로 값을 채워 돌려주는 것은 Task 033(Supabase Realtime Broadcast 연결) 이후다.
 * 그래도 지금 이 경로를 만들어 두는 이유는, 그때 `MessageRoomContainer`의 재연결 처리 코드를
 * 다시 쓰지 않아도 되게 하기 위해서다(D-030 ②가 지키려는 "구독 인터페이스만 바꿔 끼운다"는
 * 성질 — resync도 같은 계약이다).
 */
export async function resyncChatMessagesAction(
  input: ResyncChatMessagesInput,
): Promise<ResyncChatMessagesResult> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") return EMPTY_RESULT;

  const membership = await getCrewMembership(input.crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);
  if (!checkPermission({ role, action: "chat:send_message" }).allowed) return EMPTY_RESULT;

  const room = await getChatRoomByCrewId(input.crewId);
  if (!room || room.id !== input.roomId) return EMPTY_RESULT;

  const page = await listMessages(room.id, { afterMessageId: input.afterMessageId });
  const items = await Promise.all(
    page.items.map(async (message) =>
      toMessageViewModel(message, await getProfileById(message.senderId), input.crewId),
    ),
  );
  return { items };
}
