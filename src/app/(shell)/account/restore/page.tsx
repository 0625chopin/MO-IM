import { redirect } from "next/navigation";

import { RestoreAccountFormContainer } from "@/components/auth/RestoreAccountFormContainer";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";

/**
 * FR-005 AC3 — 탈퇴 유예 중 계정 복구 화면(Task 039). `(app)/layout.tsx`가
 * `reason:"deactivated"`일 때 여기로 보낸다. 이 페이지는 그 상태를 직접 재확인한다(레이아웃을
 * 거치지 않고 북마크·직접 URL 접근으로 도달하는 경로도 있으므로) — `assertAuthenticatedSession`
 * 패턴과 달리 여기서는 `throw`가 아니라 각 상태에 맞는 곳으로 `redirect`한다: 완전한 게스트는
 * `/login`으로, 이미 `active`(복구할 것이 없음)면 `/home`으로, `deactivated`가 아닌 다른
 * `error`(예: `forbidden`)도 `/login`으로 보낸다.
 */
export default async function AccountRestorePage() {
  const session = await getAuthSession();

  if (session.status === "error" && session.reason === "deactivated") {
    return <RestoreAccountFormContainer graceEndsAt={session.graceEndsAt} />;
  }

  if (isAuthenticated(session)) {
    redirect("/home");
  }

  redirect("/login");
}
