import { notFound } from "next/navigation";

import { MESSAGE_PAGE_SIZE } from "@/components/chat/message-view-models";
import { MessageRoomContainer } from "@/components/chat/MessageRoomContainer";
import { resolveChatViewer } from "@/components/chat/resolve-chat-viewer";
import { toMessageViewModel } from "@/components/chat/resolve-message-view-model";
import { getChatRoomByCrewId, getCrewById, getProfileById, listMessages } from "@/lib/data";
import { checkPermission } from "@/lib/rules/permission";
import type { Id } from "@/lib/types";

/**
 * 채팅방 컨테이너(D-030 ①) — 최초 페이지 조회를 소유한다. `BoardListContainer`와 같은 패턴
 * (async 서버 컴포넌트, 판정 후 `notFound()`/`throw`)이되, 실시간 갱신은 이 컴포넌트가 아니라
 * 클라이언트 컨테이너(`MessageRoomContainer`)로 넘긴다 — 구독은 `useEffect`가 필요해 서버
 * 컴포넌트에 둘 수 없다(D-030 ②).
 *
 * **권한 게이트 판단**: 3.3절 권한 매트릭스에는 "채팅방 열람" 자체를 가리키는 별도 행이 없다
 * (`board:read`에 해당하는 행이 채팅에는 없다 — `lib/rules/permission.ts`의 `PermissionAction`
 * 참고). FR-050 AC2("가입 승인된 신규 크루원은 별도 참여 절차 없이 메시지를 보낼 수 있다")·AC3
 * ("탈퇴한 사용자는 403")를 근거로, 이 회차는 `chat:send_message` 판정을 열람 게이트로도
 * 재사용한다 — 이 매트릭스에서 보내기와 읽기가 요구하는 최소 role이 동일(crew_member 이상)
 * 하다고 읽었기 때문이다. 별도 `chat:read` 행을 매트릭스에 추가하는 편이 더 명시적일 수
 * 있었지만 그건 권한 매트릭스 자체(Task 009B 산출물)를 바꾸는 결정이라 이 Task 범위를 넘는다고
 * 판단해 임의로 추가하지 않았다 — `docs/ISSUES.md` I-039로 등재했다.
 */
export async function MessageListContainer({ crewId }: { crewId: Id }) {
  const room = await getChatRoomByCrewId(crewId);
  if (!room) {
    notFound();
  }

  const { session, role } = await resolveChatViewer(crewId);
  const accessPermission = checkPermission({ role, action: "chat:send_message" });
  if (!accessPermission.allowed) {
    throw new Error("채팅방에 접근할 권한이 없다.", {
      cause: { code: "forbidden", message: accessPermission.reason ?? "chat:send_message denied" },
    });
  }

  // `accessPermission.allowed`가 여기까지 왔다는 것은 role이 guest/member가 아니라는 뜻이고
  // (매트릭스상 둘 다 deny), `resolveChatViewer`는 인증된 세션에만 guest 아닌 role을 매긴다 —
  // 즉 이 지점의 session은 항상 authenticated다. TypeScript는 이 불변식을 모르므로 좁혀 준다.
  if (session.status !== "authenticated") {
    throw new Error("resolveChatViewer 불변식 위반 — 인증되지 않은 세션에 방 접근이 허용됐다.");
  }
  const viewerProfileId = session.profileId;

  const page = await listMessages(room.id, { limit: MESSAGE_PAGE_SIZE });
  const items = await Promise.all(
    page.items.map(async (message) =>
      toMessageViewModel(message, await getProfileById(message.senderId), crewId),
    ),
  );
  const initialMessages = [...items].reverse(); // listMessages는 최신순 → 화면 표시는 오름차순.

  // 19일차(Task 040 UI/게이트 절반, I-066 해소) — 해산된 크루는 열람(위 accessPermission)은
  // 그대로 두고 전송만 막는다(FR-013 AC2). `accessPermission`(읽기 게이트를 겸한다, 위 모듈
  // docstring 참고)에는 이 조건을 넣지 않는다 — 넣으면 archived 크루의 채팅 기록 열람까지
  // 막혀 "열람 전용으로 남는다"는 요구사항과 어긋난다. 실제 강제 경계는 CORE가
  // chat_messages INSERT RLS에 추가하는 `crews.status='active'` 조건이다(SQL이 최종 경계).
  const crew = await getCrewById(crewId);
  const canSend = checkPermission({ role, action: "chat:send_message" }).allowed && crew?.status === "active";

  return (
    <MessageRoomContainer
      crewId={crewId}
      roomId={room.id}
      viewerProfileId={viewerProfileId}
      initialMessages={initialMessages}
      initialCursor={page.nextCursor}
      canSend={canSend}
    />
  );
}
