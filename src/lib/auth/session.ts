import "server-only";

import { createSupabaseServerClient } from "@/lib/data/supabase/server";

/**
 * Supabase Auth 세션 — 로그인·가입·로그아웃 (Task 030, 17일차 CREW).
 *
 * **`import "server-only"`(17일차, 팀장 판정)** — 이 모듈이 몇 단계를 거쳐 client 그래프에
 * 전이 import되면(`no-restricted-imports`는 전이 경로를 못 본다, `resolve-post-link-card.ts`
 * 사고가 실증) 번들러가 빌드 시점에 명시적으로 잡는다. `next/headers`를 여기서 직접 쓰지
 * 않아도(재수출된 `createSupabaseServerClient`가 쓴다) 이 파일 자체가 서버 전용 세션·쿠키
 * 함수만 export하므로 지시어를 단다.
 *
 * **왜 `src/lib/data/` 밖인가(17일차 팀장 판정)**: `src/lib/data/contracts.ts`의 CON-05·CON-06은
 * "이 레이어의 어떤 함수도 쿠키·세션·요청 객체를 직접 읽지 않는다"고 명문화했다 — 웹 쿠키 세션과
 * 네이티브 토큰 저장소 양쪽에서 그 레이어를 그대로 재사용하기 위해서다. 세션을 데이터 배럴에
 * 넣고 재노출하면 이 계약이 깨진다. 그래서 `src/lib/realtime/**`(데이터 배럴 밖에서 Supabase
 * 클라이언트를 다루는 독립 계층)와 대칭으로 `src/lib/auth/`를 신설했다 — CREW 소유,
 * `eslint.config.mjs` zone 7이 이 디렉터리에서 `@supabase/*` 직접 import를 허용한다.
 *
 * **클라이언트는 중복 구현하지 않는다** — `@/lib/data/supabase/server`의
 * `createSupabaseServerClient()`(인프라, DESIGN 파일 무수정 재사용)를 그대로 쓴다. zone 7은 이
 * 인프라 3개(`server`·`client`·`env`)만 예외로 허용하고 도메인 구현 딥 임포트는 계속 막는다.
 *
 * `@supabase/ssr`가 로그인/가입/로그아웃 성공 시 `Set-Cookie`로 세션을 쓴다 —
 * `createSupabaseServerClient()`가 `cookieOptions: { httpOnly: true, secure: true }`로 만들어져
 * 있어(NFR-010, 17일차 실측 수정) 이 파일은 쿠키를 직접 다루지 않는다.
 */

export interface SupabaseAuthUser {
  id: string;
  email: string | null;
}

/** 서버 컴포넌트·Server Action에서 현재 요청의 인증 사용자를 조회한다. `getSession()`이
 *  아니라 `getUser()`를 쓴다 — 쿠키에 담긴 JWT를 그대로 신뢰하지 않고 Supabase Auth 서버에
 *  재검증을 요청한다(Supabase 문서 권고, 서버 신뢰 경계). */
export async function getSupabaseAuthUser(): Promise<SupabaseAuthUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

export type SignInFailureCode = "invalid_credentials" | "email_not_confirmed" | "unknown";

export type SignInResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; code: SignInFailureCode };

/** FR-002 로그인. 성공하면 `createSupabaseServerClient()`의 쿠키 어댑터가 세션을 httpOnly
 *  쿠키로 즉시 써 둔다 — 호출자가 별도로 세션을 저장할 필요가 없다. */
export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // FR-002 E4 — 미인증 계정 로그인 시도는 자격 증명 불일치(E1)와 분리해 안내해야 한다.
    if (error.code === "email_not_confirmed") {
      return { ok: false, code: "email_not_confirmed" };
    }
    return { ok: false, code: "invalid_credentials" };
  }
  if (!data.user) {
    return { ok: false, code: "unknown" };
  }
  return { ok: true, userId: data.user.id, email: data.user.email ?? null };
}

export type SignUpFailureCode = "email_taken" | "unknown";

export type SignUpResult =
  | { ok: true; userId: string; sessionCreated: boolean }
  | { ok: false; code: SignUpFailureCode };

/** FR-001 회원가입. 대시보드 "Confirm email" 설정이 켜져 있는 한(실측: 17일차 확인,
 *  `docs/decisions/auth-integration-030.md` §3) `data.session`은 항상 null이다 —
 *  `sessionCreated`로 호출자가 이 분기를 명시적으로 처리하게 한다(AC1의
 *  `pending_verification`). */
export async function signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (error.code === "user_already_exists") {
      return { ok: false, code: "email_taken" };
    }
    return { ok: false, code: "unknown" };
  }
  if (!data.user) {
    return { ok: false, code: "unknown" };
  }
  // 계정 열거 방지책으로, 이미 존재하는(그리고 인증 완료된) 이메일로 재가입을 시도해도
  // Supabase Auth는 에러를 던지지 않고 대신 identities: []인 사용자를 반환한다 — 이 경우를
  // "이미 가입된 이메일"로 취급한다(FR-001 E1).
  if (data.user.identities && data.user.identities.length === 0) {
    return { ok: false, code: "email_taken" };
  }
  return { ok: true, userId: data.user.id, sessionCreated: Boolean(data.session) };
}

export async function signOutSupabaseSession(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}

export type ResendSignupEmailFailureCode = "unknown";

export type ResendSignupEmailResult = { ok: true } | { ok: false; code: ResendSignupEmailFailureCode };

/**
 * FR-001 E4 — 인증 메일 재발송(Task 030, 17일차, BOARD 교차검증 major 지적 반영). 쿨다운·
 * 시간당 상한 판정은 호출자(`resendSignupEmailAction`)가 `evaluateResendCooldown` +
 * `resend-attempts.ts`로 먼저 끝낸 뒤에만 이 함수를 부른다 — 이 함수 자신은 판정하지 않고
 * Supabase Auth API(`auth.resend`, `mcp__supabase__search_docs`로 조회한 시그니처:
 * `{ type: 'signup', email }`)만 그대로 호출한다.
 *
 * Supabase 자체에도 내장 레이트 리밋이 있어(대시보드 설정) 이 함수가 성공을 반환해도 실제
 * 발송은 그쪽에서 한 번 더 막힐 수 있다 — 그 경우도 `error` 없이 성공으로 응답하는 것이
 * Supabase의 계정 열거 방지 관례라, 이 함수 수준에서는 구분할 방법이 없다(대시보드 커스텀
 * SMTP 연결 전까지는 실제 수신 여부를 이 프로젝트 코드로 검증할 수 없다 — 운영자 수동 확인
 * 대상, `docs/decisions/auth-integration-030.md` §10).
 */
export async function resendSignupConfirmationEmail(
  email: string,
): Promise<ResendSignupEmailResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) {
    return { ok: false, code: "unknown" };
  }
  return { ok: true };
}

/**
 * FR-003 비밀번호 재설정 + FR-001 E4 인증 메일의 공용 PKCE 토큰 교환 타입(Task 039).
 * `@supabase/supabase-js`의 `EmailOtpType`은 이 프로젝트가 쓰지 않는 값(`magiclink`·`invite`·
 * `email_change` 등)까지 포함하는 더 넓은 유니온이라, zone 7 밖(`src/app/auth/confirm/route.ts`)
 * 이 `@supabase/supabase-js`를 직접 import하지 않도록 실제로 쓰는 2개만 좁혀 재노출한다.
 */
export type EmailConfirmType = "signup" | "recovery";

export type VerifyEmailOtpResult = { ok: true } | { ok: false };

/**
 * `/auth/confirm` 라우트 핸들러(PKCE 토큰 교환, Supabase 공식 Next.js 패턴)가 쓰는 유일한
 * 진입점 — `route.ts`는 `src/app/**`라 zone 6(일반 규칙)에 걸려 Supabase 클라이언트를 직접
 * import할 수 없다(`docs/CONVENTIONS.md` ESLint 표). 성공하면 `createSupabaseServerClient()`의
 * 쿠키 어댑터가 세션(가입 확인 또는 재설정용 임시 세션)을 httpOnly 쿠키로 즉시 쓴다.
 */
export async function verifyEmailOtp(
  type: EmailConfirmType,
  tokenHash: string,
): Promise<VerifyEmailOtpResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  return error ? { ok: false } : { ok: true };
}

/** FR-003 정상 흐름 ①·② — 이메일 형식 검사는 호출자(Server Action)가 먼저 끝낸다. Supabase
 *  Auth는 미가입 이메일에도 에러 없이 성공을 반환한다(계정 열거 방지 관례, `auth.resend`와
 *  동일) — FR-003 AC1("구분 불가능한 응답")을 이 API 자체가 만족시켜 별도 처리가 필요 없다. */
export async function requestPasswordReset(
  email: string,
  redirectTo: string,
): Promise<{ ok: true } | { ok: false }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  return error ? { ok: false } : { ok: true };
}

export type ConfirmPasswordResetFailureCode = "session_expired" | "weak_password" | "unknown";

export type ConfirmPasswordResetResult =
  | { ok: true }
  | { ok: false; code: ConfirmPasswordResetFailureCode };

/**
 * FR-003 정상 흐름 ④ — `/auth/confirm`이 `verifyEmailOtp("recovery", ...)`로 이미 발급해 둔
 * 임시 세션(쿠키)을 이 함수가 그대로 이어받아 `updateUser`를 호출한다. 세션이 없거나 만료됐으면
 * Supabase가 `session_not_found` 계열 오류를 반환한다 — E2(링크 만료)를 이 오류로 구분한다.
 * ⑤(기존 세션 전부 폐기)는 Supabase Auth의 문서화된 동작이다: "비밀번호 변경은 보안 민감
 * 작업이라 세션을 종료시킨다"(User sessions 가이드) — 이 함수가 별도로 다른 세션을 폐기하는
 * 코드를 두지 않는다. 이 브라우저 자신의 세션은 호출자(`confirmPasswordResetAction`)가
 * `signOutSupabaseSession()`으로 명시적으로 끝내 ⑥(로그인 화면)까지 이어간다.
 */
export async function confirmPasswordReset(
  newPassword: string,
): Promise<ConfirmPasswordResetResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    if (error.code === "session_not_found" || error.status === 401) {
      return { ok: false, code: "session_expired" };
    }
    if (error.code === "weak_password") {
      return { ok: false, code: "weak_password" };
    }
    return { ok: false, code: "unknown" };
  }
  return { ok: true };
}

/**
 * FR-005 정상 흐름 ③ — 탈퇴·계정 관련 파괴적 조작 전 비밀번호 재확인. 현재 세션 이메일로
 * `signInWithPassword`를 다시 호출하는 것이 재인증의 가장 단순한 형태다(Supabase는 별도
 * "reauthenticate" API를 이메일+비밀번호 로그인에 두지 않는다 — MFA/전화번호 변경 전용
 * `reauthenticate()`와는 다른 시나리오). 현재 로그인 사용자가 없으면 즉시 실패한다.
 */
export async function reauthenticateWithPassword(password: string): Promise<SignInResult> {
  const authUser = await getSupabaseAuthUser();
  if (!authUser || !authUser.email) {
    return { ok: false, code: "unknown" };
  }
  return signInWithPassword(authUser.email, password);
}

export type AccountLifecycleRpcResult = {
  ok: boolean;
  changed: boolean;
  reason: string | null;
};

/** FR-005 — `request_account_deactivation` RPC(security invoker, `auth.uid()`로 본인만
 *  건드림) 호출부. RPC 계약(`ok`/`changed`/`reason`)은
 *  `supabase/migrations/20260725071600_account_deactivation_restore_functions.sql` 참고. */
export async function deactivateOwnAccount(): Promise<AccountLifecycleRpcResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_account_deactivation").single();
  if (error || !data) {
    return { ok: false, changed: false, reason: "unknown" };
  }
  return data;
}

/** FR-005 AC3 — `restore_deactivated_account` RPC 호출부(30일 유예 이내만 성공). */
export async function restoreOwnAccount(): Promise<AccountLifecycleRpcResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("restore_deactivated_account").single();
  if (error || !data) {
    return { ok: false, changed: false, reason: "unknown" };
  }
  return data;
}
