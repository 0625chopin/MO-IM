import type { Id } from "@/lib/types";

/**
 * 게시판 경로 조립 — 항상 `crewId`·`postId` **리소스 ID**로부터 계산한다(R-016·FR-052). 어디에도
 * 완성된 경로 문자열을 저장해 두지 않는다 — 라우트 규칙이 바뀌면(예: 다국어 세그먼트 추가) 이
 * 두 함수만 고치면 호출부는 그대로다.
 */
export function getBoardListHref(crewId: Id): string {
  return `/crews/${crewId}/board`;
}

export function getPostDetailHref(crewId: Id, postId: Id): string {
  return `/crews/${crewId}/board/${postId}`;
}

/** 글쓰기 경로(FR-030, FR-065 "일정 변경"이 여기로 유도한다 — `community-expansion-041.md`
 *  §3 참고). */
export function getBoardWriteHref(crewId: Id): string {
  return `/crews/${crewId}/board/new`;
}
