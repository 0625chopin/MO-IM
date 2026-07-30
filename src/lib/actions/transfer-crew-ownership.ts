"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { createNotification, getCrewById, getCrewMembership, transferCrewOwnership } from "@/lib/data";
import { deriveUserRoleForPermissionCheck, isActiveMembership } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";

/**
 * FR-025 오너 이양 Server Action(D-002, Task 040). `MemberList`의 행별 "오너로 임명" 버튼이
 * `useActionState(transferCrewOwnershipAction, ...)`로 건다.
 *
 * **크루명 재입력 확인은 이 액션에서만 검사한다** — 돌이키기 어려운 조작의 오클릭 방지용
 * UX 확인이지 강제 경계가 아니다(오너 본인이 이미 자기 크루를 이양할 권한이 있으므로, 이름을
 * 틀렸다고 해서 막을 "보안 규칙"은 아니다 — disband-crew.ts의 크루명 확인과 같은 성격).
 *
 * **대상이 활성 크루원이어야 한다(FR-025 E1)는 SQL이 강제 경계다** — 이 액션의 사전 확인은
 * 안내 문구를 더 정확히 보여주기 위한 이중화일 뿐이다. `transferCrewOwnership`(`lib/data`)이
 * 호출하는 `crews_guard_owner_only_fields` 트리거(Task 040 확장)가 실제 경계이며, publishable
 * key로 `/rest/v1/crews`를 직접 PATCH해도 이 트리거가 막는다.
 *
 * **31일차(CREW, archived 크루 쓰기 표면 감사)** — 오너 이양은 `crews.owner_id`를 UPDATE하므로
 * I-070과 같은 `crews_guard_archived_immutable` 트리거를 그대로 탄다(SQL이 이미 막는다,
 * 데이터 문제 아님). 다만 그 실패가 이 화면까지 오면 위 범용 `errors.failed`로만 보였다
 * (I-070과 동일한 "(b) 범용 실패 문구" 패턴) — 여기서 먼저 걸러 정확한 문구를 준다.
 */
export interface TransferCrewOwnershipFormState {
  formError?: string;
  success?: boolean;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). 호출부(`MemberList`)가 타입만 가져다 직접 만든다.

export async function transferCrewOwnershipAction(
  _prevState: TransferCrewOwnershipFormState,
  formData: FormData,
): Promise<TransferCrewOwnershipFormState> {
  const crewId = String(formData.get("crewId") ?? "");
  const targetProfileId = String(formData.get("profileId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "");

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { formError: strings.crew.settings.transferOwnership.errors.sessionExpired };
  }

  const crew = await getCrewById(crewId);
  if (!crew) {
    return { formError: strings.error.notFound.description };
  }

  const viewerMembership = await getCrewMembership(crewId, session.profileId);
  const viewerRole = deriveUserRoleForPermissionCheck(viewerMembership);
  const permission = checkPermission({ role: viewerRole, action: "crew:transfer_ownership" });
  if (!permission.allowed) {
    return { formError: strings.crew.settings.transferOwnership.errors.notAllowed };
  }

  if (confirmName !== crew.name) {
    return { formError: strings.crew.settings.transferOwnership.errors.nameMismatch };
  }

  if (crew.status !== "active") {
    return { formError: strings.crew.settings.transferOwnership.errors.crewArchived };
  }

  const targetMembership = await getCrewMembership(crewId, targetProfileId);
  if (!targetMembership || !isActiveMembership(targetMembership.status)) {
    // FR-025 E1 — UX 안내용 사전 확인(위 docstring 참고, 강제 경계는 SQL).
    return { formError: strings.crew.settings.transferOwnership.errors.targetInactive };
  }

  const result = await transferCrewOwnership(crewId, targetProfileId);
  if (!result.ok) {
    return { formError: strings.crew.settings.transferOwnership.errors.failed };
  }

  // NFR-015 감사 로그(Task 038 인터페이스, Task 040이 호출) — 오너 이양의 근거를 남긴다.
  await recordAuditLog({
    actorId: session.profileId,
    crewId,
    action: "crew.ownership_transferred",
    targetId: targetProfileId,
  });

  // FR-025 정상 흐름 ⑤ "양측 알림" — 실패해도 이양 자체를 막지 않는다(audit-log.ts와 같은 원칙,
  // 관측성·부가 알림이 핵심 쓰기를 막으면 안 된다).
  await Promise.all([
    createNotification({
      recipientId: session.profileId,
      type: "ownership_transferred",
      channel: "in_app",
      payload: { crewId, crewName: crew.name },
    }).catch((error) => console.error("[transfer-crew-ownership] 이전 오너 알림 실패", error)),
    createNotification({
      recipientId: targetProfileId,
      type: "ownership_transferred",
      channel: "in_app",
      payload: { crewId, crewName: crew.name },
    }).catch((error) => console.error("[transfer-crew-ownership] 신규 오너 알림 실패", error)),
  ]);

  refresh();
  return { success: true };
}
