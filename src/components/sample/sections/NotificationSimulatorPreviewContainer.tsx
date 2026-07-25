"use client";

import { useState } from "react";

import { NotificationBellContainer } from "@/components/notifications/NotificationBellContainer";
import { ToastHostContainer } from "@/components/notifications/ToastHostContainer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { simulateNotificationEventAction } from "@/lib/actions/simulate-notification-event";
import { strings } from "@/lib/strings";
import type { NotificationType } from "@/lib/types";

/** `simulate-notification-event.ts`의 `SAMPLE_RECIPIENT_ID`와 반드시 같은 값이어야 한다 —
 *  `chopin0625@gmail.com`(CLAUDE.md 테스트계정)의 profile id. */
const SAMPLE_PROFILE_ID = "30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a";

const DEMO_TYPES: { type: NotificationType; label: string }[] = [
  { type: "poll_closed", label: "투표 종료" },
  { type: "join_request_received", label: "가입 신청 접수" },
  { type: "invitation_received", label: "초대 수신" },
  { type: "meetup_created", label: "모임 생성" },
];

/**
 * ToastHost·NotificationBell 종단 시연(Task 023) — `PollAutoCloseSimulatorPreview`와 같은
 * 성격이다: **발화 방식만** 버튼 클릭이고, 실제로 도는 코드(`simulateNotificationEventAction`
 * → `createNotification`)는 100% 프로덕션 파이프라인이다.
 *
 * **19일차(Task 033) 업데이트 — 실데이터 전환**: 버튼을 누르면 ① `notifications` 테이블에
 * 실제 행이 생성되고 ② DB 트리거(`notifications_broadcast`)가 `user:{profileId}:notifications`
 * 토픽에 Realtime Broadcast를 보낸다. 아래 미리 마운트해 둔 `ToastHostContainer`·
 * `NotificationBellContainer`가 그 토픽을 구독하고 있으면 토스트·배지가 실시간으로 갱신된다 —
 * 더 이상 같은 탭 안에서만 도는 Mock 루프백(`publishMockEvent`, I-042)이 아니라 실제
 * 백엔드 왕복이다. **단, Realtime Authorization은 `auth.uid() = recipientId`를 요구하므로**
 * (029B §6.2) 이 미리보기가 실시간으로 갱신되는 것을 보려면 **`chopin0625@gmail.com`으로
 * 로그인한 브라우저 세션**에서 `/sample`을 열어야 한다 — 그 계정으로 로그인하지 않은 채
 * 눌러도 알림 행 자체는 DB에 정상적으로 남지만(나중에 그 계정으로 로그인해 알림 센터에서
 * 확인 가능), 이 페이지의 벨·토스트는 구독이 거부돼(`CHANNEL_ERROR`) 갱신되지 않는다.
 */
export function NotificationSimulatorPreviewContainer() {
  const [pendingType, setPendingType] = useState<NotificationType | null>(null);

  async function trigger(type: NotificationType) {
    setPendingType(type);
    try {
      await simulateNotificationEventAction(type);
    } finally {
      setPendingType(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <AlertDescription>
          실 데이터·실 Broadcast 경로입니다. 벨·토스트가 실시간으로 갱신되는 것을 보려면
          chopin0625@gmail.com 계정으로 로그인한 상태에서 이 페이지를 열어야 합니다(Realtime
          Authorization, 029B). 다른 계정(또는 비로그인)으로는 알림 행은 실제로 생성되지만 이
          미리보기에는 실시간으로 나타나지 않습니다.
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-center gap-2">
        {DEMO_TYPES.map(({ type, label }) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            disabled={pendingType !== null}
            onClick={() => void trigger(type)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border p-3">
        <span className="text-xs text-muted-foreground">{strings.notification.center.title}</span>
        <NotificationBellContainer profileId={SAMPLE_PROFILE_ID} initialNotifications={[]} initialUnreadCount={0} />
      </div>
      <ToastHostContainer profileId={SAMPLE_PROFILE_ID} />
    </div>
  );
}
