"use client";

import { Bell } from "lucide-react";
import Link from "next/link";

import type { NotificationItemViewModel } from "@/components/notifications/notification-view-models";
import { NotificationList } from "@/components/notifications/NotificationList";
import { NotificationListSkeleton } from "@/components/notifications/NotificationListSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { NotificationImpressionItem } from "@/lib/actions/record-notification-impression";
import { strings, t } from "@/lib/strings";
import type { Id } from "@/lib/types";

export interface NotificationBellProps {
  unreadCount: number;
  notifications: NotificationItemViewModel[];
  /** 최초 조회가 아직 끝나지 않았을 때(컨테이너의 Suspense 경계 밖에서 쓰는 경우 대비). */
  isLoading?: boolean;
  /** 최초 조회 실패(D-030 ③ 도메인 오류) — 배지 없이 팝오버 안에서만 오류를 보여준다. */
  loadError?: boolean;
  onSelect?: (id: Id) => void;
  onMarkAllRead?: () => void;
  /** NFR-030 KPI-3 분모 — `NotificationList`로 그대로 전달한다(팝오버가 열려 실제로 렌더될
   *  때만 마운트되므로 "벨을 열어 봤다"가 곧 노출이다). */
  onImpression?: (items: NotificationImpressionItem[]) => void;
}

/**
 * 헤더 알림 벨(Task 023, FR-070·071) — 표현 컴포넌트(D-030 ①). `HeaderNav`가 이 컴포넌트를
 * 감싼 `NotificationBellServerContainer`를 슬롯으로 받아 렌더한다. 팝오버 안에 최근 알림
 * `NotificationList`와 "모든 알림 보기"(`/notifications`, SC-18) 링크를 둔다 — 목록 자체를
 * 다시 그리지 않고 그 페이지의 전체 목록으로 위임한다.
 */
export function NotificationBell({
  unreadCount,
  notifications,
  isLoading = false,
  loadError = false,
  onSelect,
  onMarkAllRead,
  onImpression,
}: NotificationBellProps) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={strings.notification.bell.triggerLabel}
        render={
          <Button variant="ghost" size="icon" className="relative">
            <Bell aria-hidden="true" className="size-4.5" />
            {unreadCount > 0 && (
              <Badge
                aria-hidden="true"
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 min-w-4 px-1 font-mono text-[10px] tnum"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            )}
            {unreadCount > 0 && (
              <span className="sr-only">{t((s) => s.common.a11y.unreadCount, { n: unreadCount })}</span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 max-w-[90vw] p-2">
        <div className="flex items-center justify-between px-1 py-1">
          <p className="font-heading text-sm font-medium text-foreground">{strings.notification.center.title}</p>
        </div>
        <Separator className="mb-1" />
        {isLoading ? (
          <NotificationListSkeleton rows={3} />
        ) : loadError ? (
          <ErrorState
            title={strings.notification.center.loadError}
            description={strings.notification.center.loadErrorDescription}
            className="border-none shadow-none"
          />
        ) : (
          <NotificationList
            notifications={notifications}
            onSelect={onSelect}
            onMarkAllRead={onMarkAllRead}
            onImpression={onImpression}
          />
        )}
        <Separator className="mt-1" />
        <Link
          href="/notifications"
          className="block rounded-md px-2 py-2 text-center text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {strings.notification.bell.viewAll}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
