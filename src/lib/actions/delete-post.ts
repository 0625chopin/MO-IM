"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { deletePost, getCrewMembership, getPostById } from "@/lib/data";
import { type DataResult, err } from "@/lib/data/contracts";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import type { Id, Post } from "@/lib/types";

export interface DeletePostActionInput {
  crewId: Id;
  postId: Id;
}

/**
 * 게시글 삭제(FR-032 AC1·AC3) Server Action. 작성자 본인(`post:delete_own`) 또는 임원·오너·
 * 관리자의 타인 글 삭제(`post:delete_any`) 둘 중 하나만 통과하면 허용한다 — 두 판정 모두
 * `lib/rules/permission.ts`를 그대로 호출만 하고 이 파일에서 조건을 다시 짜지 않는다(NFR-036).
 *
 * 감사 로그(AC3 "삭제되고 감사 로그에 기록된다", NFR-015 "게시물 강제 삭제")는 Task 038(18일차
 * BOARD)이 붙였다 — **작성자 본인 삭제(`post:delete_own`)는 감사 대상이 아니다.** "강제"는
 * 문면상 타인(임원·오너 등)이 `post:delete_any`로 지운 경우만을 뜻한다 — 본인이 자기 글을
 * 지우는 것은 통상적 CRUD이지 권한 남용을 감사할 대상이 아니다.
 */
export async function deletePostAction(
  input: DeletePostActionInput,
): Promise<DataResult<Post>> {
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
  const isSelf = post.authorId === session.profileId;
  const canDeleteOwn = checkPermission({ role, action: "post:delete_own", context: { isSelf } });
  const canDeleteAny = checkPermission({ role, action: "post:delete_any" });
  if (!canDeleteOwn.allowed && !canDeleteAny.allowed) {
    return err("forbidden", "이 게시글을 삭제할 권한이 없다.");
  }

  const result = await deletePost(input.postId);
  if (result.ok) {
    if (!isSelf && canDeleteAny.allowed) {
      // NFR-015 감사 로그(Task 038) — "게시물 강제 삭제" 대상(작성자 본인 삭제는 제외).
      await recordAuditLog({
        actorId: session.profileId,
        crewId: input.crewId,
        action: "post.force_deleted",
        targetId: input.postId,
      });
    }
    refresh();
  }
  return result;
}
