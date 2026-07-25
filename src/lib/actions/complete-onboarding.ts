"use server";

import { redirect } from "next/navigation";

import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { setOnboardingCompleteCookie } from "@/components/shell/onboarding-flag-cookie";
import { updateProfile } from "@/lib/data";
import { validateDisplayName } from "@/lib/rules/display-name-validation";
import { strings } from "@/lib/strings";

/**
 * FR-004(온보딩에서의 프로필 확정) Server Action. `OnboardingForm`이 건다.
 *
 * **핸들은 이 액션이 다루지 않는다.** 핸들은 FR-001(가입)에서 이미 확정됐고, `lib/data`의
 * `UpdateProfileInput`(`profile.ts`)이 애초에 `handle`을 받지 않는다 — 핸들 변경은 FR-004
 * AC1(30일 1회 제한)이 적용되는 별도 플로우로, `lib/rules/handle-validation.ts`의
 * `canChangeHandle`이 그 플로우(계정 설정 화면, CREW 몫)를 위해 이미 준비돼 있다. 온보딩은
 * 표시 이름 확정과 검색 노출 여부(searchOptOut)만 다룬다.
 *
 * **Task 030(17일차)부터 세션은 실 Supabase Auth다.** `setMockSessionCookie`/
 * `patchMockSessionCookie`는 제거됐다 — 세션 자체(`@supabase/ssr`의 httpOnly 쿠키)는 이제
 * 이 액션이 건드리지 않는다(로그인/가입 액션만 다룬다). 이 액션이 쓰는 건 "온보딩을
 * 마쳤는가"만 근사하는 보조 쿠키(`onboarding-flag-cookie.ts`)뿐이다 — `profiles` 스키마에
 * 이 사실을 담을 컬럼이 없는 전환기 한계는 그 파일 docstring 참고.
 *
 * **알려진 한계**: `updateProfile`(`@/lib/data`)의 쓰기 경로는 아직 mock 저장소다(Task 032가
 * 실데이터로 옮긴다, `docs/decisions/read-path-realdata-031.md`). 그래서 mock 시드에 없는
 * 실 계정(예: Task 030이 만든 테스트 계정 2개)이 온보딩을 제출하면 `not_found`로 실패한다 —
 * 이 액션의 버그가 아니라 쓰기 경로 전환이 아직 안 끝난 상태다. `docs/decisions/
 * auth-integration-030.md` §5에 남겼다.
 */
export interface OnboardingFieldErrors {
  displayName?: string;
}

export interface OnboardingFormState {
  fieldErrors: OnboardingFieldErrors;
  formError?: string;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). `OnboardingForm`이 `OnboardingFormState` 타입만 가져다
// 직접 만든다.

export async function completeOnboardingAction(
  _prevState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    // 세션 만료 등 — FR-002 E3(재로그인 유도)에 준한다. throw 대신 폼 오류로 표현한다(D-030 ③).
    return { fieldErrors: {}, formError: strings.auth.onboarding.errors.sessionExpired };
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  const searchOptOut = formData.get("searchOptOut") === "on";

  const displayNameCheck = validateDisplayName(displayName);
  if (!displayNameCheck.valid) {
    return {
      fieldErrors: {
        displayName: displayNameCheck.violations.includes("required")
          ? strings.auth.onboarding.errors.displayNameRequired
          : strings.auth.onboarding.errors.displayNameTooLong,
      },
    };
  }

  const updated = await updateProfile(session.profileId, { displayName, searchOptOut });
  if (!updated.ok) {
    return { fieldErrors: {}, formError: strings.error.conflict.description };
  }

  await setOnboardingCompleteCookie(session.profileId);

  redirect("/home");
}
