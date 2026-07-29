import { Suspense } from "react";

import { CrewHomeContainer } from "@/components/crews/CrewHomeContainer";
import { CrewHomeSkeleton } from "@/components/crews/CrewHomeSkeleton";

/**
 * 크루 홈 페이지 (SC-09, PRD §6 "크루 홈 페이지", F006·F011, Task 016B). `public`/`private`
 * 접근 조건 분기와 가입 신청 상태 기계는 `CrewHomeContainer`(D-030 ①)가 조립한다. 리소스
 * 링크는 경로 문자열이 아니라 crewId 기준으로 구성한다(R-016/FR-052, `crew-links.ts`).
 *
 * `(app)` 밖이다 — 게스트도 `public` 크루 소개까지는 볼 수 있다(D-007, D-030 ④ 절 참고).
 * Next.js 16에서 `params`는 비동기라 await 한다.
 */
export default async function CrewHomePage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<CrewHomeSkeleton />}>
        <CrewHomeContainer crewId={crewId} />
      </Suspense>
    </main>
  );
}
