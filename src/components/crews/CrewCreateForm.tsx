"use client";

import { Loader2Icon } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CreateCrewFormState } from "@/lib/actions/create-crew";
import { createCrewAction } from "@/lib/actions/create-crew";
import { CREW_CATEGORIES } from "@/lib/rules/crew-category";
import { CREW_DESCRIPTION_MAX_LENGTH } from "@/lib/rules/crew-description-validation";
import { CREW_NAME_MAX_LENGTH } from "@/lib/rules/crew-name-validation";
import { CREW_VISIBILITIES, DEFAULT_CREW_VISIBILITY } from "@/lib/rules/crew-visibility";
import { strings } from "@/lib/strings";

/** `'use server'` 파일은 async 함수만 export할 수 있다(`signup.ts` docstring 참고) —
 *  초기 상태는 타입만 가져와 여기서 만든다. */
const INITIAL_CREATE_CREW_STATE: CreateCrewFormState = { fieldErrors: {} };

/**
 * FR-010 크루 개설 폼(SC-08, D-016, Task 016B). 색상 입력 필드가 없다 — 개설 시 자동 배정되고
 * 변경은 크루 설정(SC-15, FR-011)에서만 한다.
 *
 * `CREW_CATEGORIES`(`lib/rules/crew-category.ts`)가 카테고리 select의 유일한 소스다 —
 * Task 016A(크루 탐색, 같은 담당자 후속 회차)의 카테고리 필터도 같은 목록을 재사용해야
 * 개설 폼에서 고른 카테고리가 탐색 필터에서도 그대로 잡힌다.
 *
 * 공개 범위 라디오도 같은 방식이다 — `CREW_VISIBILITIES`(`lib/rules/crew-visibility.ts`)를
 * 순회해 만들고, 라벨·설명은 코드값을 키로 `strings.crew.create.visibilityOptions`에서
 * 꺼낸다. `createCrewAction`이 제출값을 판정할 때 쓰는 목록과 같은 배열이라 "폼에만 있고
 * 액션은 모르는 선택지"가 생길 수 없다.
 */
export function CrewCreateForm() {
  const [state, formAction, isPending] = useActionState(createCrewAction, INITIAL_CREATE_CREW_STATE);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors.name)}>
          <FieldLabel htmlFor="crew-create-name">{strings.crew.create.fields.name}</FieldLabel>
          <Input
            id="crew-create-name"
            name="name"
            required
            maxLength={CREW_NAME_MAX_LENGTH}
            aria-invalid={Boolean(state.fieldErrors.name)}
            aria-describedby={state.fieldErrors.name ? "crew-create-name-error" : undefined}
          />
          {state.fieldErrors.name && (
            <FieldError id="crew-create-name-error">{state.fieldErrors.name}</FieldError>
          )}
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors.description)}>
          <FieldLabel htmlFor="crew-create-description">
            {strings.crew.create.fields.description}
          </FieldLabel>
          <Textarea
            id="crew-create-description"
            name="description"
            required
            maxLength={CREW_DESCRIPTION_MAX_LENGTH}
            // 소개 입력란은 높이를 고정한다 — ui/textarea 기본값인 `field-sizing-content`(내용에
            // 따라 자동 확장)와 브라우저 기본 리사이즈 핸들을 함께 끄고, 넘치면 내부 스크롤.
            className="h-32 min-h-32 resize-none field-sizing-fixed"
            aria-invalid={Boolean(state.fieldErrors.description)}
            aria-describedby={state.fieldErrors.description ? "crew-create-description-error" : undefined}
          />
          {state.fieldErrors.description && (
            <FieldError id="crew-create-description-error">{state.fieldErrors.description}</FieldError>
          )}
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors.category)}>
          <FieldLabel htmlFor="crew-create-category">{strings.crew.create.fields.category}</FieldLabel>
          <Select name="category">
            <SelectTrigger
              id="crew-create-category"
              aria-invalid={Boolean(state.fieldErrors.category)}
              aria-describedby={state.fieldErrors.category ? "crew-create-category-error" : undefined}
              className="w-full"
            >
              <SelectValue placeholder={strings.crew.create.fields.categoryPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {CREW_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.fieldErrors.category && (
            <FieldError id="crew-create-category-error">{state.fieldErrors.category}</FieldError>
          )}
        </Field>

        <FieldSet>
          <FieldLegend variant="label">{strings.crew.create.fields.visibility}</FieldLegend>
          <RadioGroup name="visibility" defaultValue={DEFAULT_CREW_VISIBILITY}>
            {CREW_VISIBILITIES.map((visibility) => (
              <Field key={visibility} orientation="horizontal">
                <RadioGroupItem id={`crew-create-visibility-${visibility}`} value={visibility} />
                <FieldContent>
                  <FieldLabel htmlFor={`crew-create-visibility-${visibility}`}>
                    {strings.crew.create.visibilityOptions[visibility].label}
                  </FieldLabel>
                  <FieldDescription>
                    {strings.crew.create.visibilityOptions[visibility].description}
                  </FieldDescription>
                </FieldContent>
              </Field>
            ))}
          </RadioGroup>
        </FieldSet>
      </FieldGroup>

      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {isPending ? strings.crew.create.submitPending : strings.crew.create.submit}
      </Button>
    </form>
  );
}
