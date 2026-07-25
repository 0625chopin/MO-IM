"use client";

import { CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import type { ResendSignupEmailState } from "@/lib/actions/resend-signup-email";
import { resendSignupEmailAction } from "@/lib/actions/resend-signup-email";
import { strings } from "@/lib/strings";

const INITIAL_RESEND_STATE: ResendSignupEmailState = { status: "idle" };

/**
 * FR-001 E4 재발송 버튼(Task 030, 17일차 — BOARD 교차검증 major 지적으로 추가). `SignupForm`의
 * `pendingVerification` 패널이 이 컴포넌트를 쓴다 — `signupAction`(가입)과 `resendSignupEmailAction`
 * (재발송)이 서로 다른 `useActionState`를 쓰므로(상태 모양이 다르다) 별도 컴포넌트로 분리했다.
 *
 * **쿨다운·시간당 상한은 예외가 아니라 도메인 오류 상태로 보여준다**(D-030 ③) — `state.status
 * === "error"`가 그 두 경우와 진짜 발송 실패를 전부 포함한다(원인 문구는 서버가 이미
 * 완성해서 내려준다, `resend-signup-email.ts`).
 */
export function ResendSignupEmailButton({ email }: { email: string }) {
  const [state, formAction, isPending] = useActionState(resendSignupEmailAction, INITIAL_RESEND_STATE);
  const strs = strings.auth.signup.pendingVerification.resend;

  return (
    <form action={formAction} className="flex flex-col items-center gap-2">
      <input type="hidden" name="email" value={email} />
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {isPending ? strs.submitPending : strs.submit}
      </Button>
      {state.status === "sent" && (
        <FieldDescription className="flex items-center gap-1 text-primary">
          <CheckCircle2Icon aria-hidden="true" className="size-3.5" />
          {strs.sent}
        </FieldDescription>
      )}
      {state.status === "error" && state.errorMessage && (
        <FieldDescription role="alert" className="text-destructive">
          {state.errorMessage}
        </FieldDescription>
      )}
    </form>
  );
}
