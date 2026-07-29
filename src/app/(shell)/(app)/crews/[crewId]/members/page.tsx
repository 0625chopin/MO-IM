import { Suspense } from "react";

import { CrewMembersContainer } from "@/components/crews/CrewMembersContainer";
import { CrewMembersSkeleton } from "@/components/crews/CrewMembersSkeleton";

/**
 * 멤버 관리 페이지(SC-14, PRD §6 "멤버 관리 페이지", F009·F010·F012~F015·F032, Task 017A).
 * 역할 정렬 목록·초대 다이얼로그·가입 신청 승인/반려 탭·임원 임명은 `CrewMembersContainer`
 * (D-030 ①)가 조립한다. `page.tsx`는 얇은 껍데기다(`docs/CONVENTIONS.md`).
 *
 * `(app)/crews/[crewId]/layout.tsx`의 크루원 게이트를 이미 거친 뒤라 "활성 멤버십인가"는
 * 여기서 다시 확인하지 않는다(D-039). Next.js 16에서 `params`는 비동기라 await 한다.
 */
export default async function CrewMembersPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<CrewMembersSkeleton />}>
        <CrewMembersContainer crewId={crewId} />
      </Suspense>
    </main>
  );
}
