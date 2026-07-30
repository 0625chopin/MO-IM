import "server-only";

import type { Comment, Id } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { toComment } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * Comment 실데이터 구현 (Task 041, FR-033). RLS(`comments_select_members`·
 * `comments_insert_members`·`comments_update_author_or_staff_delete`)는 Task 006·028이
 * 이미 만들어 뒀다(스키마·정책 선반영) — 이 회차는 그 위에 앱 레이어만 얹는다.
 *
 * **삭제된 댓글도 조회에서 걸러내지 않는다** — `board.ts`의 Post류(`.is("deleted_at", null)`)와
 * 달리 이 파일의 목록 함수는 그 필터를 두지 않는다. FR-033 AC3(삭제된 부모 댓글 아래 답글은
 * 유지)가 요구하는 그대로다 — 표현 컴포넌트가 `deletedAt !== null`을 보고 플레이스홀더를 그린다.
 *
 * `updateComment`·`deleteComment`는 같은 UPDATE RLS 정책(`comments_update_author_or_staff_
 * delete`)을 공유한다 — 본인이거나 그 크루의 임원 이상이면 행을 바꿀 수 있다. "수정"과
 * "소프트 삭제"를 정책 수준에서 구분하지 않는다(`posts`·`chat_messages`와 같은 설계) — 필드
 * 구분(본문 vs `deleted_at`)은 앱 레이어(Server Action)의 책임이다.
 */

export async function listCommentsByPost(postId: Id): Promise<Comment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toComment);
}

export async function getCommentById(id: Id): Promise<Comment | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("comments").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toComment(data) : null;
}

export interface CreateCommentInput {
  postId: Id;
  authorId: Id;
  parentId: Id | null;
  body: string;
}

/**
 * 댓글 작성(FR-033 AC1). **31일차(CREW, archived 크루 쓰기 표면 감사) 해소** —
 * `comments_insert_members` RLS(archived 크루 등)가 여기서 거부될 수 있는데, 예전엔
 * `throw error`가 `createCommentAction`까지 처리되지 않은 예외로 그대로 올라갔다.
 * `updateCrewInfo`·`updateCrewVisibility`(I-070, 20일차 CORE)가 이미 쓰는 패턴
 * (`err("forbidden", …)`)으로 맞춘다 — D-030 ③에 따라 예외를 던지지 않고 도메인 오류로
 * 표현한다.
 */
export async function createComment(input: CreateCommentInput): Promise<DataResult<Comment>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("comments")
    .insert({
      post_id: input.postId,
      author_id: input.authorId,
      parent_id: input.parentId,
      body: input.body,
    })
    .select("*")
    .single();
  if (error) return err("forbidden", error.message);
  return ok(toComment(data));
}

export type UpdateCommentInput = Pick<Comment, "body">;

/**
 * 댓글 수정(FR-033). 삭제된 댓글은 `.is("deleted_at", null)`로 걸러 0행이 되면 not_found다.
 *
 * **I-124 해소(26일차)** — `updateCommentAction`은 `isSelf`가 아니면 이 함수 호출 전에 이미
 * 막지만, 그건 이중화일 뿐이다. `comments_update_author_or_staff_delete` RLS는 본인 또는
 * 임원 이상까지 이 행에 UPDATE로 닿게 허용하는 반면(강퇴 목적의 소프트 삭제를 위해), 실제
 * "본문 수정"은 본인만 가능하다는 세부 규칙은 `comments_guard_non_author_delete_only` 트리거가
 * 강제한다 — 직접 REST로 우회하면(실측: 임원 본인 JWT로 타인 댓글의 `body`를 수정 시도)
 * "only the author may edit comment content"를 던지고, 예전엔 `throw error`가 그대로
 * 전파됐다. `transferCrewOwnership`과 같은 패턴(`err("forbidden", …)`)으로 맞춘다.
 */
export async function updateComment(id: Id, patch: UpdateCommentInput): Promise<DataResult<Comment>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("comments")
    .update({ body: patch.body })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) {
    // comments_guard_non_author_delete_only가 여기서 거부될 수 있다(본문 수정은 작성자만) —
    // D-030 ③에 따라 예외를 던지지 않고 도메인 오류로 표현한다.
    return err("forbidden", error.message);
  }
  if (!data) return err("not_found", `comment ${id} 를 찾을 수 없다.`);
  return ok(toComment(data));
}

/** 댓글 삭제(FR-033). 소프트 삭제 — `deletedAt`만 채운다. 답글은 그대로 남는다(AC3). */
export async function deleteComment(id: Id): Promise<DataResult<Comment>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return err("not_found", `comment ${id} 를 찾을 수 없다.`);
  return ok(toComment(data));
}
