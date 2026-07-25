"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import {
  createComment,
  createNotification,
  getCommentById,
  getCrewMembership,
  getPostById,
} from "@/lib/data";
import { type DataResult, err } from "@/lib/data/contracts";
import { validateCommentContent } from "@/lib/rules/comment-content-validation";
import { canReplyToComment } from "@/lib/rules/comment-depth";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import type { Comment, Id } from "@/lib/types";

export interface CreateCommentActionInput {
  crewId: Id;
  postId: Id;
  body: string;
  /** null(기본)이면 최상위 댓글, 값이 있으면 그 댓글에 대한 답글(depth 1 한정, FR-033 "범위
   *  판단"). */
  parentId?: Id | null;
}

/**
 * 댓글 작성(FR-033 AC1) Server Action. `createPostAction`과 같은 구조 — 인증·권한을 여기서
 * 다시 판정하고(Server Function 직접 호출 방어, NFR-036), 성공하면 게시글 작성자에게 알림을
 * 보낸다(AC1 "작성자에게 알림이 간다"). 자기 글에 자기가 댓글을 달면 알림을 만들지 않는다 —
 * `remove-crew-member.ts` 등 기존 알림 발송부가 이미 쓰는 관례를 따른다(자기 자신에게 보내는
 * 알림은 소음이다, 요구사항에 이 경우를 막으라는 명시는 없지만 다른 알림 유형에서도 자기
 * 행위에 대한 자기 알림은 만들지 않는다 — 예: `disband-crew.ts`가 해산자 본인도 알림 대상에
 * 포함하는 것과는 대칭이 다르다. "댓글로 자기 글에 알림 폭탄"을 피하는 게 목적이라 임의
 * 결정이며 근거 없는 억측이 아니라 상식적 UX 판단이다 — `docs/decisions/
 * community-expansion-041.md`에 남긴다).
 */
export async function createCommentAction(
  input: CreateCommentActionInput,
): Promise<DataResult<Comment>> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return err("forbidden", "로그인 후 이용할 수 있다.");
  }

  const post = await getPostById(input.postId);
  if (!post) {
    return err("not_found", `게시글 ${input.postId} 를 찾을 수 없다.`);
  }

  const membership = await getCrewMembership(input.crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);
  const permission = checkPermission({ role, action: "comment:create" });
  if (!permission.allowed) {
    return err("forbidden", "댓글을 작성할 권한이 없다.");
  }

  const violations = validateCommentContent(input.body);
  if (violations.includes("body_required")) {
    return err("validation_failed", "댓글 내용을 입력해 주세요.");
  }

  const parentId = input.parentId ?? null;
  if (parentId) {
    const parent = await getCommentById(parentId);
    if (!parent || parent.postId !== input.postId) {
      return err("not_found", `댓글 ${parentId} 를 찾을 수 없다.`);
    }
    if (!canReplyToComment(parent)) {
      return err("validation_failed", "답글에는 다시 답글을 달 수 없다.");
    }
  }

  const comment = await createComment({
    postId: input.postId,
    authorId: session.profileId,
    parentId,
    body: input.body.trim(),
  });

  if (post.authorId !== session.profileId) {
    await createNotification({
      recipientId: post.authorId,
      type: "post_commented",
      channel: "in_app",
      payload: { crewId: input.crewId, postId: input.postId },
    }).catch((error) => console.error("[create-comment] 작성자 알림 실패", post.authorId, error));
  }

  refresh();
  return { ok: true, data: comment };
}
