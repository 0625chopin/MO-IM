import type { ISODateTimeString } from "@/lib/types";

/**
 * 고정 윈도우(fixed window) 레이트 리밋 판정 — 순수 함수(NFR-036, R-015, Task 038).
 *
 * `evaluateResendCooldown`(`lib/rules/auth-credentials.ts`)과 같은 계약이다 — `attempts`는
 * **판정 대상(계정) 하나로 이미 필터링된** 시도 이력이고(호출자가 쿼리 시점에 필터링), 이
 * 함수는 identifier를 모른다. 데이터 조회(`lib/audit/rate-limit-store.ts`)와 판정을 분리해
 * 두면 이 함수 자체는 어떤 행위에 대한 리밋이든(핸들 검색·향후 메시지 전송 등) 재사용할 수
 * 있다 — D-005·NFR-016 대상은 지금은 핸들 검색뿐이다(아래 `HANDLE_SEARCH_RATE_LIMIT` 참고,
 * NFR-016의 나머지 세 리밋 — 로그인 5회/15분은 `evaluateLoginLockout`이 이미 다른 판정 형태로
 * 구현하고 있고, 메시지 전송·게시글 작성은 이번 Task 038 범위 밖이다).
 */

export interface RateLimitWindow {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** `allowed === false`일 때만 채워진다 — 윈도우 안에서 가장 오래된 시도가 빠져나가는
   *  시점까지 남은 초. */
  retryAfterSeconds?: number;
}

export function evaluateFixedWindowRateLimit(
  attempts: readonly { attemptedAt: ISODateTimeString }[],
  now: ISODateTimeString,
  { limit, windowSeconds }: RateLimitWindow,
): RateLimitDecision {
  const nowMs = Date.parse(now);
  const windowStartMs = nowMs - windowSeconds * 1000;

  const withinWindow = attempts
    .filter((attempt) => Date.parse(attempt.attemptedAt) > windowStartMs)
    .sort((a, b) => Date.parse(a.attemptedAt) - Date.parse(b.attemptedAt));

  if (withinWindow.length < limit) {
    return { allowed: true };
  }

  const oldestInWindow = withinWindow[0];
  const retryAfterMs = Date.parse(oldestInWindow.attemptedAt) + windowSeconds * 1000 - nowMs;
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
}

/** D-005·NFR-016 — 핸들 검색은 계정당 분당 20회, 초과 시 429. */
export const HANDLE_SEARCH_RATE_LIMIT: RateLimitWindow = { limit: 20, windowSeconds: 60 };

/** D-047 · I-065 — 익명(미인증) 회원가입 흐름의 핸들 존재 확인(blur)은 IP당 분당 10회.
 *  `HANDLE_SEARCH_RATE_LIMIT`(계정당·인증 위협 모델)과 **의도적으로 다른 숫자**다 — 이 값을
 *  그대로 재사용하지 않은 근거는 `docs/prioritization-and-risks.md` D-047 참고. */
export const ANONYMOUS_HANDLE_AVAILABILITY_RATE_LIMIT: RateLimitWindow = {
  limit: 10,
  windowSeconds: 60,
};
