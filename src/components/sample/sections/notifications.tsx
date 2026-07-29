import type { NotificationPreferencesViewModel } from "@/components/notifications/notification-preference-view-models";
import type { NotificationItemViewModel } from "@/components/notifications/notification-view-models";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { NotificationList } from "@/components/notifications/NotificationList";
import { NotificationListSkeleton } from "@/components/notifications/NotificationListSkeleton";
import { NotificationPreferencesPanel } from "@/components/notifications/NotificationPreferencesPanel";
import { NotificationPreferencesPanelSkeleton } from "@/components/notifications/NotificationPreferencesPanelSkeleton";
import { NotificationSimulatorPreviewContainer } from "@/components/sample/sections/NotificationSimulatorPreviewContainer";
import { defineSection } from "@/components/sample/showcase-types";
import { ErrorState } from "@/components/ui/error-state";
import { strings } from "@/lib/strings";

/**
 * 알림(FR-045·070·071, Task 023) — `NotificationItem`(개별 항목) · `NotificationList`(목록·
 * 빈 상태) · `NotificationBell`(헤더 배지·팝오버) · ToastHost(전역 토스트 구독자, 시각 요소가
 * 없어 별도 컴포넌트 카드 대신 아래 "종단 시연"에서 함께 보인다) 4종을 다룹니다.
 *
 * 알림 유형 → 화면 라우팅(`notification-routing.ts`)과 채널 추상화(`notification-channel.ts`,
 * D-030 ②)는 순수 함수/구독 래퍼라 여기서는 그 결과(계산된 `href`)만 손으로 채운 값으로
 * 보여줍니다(`sections/poll.tsx`와 같은 원칙 — 판정 로직을 이 파일에서 다시 하지 않습니다).
 */

function buildNotification(overrides: Partial<NotificationItemViewModel> = {}): NotificationItemViewModel {
  return {
    id: "sample-notification-1",
    type: "join_request_received",
    title: strings.notification.messages.joinRequestReceived,
    isRead: false,
    createdAt: "2026-07-24T09:00:00.000Z",
    href: "/crews/sample-crew/members",
    ...overrides,
  };
}

const SAMPLE_LIST: NotificationItemViewModel[] = [
  buildNotification({
    id: "sample-notification-1",
    type: "poll_closed",
    title: strings.notification.messages.pollClosed,
    isRead: false,
    createdAt: "2026-07-24T08:30:00.000Z",
    href: "/crews/sample-crew/board/sample-post",
  }),
  buildNotification({
    id: "sample-notification-2",
    type: "join_request_received",
    isRead: false,
    createdAt: "2026-07-24T02:00:00.000Z",
  }),
  buildNotification({
    id: "sample-notification-3",
    type: "meetup_created",
    title: strings.notification.messages.meetupCreated,
    isRead: true,
    createdAt: "2026-07-20T09:00:00.000Z",
    href: "/meetups/sample-meetup",
  }),
  buildNotification({
    id: "sample-notification-4",
    type: "invitation_received",
    title: strings.notification.messages.invitationReceived,
    isRead: true,
    createdAt: "2026-07-15T09:00:00.000Z",
    href: "/invitations",
  }),
];

/** `NotificationPreferencesPanel` 데모용 고정 데이터(Task 044, FR-072) — 실제
 *  `NotificationPreferencesContainer`가 `toNotificationPreferencesViewModel`로 만드는 조인
 *  결과 모양을 손으로 채운 것이다(`sections/poll.tsx`의 `buildPoll`과 같은 패턴). 필수 2종
 *  (poll_closed·member_removed)은 항상 배열 맨 앞이다(컨테이너가 그렇게 조립한다). */
function buildNotificationPreferences(
  overrides: Partial<NotificationPreferencesViewModel> = {},
): NotificationPreferencesViewModel {
  return {
    types: [
      { type: "poll_closed", label: strings.account.settings.notifications.typeLabels.pollClosed, enabled: true, mandatory: true },
      { type: "member_removed", label: strings.account.settings.notifications.typeLabels.memberRemoved, enabled: true, mandatory: true },
      { type: "join_request_received", label: strings.account.settings.notifications.typeLabels.joinRequestReceived, enabled: true, mandatory: false },
      { type: "meetup_cancelled", label: strings.account.settings.notifications.typeLabels.meetupCancelled, enabled: false, mandatory: false },
      { type: "post_commented", label: strings.account.settings.notifications.typeLabels.postCommented, enabled: true, mandatory: false },
    ],
    crews: [
      { crewId: "crew-1", crewName: "주말 러닝 크루", muted: false },
      { crewId: "crew-3", crewName: "홈카페 취향 공유", muted: true },
    ],
    ...overrides,
  };
}

export const notificationsSection = defineSection({
  id: "notifications",
  label: "알림",
  title: "알림 — NotificationItem · NotificationList · NotificationBell · NotificationPreferencesPanel · ToastHost",
  description: (
    <>
      투표 종료·가입 신청·초대·모임 생성 등 FR-070이 정의한 대상 이벤트 10종의 토스트(FR-070)와
      알림 센터(FR-071)입니다. 클릭 시 이동 경로는 항상 <code>notification-routing.ts</code>가
      리소스 ID로부터 계산하며(R-016), 실시간 갱신은 <code>notification-channel.ts</code>의
      구독 인터페이스(D-030 ②)를 씁니다.
    </>
  ),
  items: [
    {
      name: "NotificationItem",
      note: "개별 알림 항목(FR-071 AC2). 항목 하나는 '목록이 비었다'는 개념 자체가 없어 '빈 상태' 패널은 두지 않는다(ConnectionBanner·PollEarlyCloseControl과 같은 이유) — 아래 NotificationList 항목의 '빈 상태'(알림 0건)와 혼동하지 않는다. '오류'는 notification-routing.ts가 payload에서 리소스 ID를 못 찾아 href를 null로 돌려준 방어적 도메인 오류(D-030 ③) — 클릭해도 이동하지 않는 안읽음 항목이다.",
      panels: {
        default: <NotificationItem notification={SAMPLE_LIST[0]} />,
        error: <NotificationItem notification={buildNotification({ href: null, isRead: false })} />,
      },
    },
    {
      name: "NotificationList",
      note: "알림 목록(FR-071). '빈 상태'는 AC4(알림 0건). `NotificationListProps`에는 오류 개념이 없어(조회 실패는 한 단계 위 컨테이너가 소유하는 상태다) '오류' 패널은 두지 않는다 — 최초 조회 실패는 아래 'NotificationBell' 항목의 `loadError` 패널에서 검증한다.",
      panels: {
        default: <NotificationList notifications={SAMPLE_LIST} />,
        loading: <NotificationListSkeleton />,
        empty: <NotificationList notifications={[]} />,
      },
    },
    {
      name: "NotificationBell",
      note: "헤더 배지·팝오버(FR-071 AC1). '빈 상태'는 안읽음 0건(배지 없음), '오류'는 최초 조회 실패(D-030 ③ 도메인 오류) 상태입니다.",
      panels: {
        default: <NotificationBell unreadCount={2} notifications={SAMPLE_LIST} />,
        loading: <NotificationBell unreadCount={0} notifications={[]} isLoading />,
        empty: <NotificationBell unreadCount={0} notifications={[]} />,
        error: <NotificationBell unreadCount={0} notifications={[]} loadError />,
      },
    },
    {
      name: "NotificationPreferencesPanel",
      note: "알림 환경설정(FR-072 AC1·AC2·AC3, Task 044). 필수 2종(투표 종료·강퇴)은 스위치가 항상 비활성 + 켬 고정입니다(AC3, 실제 방어선은 DB 가드 트리거). '빈 상태'는 소속 크루가 없어 크루별 섹션이 비는 경우, '오류'는 저장 실패 시 표시되는 인라인 오류(실제로는 토글 실패 후 로컬 상태가 되돌아가며 함께 뜬다 — /sample은 클로저로 재현할 수 없어 ErrorState 원자로 정적 재현합니다, JoinRequestPanel과 같은 이유).",
      panels: {
        default: <NotificationPreferencesPanel viewModel={buildNotificationPreferences()} />,
        loading: <NotificationPreferencesPanelSkeleton />,
        empty: <NotificationPreferencesPanel viewModel={buildNotificationPreferences({ crews: [] })} />,
        error: (
          <div className="flex flex-col gap-3">
            <NotificationPreferencesPanel viewModel={buildNotificationPreferences()} />
            <ErrorState
              title={strings.error.conflict.title}
              description={strings.account.settings.notifications.errors.updateFailed}
            />
          </div>
        ),
      },
    },
    {
      name: "ToastHost + NotificationBell 종단 시연(Mock)",
      note: "버튼을 누르면 실제 createNotification → publishMockEvent 경로를 타고, 아래 마운트된 ToastHost가 토스트를 띄우며 NotificationBell 배지·목록이 함께 갱신됩니다(같은 구독을 공유). Mock인 것은 발화 방식뿐이고 판정·저장 로직은 전부 프로덕션 코드입니다.",
      content: <NotificationSimulatorPreviewContainer />,
    },
  ],
});
