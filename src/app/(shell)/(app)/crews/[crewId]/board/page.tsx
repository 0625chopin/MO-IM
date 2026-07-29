import { Suspense } from "react";

import { BoardListContainer } from "@/components/board/BoardListContainer";
import { BoardListSkeleton } from "@/components/board/BoardListSkeleton";
import { strings } from "@/lib/strings";

/**
 * 커뮤니티 게시판 페이지(SC-10, FR-031, Task 018A). `page.tsx`는 얇은 껍데기다(`docs/CONVENTIONS.md`
 * "src/app/은 라우팅과 조립만 한다") — 실제 조회·판정은 `BoardListContainer`(D-030 ①)가 한다.
 *
 * Next.js 16에서 `params`·`searchParams`는 비동기다 — 둘 다 await 한다.
 */
export default async function CrewBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ crewId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { crewId } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <h1 className="font-heading text-lg font-medium text-foreground">{strings.board.list.title}</h1>
      <Suspense fallback={<BoardListSkeleton />}>
        <BoardListContainer crewId={crewId} page={page} />
      </Suspense>
    </main>
  );
}
