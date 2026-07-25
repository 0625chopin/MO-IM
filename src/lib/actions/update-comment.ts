"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCommentById, getCrewMembership, updateComment } from "@/lib/data";
import { type DataResult, err } from "@/lib/data/contracts";
import { validateCommentContent } from "@/lib/rules/comment-content-validation";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import type { Comment, Id } from "@/lib/types";

export interface UpdateCommentActionInput {
  crewId: Id;
  commentId: Id;
  body: string;
}

/** 댓글 수정(FR-033) Server Action. 본인 댓글만 — `updatePostAction`과 같은 구조. */
export async function updateCommentAction(
  input: UpdateCommentActionInput,
): Promise<DataResult<Comment>> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return err("forbidden", "로그인 후 이용할 수 있다.");
  }

  const comment = await getCommentById(input.commentId);
  if (!comment || comment.deletedAt) {
    return err("not_found", `댓글 ${input.commentId} 를 찾을 수 없다.`);
  }

  const membership = await getCrewMembership(input.crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);
  const permission = checkPermission({
    role,
    action: "comment:update_own",
    context: { isSelf: comment.authorId === session.profileId },
  });
  if (!permission.allowed) {
    return err("forbidden", "이 댓글을 수정할 권한이 없다.");
  }

  const violations = validateCommentContent(input.body);
  if (violations.includes("body_required")) {
    return err("validation_failed", "댓글 내용을 입력해 주세요.");
  }

  const result = await updateComment(input.commentId, { body: input.body.trim() });
  if (result.ok) {
    refresh();
  }
  return result;
}
