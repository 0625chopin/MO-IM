import type { Comment, Id } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { generateId, store } from "./fixtures";

/**
 * Comment 데이터 접근 (FR-033, Task 041). `board.ts`의 Post 함수와 같은 모양 —
 * 소프트 삭제(`deletedAt`)만 쓰고 행을 물리적으로 지우지 않는다.
 *
 * **삭제된 댓글도 조회에서 걸러내지 않는다** — FR-033 AC3 "삭제된 댓글에 달린 답글, 조회 시
 * 부모는 '삭제된 댓글'로 남고 답글은 유지된다"가 요구하는 그대로다. `listPosts`(board.ts)와
 * 달리 이 파일의 목록 함수는 `deletedAt` 필터를 두지 않는다 — 화면(표현 컴포넌트)이
 * `deletedAt !== null`을 보고 본문 대신 "삭제된 댓글" 플레이스홀더를 그린다.
 */

/**
 * 게시글의 댓글 전체(최상위 + 답글, depth 무관) — 오래된 순. 트리 구성은 호출부(view-model)
 * 책임이다.
 *
 * `Comment` 도메인 타입에는 `createdAt`이 없다(실 DB `comments.created_at`과 같은 "도메인
 * 타입에 없는 운영 부기 컬럼", `posts`·`invitations`와 같은 취급). 그래서 명시적으로
 * 정렬하지 않는다 — `store.comments.push`가 항상 생성 순서를 유지하고 `Array.prototype.filter`
 * 는 원본 순서를 보존하므로, 필터링 결과가 그대로 오래된 순이다(실데이터의 `order by
 * created_at`과 동등한 효과, `createComment`가 항상 배열 끝에 push하는 한 성립).
 */
export async function listCommentsByPost(postId: Id): Promise<Comment[]> {
  return store.comments.filter((c) => c.postId === postId);
}

export async function getCommentById(id: Id): Promise<Comment | null> {
  return store.comments.find((c) => c.id === id) ?? null;
}

export interface CreateCommentInput {
  postId: Id;
  authorId: Id;
  parentId: Id | null;
  body: string;
}

/** 31일차 — `./supabase/comment.ts`와 시그니처를 맞춘다(`DataResult<Comment>`, I-070과
 *  같은 패턴). Mock 단계는 실패 경로가 없어 항상 `ok(...)`를 반환한다. */
export async function createComment(input: CreateCommentInput): Promise<DataResult<Comment>> {
  const comment: Comment = {
    id: generateId("comment"),
    postId: input.postId,
    authorId: input.authorId,
    parentId: input.parentId,
    body: input.body,
    deletedAt: null,
  };
  store.comments.push(comment);
  return ok(comment);
}

export type UpdateCommentInput = Pick<Comment, "body">;

/** 댓글 수정(FR-033 AC1 계열). 삭제된 댓글은 수정할 수 없다. */
export async function updateComment(id: Id, patch: UpdateCommentInput): Promise<DataResult<Comment>> {
  const comment = store.comments.find((c) => c.id === id && !c.deletedAt);
  if (!comment) return err("not_found", `comment ${id} 를 찾을 수 없다.`);
  comment.body = patch.body;
  return ok(comment);
}

/** 댓글 삭제(FR-033). 소프트 삭제 — `deletedAt`만 채운다. 답글은 그대로 남는다(AC3). */
export async function deleteComment(id: Id): Promise<DataResult<Comment>> {
  const comment = store.comments.find((c) => c.id === id && !c.deletedAt);
  if (!comment) return err("not_found", `comment ${id} 를 찾을 수 없다.`);
  comment.deletedAt = new Date().toISOString();
  return ok(comment);
}
