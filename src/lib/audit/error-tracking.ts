import "server-only";

/**
 * NFR-028 오류 수집·추적 — 구조화 로그 기반 임시 구현(Task 038, 18일차 BOARD).
 *
 * **왜 Sentry를 아직 붙이지 않았는가**: `docs/decisions/ops-foundation-038.md` §3이 조사·결정
 * 근거를 남긴다 — 결론은 "`@sentry/nextjs`를 도입 대상으로 확정하되, 지금은 계정·DSN이 없어
 * 실제 연결을 마칠 수 없다"이다. `docs/ISSUES.md`에 미결로 등재했다(SENTRY_DSN 등 자격증명
 * 필요). 이 파일은 그 자격증명이 채워지기 전까지 "추적 가능"(NFR-028 측정 기준)을 만족시키는
 * 임시 구현이다 — 호스팅(Vercel) 로그 스트림은 `console.error`로 남긴 구조화 JSON을
 * requestId·userId로 검색할 수 있게 보존한다.
 *
 * **이 파일이 유일한 교체 지점이다** — Sentry DSN이 채워지면 `captureError` 본문만
 * `Sentry.captureException(...)` 호출로 바꾸면 되고, 호출부(Server Action·오류 경계)는 이
 * 함수의 시그니처가 바뀌지 않는 한 손댈 필요가 없다.
 */

export interface ErrorCaptureContext {
  message: string;
  /** Next.js 오류 경계가 제공하는 `error.digest`, 또는 서버 단독 캡처 시 새로 생성한 상관 id.
   *  NFR-028의 "요청 식별자"에 대응한다 — 이 앱에는 별도 요청 id 미들웨어가 없으므로(D-011
   *  범위 밖 `proxy.ts`와 같은 이유로 v0.1엔 없다) digest를 사실상의 요청 식별자로 쓴다. */
  requestId: string;
  /** 미인증 요청(예: 게스트 화면의 크래시)은 null. */
  userId: string | null;
  /** 크루 스코프 밖 오류이거나 호출부가 크루 컨텍스트를 모르면 null — 오류 경계(`error.tsx`)는
   *  라우트 트리에서 크루 id를 알 방법이 없어 대부분 null로 남는다(잔여 위험,
   *  `docs/decisions/ops-foundation-038.md` §4 참고). */
  crewId: string | null;
  source: "client" | "server";
  stack?: string;
}

export async function captureError(context: ErrorCaptureContext): Promise<void> {
  console.error(
    JSON.stringify({
      level: "error",
      capturedAt: new Date().toISOString(),
      ...context,
    }),
  );
}
