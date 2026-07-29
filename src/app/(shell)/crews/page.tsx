import { Suspense } from "react";

import { CrewExploreContainer } from "@/components/crews/CrewExploreContainer";
import { CrewGridSkeleton } from "@/components/crews/CrewGridSkeleton";
import { CrewSearchBar } from "@/components/crews/CrewSearchBar";
import { strings } from "@/lib/strings";

/**
 * 크루 탐색 페이지(SC-07, FR-014, D-007·D-017, Task 016A). `private` 크루 비노출 규칙(D-017)은
 * 데이터 접근 레이어(`listCrews`)에서 구현하며 이 화면 자체와 무관하다 — 여기서는 걸러지지
 * 않는다. 제목은 `crew.explore.title`을 쓴다 — PRD §5 메뉴 구조의 헤더 항목명("크루 탐색")과
 * 같은 문구라 헤더 내비(`nav-items.ts`)도 이 키를 그대로 재사용한다.
 *
 * `page.tsx`는 얇은 껍데기다(`docs/CONVENTIONS.md` "src/app/은 라우팅과 조립만 한다") — 실제
 * 조회는 `CrewExploreContainer`(D-030 ①)가 한다. Next.js 16에서 `searchParams`는 비동기라
 * await 한다.
 *
 * **검색바는 `Suspense` 밖에 둔다** — 검색어·카테고리가 바뀌어 결과가 다시 로딩되는 동안에도
 * 입력창·카테고리 칩 자체는 사라지면 안 된다(AC4는 "결과" 영역의 로딩만 요구한다). 대신
 * `Suspense`의 `key`를 현재 필터로 잡아, 필터가 바뀔 때마다 그 아래 서브트리를 새로 마운트해
 * 폴백(`CrewGridSkeleton`)이 다시 보이게 한다 — App Router가 searchParams 변경만으로는 이미
 * 완료된 Suspense 경계를 자동으로 재중단시키지 않기 때문이다.
 */
export default async function CrewExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4">
      <h1 className="font-heading text-lg font-medium text-foreground">{strings.crew.explore.title}</h1>
      <CrewSearchBar initialQuery={q ?? ""} initialCategory={category ?? null} />
      <Suspense key={`${q ?? ""}:${category ?? ""}`} fallback={<CrewGridSkeleton />}>
        <CrewExploreContainer query={q} category={category} />
      </Suspense>
    </main>
  );
}
