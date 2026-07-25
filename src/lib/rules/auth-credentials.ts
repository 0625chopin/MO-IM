import type { AuthAttempt, ISODateTimeString } from "@/lib/types";

/**
 * 비밀번호·이메일 형식 검증 + 로그인 잠금 판정 — 순수 함수 (NFR-036, R-015, Task 015A).
 * `handle-validation.ts`와 달리 이 모듈은 인증 화면(SignupForm·LoginForm) 전용이라 다른
 * Task가 재사용을 전제하지 않는다. 그래도 zone 1 규칙(React·Next·데이터 레이어 미의존)은
 * 동일하게 지킨다 — 실제 검증 이력 조회는 호출자(Server Action)의 몫이다.
 */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordFormatViolation = "too_short";

export interface PasswordFormatCheckResult {
  valid: boolean;
  violations: PasswordFormatViolation[];
}

/**
 * FR-001 AC3 — "비밀번호 8자 미만 → 오류". 요구사항이 명시한 기준은 최소 길이 하나뿐이라
 * 그 이상의 복잡도 규칙(대소문자·특수문자 조합)은 추가하지 않았다 — 명세에 없는 제약을
 * 넣으면 AC3 시나리오("8자 이상이면 통과")와 충돌한다. `violations`를 배열로 둔 것은 향후
 * 정책이 늘어도(예: 이메일과 동일 금지) `SignupForm`이 "위반 항목을 개별 표시"(FR-001 E3)
 * 하는 구조를 지금부터 갖추기 위해서다.
 */
export function validatePasswordFormat(password: string): PasswordFormatCheckResult {
  const violations: PasswordFormatViolation[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    violations.push("too_short");
  }
  return { valid: violations.length === 0, violations };
}

/** RFC 5322를 완전히 구현하지 않는다 — 서버 측 최종 검증은 실제 인증 스택(Task 026 이후)의
 *  몫이고, 여기서는 "명백히 이메일이 아닌 값"만 클라이언트에서 조기에 걸러낸다. */
const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_FORMAT_PATTERN.test(email);
}

/** D-020 — 계정 단위 로그인 잠금. 5회 연속 실패 시 마지막 실패로부터 15분 잠금. */
export const LOGIN_LOCKOUT_FAILURE_THRESHOLD = 5;
export const LOGIN_LOCKOUT_WINDOW_MINUTES = 15;

export interface LoginLockoutState {
  locked: boolean;
  /** locked===true일 때 잠금이 풀리는 시각. locked===false면 null. */
  unlocksAt: ISODateTimeString | null;
}

/**
 * D-020 — "5회 연속 실패 → 15분 잠금", "자격 증명이 맞아도 거부"(FR-002 AC4)를 판정하는
 * 순수 함수. `attempts`는 **판정 대상 계정(identifier) 하나로 이미 필터링된** 시도 이력이다
 * — 이 함수는 identifier로 필터링하지 않는다(그건 `lib/data`/Server Action이 쿼리 시점에
 * 할 일). 최근 순으로 정렬해 맨 앞에서부터 연속 실패 횟수를 센다.
 *
 * v0.1(Mock)에서는 `attempts`가 실제 `auth_attempt` 테이블 조회 결과가 아니라 로그인
 * Server Action이 심어 둔 고정 데모 배열에서 나온다 — D-020이 "v0.1(Mock)에서는 잠금
 * **화면 상태**만 만든다"고 못박았기 때문이다. Task 026(Supabase 도입) 이후 `attempts`
 * 인자를 실제 조회 결과로 바꾸면 이 함수 자체는 손대지 않고 그대로 재사용된다.
 */
export function evaluateLoginLockout(
  attempts: readonly Pick<AuthAttempt, "attemptedAt" | "succeeded">[],
  now: ISODateTimeString,
): LoginLockoutState {
  const sorted = [...attempts].sort(
    (a, b) => Date.parse(b.attemptedAt) - Date.parse(a.attemptedAt),
  );

  let consecutiveFailures = 0;
  for (const attempt of sorted) {
    if (attempt.succeeded) break;
    consecutiveFailures += 1;
  }

  if (consecutiveFailures < LOGIN_LOCKOUT_FAILURE_THRESHOLD) {
    return { locked: false, unlocksAt: null };
  }

  const lastFailure = sorted[0];
  const unlocksAt = new Date(
    Date.parse(lastFailure.attemptedAt) + LOGIN_LOCKOUT_WINDOW_MINUTES * 60_000,
  ).toISOString();
  const locked = Date.parse(now) < Date.parse(unlocksAt);

  return { locked, unlocksAt: locked ? unlocksAt : null };
}

/** FR-001 E4 — 인증 메일 재발송. 원문(requirements.md) 그대로: "60초 쿨다운, 시간당 5회 상한".
 *  이 상한 자체는 D-021(커스텀 SMTP 전제)의 존재 이유다 — Supabase 내장 발송(시간당 2통,
 *  프로젝트 전체)로는 이 상한을 만족할 수 없다(Task 030, 17일차, BOARD 교차검증 major 지적
 *  반영). */
export const RESEND_COOLDOWN_SECONDS = 60;
export const RESEND_HOURLY_LIMIT = 5;

export type ResendBlockedReason = "cooldown" | "hourly_limit";

export interface ResendCooldownState {
  allowed: boolean;
  reason?: ResendBlockedReason;
  /** `allowed === false`일 때만 채워진다 — 다음 시도가 허용되는 시점까지 남은 초. */
  retryAfterSeconds?: number;
}

/**
 * 재발송 가능 여부를 판정하는 순수 함수. `evaluateLoginLockout`과 같은 계약이다 —
 * `attempts`는 **판정 대상 이메일 하나로 이미 필터링된** 시도 이력이고(호출자가 쿼리 시점에
 * 필터링), 이 함수는 identifier를 모른다.
 *
 * 두 조건을 독립적으로 검사한다: ① 마지막 시도로부터 60초가 안 지났으면 쿨다운 ② (쿨다운을
 * 통과했어도) 최근 1시간 안의 시도가 5회 이상이면 시간당 상한. 둘 다 실패 조건이 아니라
 * "이미 시도했다"는 사실만으로 판정한다 — 재발송 자체는 성공/실패 개념이 로그인처럼 갈리지
 * 않는다(요청하면 발송을 시도한다는 사실 자체가 카운트 대상).
 */
export function evaluateResendCooldown(
  attempts: readonly { attemptedAt: ISODateTimeString }[],
  now: ISODateTimeString,
): ResendCooldownState {
  const nowMs = Date.parse(now);
  const sorted = [...attempts].sort(
    (a, b) => Date.parse(b.attemptedAt) - Date.parse(a.attemptedAt),
  );

  const lastAttempt = sorted[0];
  if (lastAttempt) {
    const elapsedSeconds = (nowMs - Date.parse(lastAttempt.attemptedAt)) / 1000;
    if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
      return {
        allowed: false,
        reason: "cooldown",
        retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds),
      };
    }
  }

  const oneHourAgoMs = nowMs - 60 * 60_000;
  const withinHour = sorted.filter((a) => Date.parse(a.attemptedAt) > oneHourAgoMs);
  if (withinHour.length >= RESEND_HOURLY_LIMIT) {
    const oldestInWindow = withinHour[withinHour.length - 1];
    const retryAfterMs = Date.parse(oldestInWindow.attemptedAt) + 60 * 60_000 - nowMs;
    return {
      allowed: false,
      reason: "hourly_limit",
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  return { allowed: true };
}

/** FR-002 AC3("보호 라우트 직접 접근 → 로그인 → 원래 요청 경로로 복귀")에서 로그인 성공 후
 *  돌아갈 기본 경로. `sanitizeRedirectTarget`이 거부한 모든 입력이 여기로 떨어진다. */
export const REDIRECT_TARGET_FALLBACK = "/home";

/**
 * 오픈 리다이렉트 방어 — 순수 함수(NFR-036, R-015). **로그인 흐름에서 사용자가 통제하는 값이
 * 실제 HTTP 리다이렉트 대상으로 쓰이는 유일한 지점**이라 정정한다(17일차, 팀장이 우회 경로를
 * 직접 실측해 발견).
 *
 * **이 함수가 유일한 방어선이다 — 다음 사람이 이 사실을 모르고 검증을 완화하면 안 된다.**
 * `redirectTo`는 브라우저(`RedirectToLogin.tsx`)가 `usePathname()`/`useSearchParams()`로 읽어
 * `/login?redirect=...`에 실은 값이고, `LoginForm`이 hidden input으로 그대로 실어 이 액션에
 * 제출한다. `RedirectToLogin.tsx`는 **의도적으로** 자기 쪽에서 오픈 리다이렉트를 검증하지
 * 않는다 — "클라이언트가 만든 값은 어차피 신뢰할 수 없고, 받는 쪽(서버)이 재검증한다"는
 * 원칙(Next.js Server Actions 문서 "Validate inputs")을 그대로 따른 결과다. 즉 클라이언트
 * 쪽에는 이 값을 걸러내는 코드가 **의도적으로 없다** — 이 함수가 뚫리면 걸러낼 곳이 더 없다.
 *
 * **왜 문자열 prefix 비교(구버전)가 아니라 URL 파싱인가**: 이전 구현은 `candidate.startsWith("/")
 * && !candidate.startsWith("//")`만 봤다. `/\evil.com`은 이 검사를 그대로 통과하는데, WHATWG
 * URL 표준은 http/https 같은 "특수 스킴"에서 **백슬래시를 슬래시와 동등하게** 취급하므로
 * (`https://url.spec.whatwg.org/#url-parsing`의 특수 스킴 경로 상태), 브라우저가
 * `Location: /\evil.com`을 받으면 `//evil.com`(프로토콜 상대 URL)으로 정규화해 외부 사이트로
 * 나간다 — 문자열 비교는 이 정규화를 흉내 내지 못하고 실제로 뚫렸다.
 *
 * **왜 이 구현이 맞는가**: `new URL(candidate, "http://localhost")`로 파싱하면 Node·브라우저가
 * 공유하는 같은 WHATWG URL 파서가 백슬래시 정규화·퍼센트 디코딩·스킴 판정을 전부 대신
 * 해 준다 — 그 결과로 나온 `origin`이 기준 origin과 같은지만 확인하면, 브라우저가 실제로
 * 그 값을 어떻게 해석할지와 판정 기준이 항상 일치한다(직접 재구현한 정규화 규칙이 브라우저
 * 구현과 어긋날 위험이 없다). 제어문자(`\r`·`\n`·tab·NUL 등)는 URL 파서가 조용히 제거하는
 * 경우가 있어(HTTP 헤더 분리류 공격에 악용될 수 있다) 파싱 전에 별도로 걸러낸다.
 *
 * **실측(17일차)** — 아래 표가 함수 자체를 그대로 호출한 결과다(추측이 아니라 Node로 실행):
 *
 * | 입력 | 반환값 |
 * | --- | --- |
 * | `/home` | `/home`(통과) |
 * | `/crews/abc?x=1` | `/crews/abc?x=1`(통과, 쿼리 보존) |
 * | `//evil.com` | `/home`(차단) |
 * | `/\evil.com` | `/home`(차단 — 문자열 prefix 비교로는 뚫렸던 값) |
 * | `/\/evil.com` | `/home`(차단) |
 * | `https://evil.com` | `/home`(차단) |
 * | `javascript:alert(1)` | `/home`(차단) |
 * | `""`(빈 문자열) | `/home`(차단) |
 * | `"/ok\r\nSet-Cookie: x=1"` | `/home`(차단 — 제어문자 포함) |
 * | `/%2f%2fevil.com` | `/%2f%2fevil.com`(그대로 통과 — **안전하다, 결함 아니다**: 브라우저는
 *   `Location` 헤더의 `%2f`를 경로 구분자로 디코드하지 않는다 — 파서가 authority로 승격시키지
 *   않고 path 세그먼트 안에 인코딩된 채로 남아, 결과 origin이 기준과 같다. 같은 출처의(존재하지
 *   않는) 경로일 뿐 외부 사이트로 나가지 않는다. **이 행이 "인코딩된 슬래시가 뚫렸다"는 뜻이
 *   아니다** — 다음 사람이 실측표만 보고 오판해 불필요한 방어를 덧붙이지 않도록 남긴다) |
 *
 * **`TRUSTED_BASE = "http://localhost"`는 허용 목록(allowlist)이 아니라 센티널이다.** `new URL`이
 * 상대 경로를 절대 URL로 파싱하려면 `base` 인자가 있어야 하는데, 그 값 자체는 임의의 아무
 * 문자열이어도 된다(실제 배포 origin과 무관 — Vercel URL이든 뭐든 상관없다). 이 함수가 실제로
 * 강제하는 것은 "`candidate`를 이 base에 대해 파싱한 결과의 origin이 **그 base와 같아야 한다**"
 * 뿐이다 — 즉 **절대 URL(다른 origin을 명시한 값)은 그 origin이 무엇이든 전부 거부된다**(표의
 * `https://evil.com`뿐 아니라 `http://localhost:3000/home`도 차단되는 것이 그 증거 — 이 앱의
 * 실제 배포 origin이어도 절대 URL 형태로 오면 거부한다). 이 함수가 실제로 받는 입력은 항상
 * `RedirectToLogin.tsx`가 `usePathname()`/`useSearchParams()`로 만든 **상대 경로**
 * (`pathname[?search]`)뿐이다. **다음 사람이 "왜 localhost가 하드코딩돼 있지"라며 배포
 * origin으로 바꾸려 하면 안 된다** — 바꾸는 순간 그 origin이 실제로 허용된다는 뜻이 되어
 * "상대 경로만 허용"이라는 지금의 더 엄격한 보장이 사라진다.
 *
 * **URL 프래그먼트(`#...`)는 의도적으로 버리지 않고 보존한다(`url.hash`)** — 다만 이 앱의 실제
 * 호출 경로에서는 애초에 도달 불가능한 값이다: 브라우저는 프래그먼트를 HTTP 요청에 절대 싣지
 * 않고(플랫폼 표준 동작, Next.js와 무관), `RedirectToLogin.tsx`가 쓰는
 * `usePathname()`/`useSearchParams()` 둘 다 해시를 노출하지 않는다(Next.js 문서 확인 —
 * `use-pathname.md`·`use-search-params.md`에 hash 언급 없음). 그래도 포함해 두는 이유는
 * 비용이 0이고(빈 문자열이면 결과에 아무것도 안 붙는다), 이 함수를 다른 호출자가 재사용할 때
 * (예: 딥링크를 직접 다루는 클라이언트 코드가 미래에 생기면) 조용히 앵커를 잃는 실수를
 * 막아 주기 때문이다.
 */
export function sanitizeRedirectTarget(candidate: string): string {
  if (!candidate) {
    return REDIRECT_TARGET_FALLBACK;
  }
  // 제어문자(개행·탭·NUL 등)가 섞이면 즉시 거부한다 — 헤더 분리·파서 우회에 쓰일 수 있다.
  if (/[\x00-\x1f\x7f]/.test(candidate)) {
    return REDIRECT_TARGET_FALLBACK;
  }

  const TRUSTED_BASE = "http://localhost";
  try {
    const url = new URL(candidate, TRUSTED_BASE);
    if (url.origin !== TRUSTED_BASE) {
      return REDIRECT_TARGET_FALLBACK;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return REDIRECT_TARGET_FALLBACK;
  }
}
