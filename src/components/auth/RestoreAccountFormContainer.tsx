import { AuthLayout } from "@/components/auth/AuthLayout";
import { RestoreAccountForm } from "@/components/auth/RestoreAccountForm";
import { strings, t } from "@/lib/strings";

/** FR-005 AC3 컨테이너(D-030 ①). `graceEndsAt`은 `page.tsx`가 `getAuthSession()`의
 *  `reason:"deactivated"` 분기에서 이미 계산해 둔 값을 그대로 받는다 — 이 컨테이너 자신은
 *  추가 조회를 하지 않는다(세션 조회 자체가 이미 `page.tsx`에서 끝났다). 날짜 포맷(NFR-025,
 *  절대 날짜 관례)만 이 자리에서 한다. */
export function RestoreAccountFormContainer({ graceEndsAt }: { graceEndsAt: string }) {
  const formattedDate = new Date(graceEndsAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <AuthLayout
      eyebrow={strings.common.appName}
      title={strings.account.restore.title}
      description={t((s) => s.account.restore.description, { date: formattedDate })}
    >
      <RestoreAccountForm />
    </AuthLayout>
  );
}
