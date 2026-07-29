import { Suspense } from "react";

import { NotificationCenterContainer } from "@/components/notifications/NotificationCenterContainer";
import { NotificationListSkeleton } from "@/components/notifications/NotificationListSkeleton";
import { strings } from "@/lib/strings";

/**
 * 알림 센터 페이지 (SC-18, PRD §6 "알림 센터 페이지", F025·F039, Task 023). 읽지 않음 배지·항목
 * 클릭 시 이동·일괄 읽음 처리는 `NotificationCenterContainer`(D-030 ①②)가 담당한다.
 */
export default function NotificationCenterPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
      <h1 className="font-heading text-xl font-semibold text-foreground">
        {strings.notification.center.title}
      </h1>
      <Suspense fallback={<NotificationListSkeleton />}>
        <NotificationCenterContainer />
      </Suspense>
    </main>
  );
}
