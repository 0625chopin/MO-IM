import { Suspense } from "react";

import { AdminReportQueueSkeleton } from "@/components/admin/AdminReportQueueSkeleton";
import { AdminReportsContainer } from "@/components/admin/AdminReportsContainer";
import { AdminReportStatusTabs } from "@/components/admin/AdminReportStatusTabs";
import { parseReportStatusFilter } from "@/lib/rules/report-resolution";
import { strings } from "@/lib/strings";

/**
 * 관리자 콘솔 — 신고 대기열·처리 이력 (SC-21 `/admin`, FR-082, Task 042B, I-077). 접근
 * 게이트는 `(app)/admin/layout.tsx`가 담당한다(AC2). 이 페이지는 상태 필터 탭 + 조회·처리
 * UI만 조립한다 — `page.tsx`는 얇은 껍데기다(`docs/CONVENTIONS.md`), 실제 조회는
 * `AdminReportsContainer`(D-030 ①)가 한다.
 *
 * **26일차(I-077) — 상태 필터 추가.** `admin_list_reports` RPC는 처음부터 `p_status`에
 * `null`(전체)을 받았지만 이 화면은 `pending`(대기열)만 노출했다 — 관리자가 지난 처리
 * 이력을 확인할 방법이 없었다. `/crews`(`CrewExplorePage`)의 `searchParams` 기반 필터
 * 패턴을 그대로 따른다: Next.js 16 `searchParams`는 비동기라 `await`하고, 필터 값을
 * `Suspense`의 `key`로 써서 필터가 바뀔 때마다 그 아래만 다시 로딩 스켈레톤을 보여준다.
 * 탭(`AdminReportStatusTabs`)은 `Suspense` **밖**에 둔다 — `CrewSearchBar`가 검색바를
 * `Suspense` 밖에 두는 것과 같은 이유로, 필터가 바뀌는 동안에도 탭 자체는 사라지면 안 된다.
 *
 * `parseReportStatusFilter`(순수 함수, `lib/rules/report-resolution.ts`)가 잘못된/누락된
 * `?status=` 값을 조용히 `"pending"`으로 되돌린다 — 오타·구버전 링크로 404·크래시를 내지
 * 않는다.
 */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: rawStatus } = await searchParams;
  const status = parseReportStatusFilter(rawStatus);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          {strings.admin.reports.title}
        </h1>
        <p className="text-sm text-muted-foreground">{strings.admin.reports.description}</p>
      </div>
      <AdminReportStatusTabs status={status}>
        <Suspense key={status} fallback={<AdminReportQueueSkeleton />}>
          <AdminReportsContainer status={status} />
        </Suspense>
      </AdminReportStatusTabs>
    </main>
  );
}
