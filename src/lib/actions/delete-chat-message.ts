"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { deleteMessage, getChatRoomByCrewId, getCrewMembership, getMessageById } from "@/lib/data";
import { type DataResult, err } from "@/lib/data/contracts";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import type { ChatMessage, Id } from "@/lib/types";

export interface DeleteChatMessageActionInput {
  crewId: Id;
  roomId: Id;
  messageId: Id;
}

/**
 * 채팅 메시지 삭제(FR-054) Server Action. 이번 회차까지 `deleteMessage`(데이터 계층, Task
 * 031·032가 이미 구현)를 부르는 곳이 아무 데도 없었다 — Server Action·UI 둘 다 이 회차에
 * 처음 만든다.
 *
 * **판정을 먼저, 삭제(부수효과)는 그다음** — `getMessageById`로 `senderId`를 먼저 읽고
 * `chat:delete_own_message`/`chat:delete_any_message`를 판정한 뒤에만 `deleteMessage`를
 * 부른다. 처음에는 "일단 지우고 실패하면 되돌린다" 순서로 짰다가, Mock 구현에는 실 DB의
 * `chat_messages_update_self_or_staff_delete` RLS가 없어 그 순서로는 **권한이 없는 사용자의
 * 삭제 요청도 부수효과(소프트 삭제)가 먼저 일어나 버리는** 결함이 있었다 — 판정 실패 후
 * `forbidden`을 반환해도 메시지는 이미 지워진 채였다. `deletePostAction`·`deleteCommentAction`
 * 은 원래도 조회(`getPostById`/`getCommentById`) → 판정 → 삭제 순서였으니 이 파일만 예외였던
 * 셈이라 그 순서에 맞춘다.
 */
export async function deleteChatMessageAction(
  input: DeleteChatMessageActionInput,
): Promise<DataResult<ChatMessage>> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return err("forbidden", "로그인 후 이용할 수 있다.");
  }

  const room = await getChatRoomByCrewId(input.crewId);
  if (!room || room.id !== input.roomId) {
    return err("not_found", `채팅방 ${input.roomId} 를 찾을 수 없다.`);
  }

  const message = await getMessageById(input.messageId);
  if (!message || message.roomId !== input.roomId || message.deletedAt) {
    return err("not_found", `메시지 ${input.messageId} 를 찾을 수 없다.`);
  }

  const membership = await getCrewMembership(input.crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);
  const isSelf = message.senderId === session.profileId;
  const canDeleteOwn = checkPermission({ role, action: "chat:delete_own_message", context: { isSelf } });
  const canDeleteAny = checkPermission({ role, action: "chat:delete_any_message" });
  if (!canDeleteOwn.allowed && !canDeleteAny.allowed) {
    return err("forbidden", "이 메시지를 삭제할 권한이 없다.");
  }

  const result = await deleteMessage(input.messageId);
  if (result.ok) {
    refresh();
  }
  return result;
}
