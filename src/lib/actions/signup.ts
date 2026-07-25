"use server";

import { redirect } from "next/navigation";

import { checkHandleAvailabilityAction } from "@/lib/actions/check-handle-availability";
import { signUpWithPassword } from "@/lib/auth";
import { createProfile } from "@/lib/data";
import { isValidEmailFormat, validatePasswordFormat } from "@/lib/rules/auth-credentials";
import { validateDisplayName } from "@/lib/rules/display-name-validation";
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
 *
 * **I-065 major① 해소(20일차, BOARD 교차검증 → CORE 수정)** — 핸들 중복 확인은
 * `getProfileByHandle`(service-role, RLS 완전 우회)을 **직접 부르지 않는다.** 예전엔 여기서
 * 직접 불러 `checkHandleAvailabilityAction`(D-047, IP당 분당 10회)이 건 리밋을 완전히
 * 우회하는 두 번째 진입문이었다 — I-058 major①과 같은 구조("다른 경로로 같은 오라클에
 * 도달")로, `/signup`에 핸들만 바꿔가며 POST를 반복하면 리밋 없이 익명 열거가 가능했다
 * (필드 오류가 하나라도 있으면 `signUpWithPassword` 호출 전에 조기 반환하는 구조라 Supabase
 * Auth 내장 리밋에도 안 닿았다). 지금은 `checkHandleAvailabilityAction`을 그대로 재사용한다
 * — **익명 컨텍스트에서 핸들 존재를 묻는 진입점은 이 함수 하나뿐이어야 한다**
 * (`getProfileByHandle` docstring의 규약 참고).
 *
 * **리밋에 걸리면 가입 제출 자체를 차단한다 — 20일차 안에 한 번 뒤집힌 판단이다.** 최초
 * 수정은 "리밋에 걸려도 제출은 막지 않는다"였다(`rateLimited`면 사전 중복 확인을 건너뛰고
 * `signUpWithPassword`까지 그대로 진행, 실제 중복이면 `createProfile`의 UNIQUE 제약이 최종
 * 판정하는 방향). **BOARD가 이 판단이 만든 새 결함을 찾았다** — `rateLimited`로 사전 확인을
 * 건너뛰면 `signUpWithPassword`가 성공해 **실 `auth.users` 행이 먼저 생기고**, 그다음
 * `createProfile`이 `23505`(handle 중복)로 실패하는데 **그 `auth.users` 행을 되돌리는 코드가
 * 없다**(Admin API 삭제 호출 없음, grep 확인) — 사용자에겐 "핸들이 이미 사용 중"만 보이지만
 * 실제로는 이메일이 소모된 고아 계정이 하나 남고, 그 계정으로 로그인하면 `getAuthSession()`
 * 이 `forbidden`을 반환하는 복구 불가능한 막다른 골목이 된다. 기존에도 "동시에 같은 핸들로
 * 제출하는 진짜 레이스"는 같은 실패 지점을 탈 수 있었지만 확률이 낮았다 — `rateLimited` 스킵은
 * "리밋 소진 + 고른 핸들이 이미 존재"라는 훨씬 흔한 조합에서 **단일 요청으로 결정론적으로**
 * 이 경로를 연다(예: 공유 IP에서 동료들이 blur로 리밋을 먼저 소진한 상태). **그래서
 * 뒤집었다** — `rateLimited`면 `handleTaken`과 명확히 구분되는 전용 필드 오류로 제출을 막고,
 * 사용자는 리밋 윈도(60초) 뒤 재시도한다. Admin API로 `auth.users`를 사후 정리하는 대안(BOARD
 * 제안 (b))은 "정리 자체가 실패하면?"이라는 재귀적 문제를 새로 만들어 채택하지 않았다 — 이
 * 결정은 D-047과 상충하지 않는다(D-047의 목표는 "무제한 → 로테이션 비용이 드는 상태"였지
 * "리밋에 걸려도 통과시킨다"가 아니었다). 근거 전문:
 * `docs/prioritization-and-risks.md` D-047, `docs/ISSUES.md` I-065.
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

  // I-065 major① 해소 — checkHandleAvailabilityAction 하나로 형식·중복·리밋을 한 번에
  // 판정한다(위 docstring 참고). rateLimited는 이제 제출을 막는다 — 건너뛰면 signUpWithPassword
  // 가 먼저 실 auth.users 행을 만들어 버려, 그 뒤 handle UNIQUE 위반으로 되돌릴 수 없는 고아
  // 계정이 남는다(BOARD 20일차 발견, 팀장이 최초 판단을 뒤집었다). handleTaken과 다른 문구를
  // 써서 "재시도하면 된다"는 걸 명확히 한다.
  const handleAvailability = await checkHandleAvailabilityAction(handle);
  if (!handleAvailability.format.valid) {
    fieldErrors.handle = strings.auth.signup.errors.handleInvalidFormat;
  } else if (handleAvailability.rateLimited) {
    fieldErrors.handle = strings.auth.signup.errors.handleCheckRateLimited;
  } else if (handleAvailability.available === false) {
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
  // 위에서 이미 검사했지만(rateLimited면 애초에 여기 도달하지 않는다 — 위에서 제출 자체를
  // 막았다) 그 사이 진짜 경쟁(같은 핸들로 동시 가입)이 있으면 이 UNIQUE 제약이 마지막
  // 방어선으로 잡는다 — 이 경우엔 auth.users 고아 행이 드물게 남을 수 있지만(동시성 자체의
  // 근본 한계, 이번 회차 범위 밖), rateLimited로 인한 결정론적 발생은 위에서 이미 제거했다.
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
