"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { getCrewHomeHref } from "@/components/crews/crew-links";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { createCrew } from "@/lib/data";
import { isValidCrewCategory } from "@/lib/rules/crew-category";
import { validateCrewDescription } from "@/lib/rules/crew-description-validation";
import { validateCrewName } from "@/lib/rules/crew-name-validation";
import { DEFAULT_CREW_VISIBILITY, isValidCrewVisibility } from "@/lib/rules/crew-visibility";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";
import type { CrewVisibility } from "@/lib/types";

/**
 * FR-010 크루 개설 Server Action(SC-08, D-008, D-016, Task 016B). `CrewCreateForm`이
 * `useActionState(createCrewAction, ...)`로 건다.
 *
 * **인증·권한 검사가 여기 있다** — `(app)/crews/new`는 이미 인증 라우트지만(D-030 ④), Server
 * Action은 그 페이지를 거치지 않고 직접 POST될 수 있다(`search-user-by-handle.ts`와 같은
 * 경고). `crew:create` 매트릭스 행은 `guest: deny`, 그 외 전부 `allow`라 역할 세분화가
 * 필요 없다 — `member`로 고정해도 무방하지만, 실제 세션의 인증 여부만으로 role을 좁혀
 * `searchUserByHandleAction`과 같은 형태를 맞췄다.
 *
 * **색상은 이 액션이 다루지 않는다(D-016)** — `createCrew`(`lib/data/mock/crew.ts`)가 크루
 * id를 만든 직후 내부에서 `hash(crew.id) mod 12`를 계산한다. 이 액션은 크루명·소개·카테고리·
 * 공개 범위 넷만 검증한다(FR-010 "개설 폼의 입력 항목은 크루명·소개·카테고리·공개 범위 넷이다").
 *
 * **`refresh()`를 `redirect()` 앞에 추가(19일차, I-061 점검 확대)** — 원래는 `redirect()`만
 * 호출했다. `leave-crew.ts` docstring이 "createCrewAction과 같은 이유로 refresh() 대신
 * redirect()를 쓴다"고 이 파일을 근거로 인용하고 있었는데, 그 가정 자체가
 * `restore-account.ts`(I-061)에서 실제로 틀렸다고 확인됐다 — `redirect()`는 예외를 던져
 * 렌더를 즉시 끝내므로 `refresh()`는 반드시 그 앞에 있어야 한다. 이 액션 자체에서 헤더 미갱신
 * 같은 증상을 직접 관찰하지는 못했다(Playwright 세션 제약, 배선만 선제 수정) — 상세는
 * `docs/ISSUES.md` I-061.
 */
export interface CreateCrewFieldErrors {
  name?: string;
  description?: string;
  category?: string;
}

export interface CreateCrewFormState {
  fieldErrors: CreateCrewFieldErrors;
  formError?: string;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). 호출부(`CrewCreateForm`)가 타입만 가져다 직접 만든다.

export async function createCrewAction(
  _prevState: CreateCrewFormState,
  formData: FormData,
): Promise<CreateCrewFormState> {
  const session = await getAuthSession();
  const role = session.status === "authenticated" ? "member" : "guest";
  const permission = checkPermission({ role, action: "crew:create" });
  if (!permission.allowed || session.status !== "authenticated") {
    // 세션 만료 등 — FR-002 E3에 준한다. throw 대신 폼 오류로 표현한다(D-030 ③).
    return { fieldErrors: {}, formError: strings.crew.create.errors.sessionExpired };
  }

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const visibilityRaw = String(formData.get("visibility") ?? "");
  const visibility: CrewVisibility = isValidCrewVisibility(visibilityRaw)
    ? visibilityRaw
    : DEFAULT_CREW_VISIBILITY;

  const fieldErrors: CreateCrewFieldErrors = {};

  const nameCheck = validateCrewName(name);
  if (!nameCheck.valid) {
    fieldErrors.name = nameCheck.violations.includes("required")
      ? strings.crew.create.errors.nameRequired
      : nameCheck.violations.includes("banned_word")
        ? strings.crew.create.errors.nameBannedWord
        : strings.crew.create.errors.nameTooLong;
  }

  const descriptionCheck = validateCrewDescription(description);
  if (!descriptionCheck.valid) {
    fieldErrors.description = descriptionCheck.violations.includes("required")
      ? strings.crew.create.errors.descriptionRequired
      : strings.crew.create.errors.descriptionTooLong;
  }

  if (!isValidCrewCategory(category)) {
    fieldErrors.category = strings.crew.create.errors.categoryRequired;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const crew = await createCrew({
    name,
    description,
    category,
    visibility,
    ownerId: session.profileId,
  });

  refresh();
  redirect(getCrewHomeHref(crew.id));
}
