"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { getCrewHomeHref } from "@/components/crews/crew-links";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCrewById, getCrewMembership, getInvitationById, respondToInvitation } from "@/lib/data";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { evaluateInvitationResponseEligibility } from "@/lib/rules/invitation-response-eligibility";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";

/**
 * FR-021 초대 수락·거절 Server Action(SC-20, Task 017B). `InvitationCard`가
 * `useActionState(respondToInvitationAction, ...)`로 건다.
 *
 * **초대 대상 본인 확인이 이 액션의 1차 방어선이다** — `invitation.inviteeId`가 세션의
 * `profileId`와 다르면 다른 사람의 초대함 항목에 응답을 위조할 수 있으므로 그 자리에서
 * 거부한다(`respondToInvitation` 데이터 계층은 `id`만 받고 호출자 신원을 모른다 — 소유권
 * 검증은 반드시 이 액션이 한다).
 *
 * **권한 판정(`checkPermission`)과 도메인 판정(`evaluateInvitationResponseEligibility`)을
 * 함께 쓴다** — 전자는 "초대받은 회원이 응답이라는 행위 자체를 할 수 있는가"(`invitation:respond`,
 * 이 크루에서는 정의상 아직 미소속 `member`라 항상 allow), 후자는 "이 초대 건이 지금 응답
 * 가능한 상태인가"(만료·크루 해산·이미 처리됨, FR-021 E1·E2)를 본다 — `invite-crew-member.ts`가
 * `crew:invite_member`(역할)와 `evaluateInviteEligibility`(건별 조건)를 나눠 쓴 것과 같은 구조.
 *
 * 수락하면 크루 홈으로 이동한다(FR-021 AC1). 거절은 페이지에 머무른다 — `leave-crew.ts`와
 * 달리 거절 후에도 볼 화면(초대함 자신)이 그대로다.
 *
 * **Task 032(18일차) — `acceptCrewInvitationMembership`/`declineCrewInvitationMembership`
 * 호출을 제거했다.** `respondToInvitation`의 UPDATE가 성공하면
 * `trg_invitations_sync_membership_on_response`(AFTER UPDATE on invitations)가
 * `invited→active`/`invited→declined` 멤버십 전이를 같은 트랜잭션에서 이미 끝낸다
 * (`docs/decisions/write-path-realdata-032.md`) — Mock 시절처럼 이 액션이 다시 호출하면
 * 트리거가 이미 마친 전이를 재시도하다 상태 불일치로 막힌다.
 */
export interface RespondToInvitationFormState {
  formError?: string;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). 호출부(`InvitationCard`)가 타입만 가져다 직접 만든다.

export async function respondToInvitationAction(
  _prevState: RespondToInvitationFormState,
  formData: FormData,
): Promise<RespondToInvitationFormState> {
  const invitationId = String(formData.get("invitationId") ?? "");
  const response = String(formData.get("response") ?? "");

  if (response !== "accept" && response !== "decline") {
    return { formError: strings.invitation.inbox.errors.failed };
  }

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { formError: strings.invitation.inbox.errors.sessionExpired };
  }

  const invitation = await getInvitationById(invitationId);
  if (!invitation || invitation.inviteeId !== session.profileId) {
    return { formError: strings.invitation.inbox.errors.notFound };
  }

  const membership = await getCrewMembership(invitation.crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);
  const permission = checkPermission({ role, action: "invitation:respond" });
  if (!permission.allowed) {
    return { formError: strings.invitation.inbox.errors.notAllowed };
  }

  const crew = await getCrewById(invitation.crewId);
  const eligibility = evaluateInvitationResponseEligibility({
    invitation,
    crew,
    nowIso: new Date().toISOString(),
  });
  if (!eligibility.eligible) {
    return { formError: strings.invitation.inbox.errors[eligibility.reason] };
  }

  const invitationResult = await respondToInvitation(
    invitationId,
    response === "accept" ? "accepted" : "declined",
  );
  if (!invitationResult.ok) {
    return { formError: strings.invitation.inbox.errors.failed };
  }

  if (response === "decline") {
    refresh();
    return {};
  }

  redirect(getCrewHomeHref(invitation.crewId));
}
