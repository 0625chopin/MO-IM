"use client";

import { CommentForm } from "@/components/board/CommentForm";
import { createCommentAction } from "@/lib/actions/create-comment";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

/** `lib/data/contracts`의 `DataErrorCode`와 값이 같은 로컬 유니온 — 이 파일은 표현 컴포넌트
 *  (zone 4)라 `@/lib/data/*`를 직접 import할 수 없다(D-030 ①, `PostActions.tsx`
 *  `ActionErrorCode`와 같은 패턴). */
type CommentActionErrorCode = "not_found" | "forbidden" | "conflict" | "validation_failed";

const ERROR_MESSAGE: Record<CommentActionErrorCode, string> = {
  not_found: strings.board.comment.errors.notFound,
  forbidden: strings.board.comment.errors.forbidden,
  conflict: strings.board.comment.errors.submitFailed,
  validation_failed: strings.board.comment.errors.bodyRequired,
};

/**
 * 최상위(최초) 댓글 작성 폼(FR-033 AC1)의 유일한 클라이언트 진입점 — `CommentList`(서버
 * 컴포넌트)는 함수(콜백)를 클라이언트 컴포넌트로 넘길 수 없으므로(RSC 경계), 이 얇은
 * 래퍼가 `crewId`·`postId`(직렬화 가능한 값)만 받아 내부에서 `createCommentAction`을 부른다
 * (`CommentItem`의 답글·수정 폼과 같은 원칙 — Server Action 호출은 항상 클라이언트 서브트리
 * 안에서 시작한다).
 */
export function CommentComposer({ crewId, postId }: { crewId: Id; postId: Id }) {
  async function handleSubmit(body: string): Promise<string | null> {
    const result = await createCommentAction({ crewId, postId, parentId: null, body });
    return result.ok ? null : ERROR_MESSAGE[result.error.code];
  }

  return (
    <CommentForm
      placeholder={strings.board.comment.form.placeholder}
      submitLabel={strings.board.comment.form.submit}
      pendingLabel={strings.board.comment.form.submitPending}
      onSubmit={handleSubmit}
    />
  );
}
