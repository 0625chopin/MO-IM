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
    }
  | { status: "error"; reason: "network" | "forbidden" }
  | { status: "error"; reason: "deactivated"; graceEndsAt: ISODateTimeString };

/** `session.status === "authenticated"`를 좁혀 준다. 로그인 필요 페이지 가드에서 쓴다. */
export function isAuthenticated(
  session: AuthSession,
): session is Extract<AuthSession, { status: "authenticated" }> {
  return session.status === "authenticated";
}

/**
 * `src/app/(app)/` 아래(D-030 ④, I-025) — 즉 `(app)/layout.tsx`가 이미 인증을 보장하는
 * 컨테이너·페이지에서만 쓴다. 그 경계 밖(예: 크루 게시판처럼 D-007에 따라 guest가 **실제로
 * 유효한 역할**인 라우트)에서는 이 함수를 쓰지 않는다 — 거기서는 `resolveBoardViewer`
 * (`src/components/board/resolve-board-viewer.ts`)처럼 guest를 오류가 아니라 정상 역할로
 * 받아 `checkPermission`의 매트릭스가 거부하게 한다. 두 패턴이 서로 다른 문제를 푸는 것이지
 * 경쟁하는 두 방식이 아니다 — `docs/CONVENTIONS.md` D-030 ④ 절 참고(6일차, CORE 재검증
 * E-1로 정리).
 *
 * **왜 `redirect` 대신 `throw`인가**: `(app)/layout.tsx`가 이미 리다이렉트를 끝냈으므로
 * 여기서 다시 리다이렉트하면 이중 가드다. 그런데도 이 함수가 필요한 이유는 순수히
 * **타입스크립트 내로잉**이다 — 레이아웃이 보장하는 불변식("이 지점에 도달했다면 인증된
 * 세션이다")을 컴파일러는 정적으로 모르므로, 실제 런타임 체크 하나가 있어야
 * `Extract<AuthSession, {status:"authenticated"}>`로 좁혀진다. 그 체크가 실패하는 경우
 * (정상 경로에서는 도달 불가)는 사용자 오류가 아니라 레이아웃 가드 자체가 깨졌다는 뜻이므로
 * `redirect`가 아니라 `throw`로 표현한다(D-030 ③ — 진짜 프로그래밍 오류는 예외로 던진다).
 * `as` 타입 단언을 쓰지 않는 이유도 같다 — 단언은 이 불변식이 실제로 깨져도 조용히 통과시켜
 * 버그를 숨기지만, `throw`는 런타임에 실제로 검사한다.
 */
export function assertAuthenticatedSession(
  session: AuthSession,
): asserts session is Extract<AuthSession, { status: "authenticated" }> {
  if (!isAuthenticated(session)) {
    throw new Error(
      "assertAuthenticatedSession: (app) 레이아웃의 인증 가드를 통과했는데 세션이 미인증 상태다 — 레이아웃 가드가 깨졌다는 뜻이다.",
    );
  }
}
