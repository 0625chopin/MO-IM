"use server";

import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { captureError } from "@/lib/audit/error-tracking";

/**
 * NFR-028 오류 수집 — 클라이언트 오류 경계(`error.tsx`·`global-error.tsx`)가 잡은 예외를 서버
 * 로그로 전달하는 다리(Task 038, 18일차 BOARD). `captureError`(`lib/audit/error-tracking.ts`)
 * 자체는 `"server-only"`라 클라이언트 컴포넌트가 직접 부를 수 없다 — 이 Server Action이 유일한
 * 호출 경로다.
 *
 * 세션을 여기서 다시 조회하는 이유는 클라이언트 오류 경계가 `userId`를 신뢰할 수 있는 형태로
 * 갖고 있지 않기 때문이다(크래시 시점의 클라이언트 상태를 신뢰하지 않는다, 로그인 폼의 오픈
 * 리다이렉트 재검증과 같은 원칙 — `lib/rules/auth-credentials.ts`의 `sanitizeRedirectTarget`
 * docstring 참고). `crewId`는 여기서도 채우지 않는다 — 오류 경계는 라우트 트리 밖에서 실행돼
 * 크루 컨텍스트를 모른다(잔여 위험, `docs/decisions/ops-foundation-038.md` §4).
 */
export interface ReportClientErrorInput {
  message: string;
  /** `error.digest`(Next.js가 부여) 또는 그마저 없으면 호출부가 만든 상관 id. */
  requestId: string;
  stack?: string;
}

export async function reportClientErrorAction(input: ReportClientErrorInput): Promise<void> {
  const session = await getAuthSession();
  await captureError({
    message: input.message,
    requestId: input.requestId,
    stack: input.stack,
    userId: isAuthenticated(session) ? session.profileId : null,
    crewId: null,
    source: "client",
  });
}
