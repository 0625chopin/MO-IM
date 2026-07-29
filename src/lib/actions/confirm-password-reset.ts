"use server";

import { confirmPasswordReset, signOutSupabaseSession } from "@/lib/auth";
import { passwordsMatch, validatePasswordFormat } from "@/lib/rules/auth-credentials";
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
  // 비밀번호는 앞뒤 공백도 유의미해 `trim()`하지 않는다(`signup.ts`와 같은 이유).
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const format = validatePasswordFormat(password);
  if (!format.valid) {
    return { status: "error", errorMessage: strings.auth.resetPassword.confirm.errors.passwordTooShort };
  }

  // 21일차 — 확인란 불일치. 폼이 blur 시점에 같은 판정을 이미 하지만 그 결과를 신뢰하지
  // 않는다(Next.js "Validate inputs"). **`confirmPasswordReset` 호출 전에** 막는 것이 핵심이다
  // — 통과시키면 오타로 친 비밀번호가 실제로 저장되고, 그 직후 이 액션이 세션까지 폐기해
  // (⑤~⑥) 사용자는 자기가 모르는 비밀번호로 잠긴 계정을 마주한다. 재설정 링크는 이미
  // 소모된 뒤라 복구하려면 처음부터 다시 요청해야 한다.
  if (!passwordsMatch(password, passwordConfirm)) {
    return { status: "error", errorMessage: strings.auth.resetPassword.confirm.errors.passwordMismatch };
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
