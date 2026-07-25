import { AuthLayout } from "@/components/auth/AuthLayout";
import { RequestPasswordResetForm } from "@/components/auth/RequestPasswordResetForm";
import { strings } from "@/lib/strings";

/** FR-003 컨테이너(D-030 ①) — `SignupFormContainer`와 같은 이유로 조회할 데이터가 없어도
 *  3층 구조를 지킨다. */
export function RequestPasswordResetFormContainer() {
  return (
    <AuthLayout
      eyebrow={strings.common.appName}
      title={strings.auth.resetPassword.request.title}
      description={strings.auth.resetPassword.request.description}
    >
      <RequestPasswordResetForm />
    </AuthLayout>
  );
}
