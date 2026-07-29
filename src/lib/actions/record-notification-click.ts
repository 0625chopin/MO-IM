"use server";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { recordProductEvent } from "@/lib/data";
import type { Id, NotificationType } from "@/lib/types";

/**
 * NFR-030 KPI-3(투표 종료 알림 클릭률) 분자 — 사용자가 알림 항목을 선택(클릭/Enter)한 시점을
 * 기록한다. `useNotificationFeed.markRead`가 `markNotificationReadAction`과 함께 호출한다 —
 * "읽음 처리"(멱등, 이미 읽은 알림도 다시 호출될 수 있다)와 "클릭"(매번 기록해도 되는 행동
 * 이벤트)은 다른 개념이라 같은 함수로 합치지 않았다.
 */
export async function recordNotificationClickAction(notificationId: Id, type: NotificationType): Promise<void> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") return;
  await recordProductEvent({
    actorId: session.profileId,
    eventType: "notification_click",
    payload: { notificationId, type },
  });
}
