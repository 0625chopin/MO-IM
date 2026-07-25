import { AlertTriangleIcon, EyeIcon, Loader2Icon } from "lucide-react";

import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { defineSection } from "@/components/sample/showcase-types";
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
import { strings, t } from "@/lib/strings";

/**
 * Task 015A — 회원가입·로그인·온보딩(FR-001·002·004). 실제 화면(`/signup`·`/login`·
 * `/onboarding`)은 `src/components/auth/*Form.tsx`가 `useActionState`로 진짜 Server
 * Action(`lib/actions/signup.ts` 등)에 물려 있다 — 여기서 그 컴포넌트를 그대로 렌더링하면
 * 쇼케이스를 둘러보다 실수로 제출 버튼을 눌러 Mock 프로필이 실제로 생성되고 `/sample` 밖으로
 * 리다이렉트되는 부작용이 생긴다(`redirect()`가 실제로 실행된다). 그래서 `errors.tsx`의
 * `RouteErrorBoundaryPreview` 패턴을 그대로 따라 **정적 프리뷰**(같은 UI 원자·같은 문구, 제출은
 * 아무 동작도 하지 않음)만 둔다 — 실제 인터랙션(핸들 실시간 중복 검사·잠금 판정 등)을 눈으로
 * 확인하려면 실제 라우트를 연다.
 *
 * "오류" 패널은 네트워크 실패가 아니라 **도메인 오류**를 보여준다(D-030 ③) — 회원가입은
 * 이메일 중복(FR-001 E1)·비밀번호 정책 미달(E3)·핸들 중복(E2)·약관 미동의를 한 번에, 로그인은
 * 계정 잠금(FR-002 E2·AC4, D-020)을 보여준다.
 */
export const authSection = defineSection({
  id: "auth",
  label: "인증",
  title: "회원가입 · 로그인 · 온보딩",
  description:
    "FR-001·FR-002·FR-004. 실제 라우트는 /signup · /login · /onboarding — 여기서는 상태별 정적 모습만 보여줍니다(제출은 동작하지 않습니다).",
  items: [
    {
      name: "SignupForm",
      note: "핸들 실시간 중복 검사(FR-001 AC2)는 정적 프리뷰로 재현할 수 없어 /signup에서 직접 확인합니다.",
      panels: {
        default: (
          <PreviewFrame height={560}>
            <div className="mx-auto w-full max-w-sm p-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="sample-signup-email">{strings.auth.signup.fields.email}</FieldLabel>
                  <Input id="sample-signup-email" type="email" placeholder="you@example.com" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sample-signup-password">{strings.auth.signup.fields.password}</FieldLabel>
                  <div className="relative">
                    <Input id="sample-signup-password" type="password" className="pr-8" />
                    <EyeIcon
                      aria-hidden="true"
                      className="absolute inset-y-0 right-2 my-auto size-4 text-muted-foreground"
                    />
                  </div>
                  <FieldDescription>{strings.auth.signup.fields.passwordDescription}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="sample-signup-handle">{strings.auth.signup.fields.handle}</FieldLabel>
                  <Input id="sample-signup-handle" placeholder="lowercase_handle" />
                  <FieldDescription>{strings.auth.signup.fields.handleDescription}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="sample-signup-name">{strings.auth.signup.fields.displayName}</FieldLabel>
                  <Input id="sample-signup-name" />
                </Field>
                <Field orientation="horizontal">
                  <Checkbox id="sample-signup-terms" />
                  <FieldLabel htmlFor="sample-signup-terms">{strings.auth.signup.fields.terms}</FieldLabel>
                </Field>
              </FieldGroup>
              <Button className="mt-6 w-full">{strings.auth.signup.submit}</Button>
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={200}>
            <div className="mx-auto flex w-full max-w-sm justify-center p-4">
              <Button disabled className="w-full">
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {strings.auth.signup.submitPending}
              </Button>
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={560}>
            <div className="mx-auto w-full max-w-sm p-4">
              <FieldGroup>
                <Field data-invalid>
                  <FieldLabel htmlFor="sample-signup-email-err">{strings.auth.signup.fields.email}</FieldLabel>
                  <Input id="sample-signup-email-err" defaultValue="seo_runs@example.com" aria-invalid="true" />
                  <FieldError>{strings.auth.signup.errors.emailTaken}</FieldError>
                </Field>
                <Field data-invalid>
                  <FieldLabel htmlFor="sample-signup-password-err">
                    {strings.auth.signup.fields.password}
                  </FieldLabel>
                  <Input id="sample-signup-password-err" type="password" defaultValue="1234" aria-invalid="true" />
                  <FieldError>{strings.auth.signup.errors.passwordTooShort}</FieldError>
                </Field>
                <Field data-invalid>
                  <FieldLabel htmlFor="sample-signup-handle-err">{strings.auth.signup.fields.handle}</FieldLabel>
                  <Input id="sample-signup-handle-err" defaultValue="seo_runs" aria-invalid="true" />
                  <FieldError>{strings.auth.signup.errors.handleTaken}</FieldError>
                </Field>
                <Field orientation="horizontal" data-invalid>
                  <Checkbox id="sample-signup-terms-err" aria-invalid="true" />
                  <FieldContent>
                    <FieldLabel htmlFor="sample-signup-terms-err">{strings.auth.signup.fields.terms}</FieldLabel>
                    <FieldError>{strings.auth.signup.errors.termsRequired}</FieldError>
                  </FieldContent>
                </Field>
              </FieldGroup>
              <Button className="mt-6 w-full">{strings.auth.signup.submit}</Button>
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "ResendSignupEmailButton",
      note: "FR-001 E4(재발송, 60초 쿨다운·시간당 5회 상한, Task 030). 실제 컴포넌트는 /signup의 가입 완료 직후 안내 패널에서 확인합니다 — 여기서는 상태별 정적 모습만 보여줍니다.",
      panels: {
        default: (
          <PreviewFrame height={140}>
            <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-2 p-4">
              <Button variant="outline" size="sm">
                {strings.auth.signup.pendingVerification.resend.submit}
              </Button>
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={140}>
            <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-2 p-4">
              <Button variant="outline" size="sm" disabled>
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {strings.auth.signup.pendingVerification.resend.submitPending}
              </Button>
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={180}>
            <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-2 p-4">
              <Button variant="outline" size="sm">
                {strings.auth.signup.pendingVerification.resend.submit}
              </Button>
              <FieldDescription role="alert" className="text-destructive">
                {t((s) => s.auth.signup.pendingVerification.resend.cooldown, { seconds: 42 })}
              </FieldDescription>
              <FieldDescription role="alert" className="text-destructive">
                {t((s) => s.auth.signup.pendingVerification.resend.hourlyLimit, { minutes: 37 })}
              </FieldDescription>
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "LoginForm",
      note: "자격 증명 불일치와 계정 잠금(D-020)이 같은 자리(폼 상단 배너)에 뜹니다 — 어느 필드가 틀렸는지 구분하지 않는 FR-002 E1 요구의 시각적 표현입니다.",
      panels: {
        default: (
          <PreviewFrame height={320}>
            <div className="mx-auto w-full max-w-sm p-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="sample-login-email">{strings.auth.login.fields.email}</FieldLabel>
                  <Input id="sample-login-email" type="email" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sample-login-password">{strings.auth.login.fields.password}</FieldLabel>
                  <Input id="sample-login-password" type="password" />
                </Field>
              </FieldGroup>
              <Button className="mt-6 w-full">{strings.auth.login.submit}</Button>
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={200}>
            <div className="mx-auto flex w-full max-w-sm justify-center p-4">
              <Button disabled className="w-full">
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {strings.auth.login.submitPending}
              </Button>
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={280}>
            <div className="mx-auto w-full max-w-sm p-4">
              <Alert variant="destructive" className="mb-4">
                <AlertTriangleIcon aria-hidden="true" />
                <AlertDescription>{strings.auth.login.lockedNotice}</AlertDescription>
              </Alert>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="sample-login-email-err">{strings.auth.login.fields.email}</FieldLabel>
                  <Input id="sample-login-email-err" defaultValue="locked-demo@example.com" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sample-login-password-err">{strings.auth.login.fields.password}</FieldLabel>
                  <Input id="sample-login-password-err" type="password" />
                </Field>
              </FieldGroup>
              <Button disabled className="mt-6 w-full">
                {strings.auth.login.submit}
              </Button>
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "OnboardingForm",
      note: "핸들은 읽기 전용입니다(FR-001에서 이미 확정, lib/data의 updateProfile은 handle을 받지 않습니다).",
      panels: {
        default: (
          <PreviewFrame height={420}>
            <div className="mx-auto w-full max-w-sm p-4">
              <p className="mb-4 text-lg font-medium text-foreground">
                {t((s) => s.auth.onboarding.welcome, { displayName: "서지훈" })}
              </p>
              <FieldGroup>
                <Field data-disabled>
                  <FieldLabel htmlFor="sample-onboarding-handle">
                    {strings.auth.onboarding.fields.handle}
                  </FieldLabel>
                  <Input id="sample-onboarding-handle" defaultValue="seo_runs" disabled />
                  <FieldDescription>{strings.auth.onboarding.fields.handleLocked}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="sample-onboarding-name">
                    {strings.auth.onboarding.fields.displayName}
                  </FieldLabel>
                  <Input id="sample-onboarding-name" defaultValue="서지훈" />
                </Field>
                <Field orientation="horizontal">
                  <Checkbox id="sample-onboarding-opt-out" />
                  <FieldContent>
                    <FieldLabel htmlFor="sample-onboarding-opt-out">
                      {strings.auth.onboarding.fields.searchOptOut}
                    </FieldLabel>
                    <FieldDescription>{strings.auth.onboarding.fields.searchOptOutDescription}</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
              <Button className="mt-6 w-full">{strings.auth.onboarding.submit}</Button>
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={200}>
            <div className="mx-auto flex w-full max-w-sm justify-center p-4">
              <Button disabled className="w-full">
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {strings.auth.onboarding.submitPending}
              </Button>
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={200}>
            <div className="mx-auto w-full max-w-sm p-4">
              <Alert variant="destructive">
                <AlertTriangleIcon aria-hidden="true" />
                <AlertDescription>{strings.auth.onboarding.errors.sessionExpired}</AlertDescription>
              </Alert>
            </div>
          </PreviewFrame>
        ),
      },
    },
  ],
});
