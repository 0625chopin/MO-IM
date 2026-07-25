"use server";

import { confirmPasswordReset, signOutSupabaseSession } from "@/lib/auth";
import { validatePasswordFormat } from "@/lib/rules/auth-credentials";
import { strings } from "@/lib/strings";

/**
 * FR-003 정상 흐름 ④~⑥ — 새 비밀번호 저장. `ConfirmPasswordResetForm`이
 * `useActionState(confirmPasswordResetAction, ...)`로 건다. `/auth/confirm`이 이미
 * `verifyEmailOtp("recovery", ...)`로 임시 세션(쿠키)을 발급해 둔 상태에서만 이 액션이
 * 의미 있다 — 세션이 없으면 `confirmPasswordReset`이 `session_expired`로 보고한다(E2).
 *
 * ⑤(기존 세션 전부 폐기)는 Supabase Auth가 비밀번호 변경 시 자동으로 수행한다(`session.ts`
 * `confirmPasswordReset` docstring 참고, User sessions 가이드). **이 브라우저 자신의(방금
 * 만든) 세션**은 자동 폐기 대상이 아니므로(막 발급된 최신 세션이라) 여기서 명시적으로
 * `signOutSupabaseSession()`을 호출해 ⑥(로그인 화면)까지 이어간다 — AC2("이전 세션으로 API
 * 호출 → 401")를 이 브라우저에도 동일하게 적용해, "재설정 직후에는 새 비밀번호로 다시
 * 로그인해야 한다"는 일관된 흐름을 만든다.
 */
export interface ConfirmPasswordResetState {
  status: "idle" | "success" | "error";
  errorMessage?: string;
}

export async function confirmPasswordResetAction(
  _prevState: ConfirmPasswordResetState,
  formData: FormData,
): Promise<ConfirmPasswordResetState> {
  const password = String(formData.get("password") ?? "");
  const format = validatePasswordFormat(password);
  if (!format.valid) {
    return { status: "error", errorMessage: strings.auth.resetPassword.confirm.errors.passwordTooShort };
  }

  const result = await confirmPasswordReset(password);
  if (!result.ok) {
    if (result.code === "session_expired") {
      return { status: "error", errorMessage: strings.auth.resetPassword.confirm.errors.linkExpired };
    }
    if (result.code === "weak_password") {
      return { status: "error", errorMessage: strings.auth.resetPassword.confirm.errors.passwordTooShort };
    }
    return { status: "error", errorMessage: strings.auth.resetPassword.confirm.errors.unknown };
  }

  await signOutSupabaseSession();
  return { status: "success" };
}
