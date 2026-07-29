"use client";

import { BellOff } from "lucide-react";
import { useEffect, useRef } from "react";

import type { NotificationItemViewModel } from "@/components/notifications/notification-view-models";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { NotificationImpressionItem } from "@/lib/actions/record-notification-impression";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";
import { cn } from "@/lib/utils";


export interface NotificationListProps {
  notifications: NotificationItemViewModel[];
  onSelect?: (id: Id) => void;
  onMarkAllRead?: () => void;
  /** NFR-030 KPI-3 분모(알림 노출) — 이 컴포넌트가 실제로 화면에 나타날 때(팝오버가 열리거나
   *  `/notifications` 페이지가 마운트될 때) 호출부가 기록할 수 있게 넘긴다. */
  onImpression?: (items: NotificationImpressionItem[]) => void;
  className?: string;
}

/**
 * 알림 센터 목록(Task 023, FR-071) — 표현 컴포넌트(D-030 ①). `NotificationBell`의 팝오버와
 * `/notifications` 전체 페이지가 이 컴포넌트를 함께 쓴다(같은 화면 요소를 두 군데서 다시
 * 짜지 않는다). 빈 상태(FR-071 AC4)는 이 컴포넌트가 직접 그린다 — 호출부가 매번 `length === 0`
 * 을 판정하지 않게 한다. "모두 읽음"(FR-071 AC3)은 안읽음 항목이 하나라도 있을 때만 보인다.
 *
 * **`onImpression`(Task 045, NFR-030)**: 이 컴포넌트 인스턴스가 살아있는 동안 한 번씩만
 * 항목별로 기록한다(`reportedIdsRef`로 중복 억제 — 읽음 처리 등으로 `notifications` 배열
 * 참조가 바뀌어도 이미 기록한 id는 다시 부르지 않는다). Base UI `Popover`는 닫히면 내용을
 * 언마운트하므로(`PopoverContent`), 벨을 다시 열면 이 컴포넌트가 새로 마운트돼 "다시 노출됨"이
 * 다시 한 번 정확히 기록된다 — 의도된 동작이다(노출은 매번 셀 수 있는 행동이지, 평생 1회
 * 이벤트가 아니다).
 */
export function NotificationList({ notifications, onSelect, onMarkAllRead, onImpression, className }: NotificationListProps) {
  const reportedIdsRef = useRef<Set<Id>>(new Set());

  useEffect(() => {
    if (!onImpression) return;
    const fresh = notifications.filter((n) => !reportedIdsRef.current.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => reportedIdsRef.current.add(n.id));
    onImpression(fresh.map((n) => ({ id: n.id, type: n.type })));
  }, [notifications, onImpression]);

  if (notifications.length === 0) {
    return (
      <Empty className="border-none p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BellOff aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{strings.notification.center.empty}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <EmptyDescription>{strings.notification.center.emptyDescription}</EmptyDescription>
        </EmptyContent>
      </Empty>
    );
  }

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {onMarkAllRead && hasUnread && (
        <div className="flex justify-end px-1 pb-1">
          <Button type="button" variant="ghost" size="sm" onClick={onMarkAllRead}>
            {strings.notification.center.markAllRead}
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {notifications.map((notification) => (
          <li key={notification.id}>
            <NotificationItem notification={notification} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </div>
  );
}
