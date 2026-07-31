import type { Id } from "@/lib/types";

/**
 * 크루 관련 경로 조립 — 항상 `crewId` **리소스 ID**로부터 계산한다(R-016·FR-052,
 * `components/board/board-links.ts`와 같은 패턴). 게시판 경로(`/crews/{crewId}/board`)는
 * 이 파일에서 새로 만들지 않고 `board-links.ts`의 `getBoardListHref`를 그대로 재사용한다 —
 * 같은 문자열을 두 곳에서 조립하면 라우트 규칙이 바뀔 때 한쪽을 빠뜨리기 쉽다.
 */
export function getCrewHomeHref(crewId: Id): string {
  return `/crews/${crewId}`;
}

/**
 * 크루 홈 탭(팀장 요청) — 모임투표·게시판·활동내역·활동사진·크루원·채팅을 크루 홈 한 화면에서
 * 전환한다. 하위 라우트가 아니라 검색 파라미터인 이유는 셋이다:
 *
 * 1. 크루 홈은 `(app)` 밖이라(게스트도 도달한다, D-007) 하위 라우트로 쪼개면 크루원 게이트가
 *    있는 `(app)/crews/[crewId]/*`와 두 벌의 트리를 유지하게 된다.
 * 2. 탭을 바꿔도 **크루 헤더는 그대로**라는 것이 이 화면의 요점이다 — 링크 하나로 문서 전체가
 *    바뀌는 하위 라우트보다 같은 문서의 다른 절이라는 표현이 맞다.
 * 3. 검색 파라미터는 서버 컴포넌트가 그대로 읽는다 — 탭 전환에 클라이언트 상태가 필요 없고,
 *    각 탭의 데이터를 서버에서 조회하는 지금 구조를 그대로 쓸 수 있다.
 *
 * 값 목록은 `CREW_HOME_TABS`(`crew-home-tabs.ts`)가 단일 소스다.
 */
export function getCrewHomeTabHref(crewId: Id, tab: string): string {
  return `/crews/${crewId}?tab=${tab}`;
}

export function getCrewChatHref(crewId: Id): string {
  return `/crews/${crewId}/chat`;
}

export function getCrewMembersHref(crewId: Id): string {
  return `/crews/${crewId}/members`;
}

export function getCrewSettingsHref(crewId: Id): string {
  return `/crews/${crewId}/settings`;
}

export const CREW_CREATE_HREF = "/crews/new";
export const CREW_EXPLORE_HREF = "/crews";
