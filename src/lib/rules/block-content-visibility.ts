/**
 * 차단된 사용자의 콘텐츠 접힘 판정 — 순수 함수(NFR-036, R-015, Task 042A, FR-081 AC1).
 *
 * "B의 콘텐츠가 접힘 처리되고 펼치기 옵션이 제공된다"는 화면 판정이지 서버 판정이 아니다 —
 * 차단해도 B의 게시글·댓글·메시지 자체는 여전히 크루 안에서 존재하고 다른 멤버에게는
 * 그대로 보인다(FR-081은 "숨김"이 아니라 "접힘 + 펼치기"). 그래서 이 판정은 서버 조회를
 * 좁히는 대신, 조회는 그대로 하고 **렌더 시점에 어떻게 보여줄지만** 결정한다 — 이 함수를
 * 호출하는 컨테이너가 뷰어의 차단 목록(`listMyBlockedProfileIds`)과 콘텐츠 작성자 id를
 * 넘기면 된다.
 *
 * **적용 범위(Task 042A 결정, `docs/decisions/report-block-042a.md` 참고)**: 이 순수 함수와
 * `BlockedContentNotice`(표현 컴포넌트)는 이번 회차에 만들었지만, 게시판(`BoardListContainer`·
 * `PostDetailContainer`)·채팅(`MessageListContainer`)에는 아직 배선하지 않았다 — 그 파일들은
 * 다른 팀원 소유 도메인이고 같은 회차에 동시 작업 중이라 충돌 위험이 있어 최소 침습 원칙에
 * 따라 범위 밖으로 뒀다. 크루원 목록(`MemberList`)에는 이번에 직접 배선했다(CREW 소유 도메인).
 */
import type { Id } from "@/lib/types";

export function isContentFromBlockedAuthor(
  authorId: Id,
  blockedProfileIds: ReadonlySet<Id>,
): boolean {
  return blockedProfileIds.has(authorId);
}
