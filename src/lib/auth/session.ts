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
