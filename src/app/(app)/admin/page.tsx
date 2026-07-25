import { Suspense } from "react";

import { AdminReportQueueSkeleton } from "@/components/admin/AdminReportQueueSkeleton";
import { AdminReportsContainer } from "@/components/admin/AdminReportsContainer";
import { strings } from "@/lib/strings";

/**
 * 관리자 콘솔 — 신고 대기열 (SC-21 `/admin`, FR-082, Task 042B). 접근 게이트는
 * `(app)/admin/layout.tsx`가 담당한다(AC2). 이 페이지는 대기열 조회·처리 UI만 조립한다.
 */
export default function AdminReportsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          {strings.admin.reports.title}
        </h1>
        <p className="text-sm text-muted-foreground">{strings.admin.reports.description}</p>
      </div>
      <Suspense fallback={<AdminReportQueueSkeleton />}>
        <AdminReportsContainer />
      </Suspense>
    </main>
  );
}
