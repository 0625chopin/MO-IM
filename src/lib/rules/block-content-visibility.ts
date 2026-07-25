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
 * **적용 범위(Task 042A 결정, `docs/decisions/report-block-042a.md` 참고, I-072 경위 포함)**:
 * 20일차에는 크루원 목록(`MemberList`)에만 배선하고 게시판·채팅은 다른 팀원 소유 도메인과의
 * 동시 작업 충돌을 피해 범위 밖으로 뒀지만, 같은 회차 안에 팀장 판정으로 게시판
 * (`BoardListContainer`·`PostDetailContainer`)·채팅(`MessageListContainer`)까지 배선됐다
 * (I-072 해소). **21일차(Task 041, FR-033)가 댓글(`CommentListContainer`)에도 같은 패턴으로
 * 배선해 I-072의 "댓글은 화면 자체가 없어 남은 범위" 서술을 닫았다** — 이제 네 곳(크루원 목록·
 * 게시판·채팅·댓글) 모두 이 함수를 재사용한다.
 */
import type { Id } from "@/lib/types";

export function isContentFromBlockedAuthor(
  authorId: Id,
  blockedProfileIds: ReadonlySet<Id>,
): boolean {
  return blockedProfileIds.has(authorId);
}
