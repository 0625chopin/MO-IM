"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  isNotificationPayload,
  NOTIFICATION_CREATED_EVENT,
  subscribeToNotifications,
} from "@/components/notifications/notification-channel";
import { resolveNotificationHref } from "@/components/notifications/notification-routing";
import { getNotificationMessage } from "@/components/notifications/notification-view-models";
import { toast } from "@/components/ui/toast";
import { markNotificationReadAction } from "@/lib/actions/mark-notification-read";
import { describeRealtimeError } from "@/lib/realtime";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

/**
 * ToastHost(Task 023, FR-070) — 렌더링 결과가 없는(`return null`) 전역 구독자. 루트
 * 레이아웃(`src/app/layout.tsx`)에 한 번 배치한다(D-030 ④ "인증·전역 경계는 레이아웃에서").
 * 실제 토스트 위젯 자체(원자)는 이미 Task 013의 `<Toaster />`가 렌더한다 — 이 컴포넌트는
 * "언제·무엇을 보여줄지"만 결정해 `toast.show(...)`를 부르는 쪽이다.
 *
 * `subscribeToNotifications`(D-030 ②, 알림 채널 추상화)로 이 사용자 앞으로 온 알림 생성
 * 이벤트를 받는다. **알림 끔 사용자에게는 토스트를 생략한다는 예외(FR-070 E1)는 이번
 * 회차에서 구현하지 않는다** — 그 판정에 필요한 `NotificationPreference`(FR-072)는 Task 023
 * 범위 밖이다(팀장 지시 대상 FR이 045·070·071만이고 072는 "보완"·W등급).
 *
 * **클릭 시 이동 + 읽음 처리(FR-070 AC4)**: 토스트 전체를 클릭 영역으로 만들지 않고 Base UI의
 * 액션 버튼 확장점을 쓴다(`ui/toast.tsx` 모듈 docstring 참고) — 5초 자동소멸 위젯 전체가
 * 클릭 영역이면 닫기 버튼을 누르려다 실수로 이동하는 오탐이 생기기 쉽다.
 */
export function ToastHostContainer({ profileId }: { profileId: Id }) {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = subscribeToNotifications(
      profileId,
      (event) => {
        if (event.type !== NOTIFICATION_CREATED_EVENT || !isNotificationPayload(event.payload)) return;
        const notification = event.payload;
        if (notification.recipientId !== profileId) return;

        const href = resolveNotificationHref(notification);
        toast.show({
          title: getNotificationMessage(notification.type),
          actionLabel: href ? strings.notification.bell.goTo : undefined,
          onAction: href
            ? () => {
                void markNotificationReadAction(notification.id);
                router.push(href);
              }
            : undefined,
        });
      },
      (error) => {
        // `cause`(원본 소켓 에러) 노출 폭을 줄인다(19일차 CORE 교차검증 후속, 같은 이유).
        console.error("[notifications] toast subscription error", describeRealtimeError(error));
      },
    );
    return unsubscribe;
  }, [profileId, router]);

  return null;
}
