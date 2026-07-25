"use server";

import type { MessageViewModel } from "@/components/chat/message-view-models";
import { toMessageViewModel } from "@/components/chat/resolve-message-view-model";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getChatRoomByCrewId, getCrewMembership, getProfileById, sendMessage } from "@/lib/data";
import { CHAT_MESSAGE_MAX_LENGTH, validateChatMessageBody } from "@/lib/rules/chat-message-validation";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import { strings, t } from "@/lib/strings";

export interface SendChatMessageState {
  formError?: string;
  /** 성공하면 저장된 메시지(발신자 프로필까지 조인된 값). 호출부(`MessageRoomContainer.
   *  submitMessage`)가 이 값을 받아 자기 `pending` 항목을 지우고 `lib/realtime`으로 발행한다
   *  — **이 Server Action은 더 이상 직접 발행하지 않는다.** 이유는 아래 모듈 docstring
   *  "왜 여기서 발행하지 않는가" 참고(DESIGN 020A 교차검증 BLOCKER 1, I-042). */
  message?: MessageViewModel;
}

/**
 * 메시지 전송(FR-050·051) Server Action. **Task 020B부터 `MessageRoomContainer.submitMessage`가
 * 호출한다** — 재전송(FR-051 E1)이 `Composer`가 아니라 실패한 메시지 말풍선에서 트리거되므로
 * 최초 전송·재전송이 같은 경로를 타야 했고, 구독을 이미 소유한 컨테이너가 그 자리다(Composer는
 * 이제 검증을 통과한 본문을 `onSubmit`으로 올려보내기만 한다).
 *
 * **권한 검사를 여기서 다시 한다** — Server Action은 페이지를 거치지 않고 직접 POST될 수
 * 있으므로, `MessageListContainer`가 이미 방 접근을 게이트했다는 사실에 기대지 않고
 * `getAuthSession()` + `checkPermission`을 그대로 다시 호출한다(팀장 지침 6번, R-015 — 판정은
 * `lib/rules/permission.ts` 재사용만 하고 조건을 새로 짜지 않는다). 세션이 없으면 실존 Mock
 * 사용자로 대체하지 않고 그대로 거부한다(fail-closed, 팀장 지침 7번).
 *
 * **왜 여기서 `publishMockEvent`를 부르지 않는가(I-042, 020A 첫 구현의 실제 버그)**: 이
 * 함수는 `"use server"`라 Node.js 서버 프로세스에서 실행되고, `subscribeToRoom`은
 * `MessageRoomContainer`(`"use client"`)의 `useEffect` 안이라 브라우저에서만 실행된다.
 * `lib/realtime/mock.ts`의 `rooms` Map은 **모듈 스코프 싱글턴**인데 Next.js는 서버 번들과
 * 클라이언트 번들을 따로 만들므로 이 파일에서 만든 `rooms` 인스턴스와 브라우저의 `rooms`
 * 인스턴스는 **완전히 별개**다. 여기서 발행해 봐야 구독자 0명인 서버 쪽 Map에 발행하고
 * `mock.ts`의 `if (!room) return`에서 조용히 사라진다 — 첫 구현이 실제로 이 버그였다
 * (DESIGN 교차검증 BLOCKER 1). 그래서 이 함수는 **메시지만 반환**하고, 발행은 호출부
 * (`MessageRoomContainer.submitMessage`, Task 020B부터는 `Composer`를 거치지 않고 컨테이너가
 * 직접 호출한다)가 브라우저 쪽에서 한다 — 자세한 경위와 Mock 단계의
 * 구조적 한계(다른 탭·다른 사용자에게는 전달 안 됨)는 `MessageRoomContainer.tsx` 모듈
 * docstring 참고.
 */
export async function sendChatMessageAction(
  _prevState: SendChatMessageState,
  formData: FormData,
): Promise<SendChatMessageState> {
  const crewId = String(formData.get("crewId") ?? "");
  const roomId = String(formData.get("roomId") ?? "");
  const body = String(formData.get("body") ?? "");
  const clientKey = String(formData.get("clientKey") ?? "") || crypto.randomUUID();

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { formError: strings.chat.message.errors.sendFailed };
  }

  const membership = await getCrewMembership(crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);
  const permission = checkPermission({ role, action: "chat:send_message" });
  if (!permission.allowed) {
    return { formError: strings.chat.message.errors.sendFailed };
  }

  const validation = validateChatMessageBody(body);
  if (!validation.valid) {
    if (validation.violations.includes("too_long")) {
      return { formError: t((s) => s.chat.message.errors.tooLong, { max: CHAT_MESSAGE_MAX_LENGTH }) };
    }
    return { formError: strings.chat.message.errors.empty };
  }

  const room = await getChatRoomByCrewId(crewId);
  if (!room || room.id !== roomId) {
    return { formError: strings.chat.message.errors.sendFailed };
  }

  const result = await sendMessage({
    roomId: room.id,
    senderId: session.profileId,
    type: "text",
    body: body.trim(),
    clientKey,
  });
  if (!result.ok) {
    return { formError: strings.chat.message.errors.sendFailed };
  }

  const author = await getProfileById(session.profileId);
  const viewModel = await toMessageViewModel(result.data, author, crewId);

  return { message: viewModel };
}
