"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { strings } from "@/lib/strings";

/**
 * FR-002 AC3("보호 라우트 직접 접근 → 로그인 화면 → 로그인 성공 후 원래 요청 경로로 복귀")의
 * 송신측. `(app)/layout.tsx`(Server Component, D-030 ④ 인증 경계)가 비인증 요청일 때
 * `children`(보호된 콘텐츠) 대신 이걸 렌더한다 — 보호된 콘텐츠는 이 컴포넌트가 그려지는 동안
 * 한 번도 렌더되지 않으므로 정보 노출은 없다.
 *
 * **왜 `redirect("/login")`(서버, 즉시 307) 대신 클라이언트 리다이렉트인가 — 17일차, I-046 후속
 * (BOARD 교차검증에서 발견)**: `(app)/layout.tsx`는 `(app)/**` 전체가 공유하는 최상위
 * 레이아웃이라 자신이 지금 어떤 하위 경로를 감싸는 중인지 알 방법이 **공식적으로 없다** —
 * Next.js는 Server Component(레이아웃 포함)에서 현재 요청 경로를 읽는 API를 제공하지 않는다
 * ("Reading the current URL from a Server Component is not supported. This design is
 * intentional to support layout state being preserved across page navigations" —
 * `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md` 확인).
 * 공유 레이아웃은 `searchParams` prop도 받지 않는다(같은 문서 계열,
 * `use-search-params.md` "Layouts" 절 — "a shared layout is not re-rendered during
 * navigation"). 이 경로 정보를 서버 쪽에서 얻는 유일한 공식 수단은 Proxy(`proxy.ts`,
 * `request.nextUrl.pathname`)뿐인데(`node_modules/next/dist/docs/01-app/02-guides/
 * redirecting.md` "NextResponse.redirect in Proxy" 절이 정확히 이 "비인증 시 /login으로"
 * 패턴을 예시로 든다), `proxy.ts`는 D-011로 v0.1 범위 밖이라 이 레이아웃이 인증 게이트를
 * 대신 맡고 있다(D-030 ④·D-039). 그 결과 "지금 원래 어디로 가려던 것인가"를 알 수 있는
 * 유일한 자리는 **브라우저가 이미 알고 있는 값**뿐이다 — `usePathname()`/`useSearchParams()`
 * (클라이언트 훅)로 마운트 직후 읽어 `/login?redirect=...`로 클라이언트 내비게이션한다.
 *
 * **트레이드오프 1 — HTTP 응답이 바뀐다(17일차, 팀장 재검토에서 지적).** 비인증 요청에 대한
 * 보호 라우트의 응답이 **307(Location: /login) → 200(빈 본문에 가까운 HTML)**으로 바뀌었다.
 * 관측 가능한 계약 변경이라 여기 명시한다. 보안 문제는 없다 — `children`(보호된 콘텐츠)은
 * 이 컴포넌트가 대신 렌더되므로 애초에 서버에서 내려가지 않는다. 실제 이동은 마운트 후 JS가
 * `router.replace`로 수행한다("빈 화면이 아주 잠깐 렌더 → 클라이언트 내비게이션").
 *
 * **트레이드오프 2 — JS 비활성 환경에서는 자동 이동이 아예 안 일어난다(17일차, 팀장 재검토에서
 * 지적, 실질적 회귀로 분류됨).** 이전 서버 `redirect()`는 JS 없이도 307로 도달했지만, 이
 * 컴포넌트의 리다이렉트는 `useEffect`(클라이언트 JS)에서만 실행된다 — **"UX 지연"이 아니라
 * "영구적 막힘"** 이다. 그래서 아래 `<noscript>`에 `/login`으로 가는 수동 링크를 둔다 — JS가
 * 없거나 로드에 실패해도 최소한 수동으로는 로그인 화면에 갈 수 있다.
 *
 * **오픈 리다이렉트 방지는 여기서 하지 않는다** — 클라이언트가 만든 값은 어차피 신뢰할 수 없고,
 * `loginAction`이 호출하는 `sanitizeRedirectTarget`(`src/lib/rules/auth-credentials.ts`, CREW
 * 소유 — 최초 위치는 `lib/actions/login.ts`였으나 17일차에 이 파일로 이동했다)이 서버에서
 * 다시 검증한다. **17일차에 검증 강도가 바뀌었다**: 최초 버전은 `candidate.startsWith("//")`
 * 만 봐서 `/\evil.com`(백슬래시)이 통과하는 결함이 있었다(WHATWG URL 표준이 특수 스킴에서
 * 백슬래시를 슬래시와 동등하게 취급해 브라우저가 `//evil.com`으로 정규화) — 팀장이 발견해
 * CREW에게 배정했고, 지금은 `new URL(candidate, TRUSTED_BASE)`로 실제 파싱해 origin이
 * 그대로인지(=상대 경로인지) 확인하는 방식으로 재작성됐다(14케이스 검증). 이 컴포넌트는
 * "무엇을 보내는지"만 담당하고, "보낸 값을 믿어도 되는지"는 받는 쪽(서버)의 책임이다 —
 * 클라이언트 입력은 항상 서버에서 재검증한다는 원칙 그대로다.
 *
 * `useSearchParams()`를 쓰므로 `<Suspense>`로 감싸야 프로덕션 빌드에서 안전하다(Next.js 공식
 * 권고, `use-search-params.md` "Prerendering" 절) — 호출부(`(app)/layout.tsx`)가 감싼다.
 */
export function RedirectToLogin() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const query = searchParams.toString();
  const target = query ? `${pathname}?${query}` : pathname;
  const loginHref = `/login?redirect=${encodeURIComponent(target)}`;

  useEffect(() => {
    router.replace(loginHref);
  }, [loginHref, router]);

  return (
    <noscript>
      <p>
        {strings.auth.redirectingToLogin.message}{" "}
        <a href={loginHref}>{strings.auth.redirectingToLogin.linkLabel}</a>
      </p>
    </noscript>
  );
}
