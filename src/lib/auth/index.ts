import "server-only";

/**
 * 유일한 진입점(배럴) — `src/lib/realtime/index.ts`와 같은 패턴(Task 030, 17일차). 소비자
 * (`src/lib/actions/*`·`src/components/shell/get-auth-session.ts`)는 항상 `@/lib/auth`만
 * import한다. `./session`·`./lockout` 딥 임포트를 막는 별도 zone은 아직 없다 — 이 배럴의
 * 소비자가 CREW 소유 파일 몇 개뿐이라 지금은 관례로만 강제한다(realtime처럼 소비자가 여러
 * 컴포넌트로 늘어나면 그때 zone을 추가한다).
 *
 * **`import "server-only"`(17일차, 팀장 판정)** — `./session`·`./lockout` 둘 다 이미 이
 * 지시어를 달았지만, 배럴 자신도 달아 둔다 — 소비자가 이 배럴을 거치지 않고 어쩌다 클라이언트
 * 그래프에 끌려 들어가는 경로가 생겨도(예: 재노출 확장) 여기서도 한 번 더 잡힌다.
 */
export {
  getSupabaseAuthUser,
  resendSignupConfirmationEmail,
  signInWithPassword,
  signOutSupabaseSession,
  signUpWithPassword,
  type ResendSignupEmailFailureCode,
  type ResendSignupEmailResult,
  type SignInFailureCode,
  type SignInResult,
  type SignUpFailureCode,
  type SignUpResult,
  type SupabaseAuthUser,
} from "./session";

export {
  getRecentAuthAttempts,
  recordAuthAttempt,
  type AuthAttemptRecord,
} from "./lockout";

export {
  getRecentResendAttempts,
  recordResendAttempt,
  type ResendAttemptRecord,
} from "./resend-attempts";
