"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { createInvitation, getCrewById, getCrewMembership, getProfileByHandle } from "@/lib/data";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { evaluateInviteEligibility } from "@/lib/rules/invite-eligibility";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";

/** 초대 만료(요구사항 2.2절 용어집 "발급 후 14일", FR-020 E5). */
const INVITATION_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * FR-020 크루원 초대 Server Action(Task 017A). `InviteMemberDialog`가
 * `useActionState(inviteCrewMemberAction, ...)`로 건다.
 *
 * **핸들 문자열을 다시 제출받아 서버가 다시 조회한다** — `searchUserByHandleAction`의 결과
 * (`HandleSearchResult`)는 프로필 `id`를 담지 않는다(그 모듈 docstring 참고, "초대처럼 실제로
 * 그 사용자를 지목해야 하는 후속 동작은 핸들 문자열을 다시 서버에 제출"). 이 액션이 그 후속
 * 동작이다 — `getProfileByHandle`으로 이 시점에 다시 조회해 `id`를 얻는다.
 *
 * **두 겹의 판정** — ① `checkPermission({action:"crew:invite_member"})`(오너·임원만) ②
 * `evaluateInviteEligibility`(이미 멤버·이미 초대 대기 중, FR-020 E1·E2). 옵트아웃 대상은
 * 애초에 `getProfileByHandle`이 옵트아웃 여부를 걸러내지 않으므로(그 필터는
 * `projectHandleSearchResult` 쪽에만 있다) 여기서는 옵트아웃이라도 초대 자체는 통과시킨다 —
 * "검색에는 안 뜨지만 핸들을 정확히 아는 사람의 초대는 받을 수 있다"는 3.6절 옵트아웃의
 * 원래 취지(검색 노출 차단이지 초대 수신 차단이 아니다)와 맞다.
 *
 * **Task 032(18일차) — `initiateCrewMembership` 호출을 제거했다.** 실 DB는
 * `trg_invitations_provision_membership`(AFTER INSERT on invitations)이 `invited` 멤버십을
 * 자동 생성한다(`docs/decisions/write-path-realdata-032.md`) — Mock 시절에는 이 동기화를
 * 이 액션이 직접 호출해야 했지만, 지금 호출하면 트리거가 이미 만든 행에 다시 INSERT를
 * 시도해 충돌한다.
 */
export interface InviteCrewMemberFormState {
  success?: boolean;
  formError?: string;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). 호출부(`InviteMemberDialog`)가 타입만 가져다 직접 만든다.

export async function inviteCrewMemberAction(
  _prevState: InviteCrewMemberFormState,
  formData: FormData,
): Promise<InviteCrewMemberFormState> {
  const crewId = String(formData.get("crewId") ?? "");
  const handle = String(formData.get("handle") ?? "").trim();

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { formError: strings.crew.members.invite.errors.sessionExpired };
  }

  const crew = await getCrewById(crewId);
  if (!crew) {
    return { formError: strings.error.notFound.description };
  }

  const viewerMembership = await getCrewMembership(crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(viewerMembership);
  const permission = checkPermission({ role, action: "crew:invite_member" });
  if (!permission.allowed) {
    return { formError: strings.crew.members.invite.errors.notAllowed };
  }

  const invitee = await getProfileByHandle(handle);
  if (!invitee) {
    return { formError: strings.crew.members.invite.errors.handleNotFound };
  }

  const inviteeMembership = await getCrewMembership(crewId, invitee.id);
  const eligibility = evaluateInviteEligibility({
    inviterId: session.profileId,
    inviteeId: invitee.id,
    membership: inviteeMembership,
  });
  if (!eligibility.eligible) {
    return { formError: strings.crew.members.invite.errors[eligibility.reason] };
  }

  await createInvitation({
    crewId,
    inviteeId: invitee.id,
    inviterId: session.profileId,
    expiresAt: new Date(Date.now() + INVITATION_EXPIRY_MS).toISOString(),
  });

  refresh();
  return { success: true };
}
