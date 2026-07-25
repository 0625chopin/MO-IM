import type { Id } from "@/lib/types";

/**
 * `CommentList.tsx`가 받는 댓글 하나의 모양 — `CommentListContainer`가 `Comment`·`Profile`을
 * 조인하고 권한 판정(`comment:update_own`·`comment:delete_own`·`comment:delete_any`)까지 끝낸
 * 결과만 담는다(D-030 ①, `PostDetailViewModel`과 같은 자리). 전부 직렬화 가능한 원시값이다
 * (NFR-037).
 *
 * FR-033 "범위 판단"(depth 1) — `replies`는 최상위 댓글에만 값이 있고, 답글 자신의 `replies`는
 * 항상 빈 배열이다(`CommentListContainer`가 트리를 구성할 때 depth 2 이상을 만들지 않는다).
 */
export interface CommentItemView {
  id: Id;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  body: string;
  /** `deletedAt !== null` — true면 본문 대신 "삭제된 댓글" 플레이스홀더를 그린다(FR-033 AC3).
   *  답글이 있어도 이 댓글 자체는 계속 트리에 남는다 — 호출부가 필터링하지 않는다. */
  isDeleted: boolean;
  /** FR-081 AC1 — 뷰어가 작성자를 차단했는가. 삭제된 댓글은 항상 false(어차피 본문을 안 보여줘
   *  접힘이 의미가 없다). */
  isAuthorBlocked: boolean;
  /** `comment:update_own` 판정 결과. */
  canEdit: boolean;
  /** `comment:delete_own` 또는 `comment:delete_any` 판정 결과. */
  canDelete: boolean;
  /** 최상위 댓글에서만 답글을 달 수 있다(depth 1 제한, `canReplyToComment`). 삭제된 댓글에도
   *  답글은 달 수 있다 — 요구사항이 이를 막지 않는다("삭제된 댓글" 아래 답글이 이미 유지되는
   *  것 자체가 그 자리가 계속 유효한 스레드임을 뜻한다). */
  canReply: boolean;
  replies: CommentItemView[];
}

export interface CommentSectionViewModel {
  postId: Id;
  crewId: Id;
  /** `comment:create` 판정 결과 — false면 `CommentForm` 자체를 숨긴다(비로그인·비크루원). */
  canComment: boolean;
  comments: CommentItemView[];
}
