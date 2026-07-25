import type { Comment } from "@/lib/types";

/**
 * 댓글 depth 제한 판정 — 순수 함수(NFR-036, R-015, Task 041, FR-033 "범위 판단").
 *
 * requirements.md FR-033 "범위 판단"이 대댓글(답글) depth를 1단계로 제한한다고 확정했다 —
 * 답글에는 다시 답글을 달 수 없다. `Comment.parentId`가 이미 이 트리를 표현할 수 있는
 * 모양이라(자기참조) 스키마는 무제한 depth를 막지 않는다 — 이 제한은 애플리케이션(쓰기
 * Server Action)이 강제해야 한다.
 *
 * 판정 대상은 "답글을 달려는 부모 댓글"이다 — 그 부모 자신이 이미 답글(parentId !== null)
 * 이면 거부한다(부모가 최상위 댓글일 때만 답글을 허용).
 */
export function canReplyToComment(parentComment: Pick<Comment, "parentId">): boolean {
  return parentComment.parentId === null;
}
