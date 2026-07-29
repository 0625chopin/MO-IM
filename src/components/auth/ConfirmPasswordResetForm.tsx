"use client";

import { AlertTriangleIcon, CheckCircle2Icon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ConfirmPasswordResetState } from "@/lib/actions/confirm-password-reset";
import { confirmPasswordResetAction } from "@/lib/actions/confirm-password-reset";
import { passwordsMatch } from "@/lib/rules/auth-credentials";
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
  // 확인란 불일치(21일차). 판정 시점·해제 규칙은 `SignupForm`과 같다 — blur에서만 켜고 값이
  // 바뀌면 즉시 끈다(타이핑 도중에는 거의 항상 불일치라 매 글자 검사하면 소음이 된다).
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordConfirmRef = useRef<HTMLInputElement>(null);

  /** 두 칸 모두 값이 있을 때만 판정한다 — 아직 확인란을 채우지 않은 사람에게 불일치를
   *  들이밀지 않기 위해서다(빈 값은 `required`와 서버가 잡는다). */
  function checkPasswordsMatch() {
    const password = passwordRef.current?.value ?? "";
    const confirmation = passwordConfirmRef.current?.value ?? "";
    if (!password || !confirmation) {
      setPasswordMismatch(false);
      return;
    }
    setPasswordMismatch(!passwordsMatch(password, confirmation));
  }

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
              ref={passwordRef}
              id="reset-confirm-password"
              name="password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              className="pr-8"
              onBlur={checkPasswordsMatch}
              onChange={() => setPasswordMismatch(false)}
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

        {/* 확인란(21일차). 표시 토글은 위 필드와 `passwordVisible`을 공유한다(`SignupForm`과
            같은 이유 — 한 쌍의 값이라 한쪽만 보이면 대조가 반쪽이 된다).

            **클라이언트 판정만 이 자리(`FieldError`)에 붙는다.** 서버가 돌려주는 불일치는
            폼 상단 `Alert`로 나온다 — 이 화면의 모든 서버 오류(만료·형식·알 수 없음)가 이미
            그 한 자리를 쓰고 있고(`ConfirmPasswordResetState`는 필드별 오류 맵이 아니라
            `errorMessage` 하나다), 필드가 둘뿐이라 문구만으로 어디가 문제인지 충분히
            전달된다. 이 화면 하나를 위해 상태 모양을 바꾸지 않았다. */}
        <Field data-invalid={passwordMismatch}>
          <FieldLabel htmlFor="reset-confirm-password-confirm">
            {strings.auth.resetPassword.confirm.fields.passwordConfirm}
          </FieldLabel>
          <Input
            ref={passwordConfirmRef}
            id="reset-confirm-password-confirm"
            name="passwordConfirm"
            type={passwordVisible ? "text" : "password"}
            autoComplete="new-password"
            required
            onBlur={checkPasswordsMatch}
            onChange={() => setPasswordMismatch(false)}
            aria-invalid={passwordMismatch}
            aria-describedby={
              passwordMismatch ? "reset-password-confirm-error" : "reset-password-confirm-desc"
            }
          />
          {passwordMismatch ? (
            <FieldError id="reset-password-confirm-error">
              {strings.auth.resetPassword.confirm.errors.passwordMismatch}
            </FieldError>
          ) : (
            <FieldDescription id="reset-password-confirm-desc">
              {strings.auth.resetPassword.confirm.fields.passwordConfirmDescription}
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={isPending || passwordMismatch} className="w-full">
        {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {isPending ? strings.auth.resetPassword.confirm.submitPending : strings.auth.resetPassword.confirm.submit}
      </Button>
    </form>
  );
}
