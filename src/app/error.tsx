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
 * 던질 때 이 세그먼트 경계가 바로 대응할 수 있게 미리 읽는 자리를 만들어 둔다.
 *
 * **19일차, I-069 완화 — 미분류 fallback을 `"network"`에서 `"unknown"`으로 바꿨다.** 원래는
 * "그 외 모든 미분류 예외는 network로 묶는다"였는데, Next.js는 프로덕션 빌드에서 서버
 * 컴포넌트가 던진 예외의 `cause`를 클라이언트로 넘기지 않는다(공식 동작, 민감 정보 차단
 * 목적 — `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`
 * 확인). 즉 이 프로젝트의 `cause: { code }` 패턴은 **프로덕션에서 이 분기가 항상 실패한다** —
 * `forbidden`·`conflict`·`validation_failed`로 의도했던 오류까지 전부 여기로 떨어지는데,
 * 그걸 "네트워크 문제"라고 단정해 보여주면 원인을 적극적으로 잘못 안내하는 것이다(사용자는
 * 권한이 없어서 안 되는 걸 "인터넷이 문제인가?" 하고 헤매게 된다). `"unknown"`은 원인을
 * 모른다고 정직하게 말할 뿐 단정하지 않는다 — 근본 해결(프로덕션에서도 분류가 살아남게
 * 하는 것)은 이번 회차 범위 밖이다(설계 결정 필요, `docs/ISSUES.md` I-069 §후속 참고).
 * `global-error.tsx`(루트 레이아웃 오류 경계)의 `"network"` 사용은 건드리지 않았다 — 그
 * 지점은 이 `classifyError`를 거치지 않고 독립적으로 `"network"`를 하드코딩하며, 루트
 * 레이아웃 자체가 깨지는 훨씬 드문 상황이라 인프라·연결 실패일 가능성이 실제로 더 높다는
 * 판단은 이번 조사로 바뀌지 않았다.
 */
function classifyError(error: Error & { digest?: string }): RouteErrorKind {
  const { cause } = error;
  const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
  if (typeof code === "string" && (DATA_ERROR_CODES as readonly string[]).includes(code)) {
    return code as RouteErrorKind;
  }
  return "unknown";
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
