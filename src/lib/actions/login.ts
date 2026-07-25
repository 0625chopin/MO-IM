"use server";

import { redirect } from "next/navigation";

import { getRecentAuthAttempts, recordAuthAttempt, signInWithPassword } from "@/lib/auth";
import {
  evaluateLoginLockout,
  isValidEmailFormat,
  sanitizeRedirectTarget,
} from "@/lib/rules/auth-credentials";
import { strings } from "@/lib/strings";

/**
 * FR-002 로그인 Server Action. `LoginForm`이 `useActionState(loginAction, ...)`로 건다.
 *
 * **Task 030(17일차)부터 실 Supabase Auth + D-020 계정 잠금을 쓴다.** Mock 데모 계정
 * (`MOCK_DEMO_ACCOUNTS`)은 제거했다 — `CLAUDE.md`의 "테스트계정" 절도 이 회차에 함께 갱신했다.
 *
 * **D-020 게이트**: Supabase Auth의 레이트 리밋은 IP·프로젝트 단위라 "자격 증명이 맞아도
 * 거부"(AC4)를 표현할 수 없다 — 그래서 `public.auth_attempts`(Task 028이 이미 만들었고
 * 029A가 client 완전 거부 RLS까지 끝내 둔 "서버 전용" 테이블)를 `evaluateLoginLockout`
 * (순수 함수, `lib/rules/auth-credentials.ts`)로 먼저 판정한다. **잠긴 동안에는 Supabase
 * Auth를 아예 호출하지 않는다** — 그래야 "맞는 자격 증명도 거부"가 문자 그대로 성립한다
 * (호출했다가 성공 결과를 버리는 방식은 AC4가 요구하는 의미론이 아니다).
 *
 * 시도 기록(`recordAuthAttempt`)은 실제로 Supabase Auth를 호출한 시도(성공·실패 모두)에만
 * 남긴다 — 잠금 상태에서 거부된 시도는 기록하지 않는다(어차피 마지막 실패 시각 기준
 * 15분 창이 그대로 유지되므로 추가 기록이 필요 없다).
 *
 * **오픈 리다이렉트 방어(`sanitizeRedirectTarget`)는 17일차에 `lib/rules/auth-credentials.ts`로
 * 옮겼다** — 문자열 prefix 비교(`startsWith("/")`)가 `/\evil.com`(백슬래시, WHATWG URL이
 * http/https에서 슬래시와 동등하게 취급)로 우회되는 결함을 팀장이 실측으로 발견해, URL 파싱
 * 기반 구현으로 교체하며 다른 순수 판정 함수들(`evaluateLoginLockout`·`evaluateResendCooldown`)
 * 옆으로 옮겼다 — 근거·실측 표는 그 함수의 docstring 참고. **이 함수가 `redirectTo`의 유일한
 * 방어선이다** — `RedirectToLogin.tsx`(DESIGN)는 의도적으로 클라이언트 측 검증을 생략한다.
 */
export interface LoginFormState {
  formError?: string;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). `LoginForm`이 `LoginFormState` 타입만 가져다 직접 만든다.

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = sanitizeRedirectTarget(String(formData.get("redirectTo") ?? ""));

  if (!isValidEmailFormat(email) || password.length === 0) {
    // FR-002 E1 — 형식이 애초에 틀려도 "어느 필드가 문제인지"는 알려주지 않는다.
    return { formError: strings.auth.login.genericError };
  }

  const identifier = email.toLowerCase();

  const recentAttempts = await getRecentAuthAttempts(identifier);
  const lockout = evaluateLoginLockout(recentAttempts, new Date().toISOString());
  if (lockout.locked) {
    // D-020·FR-002 AC4 — 자격 증명을 검사하지 않고 즉시 거부한다.
    return { formError: strings.auth.login.lockedNotice };
  }

  const result = await signInWithPassword(email, password);
  await recordAuthAttempt(identifier, result.ok);

  if (!result.ok) {
    if (result.code === "email_not_confirmed") {
      // FR-002 E4 → FR-001 E4로 이관.
      return { formError: strings.auth.login.emailNotVerifiedNotice };
    }
    // 계정 없음과 비밀번호 불일치를 같은 메시지로 합친다(FR-002 E1 "구분하지 않는 단일 메시지").
    return { formError: strings.auth.login.genericError };
  }

  // 세션은 `signInWithPassword`가 내부에서 이미 httpOnly 쿠키로 써 뒀다(NFR-010) — 여기서
  // 별도로 세션을 만들지 않는다.
  redirect(redirectTo);
}
