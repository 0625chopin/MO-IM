import { getSupabaseAuthUser } from "@/lib/auth";
import { countUnreadNotifications, getProfileById } from "@/lib/data";
import { evaluateDeactivationGracePeriod } from "@/lib/rules/auth-credentials";

import type { AuthSession } from "./auth-session";

/**
 * 실 세션 조회 (Task 030, 17일차) — `next/headers`를 쓰므로 **서버 컴포넌트에서만** import한다
 * (`src/app/layout.tsx`와 로그인 상태 가드가 필요한 4개 페이지: 랜딩·온보딩·로그인·회원가입).
 * 표현 컴포넌트(`HeaderNav` 등)는 이 함수가 아니라 `AuthSession` 타입만 props로 받는다
 * (D-030 ①) — 타입·판정 함수는 `auth-session.ts`에 따로 있다.
 *
 * **본문만 교체됐다** — Mock 단계 docstring이 예고한 그대로 `supabase.auth.getUser()` 결과를
 * 같은 `AuthSession` 유니온으로 매핑한다(CLAUDE.md Mock First "조회부만 교체" 원칙). 호출부
 * (레이아웃·페이지)와 반환 타입은 그대로다.
 *
 * ## 세 단계 조회
 * 1. `getSupabaseAuthUser()`(`@/lib/auth` — 세션 전용 계층, `src/lib/data/` 밖에 있다. 이유는
 *    CON-05·CON-06("데이터 레이어는 쿠키·세션을 직접 읽지 않는다") — `docs/decisions/
 *    auth-integration-030.md` §1) — Supabase Auth 세션의 httpOnly 쿠키를 서버에서 재검증한다.
 *    없으면 `guest`.
 * 2. `getProfileById(authUser.id)`(`@/lib/data`, 아직 mock 구현) — **알려진 전환기 한계**:
 *    `src/lib/data`의 도메인 모듈은 이번 회차 DESIGN(Task 031)이 mock→supabase로 바꾸는
 *    중이라, 지금은 실 `auth.users` 행이 있어도 mock 저장소에 같은 id의 프로필이 없으면
 *    찾지 못한다. 이 경우 `authenticated`로 섣불리 단정하지 않고 `error(forbidden)`으로
 *    표현한다(D-030 ③ "도메인 오류도 화면 상태로") — 셸은 이 상태를 `guest`와 동일하게
 *    안전 처리한다(`nav-items.ts`). Task 031이 이 배럴을 실 Supabase로 옮기면 이 분기는
 *    정상 경로에서 도달하지 않게 된다. 상세: `docs/decisions/auth-integration-030.md` §5.
 * 3. `hasCompletedOnboarding`은 `profile.onboardingCompletedAt !== null`로 판정한다(I-046
 *    해소, Task 032) — `profiles.onboarding_completed_at` 컬럼(마이그레이션
 *    `profiles_add_onboarding_completed_at`)이 이제 이 사실을 직접 담는다. 이전에는 이 컬럼이
 *    없어 보조 httpOnly 쿠키(`onboarding-flag-cookie.ts`, 삭제됨)로 근사했다 — 브라우저를
 *    바꾸면 완료 표시를 잃는 한계가 있었는데, 실 컬럼으로 옮기며 함께 해소됐다.
 *
 * **18일차(Task 039, FR-005) 추가** — `profile.status === "deactivated"`(30일 유예 중)를
 * `forbidden`과 분리해 `reason: "deactivated"`로 반환한다. `(app)/layout.tsx`가 이 reason만
 * `/account/restore`로 보내 AC3(복구) 진입점을 제공한다 — 상세는 `docs/decisions/
 * account-lifecycle-039.md` 참고.
 */
export async function getAuthSession(): Promise<AuthSession> {
  const authUser = await getSupabaseAuthUser();
  if (!authUser) {
    return { status: "guest" };
  }

  const profile = await getProfileById(authUser.id);
  if (!profile) {
    return { status: "error", reason: "forbidden" };
  }
  // Task 039(FR-005) — deactivated(30일 유예 중)는 forbidden과 달리 복구 진입점(AC3)이
  // 있어야 하므로 별도 reason으로 분리한다. deactivatedAt이 이론상 null일 수는 없지만(RPC가
  // 항상 함께 채운다), 방어적으로 null이면 유예가 이미 끝난 것과 동일하게 취급해 forbidden으로
  // 안전 낙하한다(fail-open 금지 원칙, `docs/CONVENTIONS.md` D-030 ④).
  if (profile.status === "deactivated") {
    if (profile.deactivatedAt) {
      const { graceEndsAt } = evaluateDeactivationGracePeriod(
        profile.deactivatedAt,
        new Date().toISOString(),
      );
      return { status: "error", reason: "deactivated", graceEndsAt };
    }
    return { status: "error", reason: "forbidden" };
  }
  if (profile.status !== "active") {
    return { status: "error", reason: "forbidden" };
  }

  const unreadNotificationCount = await countUnreadNotifications(profile.id);

  return {
    status: "authenticated",
    profileId: profile.id,
    displayName: profile.displayName,
    hasCompletedOnboarding: profile.onboardingCompletedAt !== null,
    unreadNotificationCount,
  };
}
