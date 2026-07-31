import type { NotificationItemViewModel } from "@/components/notifications/notification-view-models";
import { toNotificationItemViewModel } from "@/components/notifications/notification-view-models";
import { RecentNotificationsListContainer } from "@/components/notifications/RecentNotificationsListContainer";
import { isAuthenticated } from "@/components/shell/auth-session";
import { CollapsibleSection } from "@/components/shell/CollapsibleSection";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCollapsedSections } from "@/components/shell/section-collapse-cookie";
import { ErrorState } from "@/components/ui/error-state";
import { countUnreadNotifications, listNotificationsForProfile } from "@/lib/data";
import { strings } from "@/lib/strings";

/** 서버가 미리 받아 두는 건수 — 화면에 남기는 5건보다 조금 넉넉히 받아 두면 홈에서 몇 건을
 *  읽어 치워도 목록이 바로 비지 않는다(읽은 알림도 목록에는 남는다). */
const RECENT_NOTIFICATION_FETCH_SIZE = 8;

/**
 * 홈 대시보드 "최근 알림" 섹션의 서버 컨테이너(SC-06, D-030 ①) — 최초 데이터만 조회해
 * 클라이언트 컨테이너에 넘긴다(`NotificationCenterContainer`와 같은 2단 구조).
 *
 * 접기 셸은 보통 클라이언트 컨테이너가 렌더한다(그쪽 docstring 참고). **오류일 때만 여기서
 * 직접 셸을 그린다** — 조회가 실패하면 넘길 초기 데이터가 없어 클라이언트 컨테이너를 띄울
 * 수 없고, 그렇다고 섹션 자체를 지우면 사용자는 알림 영역이 사라진 이유를 알 수 없다.
 */
export async function RecentNotificationsContainer() {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    // (app) 레이아웃이 이미 미인증 분기를 선택했을 병렬 렌더링의 폐기 브랜치다(I-095).
    return null;
  }

  const collapsed = await getCollapsedSections();
  const defaultOpen = !collapsed.has("notifications");

  // JSX를 try 안에서 만들지 않는다(`react-hooks/error-boundaries`) — 렌더는 이 함수가
  // 반환한 뒤에 일어나므로 try/catch가 렌더 오류를 잡지도 못하면서 잡는 것처럼 보인다.
  // 조회만 감싸고 분기는 밖에서 한다.
  let loaded: { notifications: NotificationItemViewModel[]; unreadCount: number } | null = null;
  try {
    const [page, unreadCount] = await Promise.all([
      listNotificationsForProfile(session.profileId, { limit: RECENT_NOTIFICATION_FETCH_SIZE }),
      countUnreadNotifications(session.profileId),
    ]);
    loaded = { notifications: page.items.map(toNotificationItemViewModel), unreadCount };
  } catch (cause) {
    // 원본 오류는 서버 로그로만 남긴다(NFR-014).
    console.error("[home] failed to load recent notifications", cause);
  }

  if (!loaded) {
    const s = strings.home.dashboard.recentNotifications;
    return (
      <CollapsibleSection sectionId="notifications" title={s.title} defaultOpen={defaultOpen}>
        <ErrorState title={s.errorTitle} description={s.errorDescription} />
      </CollapsibleSection>
    );
  }

  return (
    <RecentNotificationsListContainer
      profileId={session.profileId}
      initialNotifications={loaded.notifications}
      initialUnreadCount={loaded.unreadCount}
      defaultOpen={defaultOpen}
    />
  );
}
