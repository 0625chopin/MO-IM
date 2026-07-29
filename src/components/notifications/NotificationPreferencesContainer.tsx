import { toNotificationPreferencesViewModel } from "@/components/notifications/notification-preference-view-models";
import { NotificationPreferencesPanel } from "@/components/notifications/NotificationPreferencesPanel";
import type { AuthSession } from "@/components/shell/auth-session";
import { listCrewsByProfile, listNotificationPreferences } from "@/lib/data";
import { MUTABLE_NOTIFICATION_TYPES } from "@/lib/rules/notification-preference-rules";
import { strings } from "@/lib/strings";

export interface NotificationPreferencesContainerProps {
  session: Extract<AuthSession, { status: "authenticated" }>;
}

/**
 * FR-072 알림 환경설정 컨테이너(Task 044, D-030 ①) — `/settings`가 `AccountSettingsContainer`·
 * `BlockedUsersListContainer`와 나란히 조립한다. `AccountSettingsPage`가 이미 `assertAuthenticated
 * Session`으로 좁힌 세션을 그대로 받는다(`BlockedUsersListContainer`와 달리 이 컨테이너는
 * `session.profileId`가 바로 필요해서다).
 *
 * 두 조회(`listNotificationPreferences`·`listCrewsByProfile`)를 병렬로 실행하고
 * `toNotificationPreferencesViewModel`(순수 함수)로 접어 표현 컴포넌트에 넘긴다 — 판정(무엇이
 * 꺼져 있는가, 어떤 유형이 필수인가)은 전부 그 함수·`MUTABLE_NOTIFICATION_TYPES`(lib/rules) 몫
 * 이고 이 컨테이너는 조회·조립만 한다(NFR-036).
 */
export async function NotificationPreferencesContainer({
  session,
}: NotificationPreferencesContainerProps) {
  const [preferences, memberCrews] = await Promise.all([
    listNotificationPreferences(session.profileId),
    listCrewsByProfile(session.profileId),
  ]);

  const mandatoryTypes = new Set<"poll_closed" | "member_removed">(["poll_closed", "member_removed"]);
  const viewModel = toNotificationPreferencesViewModel(
    MUTABLE_NOTIFICATION_TYPES,
    mandatoryTypes,
    preferences,
    memberCrews,
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-medium text-foreground">
          {strings.account.settings.notifications.heading}
        </h2>
        <p className="text-sm text-muted-foreground">
          {strings.account.settings.notifications.description}
        </p>
      </div>
      <NotificationPreferencesPanel viewModel={viewModel} />
    </section>
  );
}
