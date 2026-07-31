"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCrewById, getCrewMembership, updateCrewVisibility } from "@/lib/data";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { isValidCrewVisibility } from "@/lib/rules/crew-visibility";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";

/**
 * FR-012 크루 공개 범위 변경 Server Action(SC-15, D-007, Task 017B). `CrewVisibilityForm`이
 * `useActionState(updateCrewVisibilityAction, ...)`로 건다. 오너 전용(`crew:update_visibility`,
 * D-002 귀결 — 존폐에 준하는 결정) — `updateCrewInfoAction`(임원 이상)과 권한 등급이 달라
 * 별도 액션으로 분리했다.
 */
export interface UpdateCrewVisibilityFormState {
  formError?: string;
  success?: boolean;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). 호출부(`CrewVisibilityForm`)가 타입만 가져다 직접 만든다.

export async function updateCrewVisibilityAction(
  _prevState: UpdateCrewVisibilityFormState,
  formData: FormData,
): Promise<UpdateCrewVisibilityFormState> {
  const crewId = String(formData.get("crewId") ?? "");
  const visibilityRaw = String(formData.get("visibility") ?? "");

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { formError: strings.crew.settings.visibility.errors.sessionExpired };
  }

  const crew = await getCrewById(crewId);
  if (!crew) {
    return { formError: strings.error.notFound.description };
  }

  const membership = await getCrewMembership(crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);
  const permission = checkPermission({ role, action: "crew:update_visibility" });
  if (!permission.allowed) {
    return { formError: strings.crew.settings.visibility.errors.notAllowed };
  }

  if (!isValidCrewVisibility(visibilityRaw)) {
    return { formError: strings.crew.settings.visibility.errors.failed };
  }

  const result = await updateCrewVisibility(crewId, visibilityRaw);
  if (!result.ok) {
    return { formError: strings.crew.settings.visibility.errors.failed };
  }

  refresh();
  return { success: true };
}
