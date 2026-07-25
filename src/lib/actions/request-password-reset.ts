"use server";

import { headers } from "next/headers";

import { requestPasswordReset } from "@/lib/auth";
import { isValidEmailFormat } from "@/lib/rules/auth-credentials";
import { strings } from "@/lib/strings";

/**
 * FR-003 정상 흐름 ①·② — 재설정 메일 요청. `RequestPasswordResetForm`이
 * `useActionState(requestPasswordResetAction, ...)`로 건다.
 *
 * **AC1(계정 열거 방지)을 이 액션 자신이 지킨다** — 이메일 형식만 검사하고, 그 뒤로는
 * Supabase Auth 호출 성공 여부와 무관하게 `status:"sent"`만 반환한다(`requestPasswordReset`
 * docstring 참고 — Supabase API 자체가 미가입 이메일에도 에러를 던지지 않는다). 형식 오류는
 * 계정 존재 여부와 무관한 클라이언트 입력 오류라 필드 오류로 구분해도 열거 공격 표면이 아니다.
 *
 * **커스텀 레이트 리밋 테이블을 새로 두지 않는다(Task 039 결정)** — FR-003 원문(E1~E3, AC1·AC2)
 * 은 FR-001 E4처럼 구체적 상한(초/시간당 횟수)을 명시하지 않는다. `resend-signup-email.ts`가
 * 별도 테이블을 판 것은 원문이 "60초 쿨다운, 시간당 5회"를 못박았기 때문이었다 — 근거 없는
 * 숫자를 지어내지 않고, Supabase Auth 자체의 내장 레이트 리밋(대시보드 설정)에 맡긴다.
 */
export interface RequestPasswordResetState {
  status: "idle" | "sent" | "error";
  errorMessage?: string;
}

export async function requestPasswordResetAction(
  _prevState: RequestPasswordResetState,
  formData: FormData,
): Promise<RequestPasswordResetState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!isValidEmailFormat(email)) {
    return { status: "error", errorMessage: strings.auth.resetPassword.request.errors.emailInvalid };
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const redirectTo = `${protocol}://${host}/reset-password/confirm`;

  const result = await requestPasswordReset(email, redirectTo);
  if (!result.ok) {
    return { status: "error", errorMessage: strings.auth.resetPassword.request.errors.unknown };
  }
  return { status: "sent" };
}
