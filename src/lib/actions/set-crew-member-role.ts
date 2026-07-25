"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { getCrewMembership, setCrewMembershipRole } from "@/lib/data";
import { deriveUserRoleForPermissionCheck, isActiveMembership } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";
import type { CrewMembershipRole } from "@/lib/types";

/**
 * FR-024 임원 임명·해임 Server Action(D-002, Task 017A). `MemberList`의 행별 "임원 임명"/
 * "임원 해임" 버튼이 `useActionState(setCrewMemberRoleAction, ...)`로 건다.
 *
 * **오너로의 승격·강등은 이 액션이 다루지 않는다** — `setCrewMembershipRole`(`lib/data`)의
 * 시그니처 자체가 `"staff" | "member"`만 받아 owner를 만들 수 있는 경로가 타입 레벨에서
 * 없다(D-002 오너 단일성, 오너 이양은 FR-025·v0.2). `targetRole` 파라미터도 같은 이유로
 * `"staff" | "member"` 두 값만 받는다.
 *
 * **FR-024 예외 흐름 E1(대상이 오너 본인)·E2(대상이 비활성 멤버십)를 여기서 판정한다** —
 * `checkPermission`의 3.3절 매트릭스 행(`crew:appoint_staff`)은 "오너인가"만 보고 대상의
 * role·상태는 모른다(그 매트릭스 셀 자체가 크루 컨텍스트를 받지 않는 unconditional allow다).
 * 대상 조건은 이 액션이 `getCrewMembership`으로 대상 멤버십을 직접 조회해 확인한다.
 */
export interface SetCrewMemberRoleFormState {
  success?: boolean;
  formError?: string;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). 호출부(`MemberList`)가 타입만 가져다 직접 만든다.

const TARGET_ROLE_VALUES: readonly CrewMembershipRole[] = ["staff", "member"];

function isAssignableRole(value: string): value is Extract<CrewMembershipRole, "staff" | "member"> {
  return (TARGET_ROLE_VALUES as readonly string[]).includes(value);
}

export async function setCrewMemberRoleAction(
  _prevState: SetCrewMemberRoleFormState,
  formData: FormData,
): Promise<SetCrewMemberRoleFormState> {
  const crewId = String(formData.get("crewId") ?? "");
  const targetProfileId = String(formData.get("profileId") ?? "");
  const targetRoleRaw = String(formData.get("role") ?? "");

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { formError: strings.crew.members.appoint.errors.sessionExpired };
  }
  if (!isAssignableRole(targetRoleRaw)) {
    return { formError: strings.crew.members.appoint.errors.failed };
  }

  const viewerMembership = await getCrewMembership(crewId, session.profileId);
  const viewerRole = deriveUserRoleForPermissionCheck(viewerMembership);
  const permission = checkPermission({ role: viewerRole, action: "crew:appoint_staff" });
  if (!permission.allowed) {
    return { formError: strings.crew.members.appoint.errors.notAllowed };
  }

  const targetMembership = await getCrewMembership(crewId, targetProfileId);
  if (!targetMembership || !isActiveMembership(targetMembership.status)) {
    // E2 — 대상이 활성 크루원이 아니다(이미 탈퇴·강퇴된 경우 등).
    return { formError: strings.crew.members.appoint.errors.targetInactive };
  }
  if (targetMembership.role === "owner") {
    // E1 — 오너 본인은 임명·해임 대상이 될 수 없다.
    return { formError: strings.crew.members.appoint.errors.targetIsOwner };
  }

  const result = await setCrewMembershipRole(crewId, targetProfileId, targetRoleRaw);
  if (!result.ok) {
    return { formError: strings.crew.members.appoint.errors.failed };
  }

  // NFR-015 감사 로그(Task 038) — 권한 변경(임원 임명·해임)의 근거를 남긴다.
  await recordAuditLog({
    actorId: session.profileId,
    crewId,
    action: targetRoleRaw === "staff" ? "crew.staff_appointed" : "crew.staff_dismissed",
    targetId: targetProfileId,
  });

  refresh();
  return { success: true };
}
