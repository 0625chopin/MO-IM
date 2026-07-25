"use client";

import { AlertTriangleIcon, CheckCircle2Icon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ConfirmPasswordResetState } from "@/lib/actions/confirm-password-reset";
import { confirmPasswordResetAction } from "@/lib/actions/confirm-password-reset";
import { strings } from "@/lib/strings";

const INITIAL_STATE: ConfirmPasswordResetState = { status: "idle" };

/**
 * FR-003 정상 흐름 ④~⑥. `hasValidSession=false`(컨테이너가 `getSupabaseAuthUser()`로 미리
 * 확인)면 폼 자체를 보여주지 않고 곧바로 E2(링크 만료) 상태로 시작한다 — 제출까지 갔다가
 * 실패하는 것보다 한 왕복 빠르다. `status==="success"`는 리다이렉트하지 않는다
 * (`confirmPasswordResetAction`이 이미 `signOutSupabaseSession()`으로 이 세션을 끝냈으므로
 * 서버 리다이렉트 대신 안내 + 수동 링크로 마무리한다 — `RedirectToLogin`과 달리 자동 이동을
 * 걸면 "방금 세션이 끊겼다"는 사실을 사용자가 인지하기 전에 화면이 넘어간다).
 */
export function ConfirmPasswordResetForm({ hasValidSession }: { hasValidSession: boolean }) {
  const [state, formAction, isPending] = useActionState(confirmPasswordResetAction, INITIAL_STATE);
  const [passwordVisible, setPasswordVisible] = useState(false);

  if (!hasValidSession) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <AlertTriangleIcon aria-hidden="true" className="size-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{strings.auth.resetPassword.confirm.errors.linkExpired}</p>
        <Link href="/reset-password" className="text-sm font-medium text-foreground underline underline-offset-4">
          {strings.auth.resetPassword.confirm.requestNewLink}
        </Link>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircle2Icon aria-hidden="true" className="size-10 text-primary" />
        <p className="text-sm text-muted-foreground">{strings.auth.resetPassword.confirm.successRedirectNotice}</p>
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
          <FieldLabel htmlFor="reset-confirm-password">
            {strings.auth.resetPassword.confirm.fields.password}
          </FieldLabel>
          <div className="relative">
            <Input
              id="reset-confirm-password"
              name="password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              className="pr-8"
              aria-describedby="reset-confirm-password-desc"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute inset-y-0 right-0.5 my-auto"
              onClick={() => setPasswordVisible((visible) => !visible)}
              aria-label={passwordVisible ? strings.common.a11y.hidePassword : strings.common.a11y.showPassword}
            >
              {passwordVisible ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
            </Button>
          </div>
          <FieldDescription id="reset-confirm-password-desc">
            {strings.auth.resetPassword.confirm.fields.passwordDescription}
          </FieldDescription>
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {isPending ? strings.auth.resetPassword.confirm.submitPending : strings.auth.resetPassword.confirm.submit}
      </Button>
    </form>
  );
}
