"use client";

import type { NotificationItemViewModel } from "@/components/notifications/notification-view-models";
import { NotificationList } from "@/components/notifications/NotificationList";
import { useNotificationFeed } from "@/components/notifications/use-notification-feed";
import { CollapsibleSection } from "@/components/shell/CollapsibleSection";
import { strings, t } from "@/lib/strings";
import type { Id } from "@/lib/types";

/** 홈에 남길 미리보기 건수 — 요약이지 목록이 아니다. 전체는 `/notifications`가 맡는다. */
const RECENT_NOTIFICATION_LIMIT = 5;

export interface RecentNotificationsListContainerProps {
  profileId: Id;
  initialNotifications: NotificationItemViewModel[];
  initialUnreadCount: number;
  defaultOpen: boolean;
}

/**
 * 홈 대시보드 "최근 알림" 미리보기(SC-06, F039·FR-071) — 클라이언트 컨테이너(D-030 ①②).
 * `NotificationCenterListContainer`와 같은 `useNotificationFeed`를 쓰고, 같은
 * `NotificationList`를 최근 몇 건만 잘라 그린다.
 *
 * **접기 셸을 여기서 렌더한다.** 접었을 때 헤더에 남는 요약이 "안 읽음 {n}"인데, 이 값은
 * 읽음 처리·실시간 수신으로 계속 변한다 — 서버에서 계산해 넘기면 홈에서 알림을 읽어도 접힌
 * 헤더의 숫자가 그대로 남는다.
 *
 * **구독 인스턴스가 이 화면에 둘이 된다**(헤더 벨 + 이 섹션). `NotificationCenterListContainer`
 * docstring이 적어 둔 것과 같은 트레이드오프를 그대로 받아들였다 — 대신 읽음 처리·클릭
 * 기록(NFR-030)·낙관적 갱신이 세 화면에서 한 코드로 나온다. 훅을 쓰지 않고 읽기 전용으로
 * 두면 홈에서 알림을 눌러도 읽음이 되지 않아 벨 배지와 어긋나 보인다.
 */
export function RecentNotificationsListContainer({
  profileId,
  initialNotifications,
  initialUnreadCount,
  defaultOpen,
}: RecentNotificationsListContainerProps) {
  const { notifications, unreadCount, markRead, recordImpressions } = useNotificationFeed(
    profileId,
    initialNotifications,
    initialUnreadCount,
  );

  const s = strings.home.dashboard.recentNotifications;

  return (
    <CollapsibleSection
      sectionId="notifications"
      title={s.title}
      summary={
        unreadCount > 0
          ? t((x) => x.home.dashboard.recentNotifications.summaryUnread, { count: unreadCount })
          : s.summaryAllRead
      }
      actionHref="/notifications"
      actionLabel={s.viewAll}
      defaultOpen={defaultOpen}
    >
      {/* "모두 읽음으로 표시"(FR-071 AC3)는 여기 두지 않는다 — 그 동작은 화면에 없는 알림까지
          전부 읽음 처리하는데, 5건만 보이는 미리보기에서는 "이 5건"을 읽는 것처럼 읽힌다.
          전체를 다루는 동작은 전체를 보여주는 화면(`/notifications`)에 둔다. */}
      <NotificationList
        notifications={notifications.slice(0, RECENT_NOTIFICATION_LIMIT)}
        onSelect={markRead}
        onImpression={recordImpressions}
      />
    </CollapsibleSection>
  );
}
