import { AlertTriangleIcon } from "lucide-react";
import Link from "next/link";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { strings } from "@/lib/strings";

/**
 * `/auth/confirm/route.ts`(PKCE 토큰 교환)가 실패했을 때 도착하는 화면(Task 039). 가입 확인·
 * 비밀번호 재설정 양쪽에서 공유한다 — 어느 쪽이 실패했는지 구분하지 않는다(둘 다 "다시
 * 요청하라"는 같은 다음 행동으로 이어진다).
 */
export default function AuthConfirmErrorPage() {
  return (
    <AuthLayout
      eyebrow={strings.common.appName}
      title={strings.auth.confirmError.title}
      description={strings.auth.confirmError.description}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <AlertTriangleIcon aria-hidden="true" className="size-10 text-destructive" />
        <Link href="/login" className="text-sm font-medium text-foreground underline underline-offset-4">
          {strings.auth.confirmError.backToLogin}
        </Link>
      </div>
    </AuthLayout>
  );
}
