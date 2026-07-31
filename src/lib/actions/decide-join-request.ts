"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { decideJoinRequest, getCrewById, getCrewMembership } from "@/lib/data";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";
import type { JoinRequestStatus } from "@/lib/types";

/**
 * FR-023 가입 신청 승인·반려 Server Action(Task 017A). `JoinRequestPanel`의 "대기 중" 탭이
 * 승인·반려 각 버튼마다 `useActionState(decideJoinRequestAction, ...)`로 건다.
 *
 * **`joinRequestId`만으로 대상을 찾고 `crewId`는 소속 검증에만 쓴다** — 클라이언트가 폼에
 * 실어 보낸 `crewId`가 실제 그 신청의 크루와 다르면(다른 크루 관리 화면에서 조작된 요청)
 * `decided.data.crewId !== crewId` 검사로 걸러낸다.
 *
 * **동시성(FR-023 E1 "다른 임원이 먼저 처리")은 `decideJoinRequest`의 조건부 UPDATE
 * (`.eq("status","pending")`)가 막는다** — 행 락 획득 후 WHERE 재평가라 두 임원이 동시에
 * 승인/반려해도 먼저 커밋한 쪽만 성공하고 나머지는 `conflict`를 받는다(D-019와 같은 원리,
 * `docs/decisions/write-path-realdata-032.md`).
 *
 * **Task 032(18일차) — `approveCrewMembership`/`rejectCrewMembership` 호출을 제거했다.**
 * `trg_join_requests_sync_membership_on_decision`(AFTER UPDATE on join_requests)이
 * `requested→active`/`requested→rejected` 멤버십 전이를 `decideJoinRequest`와 같은
 * 트랜잭션에서 이미 끝낸다 — Mock 시절처럼 이 액션이 다시 호출하면 트리거가 이미 마친
 * 전이를 재시도하다 상태 불일치로 막힌다.
 *
 * **31일차(CREW, archived 크루 쓰기 표면 감사) — 진짜 결함을 막는다.** `disband_crew` RPC는
 * `join_requests`를 건드리지 않아, 해산 직전에 들어온 대기 중 신청이 그대로 `pending`으로
 * 남을 수 있다. RLS(`join_requests_update_requester_or_staff`)도 트리거
 * (`join_requests_sync_membership_on_decision`)도 crew.status를 보지 않아, 오너가 이 신청을
 * "승인"하면 **실제로 archived 크루에 새 active 멤버가 생겼다**(단순 문구 문제가 아니라
 * 데이터 정합성 문제) — 이 액션이 최초 진입점이라 여기서 막는다. SQL 쪽 동급 방어(트리거
 * 확장)는 이번 회차 범위 밖으로 별도 보고한다.
 */
export interface DecideJoinRequestFormState {
  success?: boolean;
  formError?: string;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). 호출부(`JoinRequestPanel`)가 타입만 가져다 직접 만든다.

const DECISION_VALUES: readonly JoinRequestStatus[] = ["approved", "rejected"];

function isDecision(value: string): value is Extract<JoinRequestStatus, "approved" | "rejected"> {
  return (DECISION_VALUES as readonly string[]).includes(value);
}

export async function decideJoinRequestAction(
  _prevState: DecideJoinRequestFormState,
  formData: FormData,
): Promise<DecideJoinRequestFormState> {
  const crewId = String(formData.get("crewId") ?? "");
  const joinRequestId = String(formData.get("joinRequestId") ?? "");
  const decisionRaw = String(formData.get("decision") ?? "");

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { formError: strings.crew.members.requests.errors.sessionExpired };
  }
  if (!isDecision(decisionRaw)) {
    return { formError: strings.crew.members.requests.errors.decideFailed };
  }

  const viewerMembership = await getCrewMembership(crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(viewerMembership);
  const permission = checkPermission({ role, action: "crew:approve_join_request" });
  if (!permission.allowed) {
    return { formError: strings.crew.members.requests.errors.notAllowed };
  }

  const crew = await getCrewById(crewId);
  if (!crew || crew.status !== "active") {
    return { formError: strings.crew.members.requests.errors.crewArchived };
  }

  const decided = await decideJoinRequest(joinRequestId, decisionRaw, session.profileId);
  if (!decided.ok || decided.data.crewId !== crewId) {
    return { formError: strings.crew.members.requests.errors.alreadyDecided };
  }

  refresh();
  return { success: true };
}
