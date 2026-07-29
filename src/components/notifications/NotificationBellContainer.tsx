"use client";

import type { NotificationItemViewModel } from "@/components/notifications/notification-view-models";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useNotificationFeed } from "@/components/notifications/use-notification-feed";
import type { Id } from "@/lib/types";

export interface NotificationBellContainerProps {
  profileId: Id;
  initialNotifications: NotificationItemViewModel[];
  initialUnreadCount: number;
}

/**
 * 헤더 알림 벨 클라이언트 컨테이너(D-030 ①②, Task 023). 최초 조회는
 * `NotificationBellServerContainer`(서버 컴포넌트)가 이미 끝내 props로 내려주고, 이 컴포넌트는
 * 그 이후의 실시간 갱신·읽음 처리만 `useNotificationFeed`(구독+낙관적 갱신)에 위임한다 —
 * `MessageListContainer`(서버) → `MessageRoomContainer`(클라이언트) 분리와 같은 자리.
 */
export function NotificationBellContainer({
  profileId,
  initialNotifications,
  initialUnreadCount,
}: NotificationBellContainerProps) {
  const { notifications, unreadCount, markRead, markAllRead, recordImpressions } = useNotificationFeed(
    profileId,
    initialNotifications,
    initialUnreadCount,
  );

  return (
    <NotificationBell
      unreadCount={unreadCount}
      notifications={notifications.slice(0, 5)}
      onSelect={markRead}
      onMarkAllRead={unreadCount > 0 ? markAllRead : undefined}
      onImpression={recordImpressions}
    />
  );
}
