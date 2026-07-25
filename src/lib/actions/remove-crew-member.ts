"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { createNotification, getCrewMembership, updateCrewMembershipStatus } from "@/lib/data";
import { deriveUserRoleForPermissionCheck, isActiveMembership } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";

/**
 * FR-027 크루원 강퇴 Server Action(D-003, Task 040). `MemberList`의 행별 "강퇴" 버튼이
 * `useActionState(removeCrewMemberAction, ...)`로 건다.
 *
 * **DB가 이미 세부 업무 규칙 전부를 강제한다**(029B, `crew_memberships_guard_self_transition`) —
 * 오너 행 자체는 이 경로로 못 건드리고, 임원은 일반 크루원(`role='member'`)만 대상으로 할 수
 * 있다(각주⁴). 이 액션의 사전 확인(`checkPermission` conditional·대상 상태 조회)은 친절한
 * 오류 문구를 보여주기 위한 이중화다 — publishable key로 `crew_memberships`를 직접 PATCH해도
 * 트리거가 같은 규칙을 강제한다(`docs/decisions/rls-policies-029b.md` §3.2).
 *
 * **FR-027 AC3(진행 중 투표의 강퇴자 표 무효화)는 이 액션이 아니라 DB 트리거가 처리한다** —
 * `crew_memberships_invalidate_votes_on_removal`(Task 040 신설)이 이 UPDATE의 부수효과로
 * 자동 실행된다. 이 액션은 그 결과를 별도로 확인하지 않는다(호출자가 몰라도 되는 내부 구현).
 */
export interface RemoveCrewMemberFormState {
  formError?: string;
  success?: boolean;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). 호출부(`MemberList`)가 타입만 가져다 직접 만든다.

export async function removeCrewMemberAction(
  _prevState: RemoveCrewMemberFormState,
  formData: FormData,
): Promise<RemoveCrewMemberFormState> {
  const crewId = String(formData.get("crewId") ?? "");
  const targetProfileId = String(formData.get("profileId") ?? "");
  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const reason = reasonRaw.length > 0 ? reasonRaw : null;

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { formError: strings.crew.members.remove.errors.sessionExpired };
  }

  const viewerMembership = await getCrewMembership(crewId, session.profileId);
  const viewerRole = deriveUserRoleForPermissionCheck(viewerMembership);

  const targetMembership = await getCrewMembership(crewId, targetProfileId);
  if (!targetMembership || !isActiveMembership(targetMembership.status)) {
    return { formError: strings.crew.members.remove.errors.targetInactive };
  }
  if (targetMembership.role === "owner") {
    // FR-027 E2 — 오너는 강퇴 대상이 아니다(FR-025·FR-013으로만 자리를 비운다).
    return { formError: strings.crew.members.remove.errors.targetIsOwner };
  }

  const permission = checkPermission({
    role: viewerRole,
    action: "crew:remove_member",
    context: { targetRole: targetMembership.role },
  });
  if (!permission.allowed) {
    return { formError: strings.crew.members.remove.errors.notAllowed };
  }

  const result = await updateCrewMembershipStatus(crewId, targetProfileId, "removed", reason);
  if (!result.ok) {
    return { formError: strings.crew.members.remove.errors.failed };
  }

  // NFR-015 감사 로그(Task 038 인터페이스, Task 040이 호출) — 강퇴 행위자·대상·시각을 남긴다.
  await recordAuditLog({
    actorId: session.profileId,
    crewId,
    action: "crew.member_removed",
    targetId: targetProfileId,
  });

  // FR-027 정상 흐름 "대상자 알림" — 실패해도 강퇴 자체를 막지 않는다.
  await createNotification({
    recipientId: targetProfileId,
    type: "member_removed",
    channel: "in_app",
    payload: { crewId, reason },
  }).catch((error) => console.error("[remove-crew-member] 대상자 알림 실패", error));

  refresh();
  return { success: true };
}
