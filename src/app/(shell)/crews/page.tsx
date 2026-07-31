import Link from "next/link";
import { Suspense } from "react";

import { CREW_CREATE_HREF } from "@/components/crews/crew-links";
import { CrewExploreContainer } from "@/components/crews/CrewExploreContainer";
import { CrewGridSkeleton } from "@/components/crews/CrewGridSkeleton";
import { CrewSearchBar } from "@/components/crews/CrewSearchBar";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { Button } from "@/components/ui/button";
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
 *
 * **크루 개설(SC-08) 진입점은 이 페이지 제목 줄에 있다** — `CREW_CREATE_HREF`는 정의만 돼
 * 있고 소비자가 0곳이라 `/crews/new`에 URL 직접 입력 말고는 도달할 수 없었다. PRD §5 메뉴
 * 구조에 "크루 개설"이 독립 nav 항목으로 없으므로(그래서 `nav-items.ts`에 넣지 않는다) 개설
 * 대상을 이미 찾고 있는 화면인 탐색 페이지에 둔다. 라벨은 `crew.create.title`을 그대로
 * 재사용한다 — 이동해서 보게 될 페이지 제목과 같은 뜻이라 별도 문자열을 만들지 않는다
 * (`strings/README.md` §4, 헤더 내비가 `crew.explore.title`을 공유하는 것과 같은 결).
 *
 * **게스트에게는 숨긴다** — 권한 매트릭스의 `crew:create` 행이 `guest: deny`라 눌러도
 * `(app)` 가드에 걸려 `/login`으로 튕긴다. `nav-items.ts`가 캘린더·알림을 게스트에게
 * 내려주지 않는 것과 같은 fail-closed 처리다(D-030 ③). 실제 권한 검사는 이 표시 분기가
 * 아니라 `createCrewAction`이 자기 세션으로 다시 한다 — Server Action은 이 페이지를 거치지
 * 않고 직접 POST될 수 있기 때문이다.
 */
export default async function CrewExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;
  const session = await getAuthSession();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-lg font-medium text-foreground">{strings.crew.explore.title}</h1>
        {isAuthenticated(session) && (
          // `render`가 <a>를 만들므로 nativeButton={false} — 기본값(true)이면 Base UI가
          // 네이티브 <button>을 기대해 링크에 button 시맨틱이 덧씌워진다(BoardList.tsx의
          // "글쓰기" 버튼과 같은 자리·같은 처리).
          <Button size="sm" nativeButton={false} render={<Link href={CREW_CREATE_HREF} />}>
            {strings.crew.create.title}
          </Button>
        )}
      </div>
      <CrewSearchBar initialQuery={q ?? ""} initialCategory={category ?? null} />
      <Suspense key={`${q ?? ""}:${category ?? ""}`} fallback={<CrewGridSkeleton />}>
        <CrewExploreContainer query={q} category={category} />
      </Suspense>
    </main>
  );
}
