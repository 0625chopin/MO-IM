import { Suspense } from "react";

import { CrewSettingsContainer } from "@/components/crews/CrewSettingsContainer";
import { CrewSettingsSkeleton } from "@/components/crews/CrewSettingsSkeleton";

/**
 * 크루 설정 페이지 (SC-15, PRD §6 "크루 설정 페이지", F006·F007·F014·F032, Task 017B). 정보
 * 수정·공개 범위 전환(오너 전용)·캘린더 색 수동 지정(D-016)은 `CrewSettingsContainer`
 * (D-030 ①)가 조립한다. `page.tsx`는 얇은 껍데기다(`docs/CONVENTIONS.md`).
 *
 * `(app)/crews/[crewId]/layout.tsx`의 크루원 게이트를 이미 거친 뒤라 "활성 멤버십인가"는
 * 여기서 다시 확인하지 않는다(D-039). Next.js 16에서 `params`는 비동기라 await 한다.
 */
export default async function CrewSettingsPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<CrewSettingsSkeleton />}>
        <CrewSettingsContainer crewId={crewId} />
      </Suspense>
    </main>
  );
}
