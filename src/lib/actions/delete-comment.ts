"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { deleteComment, getCommentById, getCrewMembership } from "@/lib/data";
import { type DataResult, err } from "@/lib/data/contracts";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import type { Comment, Id } from "@/lib/types";

export interface DeleteCommentActionInput {
  crewId: Id;
  commentId: Id;
}

/**
 * 댓글 삭제(FR-033 AC3) Server Action. `deletePostAction`과 같은 구조 — 본인
 * (`comment:delete_own`) 또는 임원·오너·관리자의 타인 댓글 삭제(`comment:delete_any`) 둘 중
 * 하나만 통과하면 허용한다. 소프트 삭제라 답글은 그대로 남는다(AC3, `deleteComment` 데이터
 * 계층 docstring 참고) — 이 액션은 그 아래 답글을 따로 건드리지 않는다.
 *
 * 감사 로그는 `deletePostAction`과 같은 원칙 — 본인 삭제는 통상적 CRUD라 대상이 아니고,
 * 타인(임원·오너 등)이 `comment:delete_any`로 지운 경우만 NFR-015 대상이다.
 */
export async function deleteCommentAction(
  input: DeleteCommentActionInput,
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
  const isSelf = comment.authorId === session.profileId;
  const canDeleteOwn = checkPermission({ role, action: "comment:delete_own", context: { isSelf } });
  const canDeleteAny = checkPermission({ role, action: "comment:delete_any" });
  if (!canDeleteOwn.allowed && !canDeleteAny.allowed) {
    return err("forbidden", "이 댓글을 삭제할 권한이 없다.");
  }

  const result = await deleteComment(input.commentId);
  if (result.ok) {
    if (!isSelf && canDeleteAny.allowed) {
      await recordAuditLog({
        actorId: session.profileId,
        crewId: input.crewId,
        action: "comment.force_deleted",
        targetId: input.commentId,
      });
    }
    refresh();
  }
  return result;
}
