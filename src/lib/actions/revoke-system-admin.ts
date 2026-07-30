"use server";

import { refresh } from "next/cache";

import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { revokeSystemAdmin } from "@/lib/data";
import { strings } from "@/lib/strings";
import type { SystemAdminRevokeReasonCode } from "@/lib/types";

/**
 * I-075(D-076·D-078, 27일차) 관리자 회수 Server Action — `RevokeSystemAdminDialog`가
 * `useActionState(revokeSystemAdminAction, ...)`로 건다. 회수 대상은 `listSystemAdmins()`가
 * 이미 실제 `profileId`를 주므로(핸들 재해석이 필요한 지정과 다르다) `profileId`를 그대로
 * 폼에 담아 제출한다.
 *
 * **인가는 직접 `session.isSystemAdmin`을 확인한다** — `grant-system-admin.ts` docstring과
 * 같은 이유(이 도메인은 권한 매트릭스 37개 액션에 속하지 않는다).
 *
 * **최종 방어는 `admin_revoke_system_admin` SQL RPC다.** `cannot_target_self`(D-076)·
 * `last_admin_forbidden`(D-078)은 `SystemAdminList`가 `admin-grant-revoke-rpcs-075.md` §4의
 * 사전 검증(자기 자신 대상·마지막 관리자)으로 이미 버튼을 막으므로 정상 흐름에서는 도달하지
 * 않는다 — 아래 `errors`는 그 사전 검증이 새는 경우(레이스 컨디션 등)의 방어선 문구다.
 */
export interface RevokeSystemAdminFormState {
  formError?: string;
  success?: boolean;
}

export async function revokeSystemAdminAction(
  _prevState: RevokeSystemAdminFormState,
  formData: FormData,
): Promise<RevokeSystemAdminFormState> {
  const profileId = String(formData.get("profileId") ?? "");

  const session = await getAuthSession();
  if (!isAuthenticated(session) || !session.isSystemAdmin) {
    return { formError: strings.admin.systemAdmins.revoke.errors.forbidden };
  }

  const result = await revokeSystemAdmin(profileId);
  if (!result.ok) {
    const code = result.error.message as SystemAdminRevokeReasonCode;
    return {
      formError: strings.admin.systemAdmins.revoke.errors[code] ?? strings.admin.systemAdmins.revoke.errors.failed,
    };
  }

  refresh();
  return { success: true };
}
