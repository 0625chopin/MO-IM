import { Geist_Mono, Noto_Sans_KR } from "next/font/google";

import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";

import type { Metadata } from "next";
import "./globals.css";

// `global-error.tsx`와 같은 이유·같은 방식으로 폰트를 재선언한다(그 파일 docstring 참고) —
// 이 파일도 자기 완결적인 <html>/<body>를 그려야 하는 특수 파일이라 공유 레이아웃을 거치지
// 않는다.
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

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없어요",
  description: "주소가 바뀌었거나 삭제된 페이지예요",
};

/**
 * 전역 404(experimental, I-098 후속·23일차) — `next.config.ts`의 `experimental.globalNotFound`가
 * 켜져 있어야 활성화된다. `(shell)`·`sample` 두 루트 레이아웃으로 갈라진 뒤(I-098, 복수 루트
 * 레이아웃), **어느 root layout에도 속하지 않는 진짜 매칭되지 않는 URL**(예: `/오타`)이
 * `(shell)/not-found.tsx`도 `sample/not-found.tsx`도 타지 않고 Next.js 내장 제네릭 404
 * ("404: This page could not be found.")로 떨어지는 것을 실측으로 확인했다 — 복수 루트
 * 레이아웃에서는 "하나의 layout으로 구성하는 전역 404"가 애초에 성립하지 않기 때문이다
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`가
 * 정확히 이 경우를 위해 이 파일을 제공한다). 이 파일은 그 대신 Next.js가 **라우팅 단계에서
 * 직접** 반환하는 완전히 독립된 문서다 — 어떤 레이아웃도 거치지 않으므로 `<html>`/`<body>`를
 * 직접 그린다(전역 스타일·폰트를 이 파일이 직접 다시 로드해야 하는 이유).
 *
 * **주의**: `notFound()`를 명시적으로 호출하는 기존 코드(`CrewHomeContainer` 등)는 이 파일이
 * 아니라 자신이 속한 세그먼트의 `not-found.tsx`(`(shell)/not-found.tsx`)를 그대로 탄다 — 이
 * 파일은 "그 어떤 라우트도 매칭되지 않았을 때"만 쓰인다(공식 문서 "Good to know" 참고).
 */
export default function GlobalNotFound() {
  return (
    <html lang="ko" className={`${sansKr.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full items-center justify-center bg-background px-4 py-12 text-foreground">
        <RouteErrorBoundary kind="not_found" />
      </body>
    </html>
  );
}
