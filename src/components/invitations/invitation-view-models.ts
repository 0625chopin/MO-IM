import type { Id, ISODateTimeString } from "@/lib/types";

/**
 * `InvitationList`(표현)가 받는 초대 한 건의 모양(SC-20, FR-021·028, Task 017B). 크루명·
 * 초대자 표시 이름·만료일은 `InvitationInboxContainer`가 `Invitation`·`Crew`·`Profile` 조인을
 * 이미 끝낸 값이다(R-015 — 표현 컴포넌트는 조회하지 않는다, D-030 ①).
 */
export interface InvitationRowViewModel {
  id: Id;
  crewId: Id;
  crewName: string;
  /**
   * `null`은 "이 초대의 크루 색을 모른다"를 뜻한다(33일차, I-158 처분) — `0`(팔레트
   * 첫 색)과 절대 혼동하면 안 된다. `getCrewById`의 private+비소속 폴백
   * (`src/lib/data/supabase/crew.ts`)이 `colorKey`를 진짜 값 대신 `0`으로 채워 줄 수
   * 있는데, 이 컨테이너는 멤버십 게이트 없이 그 폴백을 실제로 탈 수 있는 소비자라
   * `InvitationInboxContainer`가 그 경우를 걸러 `null`로 넘긴다 — 소비자
   * (`InvitationList`/`CrewColorDot`)는 `null`을 받으면 가짜 색을 칠하지 않고 중립
   * 표시로 대체해야 한다.
   */
  crewColorIndex: number | null;
  inviterDisplayName: string;
  /** 발급 후 14일(요구사항 2.2절 용어집). 카드에는 절대 날짜로 표시한다(NFR-025). */
  expiresAt: ISODateTimeString;
}
