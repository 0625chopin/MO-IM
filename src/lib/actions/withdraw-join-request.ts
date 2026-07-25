"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { getPendingJoinRequestForRequester, withdrawJoinRequest } from "@/lib/data";
import { strings } from "@/lib/strings";

/**
 * FR-022 E4 가입 신청 철회 Server Action(Task 016B). `JoinRequestButton`의 "신청 대기 중 ·
 * 철회" 버튼이 `useActionState(withdrawJoinRequestAction, ...)`로 건다.
 *
 * **`checkPermission`을 호출하지 않는다 — 매트릭스에 이 행위의 행이 없다.** 3.3절 34개 액션
 * 중 자기 신청 철회에 해당하는 행이 없다(FR-022는 "가입 신청"만 매트릭스 행이고, 철회는 그
 * 예외 흐름 E4다). 대신 **클라이언트가 어떤 신청을 철회할지 지정하지 못하게** 설계해 안전을
 * 확보한다 — `joinRequestId`를 폼 값으로 받지 않고, `crewId` + 세션의 `profileId`만으로
 * 서버가 `getPendingJoinRequestForRequester`를 직접 조회한다. 다른 사람의 신청 id를 추측해
 * 넘기는 경로 자체가 없으므로 role 매트릭스가 아니라 "내가 만든 자원만 조작할 수 있다"는
 * 소유권 자체가 게이트다(`chat:delete_own_message`의 `isSelf` 각주와 같은 종류의 보장을,
 * 여기서는 컨텍스트 필드 대신 조회 조건으로 강제한다).
 *
 * **Task 032(18일차) — `withdrawPendingCrewMembership` 호출을 제거했다.** 실 DB의
 * `withdrawJoinRequest`(`src/lib/data/supabase/join-request.ts`)가 `crew_memberships`
 * 되돌리기(`requested→rejected`)까지 같은 함수 안에서 처리한다 — `join_requests`에는
 * 자동 동기화 트리거가 없어 이 레이어가 직접 맡는다(`docs/decisions/write-path-realdata-032.md`).
 */
export interface WithdrawJoinRequestFormState {
  success?: boolean;
  formError?: string;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). 호출부(`JoinRequestButton`)가 타입만 가져다 직접 만든다.

export async function withdrawJoinRequestAction(
  _prevState: WithdrawJoinRequestFormState,
  formData: FormData,
): Promise<WithdrawJoinRequestFormState> {
  const crewId = String(formData.get("crewId") ?? "");

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { formError: strings.crew.home.join.errors.sessionExpired };
  }

  const pending = await getPendingJoinRequestForRequester(crewId, session.profileId);
  if (!pending) {
    return { formError: strings.crew.home.join.errors.withdrawFailed };
  }

  const withdrawn = await withdrawJoinRequest(pending.id, session.profileId);
  if (!withdrawn.ok) {
    return { formError: strings.crew.home.join.errors.withdrawFailed };
  }

  refresh();
  return { success: true };
}
