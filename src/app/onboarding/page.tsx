import { redirect } from "next/navigation";

import { OnboardingFormContainer } from "@/components/auth/OnboardingFormContainer";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";

/**
 * 온보딩 페이지 (SC-05, PRD §6 "온보딩 페이지", FR-004, Task 015A). 가입 직후 최초 1회만
 * 진입하며 재방문 시 홈으로 리다이렉트하는 규칙은 Task 011의 인증 경계 그대로다(D-030 ④).
 *
 * PRD §2.2: 비회원은 접근 불가(로그인 유도) · 회원은 최초 1회만 접근, 이후 재방문 시 홈으로
 * 리다이렉트. `hasCompletedOnboarding`은 `completeOnboardingAction`이 저장을 마치면 세션
 * 쿠키에 true로 갱신한다(`lib/actions/complete-onboarding.ts`).
 *
 * 이미 확인한 `session`을 그대로 `OnboardingFormContainer`에 넘긴다 — 컨테이너가 같은 쿠키를
 * 다시 조회할 필요가 없다(`isAuthenticated`로 타입이 이미 `authenticated`로 좁혀졌다).
 *
 * **FR-002 AC3 적용(17일차, 팀장 지시로 판단)**: 비인증 접근 시 `/login?redirect=/onboarding`
 * 으로 보낸다 — `(app)/layout.tsx`처럼 `RedirectToLogin`(클라이언트 컴포넌트) 없이 서버
 * `redirect()`에 경로를 바로 박아 넣는다. 이 페이지는 **동적 세그먼트가 없는 단일 고정
 * 경로**라(항상 `/onboarding`) `(app)/layout.tsx`가 겪는 "공유 레이아웃은 자기 하위 경로를
 * 모른다"는 제약이 애초에 없다 — 그래서 하드 307을 그대로 쓸 수 있다(클라이언트 리다이렉트로
 * 바꿀 이유가 없다).
 *
 * **적용 판단 근거**: 온보딩 미완료 사용자의 세션이 끊긴 뒤 재로그인하면 이 페이지로
 * 돌아와야 자연스럽다. 반대 판단("로그인은 항상 온보딩으로 유도되니 복귀 대상 불필요")은
 * 이 페이지가 강제 진입점이라는 전제가 있어야 하는데, `(app)/layout.tsx`는 `hasCompletedOnboarding`
 * 판정을 하지 않는다(그 레이아웃 docstring이 명시) — 즉 로그인 후 기본 목적지(`/home`)로
 * 가면 온보딩 미완료 상태가 **강제되지 않고 조용히 방치**된다. 복귀 경로를 명시하지 않으면
 * 이 방치가 실제로 발생하므로, AC3를 여기도 적용하는 쪽이 더 안전하다고 판단했다.
 */
export default async function OnboardingPage() {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    redirect("/login?redirect=/onboarding");
  }
  if (session.hasCompletedOnboarding) {
    redirect("/home");
  }

  return <OnboardingFormContainer session={session} />;
}
