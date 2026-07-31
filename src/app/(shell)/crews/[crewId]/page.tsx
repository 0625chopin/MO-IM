import { Suspense } from "react";

import { resolveCrewHomeTab } from "@/components/crews/crew-home-tabs";
import { CrewHomeContainer } from "@/components/crews/CrewHomeContainer";
import { CrewHomeSkeleton } from "@/components/crews/CrewHomeSkeleton";

/**
 * 크루 홈 페이지 (SC-09, PRD §6 "크루 홈 페이지", F006·F011, Task 016B). `public`/`private`
 * 접근 조건 분기와 가입 신청 상태 기계는 `CrewHomeContainer`(D-030 ①)가 조립한다. 리소스
 * 링크는 경로 문자열이 아니라 crewId 기준으로 구성한다(R-016/FR-052, `crew-links.ts`).
 *
 * `(app)` 밖이다 — 게스트도 `public` 크루 소개까지는 볼 수 있다(D-007, D-030 ④ 절 참고).
 * Next.js 16에서 `params`·`searchParams`는 비동기라 둘 다 await 한다.
 *
 * **`?tab=`(팀장 요청)** — 모임투표·게시판·활동내역·활동사진·크루원·채팅이 이 한 화면의 탭이다.
 * 알 수 없는 값은 404가 아니라 기본 탭으로 되돌린다(`resolveCrewHomeTab`) — 옛 링크나 오타로
 * 크루 홈 자체에 못 들어가는 것이 사용자에게 더 나쁘다.
 */
export default async function CrewHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ crewId: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { crewId } = await params;
  const { tab: tabParam, page: pageParam } = await searchParams;
  const tab = resolveCrewHomeTab(tabParam);
  const page = Math.max(1, Number(pageParam) || 1);

  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<CrewHomeSkeleton />}>
        <CrewHomeContainer crewId={crewId} tab={tab} page={page} />
      </Suspense>
    </main>
  );
}
