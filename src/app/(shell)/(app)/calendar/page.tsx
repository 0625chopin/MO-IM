import { Suspense } from "react";

import { MonthCalendarContainer } from "@/components/calendar/MonthCalendarContainer";
import { MonthCalendarSkeleton } from "@/components/calendar/MonthCalendarSkeleton";
import { PageHeader } from "@/components/shell/PageHeader";
import { strings } from "@/lib/strings";

/**
 * 통합 캘린더 페이지 (SC-16, PRD §6 "통합 캘린더 페이지", F030~F033·F035) — Task 021A가
 * `MonthCalendar` 격자 + `MeetupBar`를, Task 021B가 크루 필터·`DayDetailPanel`·홈 대시보드
 * 요약을 채웠다. 날짜·바 클릭은 조회 전용이며 데이터를 생성하지 않는다(D-012).
 *
 * **`Suspense`(CORE 재검증 지적, 7일차)**: `board`(018A)·`chat`(020A)은 처음부터
 * `Suspense`+전용 스켈레톤을 썼는데 이 페이지만 `MonthCalendarContainer`(여러 `await`을 순차
 * 실행하는 async 서버 컴포넌트)를 직접 렌더해 왔다 — `/sample`에 로딩 스켈레톤 **모양**은
 * 이미 있었지만 실제 라우트에 연결돼 있지 않았다. `MonthCalendarSkeleton`으로 뽑아 여기
 * 연결한다.
 *
 * Next.js 16 — `searchParams`는 비동기라 `await`한다.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title={strings.calendar.month.title} />
      <div className="p-4">
        <Suspense fallback={<MonthCalendarSkeleton />}>
          <MonthCalendarContainer monthParam={params.month} />
        </Suspense>
      </div>
    </main>
  );
}
