"use server";

import { headers } from "next/headers";

import {
  getProfileByHandle,
  getRecentHandleAvailabilityCheckAttempts,
  recordHandleAvailabilityCheckAttempt,
} from "@/lib/data";
import { validateHandleFormat, type HandleFormatCheckResult } from "@/lib/rules/handle-validation";
import {
  ANONYMOUS_HANDLE_AVAILABILITY_RATE_LIMIT,
  evaluateFixedWindowRateLimit,
} from "@/lib/rules/rate-limit";

/**
 * FR-001 AC2 — 핸들 실시간 중복 검사. `SignupForm`이 핸들 입력란 blur마다 이 함수를 직접
 * 호출한다(폼 제출이 아니라 일반 함수 호출로 쓰는 Server Action — Next.js는 `'use server'`
 * 함수를 폼 action 밖에서도 클라이언트 컴포넌트가 그냥 호출할 수 있게 한다).
 *
 * **가입/핸들 변경 시 "유일성 중복 검사" 전용이다 — FR-006 핸들 검색에는 쓰지 않는다.**
 * `getProfileByHandle`은 `searchOptOut`과 무관하게 존재 여부를 그대로 반환한다(유일성은
 * 옵트아웃과 무관해야 하므로 여기서는 맞는 동작이다). 하지만 FR-006 핸들 검색은 옵트아웃
 * 사용자를 "존재하지 않는 핸들"과 구분 불가능하게 응답해야 한다(3.6절, D-005, R-012) — 이
 * 함수를 검색에 재사용하면 옵트아웃 사용자의 핸들 존재 여부가 새어 나간다. FR-006 검색은
 * `lib/data`의 `searchProfilesByHandle` 기반 별도 조회를 쓴다.
 *
 * **이 액션은 미인증(guest) 호출자도 부를 수 있다** — 회원가입 화면(세션 없음)에서 이
 * 액션이 정상적으로 동작해야 하므로 인증 검사 자체를 둘 수 없다(`search-user-by-handle.ts`,
 * FR-006, 로그인 필요·D-005 SQL 리밋과 다른 성격이다). 반환값이 `available: boolean`(그
 * 핸들 하나의 존재 여부) 하나뿐이라 노출은 제한적이지만(전체 회원 명부·PII 없음), 리밋이
 * 없으면 봇이 핸들 네임스페이스 전체를 저비용으로 훑을 수 있다(R-012 우려) — 19일차 팀장
 * 교차검증(I-065)이 발견했고, 사용자가 20일차 착수 전 "정책을 새 D-\*로 확정한 뒤 구현"
 * 방향을 확정했다.
 *
 * **D-047 — IP당 분당 10회로 제한한다.** 식별자는 `x-forwarded-for`(Next.js 16 `headers()`,
 * await 필요 — `request-password-reset.ts`에 이미 전례가 있다)의 첫 값이다. 계정 식별자가
 * 없는(미인증) 호출이라 D-005의 `handle_search_attempts`(uuid, 계정당)를 재사용할 수 없고,
 * **그 숫자(20/60)도 그대로 재사용하지 않는다** — 계정당·인증 위협 모델과 IP당·익명 위협
 * 모델은 다르다(공유 IP·NAT 뒤 여러 사용자 vs 계정 생성 비용). 근거 전문은
 * `docs/prioritization-and-risks.md` D-047 참고. 판정은
 * `evaluateFixedWindowRateLimit`(순수 함수, `lib/rules/rate-limit.ts`)에 맡기고, 조회·기록은
 * `handle-availability-rate-limit.ts`(zone 3, `src/lib/data/supabase/`)가 맡는다 — 허용된
 * 시도만 기록한다(거부된 요청은 다음 판정도 같은 윈도우를 다시 계산할 뿐이라 기록 불필요).
 * 형식이 틀린 값은 리밋을 소모하지 않는다 — 애초에 DB 조회(열거 대상)까지 가지 않으므로.
 *
 * `excludeProfileId`를 주면 "본인의 현재 핸들"은 중복으로 치지 않는다(핸들 변경 화면에서
 * 저장 버튼을 누르지 않고 다시 blur만 해도 자기 핸들이 "이미 사용 중"으로 뜨는 오탐을
 * 막는다 — FR-004 AC1의 30일 쿨다운 판정은 `lib/rules/handle-validation.ts`의
 * `canChangeHandle`이 별도로 맡는다). 회원가입 경로(이 화면)는 항상 `excludeProfileId`를
 * 생략한다 — 아직 프로필이 없다. `change-account-handle.ts`(인증된 핸들 변경)도 이 액션을
 * 재사용하므로 그쪽도 부수적으로 같은 IP 리밋을 받는다 — 인증 여부로 분기하지 않는다.
 *
 * **이 함수가 익명 컨텍스트에서 `getProfileByHandle`(service-role, RLS 완전 우회)을 부르는
 * 유일한 진입점이어야 한다(20일차 I-065 major① 규약)** — `getProfileByHandle`의 docstring
 * (`src/lib/data/supabase/profile.ts`) 참고. `signup.ts`가 한때 이 함수를 거치지 않고
 * `getProfileByHandle`을 직접 호출해 D-047 리밋을 완전히 우회하는 두 번째 진입문이 됐던
 * 사고가 있었다(BOARD 교차검증 발견, I-058 major①과 같은 구조) — 지금은 `signup.ts`도 이
 * 함수를 재사용한다(§ 아래 "제출 시점 재사용" 참고).
 *
 * **제출 시점 재사용(20일차) — 리밋에 걸려도 가입 제출은 막지 않는다.** `signupAction`은
 * blur 미리보기가 아니라 실제 제출 직전에도 이 함수를 한 번 더 호출해 형식·중복을 최종
 * 확인한다. `rateLimited: true`(따라서 `available: null`)이면 `signupAction`은 사전 중복
 * 확인을 그냥 건너뛴다 — `SignupForm`의 `rate_limited` 상태가 제출을 막지 않는 것과 같은
 * 원칙이다. 실제 중복이면 이후 `createProfile`의 `profiles_handle_key` UNIQUE 제약이 최종
 * 판정하므로 안전하다(동시 가입 경쟁 대비로 이미 있던 방어선을 그대로 재사용). 리밋 초과
 * 시에도 `signUpWithPassword`(Supabase Auth 내장 회원가입 리밋)까지는 항상 도달하므로 하부
 * 안전망이 살아 있다.
 *
 * 형식이 틀리면 서버 조회 자체를 하지 않는다 — `available: null`로 "판단 보류"를 표현한다
 * (`false`를 쓰면 "중복"과 "형식 오류"가 같은 신호가 되어 `SignupForm`이 둘을 구분해
 * 다른 문구를 보여줄 수 없다). **리밋 초과도 `available: null`(판단 보류)이지만
 * `rateLimited: true`로 구분한다** — 호출부가 이를 "이미 사용 중"(`available: false`)과
 * 혼동해 잘못된 안내를 보여주지 않게 하기 위해서다.
 *
 * **알려진 한계(BOARD 20일차 참고 의견, 새 이슈로 등재하지 않음)**: `x-forwarded-for`가 없는
 * 환경(로컬 `next dev` 등)은 전체 요청이 `"unknown"` 버킷 하나를 공유한다(`resolveClientIp`
 * 참고) — 실 배포에서 이 헤더가 어떤 이유로든 비게 되면 모든 익명 방문자가 같은 리밋 버킷을
 * 나눠 쓰게 돼 **가용성 리스크**(한 명이 리밋을 소진하면 다른 사용자도 막힘)가 된다. 정보
 * 노출·우회 방어 약화 같은 보안 리스크는 아니다(오히려 더 보수적으로 막히는 방향). Vercel
 * 배포에서는 엣지가 이 헤더를 항상 설정하므로(D-047 신뢰 경계) 정상 운영 중에는 발생하지
 * 않는 시나리오로 본다.
 */
export interface HandleAvailability {
  format: HandleFormatCheckResult;
  available: boolean | null;
  /** D-047 — IP당 분당 10회 초과 시 true. 이때 `available`은 항상 null이다. */
  rateLimited: boolean;
}

/** `x-forwarded-for`는 `클라이언트, 프록시1, 프록시2 ...` 순서의 콤마 구분 목록이다 — 첫
 *  값이 실제 클라이언트다(D-047 신뢰 경계: Vercel 배포 전제). 헤더가 없으면(로컬 `next dev`
 *  등 프록시가 붙지 않는 환경) 모든 호출이 `"unknown"` 버킷 하나를 공유한다. */
function resolveClientIp(forwardedFor: string | null): string {
  if (!forwardedFor) return "unknown";
  const [first] = forwardedFor.split(",");
  const trimmed = first?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "unknown";
}

export async function checkHandleAvailabilityAction(
  handle: string,
  excludeProfileId?: string,
): Promise<HandleAvailability> {
  const format = validateHandleFormat(handle);
  if (!format.valid) {
    return { format, available: null, rateLimited: false };
  }

  const requestHeaders = await headers();
  const ip = resolveClientIp(requestHeaders.get("x-forwarded-for"));

  const attempts = await getRecentHandleAvailabilityCheckAttempts(ip);
  const decision = evaluateFixedWindowRateLimit(
    attempts,
    new Date().toISOString(),
    ANONYMOUS_HANDLE_AVAILABILITY_RATE_LIMIT,
  );
  if (!decision.allowed) {
    return { format, available: null, rateLimited: true };
  }
  await recordHandleAvailabilityCheckAttempt(ip);

  const existing = await getProfileByHandle(handle);
  const available = existing === null || existing.id === excludeProfileId;
  return { format, available, rateLimited: false };
}
