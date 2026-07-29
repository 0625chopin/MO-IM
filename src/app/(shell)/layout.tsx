import { Geist_Mono, Noto_Sans_KR } from "next/font/google";

import { ToastHostContainer } from "@/components/notifications/ToastHostContainer";
import { AppShell } from "@/components/shell/AppShell";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { THEME_INIT_SCRIPT } from "@/components/theme/theme-config";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "@/components/ui/toast";
import { strings } from "@/lib/strings";

import type { Metadata } from "next";
import "../globals.css";

/**
 * 본문·제목 서체. **개편 전까지 이 앱에는 한글 서체가 지정돼 있지 않았다** —
 * Geist에는 한글 글리프가 없어서 화면의 거의 모든 문자(제품 언어가 한국어다,
 * D-011)가 OS 폴백(Windows 맑은 고딕 / macOS Apple SD Gothic Neo)으로 렌더됐고,
 * 자간·굵기·행간이 기기마다 달라 조판을 통제할 수 없었다.
 *
 * **굵기를 지정하지 않는 것은 의도적이다** — 생략하면 next/font가 **가변 폰트**를 쓴다.
 * 한글 웹폰트에서 이건 단순한 취향이 아니라 용량 문제다. 구글 CSS API 실측:
 *
 *   고정 400 + 600 → 조각 248개 · 6,874KB
 *   가변 100~900   → 조각 124개 · 3,437KB
 *
 * 가변 쪽이 **조각 수도 용량도 절반**이면서 굵기 전 범위를 준다. 고정 굵기를 하나만
 * 써도 124조각·3.4MB로 가변과 같으므로, 이 폰트에서는 가변이 언제나 이득이다.
 * (직전까지 쓰던 IBM Plex Sans KR은 가변 판이 없어 굵기마다 별도 파일이었고, 그래서
 * 거기서는 굵기를 400·600 두 종으로 묶어야 했다.)
 *
 * `preload: false`도 **의도적이며 실측에 근거한다.** 구글은 한글 폰트를 유니코드 범위별로
 * 잘게 쪼개 배포하고 next/font는 그 조각을 전부 셀프 호스팅한다. preload를 켜 두면 그중
 * 수십 개가 `<link rel="preload">`로 초기 문서에 박혀 첫 화면에서 폰트 요청이 한꺼번에
 * 나간다 — 실제로 그 페이지에 쓰인 글자가 속한 조각은 몇 개뿐인데도 그렇다.
 *
 * 끄면 브라우저가 `unicode-range`를 보고 **화면에 실제로 나온 글자가 속한 조각만** 내려받는다.
 * 대가는 첫 페인트에서 폴백 서체가 잠깐 보이는 것(`display: "swap"`)인데, next/font가 폴백
 * 메트릭을 자동으로 맞춰 주므로 레이아웃 이동(CLS)은 생기지 않는다.
 */
const sansKr = Noto_Sans_KR({
  variable: "--font-sans-kr",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

/**
 * 수·시각 전용 서체. 코드 블록용이 아니라 **득표수·정족수·시각·날짜의 서체**로
 * 쓴다(`globals.css`의 `--font-mono` 주석, `.tnum` 유틸리티 참고). 투표 집계와
 * 캘린더가 이 제품의 뼈대라 숫자에 고유한 얼굴을 준 것이 위계 장치다.
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: strings.common.appName,
  description: strings.landing.hero.title,
};

/**
 * `(shell)` 그룹의 루트 레이아웃 — Task 011의 구성 루트(D-030 ④). `getAuthSession()`으로
 * 세션을 조회해 `AppShell`(표현 컴포넌트)에 props로 내려준다(D-030 ①). 실제 인증 스택이
 * 들어와도 `getAuthSession()` 내부만 바뀌고 이 조립 방식은 그대로다.
 *
 * **I-098(23일차)로 `src/app/layout.tsx`에서 이 자리(`src/app/(shell)/layout.tsx`)로
 * 옮겨졌다.** 원래 이 파일 하나가 `/sample`을 포함한 앱의 모든 라우트를 감쌌는데, 그 결과
 * `/sample`의 `PreviewFrame` 폭 토글이 이 파일이 만드는 `AppShell`의 430px 프레임 제약에
 * 항상 갇혀 무력화됐다(`docs/ISSUES.md` I-098). Next.js 16의 "복수 루트 레이아웃"(route
 * groups)만이 규약을 지키며 이 제약을 걷어내는 방법이라(중첩 `layout.tsx`는 조상이 이미
 * 그린 JSX를 제거할 수 없다 — `node_modules/next/dist/docs/.../route-groups.md`), `AppShell`이
 * 필요한 라우트 전부를 `(shell)/` 그룹으로 옮기고 `/sample`은 자신만의 루트 레이아웃
 * (`sample/layout.tsx`, `AppShell` 없음)을 갖는 형제 트리로 분리했다. 조사·근거·전수 확인은
 * `docs/decisions/appframe-responsive-audit-099.md` §4, 해소 실측은
 * `docs/decisions/sample-frame-escape-098.md`.
 *
 * **다른 루트 레이아웃(`sample/layout.tsx`)과의 사이를 이동하면 풀 페이지 리로드가
 * 강제된다**(Next.js 공식 caveat) — `/sample`은 내부 개발 도구 페이지라 제품 화면에서
 * 여기로 가는 링크가 없으므로 낮은 비용으로 판단했다.
 *
 * `lang="ko"` — v0.1은 한국어 단독이고 로케일 경로 세그먼트를 두지 않는다(D-011). 이전 값
 * `lang="en"`은 `create-next-app` 스캐폴드 기본값이 그대로 남아 있던 것으로, 실제 콘텐츠
 * 언어와 불일치해 접근성 문제(스크린 리더 발음)였다 — 이번에 함께 고쳤다.
 */
export default async function ShellRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getAuthSession();

  return (
    <html
      lang="ko"
      // FOUC 방지 스크립트가 하이드레이션 이전에 `<html>`에 `.light`/`.dark`를 붙이므로 서버가
      // 렌더한 className과 달라진다. 이 한 요소의 속성 불일치 경고만 억제한다(next-themes와 동일
      // 관례) — 자식 트리에는 전파되지 않는다.
      suppressHydrationWarning
      className={`${sansKr.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* FOUC 방지: 하이드레이션 이전에 동기 실행돼 저장된 테마(없으면 OS 설정)를 `<html>`
            클래스로 즉시 반영한다. `ThemeProvider`가 mount되기 전 첫 페인트가 반대 테마로
            번쩍이는 것을 막는다(근거·규칙은 `theme-config.ts`). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          <AppShell session={session}>{children}</AppShell>
          <Toaster />
          {/* ToastHost(Task 023, D-030 ④) — 인증·전역 경계는 레이아웃에서 처리한다. `session`을
              여기서 좁혀 넘기는 이유는 `getAuthSession()`을 이 파일이 이미 호출해 뒀기 때문이다
              (`ToastHostContainer` 자신이 다시 조회하게 하지 않는다 — 이 지점 하나뿐인 배치라
              반복 조회의 이점이 없다). */}
          {isAuthenticated(session) && <ToastHostContainer profileId={session.profileId} />}
        </ThemeProvider>
      </body>
    </html>
  );
}
