"use client";

import { AlertTriangleIcon, Loader2Icon, MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { RequestPasswordResetState } from "@/lib/actions/request-password-reset";
import { requestPasswordResetAction } from "@/lib/actions/request-password-reset";
import { strings } from "@/lib/strings";

const INITIAL_STATE: RequestPasswordResetState = { status: "idle" };

/**
 * FR-003 정상 흐름 ①·② — `SignupForm`의 `pendingVerification` 패턴과 같은 모양이다: 성공
 * 후에도 같은 화면에 남아 폼 대신 안내 패널을 보여준다(성공 시 리다이렉트가 없으므로
 * `useActionState`를 그대로 쓴다 — `docs/CONVENTIONS.md` "Server Action 폼 상태 관리" 첫
 * 갈래에 해당하지 않지만, 이 화면은 "다른 곳으로 이동"이 아니라 "같은 화면에서 패널 전환"이라
 * `SignupForm`과 동일 사유로 `useActionState`가 맞다 — 입력을 비우는 게 아니라 아예 다른
 * 콘텐츠로 바뀌므로 `set-state-in-effect` 문제 자체가 발생하지 않는다).
 */
export function RequestPasswordResetForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordResetAction, INITIAL_STATE);

  if (state.status === "sent") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <MailCheckIcon aria-hidden="true" className="size-10 text-primary" />
        <p className="text-sm text-muted-foreground">{strings.auth.resetPassword.request.sent}</p>
        <Link href="/login" className="text-sm font-medium text-foreground underline underline-offset-4">
          {strings.auth.resetPassword.request.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      {state.status === "error" && state.errorMessage && (
        <Alert variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertDescription>{state.errorMessage}</AlertDescription>
        </Alert>
      )}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="reset-request-email">{strings.auth.resetPassword.request.fields.email}</FieldLabel>
          <Input id="reset-request-email" name="email" type="email" autoComplete="email" required />
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {isPending ? strings.auth.resetPassword.request.submitPending : strings.auth.resetPassword.request.submit}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          {strings.auth.resetPassword.request.backToLogin}
        </Link>
      </p>
    </form>
  );
}
