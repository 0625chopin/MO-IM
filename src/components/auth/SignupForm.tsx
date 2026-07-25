"use client";

import { AlertTriangleIcon, CheckCircle2Icon, EyeIcon, EyeOffIcon, Loader2Icon, MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition, type FocusEvent } from "react";

import { ResendSignupEmailButton } from "@/components/auth/ResendSignupEmailButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { checkHandleAvailabilityAction } from "@/lib/actions/check-handle-availability";
import type { SignupFormState } from "@/lib/actions/signup";
import { signupAction } from "@/lib/actions/signup";
import { validateHandleFormat } from "@/lib/rules/handle-validation";
import { strings, t } from "@/lib/strings";

/** `'use server'` 파일(`signup.ts`)은 async 함수만 export할 수 있어 초기 상태 상수를 거기
 *  둘 수 없다 — 타입만 가져와 여기서 리터럴을 만든다. */
const INITIAL_SIGNUP_FORM_STATE: SignupFormState = { fieldErrors: {} };

type HandleCheckStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "invalid_format" }
  | { kind: "available" }
  | { kind: "taken" };

/**
 * FR-001 회원가입 폼 — 이 화면의 유일한 클라이언트 경계다(팀장 지침 4번 "인터랙티브 필드/폼
 * 단위로 경계를 내린다"). `SignupFormContainer`(서버)가 레이아웃·문구를 감싸고, 이 컴포넌트는
 * 입력·제출 상태만 다룬다.
 *
 * **형식 검증은 `lib/rules`의 순수 함수를 서버 액션과 똑같이 클라이언트에서도 호출한다** —
 * 왕복 없이 즉시 피드백을 주기 위해서다(판정 로직의 단일 소스는 여전히 `lib/rules`, 이
 * 컴포넌트는 판정을 다시 구현하지 않고 그대로 호출만 한다). 최종 판정(중복 검사·저장)은
 * 항상 `signupAction`(서버)이 다시 확인한다 — 클라이언트 검증은 신뢰하지 않는다(Next.js
 * Server Actions 문서 "Validate inputs").
 *
 * **핸들 실시간 중복 검사(FR-001 AC2)**: blur 시점에 먼저 형식을 검사하고(로컬, 왕복 없음),
 * 통과한 값만 `checkHandleAvailabilityAction`(서버)에 물어본다 — 형식이 틀린 값을 서버에
 * 물어볼 필요가 없다.
 */
export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signupAction, INITIAL_SIGNUP_FORM_STATE);
  const [handleStatus, setHandleStatus] = useState<HandleCheckStatus>({ kind: "idle" });
  const [isCheckingHandle, startHandleCheck] = useTransition();
  const [passwordVisible, setPasswordVisible] = useState(false);

  function handleHandleBlur(event: FocusEvent<HTMLInputElement>) {
    const handle = event.currentTarget.value.trim();
    if (!handle) {
      setHandleStatus({ kind: "idle" });
      return;
    }

    const format = validateHandleFormat(handle);
    if (!format.valid) {
      setHandleStatus({ kind: "invalid_format" });
      return;
    }

    setHandleStatus({ kind: "checking" });
    startHandleCheck(async () => {
      const result = await checkHandleAvailabilityAction(handle);
      setHandleStatus(result.available ? { kind: "available" } : { kind: "taken" });
    });
  }

  const handleFieldError =
    state.fieldErrors.handle ??
    (handleStatus.kind === "taken"
      ? strings.auth.signup.errors.handleTaken
      : handleStatus.kind === "invalid_format"
        ? strings.auth.signup.errors.handleInvalidFormat
        : undefined);

  const submitDisabled =
    isPending || isCheckingHandle || handleStatus.kind === "taken" || handleStatus.kind === "invalid_format";

  // FR-001 정상 흐름 ⑤ — 가입은 성공했으나 세션은 아직 없다(이메일 인증 대기, Task 030 실측
  // 결과: 이 프로젝트는 "Confirm email"이 켜져 있다). 폼 대신 안내 패널을 보여준다.
  if (state.status === "pendingVerification" && state.email) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <MailCheckIcon aria-hidden="true" className="size-10 text-primary" />
        <div className="flex flex-col gap-1">
          <p className="text-base font-medium text-foreground">{strings.auth.signup.pendingVerification.title}</p>
          <p className="text-sm text-muted-foreground">
            {t((s) => s.auth.signup.pendingVerification.description, { email: state.email ?? "" })}
          </p>
        </div>
        <ResendSignupEmailButton email={state.email} />
        <Link href="/login" className="text-sm font-medium text-foreground underline underline-offset-4">
          {strings.auth.signup.pendingVerification.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      {state.formError && (
        <Alert variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      )}

      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors.email)}>
          <FieldLabel htmlFor="signup-email">{strings.auth.signup.fields.email}</FieldLabel>
          <Input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(state.fieldErrors.email)}
            aria-describedby={state.fieldErrors.email ? "signup-email-error" : undefined}
          />
          {state.fieldErrors.email && <FieldError id="signup-email-error">{state.fieldErrors.email}</FieldError>}
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors.password)}>
          <FieldLabel htmlFor="signup-password">{strings.auth.signup.fields.password}</FieldLabel>
          <div className="relative">
            <Input
              id="signup-password"
              name="password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              className="pr-8"
              aria-invalid={Boolean(state.fieldErrors.password)}
              aria-describedby={state.fieldErrors.password ? "signup-password-error" : "signup-password-desc"}
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
          {state.fieldErrors.password ? (
            <FieldError id="signup-password-error">{state.fieldErrors.password}</FieldError>
          ) : (
            <FieldDescription id="signup-password-desc">
              {strings.auth.signup.fields.passwordDescription}
            </FieldDescription>
          )}
        </Field>

        <Field data-invalid={Boolean(handleFieldError)}>
          <FieldLabel htmlFor="signup-handle">{strings.auth.signup.fields.handle}</FieldLabel>
          <Input
            id="signup-handle"
            name="handle"
            autoComplete="off"
            required
            onBlur={handleHandleBlur}
            onChange={() => setHandleStatus({ kind: "idle" })}
            aria-invalid={Boolean(handleFieldError)}
            aria-describedby={handleFieldError ? "signup-handle-error" : "signup-handle-desc"}
          />
          {handleFieldError ? (
            <FieldError id="signup-handle-error">{handleFieldError}</FieldError>
          ) : (
            <FieldDescription id="signup-handle-desc" className="flex items-center gap-1">
              {handleStatus.kind === "checking" && (
                <>
                  <Loader2Icon aria-hidden="true" className="size-3.5 animate-spin" />
                  {strings.auth.signup.handleStatus.checking}
                </>
              )}
              {handleStatus.kind === "available" && (
                <>
                  <CheckCircle2Icon aria-hidden="true" className="size-3.5 text-primary" />
                  {strings.auth.signup.handleStatus.available}
                </>
              )}
              {(handleStatus.kind === "idle") && strings.auth.signup.fields.handleDescription}
            </FieldDescription>
          )}
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors.displayName)}>
          <FieldLabel htmlFor="signup-display-name">{strings.auth.signup.fields.displayName}</FieldLabel>
          <Input
            id="signup-display-name"
            name="displayName"
            autoComplete="nickname"
            required
            maxLength={30}
            aria-invalid={Boolean(state.fieldErrors.displayName)}
            aria-describedby={state.fieldErrors.displayName ? "signup-display-name-error" : undefined}
          />
          {state.fieldErrors.displayName && (
            <FieldError id="signup-display-name-error">{state.fieldErrors.displayName}</FieldError>
          )}
        </Field>

        <Field orientation="horizontal" data-invalid={Boolean(state.fieldErrors.terms)}>
          <Checkbox id="signup-terms" name="agreedToTerms" value="on" aria-describedby={state.fieldErrors.terms ? "signup-terms-error" : undefined} />
          <FieldContent>
            <FieldLabel htmlFor="signup-terms">{strings.auth.signup.fields.terms}</FieldLabel>
            {state.fieldErrors.terms && <FieldError id="signup-terms-error">{state.fieldErrors.terms}</FieldError>}
          </FieldContent>
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={submitDisabled} className="w-full">
        {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {isPending ? strings.auth.signup.submitPending : strings.auth.signup.submit}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {strings.auth.signup.alreadyHaveAccount}{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          {strings.auth.signup.goToLogin}
        </Link>
      </p>
    </form>
  );
}
