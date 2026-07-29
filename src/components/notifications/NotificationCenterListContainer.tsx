"use client";

import type { NotificationItemViewModel } from "@/components/notifications/notification-view-models";
import { NotificationList } from "@/components/notifications/NotificationList";
import { useNotificationFeed } from "@/components/notifications/use-notification-feed";
import type { Id } from "@/lib/types";

export interface NotificationCenterListContainerProps {
  profileId: Id;
  initialNotifications: NotificationItemViewModel[];
  initialUnreadCount: number;
}

/**
 * `/notifications`(SC-18) 전용 클라이언트 컨테이너 — `NotificationBellContainer`와 같은
 * `useNotificationFeed`를 쓰지만 팝오버 없이 전체 목록만 그린다(D-030 ①②). 헤더 벨과 이
 * 페이지는 서로 독립된 구독 인스턴스라 — 같은 탭에서 벨을 연 채 이 페이지로 와도 각자
 * 새로 구독한다. Mock 단계 전송 계층 한계상 서로 상태를 실시간으로 동기화하진 않지만
 * (`lib/realtime/mock.ts` 모듈 docstring), 둘 다 서버 진실(Source of truth)에서 다시 불러오면
 * 맞춰진다 — 실데이터 전환(Task 033) 이후에는 이 제약 자체가 사라진다.
 */
export function NotificationCenterListContainer({
  profileId,
  initialNotifications,
  initialUnreadCount,
}: NotificationCenterListContainerProps) {
  const { notifications, unreadCount, markRead, markAllRead, recordImpressions } = useNotificationFeed(
    profileId,
    initialNotifications,
    initialUnreadCount,
  );

  return (
    <NotificationList
      notifications={notifications}
      onSelect={markRead}
      onMarkAllRead={unreadCount > 0 ? markAllRead : undefined}
      onImpression={recordImpressions}
    />
  );
}
