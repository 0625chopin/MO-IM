import { Suspense } from "react";

import { HomeCalendarSummaryContainer } from "@/components/calendar/HomeCalendarSummaryContainer";
import { HomeCalendarSummarySkeleton } from "@/components/calendar/HomeCalendarSummarySkeleton";
import { PageHeader } from "@/components/shell/PageHeader";
import { strings } from "@/lib/strings";

/**
 * 홈 대시보드 페이지 (SC-06, PRD §6 "홈 대시보드 페이지"). "다가오는 모임" 캘린더 요약은
 * Task 021B가 채웠다 — 소속 크루 카드·최근 알림 미리보기(F039)는 이 Task 범위 밖이라 이후
 * 채운다(경계 근거는 `HomeCalendarSummary.tsx` 모듈 docstring 참고).
 *
 * **`Suspense`(CORE 재검증 지적, 7일차)**: `board`·`chat`과 달리 이 페이지는 Suspense 없이
 * `HomeCalendarSummaryContainer`를 직접 렌더해 왔다 — `HomeCalendarSummarySkeleton`을 새로
 * 만들어 연결했다(`/calendar/page.tsx`와 같은 회차의 같은 지적).
 */
export default function HomeDashboardPage() {
  return (
    <main className="flex flex-1 flex-col gap-6">
      <PageHeader title={strings.home.dashboard.title} />
      <div className="p-4">
        <Suspense fallback={<HomeCalendarSummarySkeleton />}>
          <HomeCalendarSummaryContainer />
        </Suspense>
      </div>
    </main>
  );
}
