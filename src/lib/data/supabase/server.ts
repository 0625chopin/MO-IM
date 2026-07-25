import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "./env";

import type { Database } from "./database.types";

/**
 * **`import "server-only"`(17일차, 팀장 판정)** — 이 모듈이 클라이언트 번들 그래프에 잘못
 * 딸려 들어가면(직접이든 몇 단계 전이든) 빌드 시점에 명시적 오류로 잡는다. Next.js 16이
 * 기본 제공하는 지시어라 새 의존성이 필요 없다(`node_modules/next/dist/docs/01-app/
 * 01-getting-started/05-server-and-client-components.md:577` — "installing `server-only`…
 * is optional", `node_modules/server-only` 패키지 없이도 Next가 자체 처리함을 확인). CORE의
 * `resolve-post-link-card.ts` 핫픽스가 드러낸 "`no-restricted-imports`는 전이 경로를 못 본다"
 * 는 구멍을 이 지시어가 번들러 그래프 단위 판정으로 메운다.
 *
 * 서버 컴포넌트·Server Action·Route Handler에서 쓰는 Supabase 클라이언트 팩터리.
 * Next.js 16의 `cookies()`는 비동기라 이 함수도 비동기다.
 *
 * Server Component에서 `setAll`이 실패하는 것은 정상이다 — Server Component는 쿠키를
 * 쓸 수 없고, 세션 갱신은 인증 경계(레이아웃, D-030 ④)가 맡는다.
 *
 * `Database` 제네릭은 Task 028(스키마 마이그레이션) 산출물인 `database.types.ts`에서 온다 —
 * `.from("...")` 호출의 테이블명·컬럼이 실제 스키마와 어긋나면 타입 오류로 잡힌다.
 *
 * **`cookieOptions: { httpOnly: true }` — Task 030(17일차) NFR-010 실측 수정.** `@supabase/ssr`의
 * `DEFAULT_COOKIE_OPTIONS`는 `httpOnly: false`다(패키지 소스 `utils/constants.js` 실측 —
 * 브라우저 클라이언트가 같은 쿠키를 읽어야 하는 경우를 기본으로 가정한 설정이다). 이 앱은
 * 세션을 서버 전용으로만 쓰므로(CON-06, `createSupabaseBrowserClient`는 아직 어디서도 세션을
 * 직접 읽지 않는다) 기본값을 그대로 두면 NFR-010("세션 토큰을 JS로 읽을 수 없는 저장소에")을
 * 위반한다 — 실제로 `document.cookie`에 `sb-<project-ref>-auth-token`이 노출되는 것을 17일차에
 * Playwright로 확인했다(`docs/decisions/auth-integration-030.md` §4). **`secure: true`와 로컬
 * `http://localhost`(정정, 17일차)**: "secure context(`window.isSecureContext`)"와 "쿠키
 * `Secure` 속성"은 별개 메커니즘이다(MDN이 명시 — 둘 사이에 직접적 연관이 없다). 근거는 쿠키
 * 표준 쪽의 독립된 예외 조항이다 — MDN `Set-Cookie` 문서: "The `https:` requirements are
 * ignored when the `Secure` attribute is set by localhost." 즉 `Secure` 쿠키는 원래 HTTPS
 * 요청에만 전송되지만, `localhost`에 한해 이 요구조건 자체가 면제된다(Firefox는 이 예외의
 * 근거를 W3C Secure Contexts 명세의 "potentially trustworthy origin" 판정과 통일했고, Chrome도
 * 대체로 동등하게 동작하되 `__Host-`/`__Secure-` 접두 쿠키 지원은 아직 부분적이다 — 이 프로젝트는
 * 접두 쿠키를 쓰지 않아 해당 없음). 배포 대상(Vercel)은 HTTPS 전용이라 `secure: true`가 항상
 * 안전하고, 로컬 개발은 위 localhost 예외로 커버된다 — `npm run dev` 로그인 왕복을 Playwright로
 * 실측해 확인했다.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookieOptions: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component에서 호출된 경우 — 세션 갱신은 인증 경계가 담당한다.
        }
      },
    },
  });
}
