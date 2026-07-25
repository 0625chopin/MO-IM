import { cookies } from "next/headers";

/**
 * 온보딩 완료 보조 쿠키 (Task 030, 17일차) — `set-mock-session-cookie.ts`(Mock 세션 발급)를
 * 대체한다. 세션 자체는 이제 `@supabase/ssr`가 `Set-Cookie`로 직접 관리하므로(NFR-010,
 * `get-auth-session.ts` docstring 참고) 이 파일은 세션을 다루지 않는다.
 *
 * **왜 필요한가**: `public.profiles`(Task 028 스키마)에는 "온보딩을 마쳤는가" 컬럼이 없다 —
 * FR-004 온보딩은 `display_name`·`search_opt_out`만 갱신하고 별도 완료 플래그를 두지 않는다.
 * 스키마에 컬럼을 추가하는 것은 `src/lib/data/**`(도메인 데이터, 이번 회차 DESIGN 소유) 쪽
 * 마이그레이션이라 이 회차 범위 밖이다(`docs/decisions/auth-integration-030.md` §5). 그 전까지
 * **세션 인증 쿠키와는 별개인** 이 보조 쿠키로 근사한다.
 *
 * **알려진 한계**(`docs/ISSUES.md` I-046): 브라우저를 바꾸거나 쿠키를 지우면 이미 온보딩을
 * 마친 사용자도 온보딩 화면을 다시 보게 된다 — 인증 실패가 아니라 UX 힌트만 잃는 것이라
 * 안전한 열화지만, 정식 수정은 `profiles`에 `onboarding_completed_at`류 컬럼을 추가하는
 * 후속 마이그레이션이다.
 *
 * `profileId`를 값에 함께 저장해 대조한다 — 같은 브라우저에서 계정을 바꿔 로그인해도 이전
 * 계정의 완료 표시를 새 계정에 잘못 적용하지 않기 위해서다.
 */
const ONBOARDING_FLAG_COOKIE = "mo_im_onboarding_complete";

export async function setOnboardingCompleteCookie(profileId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ONBOARDING_FLAG_COOKIE, profileId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
    httpOnly: true,
  });
}

export async function readOnboardingCompleteCookie(profileId: string): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(ONBOARDING_FLAG_COOKIE)?.value === profileId;
}
