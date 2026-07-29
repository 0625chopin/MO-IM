"use server";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { recordProductEvent } from "@/lib/data";
import type { Id, NotificationType } from "@/lib/types";

export interface NotificationImpressionItem {
  id: Id;
  type: NotificationType;
}

/**
 * NFR-030 KPI-3(투표 종료 알림 클릭률) 분모 — 알림이 실제로 화면에 렌더돼 사용자가 볼 수
 * 있게 된 시점을 기록한다. `useNotificationFeed`가 알림 벨 팝오버가 열리거나 `/notifications`
 * 페이지가 마운트될 때(`NotificationList`의 마운트 이펙트, D-030 ① 표현 컴포넌트가 콜백만
 * 받는 형태) 호출한다 — 배지에 안읽음 숫자가 보이는 것과 목록이 실제로 펼쳐져 보이는 것을
 * 구분한다(전자는 "존재를 알렸다"일 뿐 "노출"이 아니다).
 *
 * 유형은 `poll_closed`로 좁히지 않고 10종 전부 기록한다 — KPI-3 산출 시 `event_type=
 * 'notification_impression' AND payload->>'type'='poll_closed'`로 걸러 쓰면 되고, 지금
 * 좁히면 다른 알림 유형의 클릭률을 나중에 보고 싶을 때 이벤트를 다시 심어야 한다.
 *
 * 여러 건을 한 번의 왕복으로 기록한다(팝오버를 열 때마다 알림 개수만큼 요청을 보내지 않는다).
 */
export async function recordNotificationImpressionAction(items: NotificationImpressionItem[]): Promise<void> {
  if (items.length === 0) return;
  const session = await getAuthSession();
  if (session.status !== "authenticated") return;

  await Promise.all(
    items.map((item) =>
      recordProductEvent({
        actorId: session.profileId,
        eventType: "notification_impression",
        payload: { notificationId: item.id, type: item.type },
      }),
    ),
  );
}
