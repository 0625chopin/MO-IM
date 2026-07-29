import { toNotificationItemViewModel } from "@/components/notifications/notification-view-models";
import { NotificationCenterListContainer } from "@/components/notifications/NotificationCenterListContainer";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { countUnreadNotifications, listNotificationsForProfile } from "@/lib/data";

const NOTIFICATION_CENTER_PAGE_SIZE = 30;

/**
 * `/notifications`(SC-18, FR-071) 페이지 컨테이너(D-030 ①) — Task 023. 이 라우트는 이미
 * `(app)/layout.tsx`(D-030 ④)가 인증을 보장하는 트리 안이라 `isAuthenticated` 조기 반환으로
 * 타입만 좁힌다(`MonthCalendarContainer`·`HomeCalendarSummaryContainer`와 같은 패턴, 실제
 * 리다이렉트는 하지 않는다 — 이미 레이아웃이 했다).
 *
 * **24일차(I-095)** — 원래 throw 기반 `assertAuthenticatedSession`을 썼다. 경위·대체 패턴
 * 근거는 `@/components/shell/auth-session.ts` 모듈 docstring 참고.
 */
export async function NotificationCenterContainer() {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    // (app) 레이아웃이 이미 미인증 분기를 선택했을 병렬 렌더링의 폐기 브랜치다(I-095).
    return null;
  }

  const [page, unreadCount] = await Promise.all([
    listNotificationsForProfile(session.profileId, { limit: NOTIFICATION_CENTER_PAGE_SIZE }),
    countUnreadNotifications(session.profileId),
  ]);

  return (
    <NotificationCenterListContainer
      profileId={session.profileId}
      initialNotifications={page.items.map(toNotificationItemViewModel)}
      initialUnreadCount={unreadCount}
    />
  );
}
