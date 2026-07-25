"use server";

import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { updateProfile } from "@/lib/data";
import { validateBio } from "@/lib/rules/bio-validation";
import { validateDisplayName } from "@/lib/rules/display-name-validation";
import { strings } from "@/lib/strings";

/**
 * FR-004 계정 설정 — 표시 이름·소개·검색 노출 여부 저장 Server Action(Task 015B).
 * `ProfileEditForm`이 `useActionState(updateAccountProfileAction, ...)`로 건다.
 *
 * **핸들은 이 액션이 다루지 않는다** — `change-account-handle.ts`가 별도로 처리한다(FR-004
 * AC1의 30일 쿨다운이라는 별도의 실패 모드 때문, 그 파일 docstring 참고). 이 액션은
 * `completeOnboardingAction`(온보딩)과 같은 필드(displayName·searchOptOut)에 `bio`만
 * 더한 상위 집합이다 — 온보딩은 최초 1회 확정, 이 액션은 그 이후 언제든 재저장이라 별도
 * 액션으로 남긴다(온보딩 라우트 가드와 무관하게 동작해야 한다).
 */
export interface AccountProfileFieldErrors {
  displayName?: string;
  bio?: string;
}

export interface AccountProfileFormState {
  fieldErrors: AccountProfileFieldErrors;
  formError?: string;
  /** 저장 성공 직후 한 번만 "저장했어요" 안내를 보여주기 위한 플래그. */
  success?: boolean;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). 호출부(`ProfileEditForm`)가 타입만 가져다 직접 만든다.

export async function updateAccountProfileAction(
  _prevState: AccountProfileFormState,
  formData: FormData,
): Promise<AccountProfileFormState> {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    // 세션 만료 — FR-002 E3에 준한다. throw 대신 폼 오류로 표현한다(D-030 ③).
    return { fieldErrors: {}, formError: strings.account.settings.errors.sessionExpired };
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  const bioRaw = String(formData.get("bio") ?? "").trim();
  const searchOptOut = formData.get("searchOptOut") === "on";

  const fieldErrors: AccountProfileFieldErrors = {};

  const displayNameCheck = validateDisplayName(displayName);
  if (!displayNameCheck.valid) {
    fieldErrors.displayName = displayNameCheck.violations.includes("required")
      ? strings.account.settings.errors.displayNameRequired
      : strings.account.settings.errors.displayNameTooLong;
  }

  const bioCheck = validateBio(bioRaw);
  if (!bioCheck.valid) {
    fieldErrors.bio = strings.account.settings.errors.bioTooLong;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const updated = await updateProfile(session.profileId, {
    displayName,
    bio: bioRaw.length > 0 ? bioRaw : null,
    searchOptOut,
  });
  if (!updated.ok) {
    return { fieldErrors: {}, formError: strings.account.settings.errors.loadFailed };
  }

  // Task 030부터 세션은 매 요청 `getAuthSession()`이 `profiles`를 다시 읽어 만든다(쿠키에
  // displayName을 캐시하지 않는다) — 별도 세션 패치 없이 다음 렌더에서 바로 반영된다.

  return { fieldErrors: {}, success: true };
}
