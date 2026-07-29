import { strings } from "@/lib/strings";
import type { Crew, Id, NotificationPreference, NotificationType } from "@/lib/types";

/**
 * 알림 유형 → 설정 화면 토글 라벨(FR-072, Task 044). `notification-view-models.ts`의
 * `NOTIFICATION_MESSAGE_BY_TYPE`와 같은 `Record<NotificationType, ...>` 관용구(하나라도 빠지면
 * 컴파일 에러) — 다만 문구 도메인은 다르다(모듈 docstring 참고, "~됐어요" vs "이 유형의 알림").
 */
const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  poll_closed: strings.account.settings.notifications.typeLabels.pollClosed,
  join_request_received: strings.account.settings.notifications.typeLabels.joinRequestReceived,
  join_request_approved: strings.account.settings.notifications.typeLabels.joinRequestApproved,
  join_request_rejected: strings.account.settings.notifications.typeLabels.joinRequestRejected,
  invitation_received: strings.account.settings.notifications.typeLabels.invitationReceived,
  staff_appointed: strings.account.settings.notifications.typeLabels.staffAppointed,
  member_removed: strings.account.settings.notifications.typeLabels.memberRemoved,
  meetup_created: strings.account.settings.notifications.typeLabels.meetupCreated,
  meetup_cancelled: strings.account.settings.notifications.typeLabels.meetupCancelled,
  post_commented: strings.account.settings.notifications.typeLabels.postCommented,
  ownership_transferred: strings.account.settings.notifications.typeLabels.ownershipTransferred,
  crew_disbanded: strings.account.settings.notifications.typeLabels.crewDisbanded,
  poll_withdrawn: strings.account.settings.notifications.typeLabels.pollWithdrawn,
};

export interface NotificationTypeToggleViewModel {
  type: NotificationType;
  label: string;
  /** 이 값이 `false`면 전역으로 꺼져 있다(행 부재 = `true`, `notifications_broadcast` 문서
   *  참고 — 컨테이너가 "행이 없으면 켬"으로 이미 접었다). */
  enabled: boolean;
  /** FR-072 AC3 — `true`면 스위치가 항상 비활성(disabled)이고 켜진 채로 고정된다. */
  mandatory: boolean;
}

export interface CrewMuteViewModel {
  crewId: Id;
  crewName: string;
  /** `MUTABLE_NOTIFICATION_TYPES` 전부가 이 크루 스코프로 꺼져 있으면 `true`(컨테이너가
   *  "하나라도 꺼져 있으면 꺼진 것으로" 접지 않는다 — 이 화면이 만드는 크루 음소거는 항상
   *  전부-켬/전부-끔이므로 하나라도 있으면 이미 "끈" 상태다). */
  muted: boolean;
}

export interface NotificationPreferencesViewModel {
  types: NotificationTypeToggleViewModel[];
  crews: CrewMuteViewModel[];
}

/**
 * `NotificationPreferencesContainer`가 `listNotificationPreferences`(전역 + 크루별 오버라이드
 * 뒤섞인 원본 행)와 `listCrewsByProfile`(크루 이름)을 조인해 이 뷰모델로 접는다. `MANDATORY`
 * 여부·표시 순서(`orderedTypes`)는 호출부가 `MUTABLE_NOTIFICATION_TYPES` 순서를 그대로 넘긴다
 * (호출부가 이미 `lib/rules`를 참조할 수 있는 서버 컴포넌트이므로 이 zone 6 파일이 대신 import
 * 하지 않는다 — `.ts` 파일이라 zone 6이라 사실 가능하지만, "순서 정책"은 규칙(rules) 소관이라는
 * 경계를 지킨다).
 */
export function toNotificationPreferencesViewModel(
  orderedTypes: readonly NotificationType[],
  mandatoryTypes: ReadonlySet<NotificationType>,
  rawPreferences: readonly NotificationPreference[],
  memberCrews: readonly Crew[],
): NotificationPreferencesViewModel {
  const globalDisabled = new Set(
    rawPreferences.filter((p) => p.crewId === null && !p.enabled).map((p) => p.type),
  );
  const crewMutedIds = new Set(
    rawPreferences.filter((p) => p.crewId !== null && !p.enabled).map((p) => p.crewId as Id),
  );

  const allTypes: NotificationType[] = [...mandatoryTypes, ...orderedTypes];
  const types: NotificationTypeToggleViewModel[] = allTypes.map((type) => ({
    type,
    label: NOTIFICATION_TYPE_LABEL[type],
    enabled: !globalDisabled.has(type),
    mandatory: mandatoryTypes.has(type),
  }));

  const crews: CrewMuteViewModel[] = memberCrews.map((crew) => ({
    crewId: crew.id,
    crewName: crew.name,
    muted: crewMutedIds.has(crew.id),
  }));

  return { types, crews };
}
