"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

import type { RouteErrorKind } from "@/components/errors/route-error-kind";
import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";
import { reportClientErrorAction } from "@/lib/actions/report-client-error";
import type { DataErrorCode } from "@/lib/data/contracts";

const DATA_ERROR_CODES: readonly DataErrorCode[] = [
  "not_found",
  "conflict",
  "validation_failed",
  "forbidden",
];

/**
 * `error.cause`에 `lib/data/contracts.ts`의 `DataError`(`{ code, message }`) 모양이 실려 있으면
 * 그 `code`로 분류한다 — Mock 단계에는 이렇게 던지는 호출부가 아직 없지만(계약에 자리만 있음,
 * I-027), Task 026(Supabase 도입) 이후 서버 컴포넌트·Server Action이 예상 밖의 RLS 거부 등을
 * 던질 때 이 세그먼트 경계가 바로 대응할 수 있게 미리 읽는 자리를 만들어 둔다. 그 외
 * 모든 미분류 예외는 "network"로 묶는다 — 이 바운더리에 도달한다는 것 자체가 이미
 * 예상하지 못한 실패이고, 이 저장소의 오류 어휘 중 "재시도해 볼 만한 일반적 실패"에
 * 가장 가까운 것이 network다.
 */
function classifyError(error: Error & { digest?: string }): RouteErrorKind {
  const { cause } = error;
  const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
  if (typeof code === "string" && (DATA_ERROR_CODES as readonly string[]).includes(code)) {
    return code as RouteErrorKind;
  }
  return "network";
}

/**
 * SC-E1 세그먼트 오류 경계(D-030 ①, 얇은 라우트 파일 + 표현 컴포넌트). `unstable_retry`가
 * Next.js 16.2의 1차 복구 API다(`reset`은 "재요청 없이 상태만 지우고 싶은 경우"의 보조
 * 수단으로 격하됨).
 *
 * 프로덕션에서는 `error.message`가 일반화된 문구로 대체되고 `error.digest`만 전달된다
 * (NFR-014) — 그래서 이 컴포넌트는 `error.message`를 화면에 그리지 않고 `digest`만
 * `RouteErrorBoundary`에 넘긴다.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // NFR-028 오류 수집(Task 038). `error.digest`가 요청 식별자 역할을 한다(모듈 docstring
    // 참고) — 없으면(개발 모드 등) 새 상관 id를 만든다. 실패해도(네트워크 등) 화면에 영향을
    // 주지 않도록 fire-and-forget으로 둔다.
    void reportClientErrorAction({
      message: error.message,
      requestId: error.digest ?? crypto.randomUUID(),
      stack: error.stack,
    });
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <RouteErrorBoundary
        kind={classifyError(error)}
        digest={error.digest}
        onRetry={() => unstable_retry()}
      />
    </main>
  );
}
