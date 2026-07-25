"use server";

import { redirect } from "next/navigation";

import { restoreOwnAccount } from "@/lib/auth";
import { strings } from "@/lib/strings";

/**
 * FR-005 AC3 — `/account/restore`가 `useActionState(restoreAccountAction, ...)`로 건다.
 * 비밀번호 재확인은 두지 않는다 — 이 화면에 도달했다는 사실 자체가 이미 유효한 Supabase Auth
 * 세션(로그인 성공)을 전제하므로, 탈퇴(파괴적 행위)와 달리 복구(원상 복구)에 같은 마찰을 둘
 * 이유가 약하다고 판단했다(FR-005 원문도 복구에 재인증을 요구하지 않는다).
 *
 * 성공하면 `/home`으로 보낸다 — `restore_deactivated_account`가 이미 `status`를 `active`로
 * 되돌려 뒀으므로 다음 `getAuthSession()` 호출은 정상 `authenticated`를 반환한다.
 */
export interface RestoreAccountState {
  status: "idle" | "error";
  errorMessage?: string;
}

export async function restoreAccountAction(
  // useActionState의 액션 시그니처(prevState, formData)를 맞추기 위한 자리다 — 이 액션은
  // 폼 필드를 쓰지 않는다(모듈 docstring 참고, 비밀번호 재확인을 두지 않기로 한 결정).
  _prevState: RestoreAccountState,
  formData: FormData,
): Promise<RestoreAccountState> {
  void formData;
  const result = await restoreOwnAccount();
  if (!result.ok) {
    if (result.reason === "grace_expired") {
      return { status: "error", errorMessage: strings.account.restore.errors.graceExpired };
    }
    if (result.reason === "not_deactivated") {
      return { status: "error", errorMessage: strings.account.restore.errors.notDeactivated };
    }
    return { status: "error", errorMessage: strings.account.restore.errors.unknown };
  }

  redirect("/home");
}
