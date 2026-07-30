import type { Id } from "@/lib/types";

/**
 * Meetup 상세 경로 조립 — 항상 `meetupId` **리소스 ID**로부터 계산한다(R-016·FR-052,
 * `board-links.ts`와 같은 이유). 진입 경로가 통합 캘린더·알림·원 제안글 세 곳이라(SC-17,
 * `app/(app)/meetups/[meetupId]/page.tsx` 모듈 docstring) `/calendar` 등 특정 화면 경로에
 * 종속시키지 않고 최상위 리소스 경로로 둔다 — 로케일 세그먼트가 붙거나 캘린더 경로 규칙이
 * 바뀌어도 이 함수 하나만 고치면 된다.
 */
export function getMeetupDetailHref(meetupId: Id): string {
  return `/meetups/${meetupId}`;
}

/** I-079/FR-065 AC2(26일차) — "일정 변경 제안" 전용 글쓰기 진입점. 일반 FR-034 제안
 *  (`getBoardWriteHref`)과 구분되는 경로다 — 대상 Meetup이 리소스 ID로 특정돼야 하므로
 *  `/crews/{crewId}/board/new` 하위가 아니라 이 Meetup 리소스 경로의 하위로 둔다(R-016·FR-052,
 *  이 파일 모듈 docstring과 같은 이유). */
export function getMeetupRescheduleHref(meetupId: Id): string {
  return `/meetups/${meetupId}/reschedule`;
}
