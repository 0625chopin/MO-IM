import { redirect } from "next/navigation";

import { LoginFormContainer } from "@/components/auth/LoginFormContainer";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";

/**
 * 로그인 페이지 (SC-03, PRD §6 "로그인 페이지", FR-002, Task 015A). 이미 로그인 상태에서의
 * 접근 차단(PRD §2.2 각주1)은 Task 011의 인증 경계 그대로다.
 *
 * `searchParams`는 Next.js 16에서 비동기다(await 필요) — FR-002 AC3("보호 라우트 직접 접근 →
 * 로그인 → 원래 경로로 복귀")을 위해 `redirect` 쿼리스트링을 읽어 컨테이너에 내려준다. 이 값을
 * 만드는 쪽(예: 로그인 필요 페이지의 가드)이 아직 없어 지금은 항상 비어 있지만, 계약은 지금부터
 * 갖춰 둔다.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const session = await getAuthSession();
  if (isAuthenticated(session)) {
    redirect("/home");
  }

  const { redirect: redirectTo } = await searchParams;
  return <LoginFormContainer redirectTo={redirectTo} />;
}
