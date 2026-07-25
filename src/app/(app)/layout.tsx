import { redirect } from "next/navigation";
import { Suspense } from "react";

import { RedirectToLogin } from "@/components/auth/RedirectToLogin";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";

import type { ReactNode } from "react";

/**
 * 인증된 앱 라우트 하위 트리의 인증 경계(D-030 ④) — 6일차, I-025 해소.
 *
 * **왜 이제야 생겼는가**: Task 011은 인증 경계를 게스트 전용 진입 페이지 4개(랜딩·로그인·
 * 회원가입·온보딩)에만 개별적으로 걸었고, 그 시점엔 "로그인이 필요한 실제 화면"이 하나도
 * 없어(전부 placeholder) 반복 가드가 문제 되지 않았다(I-025). 5~6일차에 `/calendar`(DESIGN)·
 * `/settings`(CREW)가 실제로 채워지면서, 각 `page.tsx`가 같은 3줄 가드를 개별적으로 복사하는
 * 패턴이 실제로 반복되기 시작했다 — `/calendar`는 그 복사조차 빠뜨려 가드가 **없는 채로**
 * 배포됐었다(6일차 교차검증에서 발견). 이 레이아웃이 그 반복·누락 위험 자체를 없앤다.
 *
 * **라우트 그룹 `(app)`은 URL에 영향이 없다** — `(app)/calendar/page.tsx`는 여전히
 * `/calendar`로 보인다(Next.js route-groups 컨벤션). 이 그룹 아래로 옮긴 라우트: `/home`·
 * `/crews`(하위 전부)·`/calendar`·`/notifications`·`/invitations`·`/meetups/[meetupId]`·
 * `/settings` — 전부 로그인이 필요한 실제 앱 콘텐츠다.
 *
 * **게스트 전용 진입 페이지(랜딩 `/`·`/login`·`/signup`·`/onboarding`)는 이 그룹 밖에 남는다.**
 * 그 넷은 "미로그인/미완료 상태일 때 보여주는" **반대 방향** 가드(이미 로그인했으면 다른 곳으로
 * 돌려보낸다)라 이 레이아웃과 성격이 다르고, 각자 하위 세그먼트가 없는 단일 페이지라 페이지당
 * 한 번만 쓰이고 더 늘어나지 않는다 — 이 그룹처럼 "다음 보호 페이지가 계속 추가되는" 쪽이
 * 아니라서 레이아웃으로 모을 이유가 없다(15A 교차검증에서 이미 정리한 구분, 여기서도 유지).
 *
 * **이 레이아웃이 하지 않는 것**: 온보딩 완료 여부(`hasCompletedOnboarding`) 판정은 여기 없다
 * — `/onboarding` 자신의 "이미 완료했으면 `/home`으로" 가드와 대칭되는 "완료 전이면
 * `/onboarding`으로" 가드는 이 변경의 범위 밖이다(팀장 지시 범위: `isAuthenticated`만). 필요하면
 * 별도 결정으로 추가한다.
 *
 * **FR-002 AC3("로그인 성공 후 원래 요청 경로로 복귀") — 17일차, BOARD 교차검증에서 발견한
 * 배선 누락 수정.** 비인증 요청은 더 이상 서버 `redirect("/login")`(경로 정보를 버리는
 * 하드 리다이렉트)을 타지 않는다 — `RedirectToLogin`(클라이언트 컴포넌트)을 대신 렌더한다.
 * 이 레이아웃(Server Component)은 자신이 감싸는 하위 경로를 알 방법이 공식적으로 없어서다
 * (`RedirectToLogin.tsx` 모듈 docstring에 근거를 남겼다 — Next.js 공식 문서 확인,
 * `proxy.ts`가 유일한 서버 측 대안이나 D-011로 범위 밖). `useSearchParams()`를 쓰는 클라이언트
 * 컴포넌트라 `<Suspense>`로 감싼다(Next.js 프로덕션 빌드 요구사항).
 *
 * **18일차(Task 039, FR-005) 추가 — `reason: "deactivated"`는 `/login`이 아니라
 * `/account/restore`로 보낸다.** 그 계정은 Supabase Auth 세션 자체는 유효하다(30일 유예
 * 중이라 로그인 자체는 통과한다, `docs/decisions/account-lifecycle-039.md` 참고) — 그래서
 * `RedirectToLogin`처럼 "원래 요청 경로로 복귀"할 필요가 없어(로그인 다이얼로그를 다시 거치지
 * 않는다) 클라이언트 컴포넌트 우회 없이 서버 `redirect()`를 바로 쓴다. 이 분기는 세션이
 * 완전히 없는 경우(`isAuthenticated`가 이미 false)보다 먼저 검사해야 한다 — `deactivated`도
 * `isAuthenticated(session)`은 false이므로, 먼저 걸러내지 않으면 `RedirectToLogin`으로
 * 떨어져 복구 진입점을 잃는다.
 */
export default async function AuthenticatedAppLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();
  if (session.status === "error" && session.reason === "deactivated") {
    redirect("/account/restore");
  }
  if (!isAuthenticated(session)) {
    return (
      <Suspense fallback={null}>
        <RedirectToLogin />
      </Suspense>
    );
  }

  return <>{children}</>;
}
