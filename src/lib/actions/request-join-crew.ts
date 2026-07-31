"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { createJoinRequest, getCrewById, getCrewMembership } from "@/lib/data";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { evaluateJoinRequestEligibility } from "@/lib/rules/join-request-eligibility";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";

/**
 * FR-022 크루 가입 신청 Server Action(SC-09, Task 016B). `JoinRequestButton`이
 * `useActionState(requestToJoinCrewAction, ...)`로 건다.
 *
 * **두 겹의 판정을 순서대로 통과해야 한다** — ① `checkPermission({action:"crew:request_join"})`
 * (전역 role 게이트: guest 불가, 이미 크루원이면 role 자체가 crew_member 이상이라 매트릭스가
 * 막는다) ② `evaluateJoinRequestEligibility`(크루별 조건: 비공개·이미 대기 중·강퇴 이력).
 * 클라이언트의 `resolveJoinRequestButtonState`가 버튼을 미리 숨기지만, Server Action은 그
 * 클라이언트 상태를 신뢰하지 않고 두 판정을 서버에서 다시 한다(Next.js Server Actions 문서
 * "Validate inputs" — `search-user-by-handle.ts`와 같은 이유).
 *
 * `createJoinRequest`(`@/lib/data`) 하나가 FR-022 정상 흐름 ③("멤버십 requested 생성")까지
 * 함께 처리한다 — `join_requests`에는 `invitations`류 자동 프로비저닝 트리거가 없어서(Task 032
 * 실측) 그 함수 내부가 crew_memberships를 직접 만든다. Mock 시절에는 이 액션이 별도로
 * `initiateCrewMembership("request")`를 호출해야 했으나, 실 DB에서는 그 호출이 중복 처리가
 * 되므로 제거했다(`docs/decisions/write-path-realdata-032.md`).
 *
 * **31일차(CREW, archived 크루 쓰기 표면 감사) — 두 가지를 고쳤다.** ①
 * `evaluateJoinRequestEligibility`는 crew.status를 보지 않으므로(공개 범위·멤버십만 판정)
 * archived 공개 크루에도 "신청 가능"이 나올 수 있었다 — DB RPC(`create_join_request`)가
 * `crew_status <> 'active'`를 이미 `reason_code='forbidden'`으로 막고 있어(SQL이 최종 경계,
 * 데이터 정합성 문제는 아니었다) 여기서는 UX만 보정한다: 명시적으로 먼저 걸러 정확한 문구를
 * 준다. ② `createJoinRequest` 실패 시 원인과 무관하게 항상 `errors.already_pending`을
 * 반환하던 기존 버그를 고쳤다 — 이 지점에 도달했다는 것 자체가 이미
 * `evaluateJoinRequestEligibility`를 통과했다는 뜻이라 "이미 대기 중"은 실제로는 발생할 수
 * 없는 사유였다(경합으로 인한 `conflict`이거나 이번에 새로 걸러내는 `forbidden`(archived)
 * 뿐이다). `created.error.code`로 분기해 실제 사유에 맞는 문구를 준다.
 */
export interface RequestJoinCrewFormState {
  success?: boolean;
  formError?: string;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). 호출부(`JoinRequestButton`)가 타입만 가져다 직접 만든다.

export async function requestToJoinCrewAction(
  _prevState: RequestJoinCrewFormState,
  formData: FormData,
): Promise<RequestJoinCrewFormState> {
  const crewId = String(formData.get("crewId") ?? "");
  const message = String(formData.get("message") ?? "").trim();

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { formError: strings.crew.home.join.errors.sessionExpired };
  }

  const crew = await getCrewById(crewId);
  if (!crew) {
    return { formError: strings.error.notFound.description };
  }

  const membership = await getCrewMembership(crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);
  const permission = checkPermission({ role, action: "crew:request_join" });
  if (!permission.allowed) {
    return { formError: strings.crew.home.join.errors.notAllowed };
  }

  if (crew.status !== "active") {
    return { formError: strings.crew.home.join.errors.crewArchived };
  }

  const eligibility = evaluateJoinRequestEligibility({
    crewVisibility: crew.visibility,
    membership,
  });
  if (!eligibility.eligible) {
    return { formError: strings.crew.home.join.errors[eligibility.reason] };
  }

  const created = await createJoinRequest({
    crewId,
    requesterId: session.profileId,
    message: message.length > 0 ? message : null,
  });
  if (!created.ok) {
    return {
      formError:
        created.error.code === "forbidden"
          ? strings.crew.home.join.errors.crewArchived
          : strings.crew.home.join.errors.failed,
    };
  }

  refresh();
  return { success: true };
}
