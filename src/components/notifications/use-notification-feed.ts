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
import { recordNotificationClickAction } from "@/lib/actions/record-notification-click";
import { recordNotificationImpressionAction } from "@/lib/actions/record-notification-impression";
import type { NotificationImpressionItem } from "@/lib/actions/record-notification-impression";
import { describeRealtimeError } from "@/lib/realtime";
import type { Id } from "@/lib/types";

export interface UseNotificationFeedResult {
  notifications: NotificationItemViewModel[];
  unreadCount: number;
  markRead: (id: Id) => void;
  markAllRead: () => void;
  /** NFR-030 KPI-3 분모 — `NotificationList`의 마운트 이펙트가 부른다(아래 참고). */
  recordImpressions: (items: NotificationImpressionItem[]) => void;
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
    // NFR-030 KPI-3 분자(클릭) — 읽음 처리와는 별개 개념이라 같은 상태 갱신에 얹지 않고
    // 클릭 시점의 알림 유형만 조회해 둔다(읽음은 멱등이라 이미 읽은 알림도 다시 markRead가
    // 불릴 수 있지만, 클릭 이벤트는 그때마다 기록해도 무방한 행동 로그다).
    const clicked = notifications.find((n) => n.id === id);
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
      if (clicked) await recordNotificationClickAction(id, clicked.type);
    });
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => (n.isRead ? n : { ...n, isRead: true })));
    setUnreadCount(0);
    startTransition(async () => {
      await markAllNotificationsReadAction();
    });
  }

  function recordImpressions(items: NotificationImpressionItem[]) {
    if (items.length === 0) return;
    startTransition(async () => {
      await recordNotificationImpressionAction(items);
    });
  }

  return { notifications, unreadCount, markRead, markAllRead, recordImpressions, isPending };
}
