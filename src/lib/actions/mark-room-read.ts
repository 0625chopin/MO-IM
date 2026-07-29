"use server";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { markRoomRead } from "@/lib/data";
import type { Id } from "@/lib/types";

/**
 * 읽음 지점 갱신(FR-055 AC2, Task 044). `mark-notification-read.ts`와 같은 형태 — 클라이언트는
 * roomId만 넘기고, 소유권(profileId)은 세션에서 가져온다. `MessageRoomContainer`가 "최신까지
 * 스크롤"을 감지했을 때 배경으로 호출한다(D-030 ② 실시간 경계 — 로컬 배지 상태는 호출부가 이미
 * 낙관적으로 지웠다고 가정하지 않고, 크루 목록으로 돌아갔을 때 서버 값을 다시 읽는다).
 *
 * `refresh()`를 부르지 않는다 — 이 화면(채팅방) 자체는 배지를 그리지 않고, 배지가 있는 화면
 * (크루 목록)은 이 액션과 무관하게 다음 방문 시 새로 조회한다.
 */
export async function markRoomReadAction(roomId: Id): Promise<void> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") return;
  await markRoomRead(roomId, session.profileId);
}
