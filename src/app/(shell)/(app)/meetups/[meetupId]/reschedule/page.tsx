import { Suspense } from "react";

import { MeetupRescheduleContainer } from "@/components/meetup/MeetupRescheduleContainer";
import { MeetupRescheduleSkeleton } from "@/components/meetup/MeetupRescheduleSkeleton";

/**
 * "일정 변경 제안" 전용 글쓰기 페이지(I-079/FR-065 AC2, 26일차 BOARD). `/meetups/[meetupId]`
 * (Meetup 상세)에서만 진입한다 — 대상 Meetup이 리소스 ID로 특정돼야 하므로(R-016·FR-052)
 * 이 Meetup 리소스 경로의 하위에 둔다. 얇은 껍데기 — 실제 조회·게이트·폼은
 * `MeetupRescheduleContainer`가 한다(D-030 ①, `meetups/[meetupId]/page.tsx`와 같은 패턴).
 *
 * Next.js 16에서 `params`는 비동기다 — await 한다.
 */
export default async function MeetupReschedulePage({
  params,
}: {
  params: Promise<{ meetupId: string }>;
}) {
  const { meetupId } = await params;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<MeetupRescheduleSkeleton />}>
        <MeetupRescheduleContainer meetupId={meetupId} />
      </Suspense>
    </main>
  );
}
