import { getSupabaseAuthUser } from "@/lib/auth";
import { countUnreadNotifications, getProfileById } from "@/lib/data";

import { readOnboardingCompleteCookie } from "./onboarding-flag-cookie";

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
 * 3. `hasCompletedOnboarding`은 **DB 컬럼이 없다**(`profiles` 스키마 실측, Task 028) — 온보딩은
 *    표시 이름·검색 노출만 갱신하고 별도 완료 플래그를 두지 않는다. 이 회차 범위에서 스키마를
 *    바꾸는 대신(그 자체가 DESIGN 소관 마이그레이션) `onboarding-flag-cookie.ts`의 보조
 *    쿠키(세션 인증 쿠키와 별개, httpOnly)로 임시 근사한다 — 브라우저를 바꾸면 다시 온보딩
 *    화면을 보게 되는 알려진 한계다. 후속 과제로 `docs/ISSUES.md` I-046에 등재했다.
 */
export async function getAuthSession(): Promise<AuthSession> {
  const authUser = await getSupabaseAuthUser();
  if (!authUser) {
    return { status: "guest" };
  }

  const profile = await getProfileById(authUser.id);
  if (!profile || profile.status !== "active") {
    return { status: "error", reason: "forbidden" };
  }

  const [hasCompletedOnboarding, unreadNotificationCount] = await Promise.all([
    readOnboardingCompleteCookie(profile.id),
    countUnreadNotifications(profile.id),
  ]);

  return {
    status: "authenticated",
    profileId: profile.id,
    displayName: profile.displayName,
    hasCompletedOnboarding,
    unreadNotificationCount,
  };
}
