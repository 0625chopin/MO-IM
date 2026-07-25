"use server";

import { redirect } from "next/navigation";

import { signUpWithPassword } from "@/lib/auth";
import { createProfile, getProfileByHandle } from "@/lib/data";
import { isValidEmailFormat, validatePasswordFormat } from "@/lib/rules/auth-credentials";
import { validateDisplayName } from "@/lib/rules/display-name-validation";
import { validateHandleFormat } from "@/lib/rules/handle-validation";
import { strings } from "@/lib/strings";

/**
 * FR-001 회원가입 Server Action. `SignupForm`이 `useActionState(signupAction, ...)`로 건다.
 *
 * **Task 030(17일차)부터 실 Supabase Auth를 쓴다.** `signUpWithPassword`(`@/lib/auth`, 세션 전용
 * 계층 — `src/lib/data/` 밖에 있다, CON-05·CON-06 근거는 `docs/decisions/auth-integration-030.md`
 * §1)가 `auth.users` 행을 만든다 — 이메일 자격 증명 저장소는 이제 실재한다(CON-06 그대로: 이
 * 데이터 레이어(`@/lib/data`)의 나머지 함수는 여전히 `profileId`만 인자로 받는다).
 *
 * **실측(17일차)**: 이 프로젝트의 Supabase 대시보드는 "Confirm email"이 켜져 있다 —
 * `signUpWithPassword`는 성공해도 세션을 만들지 않는다(`sessionCreated: false`). 즉 FR-001
 * 정상 흐름 ⑤~⑥(메일 발송 → 링크 클릭 → 활성화)이 실제로 발동하고, AC1의
 * `pending_verification` 의미론이 문자 그대로 성립한다 — 이 액션은 성공 시 `/onboarding`으로
 * 리다이렉트하지 않고 "메일함을 확인해 주세요" 상태를 반환한다.
 *
 * **I-046 해소(Task 032, 18일차)**: `createProfile`이 이제 `id`(= `signUpWithPassword`가 반환한
 * 실 `auth.users.id`)를 받는다(`docs/decisions/auth-integration-030.md` §5가 남긴 인계 항목).
 * "Confirm email"이 켜져 있어 가입 직후에는 세션이 없는 것이 정상 흐름이라(§3) `auth.uid()`
 * 기반 RLS로는 이 시점에 프로필을 만들 수 없다 — `createProfile`(`src/lib/data/supabase/
 * profile.ts`)이 그 경우만 예외적으로 service-role 클라이언트를 쓴다. 이 액션은 세션 유무와
 * 무관하게 `signUpWithPassword` 성공 직후 곧바로 프로필을 만든다 — 사용자가 나중에 메일
 * 링크로 인증하고 로그인하면 `getAuthSession()`이 이미 존재하는 이 프로필 행을 찾는다.
 */
export interface SignupFieldErrors {
  email?: string;
  password?: string;
  handle?: string;
  displayName?: string;
  terms?: string;
}

export interface SignupFormState {
  fieldErrors: SignupFieldErrors;
  /** 필드에 걸리지 않는 전역 오류(예: 동시 요청 경쟁으로 인한 저장 실패). */
  formError?: string;
  /** FR-001 정상 흐름 ⑤ — 가입은 성공했지만 세션이 아직 없다(이메일 인증 대기). 이 값이
   *  세팅되면 `SignupForm`은 입력 폼 대신 안내 패널을 보여준다. */
  status?: "pendingVerification";
  /** `pendingVerification`일 때만 채워진다 — 안내 문구에 보낸 주소를 보여주기 위해서다. */
  email?: string;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (React Server Functions 제약). 초기 상태는 `SignupForm`(호출부)이 이 파일의
// **타입**(`SignupFormState`, 타입 import는 컴파일 타임에 지워져 제약 대상이 아니다)만 가져다
// 직접 리터럴로 만든다.
export async function signupAction(
  _prevState: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const handle = String(formData.get("handle") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const agreedToTerms = formData.get("agreedToTerms") === "on";

  const fieldErrors: SignupFieldErrors = {};

  if (!isValidEmailFormat(email)) {
    fieldErrors.email = strings.auth.signup.errors.emailInvalid;
  }

  if (!validatePasswordFormat(password).valid) {
    fieldErrors.password = strings.auth.signup.errors.passwordTooShort;
  }

  const displayNameCheck = validateDisplayName(displayName);
  if (!displayNameCheck.valid) {
    fieldErrors.displayName = displayNameCheck.violations.includes("required")
      ? strings.auth.signup.errors.displayNameRequired
      : strings.auth.signup.errors.displayNameTooLong;
  }

  const handleFormatCheck = validateHandleFormat(handle);
  if (!handleFormatCheck.valid) {
    fieldErrors.handle = strings.auth.signup.errors.handleInvalidFormat;
  } else if (await getProfileByHandle(handle)) {
    fieldErrors.handle = strings.auth.signup.errors.handleTaken;
  }

  if (!agreedToTerms) {
    fieldErrors.terms = strings.auth.signup.errors.termsRequired;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const signedUp = await signUpWithPassword(email, password);
  if (!signedUp.ok) {
    if (signedUp.code === "email_taken") {
      // FR-001 E1. D-005는 검색 API의 계정 존재 노출만 막았을 뿐, 가입 폼의 중복 안내는
      // 사용성을 위해 그대로 유지한다(requirements.md FR-001 E1 각주).
      return { fieldErrors: { email: strings.auth.signup.errors.emailTaken } };
    }
    return { fieldErrors: {}, formError: strings.auth.signup.errors.unknown };
  }

  // I-046 해소 — 세션 유무와 무관하게 auth.users 행이 생긴 직후 곧바로 프로필을 만든다
  // (createProfile이 이 경우 service-role로 RLS를 우회한다, 위 docstring 참고). 핸들 중복은
  // 위에서 이미 검사했지만 그 사이 경쟁(같은 핸들 동시 가입)이 있으면 여기서 conflict로 잡힌다.
  const created = await createProfile({ id: signedUp.userId, handle, displayName });
  if (!created.ok) {
    return { fieldErrors: { handle: strings.auth.signup.errors.handleTaken } };
  }

  if (!signedUp.sessionCreated) {
    // 정상 경로(대시보드 "Confirm email" 켜짐, 17일차 실측) — 세션 없이 인증 대기 화면.
    return { fieldErrors: {}, status: "pendingVerification", email };
  }

  // 대시보드 설정이 이메일 확인을 요구하지 않는 경우의 대비 경로 — 세션이 즉시 생겼으므로
  // 기존 Mock First 흐름과 동일하게 온보딩으로 보낸다.
  redirect("/onboarding");
}
