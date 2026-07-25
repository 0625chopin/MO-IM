import { toCrewCardViewModel, type CrewCardViewModel } from "@/components/crews/crew-explore-view-models";
import {
  getPublicCrewMemberCount,
  listCrewMembers,
  listCrews,
  listCrewsByProfile,
  type ListCrewsQuery,
} from "@/lib/data";
import { isActiveMembership } from "@/lib/rules/crew-membership-transition";
import type { Id } from "@/lib/types";

export interface FetchCrewCardsPageResult {
  items: CrewCardViewModel[];
  nextCursor: Id | null;
}

/**
 * 크루 탐색 카드 목록 조회(FR-014, Task 016A) — `CrewExploreContainer`(최초 페이지)와
 * `loadMoreCrewsAction`(무한 스크롤 다음 페이지)이 똑같이 필요로 하는 "`Crew[]` →
 * `CrewCardViewModel[]`" 조인을 한 곳에 모은다. 흩어 두면 "가입됨" 배지 판정이 두 곳에서
 * 각자 계산되다가 어긋나는 R-015류 위험이 생긴다 — `resolve-board-viewer.ts`가 게시판
 * 컨테이너 둘(목록·상세)이 공유하는 조회를 한 곳에 모은 것과 같은 이유다.
 *
 * `.ts`(비-`.tsx`) 파일이라 `eslint.config.mjs` zone 6으로 떨어져 `@/lib/data` 배럴 import가
 * 허용된다 — `resolve-board-viewer.ts`와 같은 위치·같은 취급이다(`docs/CONVENTIONS.md`
 * "그 외 src/**" 행 참고).
 */
export async function fetchCrewCardsPage(
  query: ListCrewsQuery,
): Promise<FetchCrewCardsPageResult> {
  const [page, memberCrews] = await Promise.all([
    listCrews(query),
    query.viewerProfileId ? listCrewsByProfile(query.viewerProfileId) : Promise.resolve([]),
  ]);
  const memberCrewIds = new Set(memberCrews.map((c) => c.id));

  const items = await Promise.all(
    page.items.map(async (crew) => {
      const isMember = memberCrewIds.has(crew.id);
      // I-081 해소 — 비소속 방문자(anon 포함)에게는 listCrewMembers(직접 select)가 crew_
      // memberships RLS에 걸려 항상 0행을 준다. 이 목록에 비소속자 기준으로 뜨는 크루는
      // 정의상 항상 public이므로(listCrews가 private을 애초에 걸러 준다, D-007) RLS를
      // 우회하는 crew_directory_summary RPC(getPublicCrewMemberCount)로 정확한 값을 받는다
      // — 소속 크루(isMember)는 listCrewMembers가 원래 정확하므로 그대로 둔다.
      const memberCount = isMember
        ? (await listCrewMembers(crew.id)).filter((m) => isActiveMembership(m.status)).length
        : await getPublicCrewMemberCount(crew.id);
      return toCrewCardViewModel(crew, memberCount, isMember);
    }),
  );

  return { items, nextCursor: page.nextCursor };
}
