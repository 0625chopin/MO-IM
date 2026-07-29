"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";
import { reportClientErrorAction } from "@/lib/actions/report-client-error";

/**
 * `/sample` 루트 레이아웃(I-098, 23일차)의 세그먼트 오류 경계. `(shell)/error.tsx`와 달리
 * `DataError.code` 분류(`classifyError`)를 두지 않는다 — `/sample`은 데이터 조회 경로가 아니라
 * 내부 개발 도구 페이지라 `lib/data`발 도메인 오류를 던질 일이 없고(각 데모는 정적 JSX이거나
 * 자체 클라이언트 상태로 오류를 흉내낸다), 분류 로직을 복사해 두면 실제로 안 쓰이는 죽은
 * 분기만 늘어난다. 미분류 fallback과 동일하게 `"unknown"`을 쓴다(`(shell)/error.tsx`의
 * `classifyError` fallback과 같은 값, I-069 근거 동일).
 */
export default function SampleError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    void reportClientErrorAction({
      message: error.message,
      requestId: error.digest ?? crypto.randomUUID(),
      stack: error.stack,
    });
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <RouteErrorBoundary
        kind="unknown"
        digest={error.digest}
        homeHref="/sample"
        onRetry={() => unstable_retry()}
      />
    </main>
  );
}
