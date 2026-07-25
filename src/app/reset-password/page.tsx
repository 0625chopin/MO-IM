import { redirect } from "next/navigation";

import { RequestPasswordResetFormContainer } from "@/components/auth/RequestPasswordResetFormContainer";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";

/**
 * FR-003 비밀번호 재설정 요청 페이지(SC-04, Task 039). `/login`·`/signup`과 같은 게스트 전용
 * 진입 페이지 패턴 — 자기 자신이 "이미 로그인했으면 다른 곳으로" 반대 방향 가드를 갖는다
 * (`docs/CONVENTIONS.md` D-030 ④). `deactivated`(30일 유예) 세션은 `isAuthenticated`가
 * false이므로 이 가드에 걸리지 않고 정상 렌더된다 — 그 계정도 비밀번호를 재설정할 수 있어야
 * 하므로 의도된 동작이다.
 */
export default async function ResetPasswordPage() {
  const session = await getAuthSession();
  if (isAuthenticated(session)) {
    redirect("/home");
  }

  return <RequestPasswordResetFormContainer />;
}
