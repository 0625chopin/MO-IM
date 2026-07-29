import { resolveNotificationHref } from "@/components/notifications/notification-routing";
import { strings } from "@/lib/strings";
import type { Id, ISODateTimeString, Notification, NotificationType } from "@/lib/types";

/**
 * 알림 유형 → 안내 문구(FR-070 "대상 이벤트" 10종). 토스트(FR-070)와 알림 센터 항목(FR-071)이
 * 완전히 같은 문구를 공유한다 — `src/lib/strings/ko.ts`의 `notification.messages` 주석 참고.
 * 표시 문구는 배우(actor)의 이름을 담지 않는다 — payload에 requesterId 같은 행위자 id는 있어도
 * displayName은 없어(알림 레코드는 그 시점 스냅샷이 아니라 참조라 조인이 필요하다), 문구
 * 자체를 조인 없이 유형만으로 고정해 두면 알림 생성 지점(Task 034)이 매번 문구를 만들 필요가
 * 없다 — 자세한 맥락은 클릭해서 이동한 화면에서 확인한다.
 */
const NOTIFICATION_MESSAGE_BY_TYPE: Record<NotificationType, string> = {
  poll_closed: strings.notification.messages.pollClosed,
  join_request_received: strings.notification.messages.joinRequestReceived,
  join_request_approved: strings.notification.messages.joinRequestApproved,
  join_request_rejected: strings.notification.messages.joinRequestRejected,
  invitation_received: strings.notification.messages.invitationReceived,
  staff_appointed: strings.notification.messages.staffAppointed,
  member_removed: strings.notification.messages.memberRemoved,
  meetup_created: strings.notification.messages.meetupCreated,
  meetup_cancelled: strings.notification.messages.meetupCancelled,
  post_commented: strings.notification.messages.postCommented,
  ownership_transferred: strings.notification.messages.ownershipTransferred,
  crew_disbanded: strings.notification.messages.crewDisbanded,
  poll_withdrawn: strings.notification.messages.pollWithdrawn,
};

export function getNotificationMessage(type: NotificationType): string {
  return NOTIFICATION_MESSAGE_BY_TYPE[type];
}

/**
 * `NotificationBell`·`NotificationList`·`NotificationItem`(표현 컴포넌트)이 받는 평평한
 * 조인 결과 — 컨테이너(`NotificationBellContainer` 등)가 원본 `Notification`에서 조립한다
 * (`meetup-view-models.ts`의 `MeetupDetailViewModel`과 같은 자리). `href`는
 * `resolveNotificationHref`가 이미 계산해 둔 값이라 표현 컴포넌트는 라우팅 판정을 다시 하지
 * 않는다(R-015).
 */
export interface NotificationItemViewModel {
  id: Id;
  type: NotificationType;
  title: string;
  isRead: boolean;
  createdAt: ISODateTimeString;
  href: string | null;
}

export function toNotificationItemViewModel(notification: Notification): NotificationItemViewModel {
  return {
    id: notification.id,
    type: notification.type,
    title: getNotificationMessage(notification.type),
    isRead: notification.readAt !== null,
    createdAt: notification.createdAt,
    href: resolveNotificationHref(notification),
  };
}
