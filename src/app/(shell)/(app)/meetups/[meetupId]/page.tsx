import { Suspense } from "react";

import { MeetupDetailContainer } from "@/components/meetup/MeetupDetailContainer";
import { MeetupDetailSkeleton } from "@/components/meetup/MeetupDetailSkeleton";

/**
 * Meetup 상세 페이지 (SC-17, PRD §6 "Meetup 상세 페이지", FR-064·066~068, Task 022). 얇은
 * 껍데기 — 실제 조회·크루원 게이트·참석 상태 판정은 `MeetupDetailContainer`가 한다(D-030 ①).
 * 진입 경로가 통합 캘린더·알림·원 제안글 세 곳이라 `/calendar` 하위가 아니라 최상위 리소스
 * 경로로 둔다(R-016/FR-052 — 경로가 아니라 meetupId 기준). 캘린더 쪽 진입 경로는
 * `src/components/meetup/meetup-links.ts`의 `getMeetupDetailHref` 하나로 모아 뒀다 — 이
 * 경로 규칙이 바뀌어도 그 함수만 고치면 된다.
 *
 * Next.js 16에서 `params`는 비동기다 — await 한다.
 */
export default async function MeetupDetailPage({
  params,
}: {
  params: Promise<{ meetupId: string }>;
}) {
  const { meetupId } = await params;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<MeetupDetailSkeleton />}>
        <MeetupDetailContainer meetupId={meetupId} />
      </Suspense>
    </main>
  );
}
