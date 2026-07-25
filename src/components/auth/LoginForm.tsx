"use client";

import { AlertTriangleIcon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { LoginFormState } from "@/lib/actions/login";
import { loginAction } from "@/lib/actions/login";
import { strings } from "@/lib/strings";

/** `'use server'` 파일은 async 함수만 export할 수 있다(`signup.ts` docstring 참고) —
 *  초기 상태는 타입만 가져와 여기서 만든다. */
const INITIAL_LOGIN_FORM_STATE: LoginFormState = {};

/**
 * FR-002 로그인 폼 — 이 화면의 유일한 클라이언트 경계(팀장 지침 4번). `redirectTo`는 서버
 * 컴포넌트(`LoginFormContainer`)가 쿼리스트링에서 읽어 props로 내려준 값을 hidden input으로
 * 그대로 다시 서버(`loginAction`)에 실어 보낸다 — FR-002 AC3("보호 라우트 직접 접근 → 로그인
 * → 원래 경로로 복귀")을 만족한다. 값 자체의 안전성 검증(오픈 리다이렉트 방지)은
 * `loginAction`의 `sanitizeRedirectTarget`이 서버에서 다시 한다 — 클라이언트가 넘긴 값은
 * 신뢰하지 않는다.
 *
 * FR-002 E1(자격 증명 불일치)·E2/AC4(D-020 계정 잠금) 둘 다 **같은 자리**(`state.formError`)에
 * 뜬다 — 필드별로 나누지 않는 것 자체가 "어느 필드가 틀렸는지 구분하지 않는다"는 요구사항의
 * 시각적 표현이다.
 */
export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, INITIAL_LOGIN_FORM_STATE);
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      {state.formError && (
        <Alert variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      )}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="login-email">{strings.auth.login.fields.email}</FieldLabel>
          <Input id="login-email" name="email" type="email" autoComplete="email" required />
        </Field>

        <Field>
          <FieldLabel htmlFor="login-password">{strings.auth.login.fields.password}</FieldLabel>
          <div className="relative">
            <Input
              id="login-password"
              name="password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="current-password"
              required
              className="pr-8"
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
        </Field>
      </FieldGroup>

      <p className="text-right text-sm">
        <Link href="/reset-password" className="font-medium text-foreground underline underline-offset-4">
          {strings.auth.login.forgotPassword}
        </Link>
      </p>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {isPending ? strings.auth.login.submitPending : strings.auth.login.submit}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {strings.auth.login.noAccount}{" "}
        <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
          {strings.auth.login.goToSignup}
        </Link>
      </p>
    </form>
  );
}
