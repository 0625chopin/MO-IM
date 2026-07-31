import { toCrewCardViewModel, type CrewCardViewModel } from "@/components/crews/crew-explore-view-models";
import {
  getChatRoomByCrewId,
  getPublicCrewMemberCount,
  getUnreadMessageCount,
  listCrewMembers,
  listCrews,
  listCrewsByProfile,
  type ListCrewsQuery,
} from "@/lib/data";
import { isActiveMembership } from "@/lib/rules/crew-membership-transition";
import type { Crew, Id } from "@/lib/types";

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
    page.items.map((crew) => toCardWithCounts(crew, memberCrewIds.has(crew.id), query.viewerProfileId)),
  );

  return { items, nextCursor: page.nextCursor };
}

/**
 * 홈 대시보드 "내 크루" 섹션(SC-06)용 카드 목록 — 조회자가 **활성 크루원인 크루만** 담는다.
 * `fetchCrewCardsPage`와 같은 파일에 두는 이유는 위 docstring과 같다: 카드 한 장을 채우는
 * 조인(크루원 수·읽지 않은 메시지 수)이 두 화면에서 각자 계산되면 어긋난다. **D-062가
 * 예고한 이관 지점**이기도 하다 — 그 결정은 "홈에 전용 내 크루 섹션이 생기면 배지 계산을
 * 그대로 옮기면 된다"고 적었는데, 옮기는 대신 `toCardWithCounts`로 공유해 `/crews`의 배지와
 * 홈의 배지가 한 코드에서 나오게 했다.
 *
 * `listCrewsByProfile`은 정렬을 보장하지 않고(`crews.id in (...)` 조회) 기본적으로 해산된
 * 크루를 제외한다 — 홈에 필요한 필터가 정확히 그것이라 옵션을 넘기지 않는다(D-040).
 * 이름순 정렬은 여기서 한다: 홈에 다시 방문할 때마다 카드 순서가 바뀌면 위치로 기억하는
 * 사용자가 매번 다시 찾아야 한다.
 */
export async function fetchMyCrewCards(viewerProfileId: Id): Promise<CrewCardViewModel[]> {
  const crews = await listCrewsByProfile(viewerProfileId);
  const items = await Promise.all(
    crews.map((crew) => toCardWithCounts(crew, true, viewerProfileId)),
  );
  return items.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/**
 * `Crew` 한 건 → 카드 뷰모델. 크루원 수와 읽지 않은 메시지 수는 `Crew`에 없어 여기서 조인한다.
 */
async function toCardWithCounts(
  crew: Crew,
  isMember: boolean,
  /** `ListCrewsQuery.viewerProfileId`가 비로그인 방문자를 `null`로도 표현해 둘 다 받는다. */
  viewerProfileId: Id | null | undefined,
): Promise<CrewCardViewModel> {
  // I-081 해소 — 비소속 방문자(anon 포함)에게는 listCrewMembers(직접 select)가 crew_
  // memberships RLS에 걸려 항상 0행을 준다. 이 목록에 비소속자 기준으로 뜨는 크루는
  // 정의상 항상 public이므로(listCrews가 private을 애초에 걸러 준다, D-007) RLS를
  // 우회하는 crew_directory_summary RPC(getPublicCrewMemberCount)로 정확한 값을 받는다
  // — 소속 크루(isMember)는 listCrewMembers가 원래 정확하므로 그대로 둔다.
  const memberCount = isMember
    ? (await listCrewMembers(crew.id)).filter((m) => isActiveMembership(m.status)).length
    : await getPublicCrewMemberCount(crew.id);
  // FR-055 AC1 — 비소속자는 채팅방 접근 권한이 없어(FR-050 AC3) 조회 자체를 생략한다.
  // `viewerProfileId`가 없으면(비로그인) 세어 줄 "내 읽음 지점"이 없어 마찬가지로 0으로 둔다.
  let unreadMessageCount = 0;
  if (isMember && viewerProfileId) {
    const room = await getChatRoomByCrewId(crew.id);
    unreadMessageCount = room ? await getUnreadMessageCount(room.id, viewerProfileId) : 0;
  }
  return toCrewCardViewModel(crew, memberCount, isMember, unreadMessageCount);
}
