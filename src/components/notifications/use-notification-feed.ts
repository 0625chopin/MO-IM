"use client";

import { useEffect, useState, useTransition } from "react";

import {
  isNotificationPayload,
  NOTIFICATION_CREATED_EVENT,
  subscribeToNotifications,
} from "@/components/notifications/notification-channel";
import { toNotificationItemViewModel } from "@/components/notifications/notification-view-models";
import type { NotificationItemViewModel } from "@/components/notifications/notification-view-models";
import { markAllNotificationsReadAction } from "@/lib/actions/mark-all-notifications-read";
import { markNotificationReadAction } from "@/lib/actions/mark-notification-read";
import { describeRealtimeError } from "@/lib/realtime";
import type { Id } from "@/lib/types";

export interface UseNotificationFeedResult {
  notifications: NotificationItemViewModel[];
  unreadCount: number;
  markRead: (id: Id) => void;
  markAllRead: () => void;
  isPending: boolean;
}

/**
 * 알림 벨·알림 센터 페이지가 공유하는 클라이언트 상태(Task 023, 도메인 결합이 강해
 * `src/hooks/`가 아니라 이 디렉터리에 콜로케이션한다 — `src/hooks/README.md` "특정 도메인에
 * 강하게 결합된 훅은 해당 도메인 디렉터리에 둬도 된다"). 구독(`subscribeToNotifications`,
 * D-030 ②)으로 실시간 신규 알림을 받고, 읽음 처리는 낙관적으로 로컬 상태를 먼저 바꾼 뒤
 * Server Action을 백그라운드로 보낸다(`MessageRoomContainer`의 낙관적 렌더와 같은 이유 —
 * 사용자는 서버 왕복을 기다리지 않는다). 실패해도 되돌리지 않는다 — "읽음"은 멱등이고 실패해도
 * 사용자에게 해로운 결과가 없어(다시 열면 서버 값으로 맞춰진다) 채팅 낙관적 렌더처럼 실패
 * 상태를 따로 표시할 필요가 없다고 판단했다.
 */
export function useNotificationFeed(
  profileId: Id,
  initialNotifications: NotificationItemViewModel[],
  initialUnreadCount: number,
): UseNotificationFeedResult {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const unsubscribe = subscribeToNotifications(
      profileId,
      (event) => {
        if (event.type !== NOTIFICATION_CREATED_EVENT || !isNotificationPayload(event.payload)) return;
        const notification = event.payload;
        if (notification.recipientId !== profileId) return;
        setNotifications((prev) => [toNotificationItemViewModel(notification), ...prev]);
        if (!notification.readAt) setUnreadCount((count) => count + 1);
      },
      (error) => {
        // `cause`(원본 소켓 에러) 노출 폭을 줄인다(19일차 CORE 교차검증 후속 — MessageRoomContainer
        // 와 같은 이유, `docs/decisions/realtime-broadcast-033.md` §8-후속①).
        console.error("[notifications] realtime subscription error", describeRealtimeError(error));
      },
    );
    return unsubscribe;
  }, [profileId]);

  function markRead(id: Id) {
    let didChange = false;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== id || n.isRead) return n;
        didChange = true;
        return { ...n, isRead: true };
      }),
    );
    if (didChange) setUnreadCount((count) => Math.max(0, count - 1));
    startTransition(async () => {
      await markNotificationReadAction(id);
    });
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => (n.isRead ? n : { ...n, isRead: true })));
    setUnreadCount(0);
    startTransition(async () => {
      await markAllNotificationsReadAction();
    });
  }

  return { notifications, unreadCount, markRead, markAllRead, isPending };
}
