"use client";

import { AlertTriangleIcon, CheckCircle2Icon, EyeIcon, EyeOffIcon, Loader2Icon, MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState, useTransition, type FocusEvent } from "react";

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
import { passwordsMatch } from "@/lib/rules/auth-credentials";
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
  | { kind: "taken" }
  | { kind: "rate_limited" };

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
 * 물어볼 필요가 없다. **D-047(20일차)** — 그 서버 액션은 IP당 분당 10회로 제한돼 있다.
 * 초과하면 `rateLimited: true`가 오고, 이건 "이미 사용 중"(taken)과 다른 상태(`rate_limited`)
 * 로 다룬다 — blur 미리보기 단계에서는 제출 버튼을 막지 않는다(윈도가 60초라 클릭 시점엔
 * 이미 풀렸을 수 있다). **다만 제출 자체는 `signupAction`(서버)이 같은 리밋을 다시 확인해
 * 여전히 걸려 있으면 실제로 막는다**(20일차 안에 뒤집힌 판단 — 최초엔 제출을 막지 않고 DB
 * UNIQUE 제약에 맡겼으나, 그러면 리밋에 걸린 채로 넘어간 요청이 `signUpWithPassword`를 먼저
 * 실행해 되돌릴 수 없는 고아 `auth.users` 계정을 만드는 결함으로 이어짐을 BOARD가 발견했다
 * — `signupAction` docstring·D-047·I-065 참고).
 *
 * **blur 중복 호출 완화(20일차, DESIGN 지적 → BOARD 재확인 → CORE 적용)**: 같은 값으로 이미
 * 서버에 확인했다면 다시 blur해도 재호출하지 않는다(`lastCheckedHandleRef`) — 리밋을 정직한
 * 사용자가 우연히 소진하는 확률을 낮춰, 위 제출 차단이 실제로 발동할 일을 줄이는 게 목적이다
 * (두 결함이 서로를 강화하던 고리를 끊는다).
 */
export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signupAction, INITIAL_SIGNUP_FORM_STATE);
  const [handleStatus, setHandleStatus] = useState<HandleCheckStatus>({ kind: "idle" });
  const [isCheckingHandle, startHandleCheck] = useTransition();
  const [passwordVisible, setPasswordVisible] = useState(false);
  // 비밀번호 확인 불일치(21일차). blur 시점에만 판정한다 — 타이핑 도중 매 글자마다 "일치하지
  // 않아요"를 띄우면 정상적으로 입력하는 사람에게도 거의 항상 오류가 보인다(두 번째 글자부터
  // 마지막 글자 직전까지 계속 불일치다). 값이 다시 바뀌면 즉시 해제해 수정 중에는 조용하다.
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  // blur 판정에 상대 필드의 현재 값이 필요하다 — 두 필드 중 어느 쪽을 나중에 벗어나든 같은
  // 비교를 할 수 있어야 해서 양쪽 DOM 노드를 참조로 잡는다(입력값 자체를 state로 들고 있으면
  // 비밀번호 원문이 React 트리에 머무는 시간이 길어져 피하고 싶었다).
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordConfirmRef = useRef<HTMLInputElement>(null);

  /** 두 칸 모두 값이 있을 때만 판정한다 — 아직 확인란을 채우지 않은 사람에게 불일치를
   *  들이밀지 않기 위해서다(빈 값은 제출 시 `required`와 서버가 잡는다). */
  function checkPasswordsMatch() {
    const password = passwordRef.current?.value ?? "";
    const confirmation = passwordConfirmRef.current?.value ?? "";
    if (!password || !confirmation) {
      setPasswordMismatch(false);
      return;
    }
    setPasswordMismatch(!passwordsMatch(password, confirmation));
  }
  // D-047 — 이미 서버에 확인한 값으로 다시 blur해도 재호출하지 않는다(20일차, 리밋 소진
  // 완화). 값뿐 아니라 그때의 결과 상태도 같이 기억해야 한다 — 그 사이 `onChange`가
  // `handleStatus`를 "idle"로 되돌려 놨을 수 있어(타이핑했다가 원래 값으로 되돌린 경우),
  // 서버를 다시 안 부르는 대신 마지막 결과를 그대로 복원해 줘야 사용자가 "확인 중" 표시
  // 없이 결과를 계속 볼 수 있다. `null`은 "아직 아무 값도 서버에 확인하지 않았다"를 뜻한다.
  const lastCheckedHandleRef = useRef<{ handle: string; status: HandleCheckStatus } | null>(null);

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

    if (handle === lastCheckedHandleRef.current?.handle) {
      // 값이 안 바뀌었다 — 서버를 다시 부르지 않고 마지막 결과를 그대로 복원한다(리밋 소진
      // 완화가 목적, D-047).
      setHandleStatus(lastCheckedHandleRef.current.status);
      return;
    }

    setHandleStatus({ kind: "checking" });
    startHandleCheck(async () => {
      const result = await checkHandleAvailabilityAction(handle);
      // D-047 — 리밋 초과도 `available: null`이라 `rateLimited`를 먼저 분기해야 한다. 그냥
      // `result.available ? available : taken`을 쓰면 리밋 초과가 "이미 사용 중"으로
      // 잘못 보인다(둘 다 falsy) — 사실이 아닌 안내다.
      const status: HandleCheckStatus = result.rateLimited
        ? { kind: "rate_limited" }
        : result.available
          ? { kind: "available" }
          : { kind: "taken" };
      lastCheckedHandleRef.current = { handle, status };
      setHandleStatus(status);
    });
  }

  // 서버가 돌려준 오류를 우선한다 — 클라이언트 blur 판정은 즉시 피드백용이고, 최종 판정은
  // 항상 `signupAction`이다(핸들 오류가 같은 우선순위를 쓰는 것과 같은 이유).
  const passwordConfirmError =
    state.fieldErrors.passwordConfirm ??
    (passwordMismatch ? strings.auth.signup.errors.passwordMismatch : undefined);

  const handleFieldError =
    state.fieldErrors.handle ??
    (handleStatus.kind === "taken"
      ? strings.auth.signup.errors.handleTaken
      : handleStatus.kind === "invalid_format"
        ? strings.auth.signup.errors.handleInvalidFormat
        : undefined);

  // rate_limited는 사용자 입력 오류가 아니라 일시적 상태다(D-047, IP 리밋) — blur 미리보기
  // 단계에서 제출 버튼을 막지는 않는다(클릭 시점엔 60초 윈도가 이미 풀렸을 수 있다). 다만
  // 실제로 여전히 걸려 있으면 제출 자체는 `signupAction`(서버)이 막는다 — `state.fieldErrors.handle`
  // 로 돌아와 위 `handleFieldError`에 반영된다(20일차, 위 컴포넌트 docstring 참고).
  // 불일치가 확인된 상태에서는 제출을 막는다(핸들 중복·형식 오류와 같은 취급) — 어차피 서버가
  // 거절할 요청을 왕복시킬 이유가 없다. `passwordMismatch`는 blur로만 켜지고 값이 바뀌면 즉시
  // 꺼지므로, 고치는 도중에 버튼이 잠기지는 않는다.
  const submitDisabled =
    isPending ||
    isCheckingHandle ||
    passwordMismatch ||
    handleStatus.kind === "taken" ||
    handleStatus.kind === "invalid_format";

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
              ref={passwordRef}
              id="signup-password"
              name="password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              className="pr-8"
              onBlur={checkPasswordsMatch}
              onChange={() => setPasswordMismatch(false)}
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

        {/* 비밀번호 확인(21일차). 표시 토글은 위 필드와 `passwordVisible` 하나를 공유한다 —
            두 칸은 같은 값을 담는 한 쌍이라 한쪽만 보이면 대조라는 목적 자체가 반쪽이 된다.
            그래서 이 칸에는 토글 버튼을 따로 두지 않는다(같은 일을 하는 버튼이 둘이면 어느
            쪽이 무엇을 여는지 오히려 불분명하다). */}
        <Field data-invalid={Boolean(passwordConfirmError)}>
          <FieldLabel htmlFor="signup-password-confirm">
            {strings.auth.signup.fields.passwordConfirm}
          </FieldLabel>
          <Input
            ref={passwordConfirmRef}
            id="signup-password-confirm"
            name="passwordConfirm"
            type={passwordVisible ? "text" : "password"}
            autoComplete="new-password"
            required
            onBlur={checkPasswordsMatch}
            onChange={() => setPasswordMismatch(false)}
            aria-invalid={Boolean(passwordConfirmError)}
            aria-describedby={
              passwordConfirmError ? "signup-password-confirm-error" : "signup-password-confirm-desc"
            }
          />
          {passwordConfirmError ? (
            <FieldError id="signup-password-confirm-error">{passwordConfirmError}</FieldError>
          ) : (
            <FieldDescription id="signup-password-confirm-desc">
              {strings.auth.signup.fields.passwordConfirmDescription}
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
              {handleStatus.kind === "rate_limited" && strings.auth.signup.handleStatus.rateLimited}
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
