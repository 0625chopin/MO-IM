import { redirect } from "next/navigation";

import { SignupFormContainer } from "@/components/auth/SignupFormContainer";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";

/**
 * 회원가입 페이지 (SC-02, PRD §6 "회원가입 페이지", FR-001, Task 015A). 이미 로그인 상태에서의
 * 접근 차단(PRD §2.2 각주1)은 Task 011의 인증 경계 그대로다 — 여기서는 폼(`SignupFormContainer`
 * → `SignupForm`)을 실제로 채운다.
 */
export default async function SignupPage() {
  const session = await getAuthSession();
  if (isAuthenticated(session)) {
    redirect("/home");
  }

  return <SignupFormContainer />;
}
