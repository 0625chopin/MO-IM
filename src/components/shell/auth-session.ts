import type { Id, ISODateTimeString } from "@/lib/types";

/**
 * 인증 경계(D-030 ④)가 소비하는 세션 타입 + 순수 판정 함수. `next/headers`(서버 전용 API)를
 * import하지 않는다 — `HeaderNav`·`MobileTabBar`·`nav-items.ts`가 전부 `'use client'`라
 * 이 모듈을 값(함수) 단위로 import하며, 서버 전용 API가 섞이면 클라이언트 번들이 깨진다
 * (실제로 처음에는 `getAuthSession()`을 이 파일에 뒀다가 `next build`에서 "next/headers를
 * Pages Router에서 쓴다"는 오류로 드러났다 — 원인은 App Router의 클라이언트 번들링 경계였다).
 * 실제 쿠키 조회 함수는 `get-auth-session.ts`(서버 컴포넌트 전용)로 분리했다.
 *
 * - `loading`: 서버 컴포넌트 렌더 시점에는 실제로 발생하지 않는다(세션은 렌더 전에 이미
 *   동기적으로 확정된다). 다만 이후 클라이언트에서 Supabase Auth 상태 변화를 구독하는 훅이
 *   이 타입을 재사용할 때를 대비해 미리 정의해 둔다. `/sample`에서 로딩 상태 토글로 쓴다.
 * - `error`: 네트워크 실패(`network`)뿐 아니라 RLS 403류의 **도메인 오류**(`forbidden`)를
 *   포함한다(D-030 ③). 셸은 오류 상태에서도 크래시하지 않고 게스트 안전값으로 내비게이션을
 *   내려야 한다 — `nav-items.ts`가 `error`를 `guest`와 동일하게 취급하는 이유다.
 * - `reason: "deactivated"`(Task 039, FR-005): Supabase Auth 세션 자체는 유효하지만
 *   `profiles.status === "deactivated"`(30일 유예 중)인 계정이다 — `forbidden`(게스트 취급,
 *   복구 불가)과 달리 이 상태는 **AC3(복구) 진입점**이 있어야 하므로 별도 판별지로 뺐다.
 *   `(app)/layout.tsx`가 이 reason만 `/account/restore`로 보내고, 그 밖의 `error`는 계속
 *   `/login`으로 보낸다(`nav-items.ts`의 "error=guest 취급" 원칙은 내비게이션 표시에 한정되고
 *   라우팅 목적지 분기와는 별개다).
 * - `profileId`(`authenticated`에만 존재): `lib/data`의 9개 도메인 함수가 전부 `profileId`를
 *   인자로 받는 계약(CON-06)이라, 다음 회차에 컨테이너를 만드는 사람이 세션에서 바로
 *   꺼내 `lib/data` 호출에 넘길 수 있어야 한다(3일차 교차검증에서 DESIGN이 자체 발견, 팀장
 *   지시로 이번 회차에 처리). **판별 유니온이라 `loading`/`guest`/`error`에는 이 필드 자체가
 *   없다** — 컴파일 타임에 "미인증 상태에서 profileId를 읽으려는" 실수를 막는다.
 *
 * **(app) 경계 안에서 세션을 좁히는 방법(24일차, I-095 해소)**: 예전에는 이 모듈이 내보내던
 * `assertAuthenticatedSession`(throw 기반 `asserts` 함수)을 썼다. Next 16이 레이아웃과 그
 * 아래 페이지를 병렬로 렌더하는 탓에(`node_modules/next/dist/docs/01-app/01-getting-started/
 * 06-fetching-data.md` "Parallel data fetching"), `(app)/layout.tsx`가 미인증 세션에서
 * `<RedirectToLogin/>`을 반환하기로 결정해도 그 아래 페이지 컨테이너는 이미 독립적으로 자기
 * 세션을 다시 조회해 이 함수를 호출하고 있었고, 그 병렬 브랜치가 매 게스트 요청마다 "레이아웃
 * 가드가 깨졌다"는 **틀린** 예외를 서버 콘솔에 남겼다(22일차 조사 완료, 실제로 이 함수가 진짜
 * 가드 붕괴를 잡아낸 사례는 0건이었다 — 상세: `docs/ISSUES.md` I-095). 그 브랜치의 반환값은
 * 레이아웃이 어차피 버리므로(항상 이 경계 안에서만 호출된다는 것이 이 함수의 원래 계약이다)
 * 무엇을 반환하든 화면·보안에는 영향이 없다 — 그래서 24일차에 9개 호출부 전부를
 * `if (!isAuthenticated(session)) return null;` 조기 반환으로 옮기고 `assertAuthenticatedSession`
 * 자체는 삭제했다(Next.js 공식 인증 가이드가 "Auth checks in leaf components"에서 정확히 이
 * `return null` 패턴을 권장한다). **트레이드오프**: 이 지점에서 불변식이 정말로 깨지는 회귀가
 * 생기면 이제 조용한 빈 화면으로 나타난다(예전엔 시끄러운 throw) — 실제 보안 경계는 애초에
 * 이 함수가 아니라 서버·RLS이므로(NFR-012, D-030 ③) 받아들였다.
 */
export type AuthSession =
  | { status: "loading" }
  | { status: "guest" }
  | {
      status: "authenticated";
      profileId: Id;
      displayName: string;
      /** 최초 1회 온보딩 재방문 리다이렉트(PRD §2.2 각주2)에 쓴다. */
      hasCompletedOnboarding: boolean;
      unreadNotificationCount: number;
      /** FR-082(Task 042B, D-049) — `/admin` 게이트 UI 판단용. 최종 강제는
       *  `admin_resolve_report`/`admin_list_reports` RPC 내부의 is_system_admin 재확인이다. */
      isSystemAdmin: boolean;
    }
  | { status: "error"; reason: "network" | "forbidden" }
  | { status: "error"; reason: "deactivated"; graceEndsAt: ISODateTimeString };

/** `session.status === "authenticated"`를 좁혀 준다. 로그인 필요 페이지 가드에서 쓴다. */
export function isAuthenticated(
  session: AuthSession,
): session is Extract<AuthSession, { status: "authenticated" }> {
  return session.status === "authenticated";
}

// `assertAuthenticatedSession`(throw 기반 `asserts` 함수)은 24일차(I-095)에 여기서
// 삭제했다 — 경위·대체 패턴은 위 `AuthSession` 모듈 docstring의 "(app) 경계 안에서 세션을
// 좁히는 방법" 절 참고.
