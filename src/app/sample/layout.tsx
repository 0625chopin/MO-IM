import { Geist_Mono, Noto_Sans_KR } from "next/font/google";

import { THEME_INIT_SCRIPT } from "@/components/theme/theme-config";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "@/components/ui/toast";

import type { Metadata } from "next";
import "../globals.css";

// 폰트 선언 — `(shell)/layout.tsx`와 값은 같지만 이 파일 자신이 별도 루트 레이아웃(복수 루트
// 레이아웃 패턴, 아래 모듈 docstring)이라 재선언이 필요하다. `next/font`는 파일마다 호출해야
// 하는 로더라 공유 모듈로 뽑아도 중복 자체는 없앨 수 없다 — `global-error.tsx`가 이미 같은
// 이유로 같은 방식을 쓰고 있어(그 파일 docstring 참고) 그 선례를 따랐다.
const sansKr = Noto_Sans_KR({
  variable: "--font-sans-kr",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// `/sample`은 SC-01~22 제품 화면이 아니라 내부 개발 도구 페이지라 이 문구는 `strings` 모듈
// 경유 대상이 아니다(팀장 판정 완료, `sample/page.tsx` 상단 주석과 동일 근거).
export const metadata: Metadata = {
  title: "컴포넌트 쇼케이스 — mo_im 내부 도구",
  description: "/sample 컴포넌트 쇼케이스 (내부 개발 도구, 제품 화면 아님)",
};

/**
 * `/sample` 전용 루트 레이아웃 — I-098 해소(23일차, DESIGN). Next.js 16 "복수 루트
 * 레이아웃"(route groups) 패턴의 두 번째 갈래다(첫 갈래는 `(shell)/layout.tsx`) — 공식
 * 문서(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`
 * "Defining multiple root layouts")가 명시한 유일한 규약 준수 경로다. 중첩 `layout.tsx`는
 * 조상이 이미 그린 JSX를 제거할 수 없어(같은 문서), `/sample`이 `AppShell`(430px 모바일
 * 프레임, D-066)을 **아예 상속하지 않게** 하려면 형제 루트 트리로 분리하는 수밖에 없었다.
 *
 * **`AppShell`을 조립하지 않는다.** 그게 이 파일이 존재하는 유일한 이유다 — `/sample`의
 * `PreviewFrame` 폭 토글(360/768/1280/전체, Task 012)이 `AppShell`의 `max-w-app`(430px) 안에
 * 갇혀 있으면 768·1280·전체 중 무엇을 골라도 실제 렌더 폭이 ~430px를 넘지 못한다(`docs/ISSUES.md`
 * I-098, CORE의 `docs/decisions/appframe-responsive-audit-099.md` §4가 원인·해법을 조사해
 * 인계했다). 이 레이아웃 밖으로 나가야 그 제약이 사라진다.
 *
 * **`@container/appframe`을 `<body>`에 직접 준다.** `globals.css`의 `@custom-variant`가
 * `sm:`/`md:`/`lg:`/`xl:`/`2xl:`을 전역으로 "이름이 `appframe`인 조상 컨테이너" 기준으로
 * 재정의해 두었다(named container query는 **이름이 일치하는 조상만** 찾는다, `globals.css`
 * 머리 주석). `/sample`이 `AppShell` 밖으로 나가면 그 이름의 조상이 완전히 사라져, 이 variant를
 * 쓰는 코드는 폭과 무관하게 **영구적으로 죽는다** — CORE가 `appframe-responsive-audit-099.md`
 * §2.3에서 "c"(`/sample` 예외, DESIGN 인계)로 분류해 둔 5곳이 정확히 이 문제였다
 * (`sample/page.tsx`의 헤더·내비 패딩 `sm:px-6`/`sm:-mx-6`, `certainty.tsx`·`foundation.tsx`·
 * `primitives.tsx`의 `sm:grid-cols-*`/`lg:grid-cols-*`). 그래서 `AppShell`처럼 폭을 430px로
 * 가두는 대신 **실제 페이지 폭을 그대로 따라가는**(하드캡 없는) 이름 있는 컨테이너를 `<body>`에
 * 준다 — 그래야 저 5곳이 실제 브라우저 폭이 768px·1024px 이상일 때 정상적으로 재배치된다.
 *
 * **`PreviewFrame`도 자신을 `@container/appframe`으로 선언한다**(`PreviewFrame.tsx` 참고,
 * 기존에는 익명 `@container`뿐이었다). CSS 컨테이너 쿼리는 **이름이 일치하는 가장 가까운
 * 조상**을 찾으므로, `PreviewFrame`으로 감싼 데모는 이 `<body>` 대신 `PreviewFrame` 자신의
 * 토글된 폭을 기준면으로 삼는다 — 두 계층이 충돌하지 않고, 폭 토글이 "그 컴포넌트가 그 폭에서
 * 어떻게 보이는가"를 실제로 보여주게 된다. (`AppShell`을 통째로 데모하는 `shell.tsx`의
 * `PreviewFrame` 안에서는 `AppShell` 자신의 `@container/appframe`이 더 가까워 그쪽이
 * 이긴다 — D-066이 원하는 "항상 430px" 데모가 그대로 유지된다.)
 *
 * **폰트·FOUC 스크립트·`ThemeProvider`·`Toaster`를 `(shell)/layout.tsx`와 중복 정의한다** —
 * 서로 다른 루트 레이아웃은 각자 완전한 `<html>`/`<body>`를 가져야 하는 Next.js 16 규약이다.
 * `ThemeProvider`(테마 토글, `theme.tsx` 섹션)와 `Toaster`(토스트 트리거, `ToastTriggerPreview`)
 * 둘 다 `/sample`이 실제로 데모하므로 생략할 수 없다 — 인증 세션에 걸린 `ToastHostContainer`는
 * 필요 없다(그 데모들은 자기 안에서 직접 마운트한다, `NotificationSimulatorPreviewContainer`
 * 참고).
 *
 * **다른 루트 레이아웃(`(shell)/layout.tsx`) 사이를 이동하면 풀 페이지 리로드가 강제된다**
 * (Next.js 공식 caveat, "Full page load"). `/sample`은 내부 개발 도구 페이지라 제품 화면에서
 * 여기로 가는 링크가 없어 이 트레이드오프를 낮은 비용으로 판단했다.
 */
export default function SampleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${sansKr.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="@container/appframe flex min-h-full flex-col bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
