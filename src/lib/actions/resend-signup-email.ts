"use server";

import {
  getRecentResendAttempts,
  recordResendAttempt,
  resendSignupConfirmationEmail,
} from "@/lib/auth";
import { evaluateResendCooldown, isValidEmailFormat } from "@/lib/rules/auth-credentials";
import { strings, t } from "@/lib/strings";

/**
 * FR-001 E4 인증 메일 재발송 Server Action(Task 030, 17일차 — BOARD 교차검증 major 지적으로
 * 추가). `SignupForm`의 `pendingVerification` 패널이 `useActionState(resendSignupEmailAction, ...)`
 * 로 건다.
 *
 * 요구사항 원문(requirements.md FR-001 E4) 그대로: "재발송(60초 쿨다운, 시간당 5회 상한)". 게이트
 * 순서는 `loginAction`의 D-020 잠금 게이트와 같은 모양이다 — ① `evaluateResendCooldown`으로
 * 먼저 판정 ② 거부면 Supabase Auth를 호출하지 않고 즉시 도메인 오류 상태로 반환(D-030 ③,
 * 예외로 던지지 않는다) ③ 허용이면 `resendSignupConfirmationEmail` 호출 후에만 시도 기록.
 *
 * **실측 한계**: 이 프로젝트는 아직 커스텀 SMTP(Resend, D-042)가 대시보드에 연결되지 않아
 * 실제 메일 수신까지는 검증할 수 없다 — `resendSignupConfirmationEmail`이 `ok:true`를
 * 반환해도 Supabase 내장 발송 한도(시간당 2통, 프로젝트 전체)에 걸려 조용히 발송되지 않을 수
 * 있다(계정 열거 방지를 위해 Supabase가 이 경우도 에러를 던지지 않는다 — `session.ts` 참고).
 * "재발송 요청이 접수됐다"까지만 이 액션이 보장한다.
 */
export interface ResendSignupEmailState {
  status: "idle" | "sent" | "error";
  errorMessage?: string;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). `SignupForm`이 타입만 가져다 직접 만든다.

export async function resendSignupEmailAction(
  _prevState: ResendSignupEmailState,
  formData: FormData,
): Promise<ResendSignupEmailState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!isValidEmailFormat(email)) {
    return { status: "error", errorMessage: strings.auth.signup.pendingVerification.resend.unknown };
  }

  const identifier = email.toLowerCase();
  const recentAttempts = await getRecentResendAttempts(identifier);
  const cooldown = evaluateResendCooldown(recentAttempts, new Date().toISOString());

  if (!cooldown.allowed) {
    const seconds = cooldown.retryAfterSeconds ?? 0;
    if (cooldown.reason === "cooldown") {
      return {
        status: "error",
        errorMessage: t((s) => s.auth.signup.pendingVerification.resend.cooldown, { seconds }),
      };
    }
    return {
      status: "error",
      errorMessage: t((s) => s.auth.signup.pendingVerification.resend.hourlyLimit, {
        minutes: Math.ceil(seconds / 60),
      }),
    };
  }

  const result = await resendSignupConfirmationEmail(email);
  await recordResendAttempt(identifier);

  if (!result.ok) {
    return { status: "error", errorMessage: strings.auth.signup.pendingVerification.resend.unknown };
  }

  return { status: "sent" };
}
