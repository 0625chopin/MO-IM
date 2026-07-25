import { AuthLayout } from "@/components/auth/AuthLayout";
import { ConfirmPasswordResetForm } from "@/components/auth/ConfirmPasswordResetForm";
import { getSupabaseAuthUser } from "@/lib/auth";
import { strings } from "@/lib/strings";

/**
 * FR-003 컨테이너(D-030 ①) — `/auth/confirm`이 `verifyEmailOtp("recovery", ...)`로 이미 발급해
 * 둔 임시 세션이 실제로 있는지 `getSupabaseAuthUser()`로 확인해 표현 컴포넌트에 boolean으로만
 * 내려준다(D-030 ① — 표현 컴포넌트는 `lib/auth`를 직접 import하지 않는다).
 */
export async function ConfirmPasswordResetFormContainer() {
  const authUser = await getSupabaseAuthUser();

  return (
    <AuthLayout
      eyebrow={strings.common.appName}
      title={strings.auth.resetPassword.confirm.title}
      description={strings.auth.resetPassword.confirm.description}
    >
      <ConfirmPasswordResetForm hasValidSession={authUser !== null} />
    </AuthLayout>
  );
}
