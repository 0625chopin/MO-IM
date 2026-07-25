"use client";

import {
  Archive,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  Crown,
  Mail,
  MessageSquare,
  ShieldCheck,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { formatNotificationTime } from "@/components/notifications/format-notification-time";
import type { NotificationItemViewModel } from "@/components/notifications/notification-view-models";
import type { Id, NotificationType } from "@/lib/types";
import { cn } from "@/lib/utils";


/** 알림 유형별 장식 아이콘 — 판정 로직이 아니라 시각 구분용이라 이 파일에 인라인해도 R-015
 *  대상이 아니다(`notification-routing.ts`의 라우팅 표와는 다른 성격). */
const NOTIFICATION_ICONS: Record<NotificationType, LucideIcon> = {
  poll_closed: CheckCircle2,
  join_request_received: UserPlus,
  join_request_approved: UserCheck,
  join_request_rejected: UserX,
  invitation_received: Mail,
  staff_appointed: ShieldCheck,
  member_removed: UserMinus,
  meetup_created: CalendarPlus,
  meetup_cancelled: CalendarX,
  post_commented: MessageSquare,
  // FR-025·FR-013(Task 040) — 오너 이양·크루 해산.
  ownership_transferred: Crown,
  crew_disbanded: Archive,
};

export interface NotificationItemProps {
  notification: NotificationItemViewModel;
  /** 항목을 선택(클릭/Enter)했을 때 — 컨테이너가 읽음 처리를 건다(FR-071 AC2). */
  onSelect?: (id: Id) => void;
}

/**
 * 알림 센터 개별 항목(Task 023, FR-071) — 표현 컴포넌트(D-030 ①). `href`가 있으면
 * `next/link`로, 없으면(방어적 — `notification-routing.ts`가 리소스 ID를 못 찾은 경우) 이동
 * 없이 읽음 처리만 하는 버튼으로 렌더한다.
 */
export function NotificationItem({ notification, onSelect }: NotificationItemProps) {
  const Icon = NOTIFICATION_ICONS[notification.type];

  const body = (
    <div
      className={cn(
        "flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-muted",
        !notification.isRead && "bg-accent/40",
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm",
            notification.isRead ? "text-muted-foreground" : "font-medium text-foreground",
          )}
        >
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground">{formatNotificationTime(notification.createdAt)}</p>
      </div>
      {!notification.isRead && (
        <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      )}
    </div>
  );

  const focusRing =
    "block rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

  if (notification.href) {
    return (
      <Link href={notification.href} onClick={() => onSelect?.(notification.id)} className={focusRing}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => onSelect?.(notification.id)} className={cn(focusRing, "w-full")}>
      {body}
    </button>
  );
}
