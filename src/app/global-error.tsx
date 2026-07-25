"use client"; // Error boundaries must be Client Components

import { Geist_Mono, Noto_Sans_KR } from "next/font/google";
import { useEffect } from "react";

import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";
import { reportClientErrorAction } from "@/lib/actions/report-client-error";

import "./globals.css";

// layout.tsx와 같은 폰트 설정(주석은 그쪽에 있다) — global-error는 루트 레이아웃을 완전히
// 대체하므로(Next.js 16 규약) 여기서 다시 로드해야 화면이 폰트 없이 깨지지 않는다.
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

/**
 * SC-E1 루트 레이아웃 오류 경계. 루트 `layout.tsx`(`AppShell`)까지 크래시했을 때만 활성화되는
 * 최후의 화면이라 `<html>`·`<body>`를 직접 정의해야 한다(Next.js 16 규약, `AppShell`을 재사용할
 * 수 없다 — 그 자체가 감싸는 레이아웃이 깨진 상황이다).
 *
 * 어떤 도메인 오류였는지 알 방법이 없는 층위라 `kind`는 항상 `"network"`로 고정한다 —
 * `error.tsx`(세그먼트 경계)가 `DataError.code`를 읽어 세분화하는 것과 달리, 여기 도달했다는
 * 것은 세션 조회조차 실패했다는 뜻이라 가장 가까운 일반적 실패 어휘를 쓴다.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // NFR-028 오류 수집(Task 038) — `error.tsx`와 같은 이유·같은 방식(모듈 docstring 참고).
    void reportClientErrorAction({
      message: error.message,
      requestId: error.digest ?? crypto.randomUUID(),
      stack: error.stack,
    });
  }, [error]);

  return (
    <html lang="ko" className={`${sansKr.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full items-center justify-center bg-background px-4 py-12 text-foreground">
        <RouteErrorBoundary kind="network" digest={error.digest} onRetry={() => unstable_retry()} />
      </body>
    </html>
  );
}
