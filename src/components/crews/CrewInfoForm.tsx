"use client";

import { CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { useActionState } from "react";

import { CrewColorDot } from "@/components/crews/CrewColorDot";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
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
import { updateCrewInfoAction, type UpdateCrewInfoFormState } from "@/lib/actions/update-crew-info";
import { CREW_PALETTE } from "@/lib/crew-palette";
import { CREW_CATEGORIES } from "@/lib/rules/crew-category";
import { CREW_DESCRIPTION_MAX_LENGTH } from "@/lib/rules/crew-description-validation";
import { CREW_NAME_MAX_LENGTH } from "@/lib/rules/crew-name-validation";
import { strings, t } from "@/lib/strings";
import type { Id } from "@/lib/types";

const INITIAL_UPDATE_INFO_STATE: UpdateCrewInfoFormState = { fieldErrors: {} };

export interface CrewInfoFormProps {
  crewId: Id;
  initialName: string;
  initialDescription: string;
  initialCategory: string;
  initialColorKey: number;
}

/**
 * FR-011 크루 정보 수정 폼(SC-15, D-016, Task 017B) — 이름·소개·카테고리·캘린더 색상. 임원
 * 이상이면 이 폼 자체가 보인다(`CrewSettingsContainer`가 `crew:update_info`로 이미 걸렀다,
 * D-030 ①·R-015 — 이 컴포넌트는 판정을 다시 하지 않는다).
 *
 * **색상은 팔레트 12색으로 제한된 라디오 그룹**이다(D-016 — "변경은 크루 설정에서만", 개설
 * 폼은 색을 묻지 않는다). 자유 색상 입력을 허용하지 않아 접근성(NFR-018 대비)·크루 12색
 * 불변식이 항상 유지된다 — 어떤 값을 골라도 이미 검증된 팔레트 안이다.
 */
export function CrewInfoForm({
  crewId,
  initialName,
  initialDescription,
  initialCategory,
  initialColorKey,
}: CrewInfoFormProps) {
  const [state, formAction, isPending] = useActionState(updateCrewInfoAction, INITIAL_UPDATE_INFO_STATE);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="crewId" value={crewId} />
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors.name)}>
          <FieldLabel htmlFor="crew-settings-name">{strings.crew.settings.info.fields.name}</FieldLabel>
          <Input
            id="crew-settings-name"
            name="name"
            required
            defaultValue={initialName}
            maxLength={CREW_NAME_MAX_LENGTH}
            aria-invalid={Boolean(state.fieldErrors.name)}
            aria-describedby={state.fieldErrors.name ? "crew-settings-name-error" : undefined}
          />
          {state.fieldErrors.name && (
            <FieldError id="crew-settings-name-error">{state.fieldErrors.name}</FieldError>
          )}
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors.description)}>
          <FieldLabel htmlFor="crew-settings-description">
            {strings.crew.settings.info.fields.description}
          </FieldLabel>
          <Textarea
            id="crew-settings-description"
            name="description"
            required
            defaultValue={initialDescription}
            maxLength={CREW_DESCRIPTION_MAX_LENGTH}
            aria-invalid={Boolean(state.fieldErrors.description)}
            aria-describedby={state.fieldErrors.description ? "crew-settings-description-error" : undefined}
          />
          {state.fieldErrors.description && (
            <FieldError id="crew-settings-description-error">{state.fieldErrors.description}</FieldError>
          )}
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors.category)}>
          <FieldLabel htmlFor="crew-settings-category">{strings.crew.settings.info.fields.category}</FieldLabel>
          <Select name="category" defaultValue={initialCategory}>
            <SelectTrigger
              id="crew-settings-category"
              aria-invalid={Boolean(state.fieldErrors.category)}
              aria-describedby={state.fieldErrors.category ? "crew-settings-category-error" : undefined}
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
            <FieldError id="crew-settings-category-error">{state.fieldErrors.category}</FieldError>
          )}
        </Field>

        <FieldSet>
          <FieldLegend variant="label">{strings.crew.settings.info.fields.color}</FieldLegend>
          <RadioGroup name="colorKey" defaultValue={String(initialColorKey)} className="grid-cols-6 gap-3">
            {CREW_PALETTE.map((color) => (
              <FieldLabel
                key={color.index}
                htmlFor={`crew-settings-color-${color.index}`}
                // 10일차 접근성 QA 이슈 B — 스와치 자체(size-6=24px)는 NFR-027 24px 하한에 딱
                // 걸려 여유가 없었다. 다른 3건(HomeCalendarSummary 등)이 py-1로 여유를 둔 것과
                // 기준을 맞추기 위해 라벨에 px-2 py-1을 더해 히트 영역을 가로·세로 모두 24px
                // 초과로 넓힌다(닷 자체의 시각 크기는 그대로 24px 유지).
                className="flex cursor-pointer flex-col items-center gap-1 rounded-md px-2 py-1 font-normal"
              >
                <RadioGroupItem
                  id={`crew-settings-color-${color.index}`}
                  value={String(color.index)}
                  aria-label={t((s) => s.crew.settings.info.colorOptionLabel, {
                    n: color.index + 1,
                    name: color.nameKo,
                  })}
                  className="peer sr-only"
                />
                <CrewColorDot
                  colorIndex={color.index}
                  className="size-6 rounded-full ring-offset-2 ring-offset-background peer-data-checked:ring-2 peer-data-checked:ring-foreground"
                />
              </FieldLabel>
            ))}
          </RadioGroup>
        </FieldSet>
      </FieldGroup>

      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}

      <FieldContent>
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          {state.success && !isPending && <CheckCircle2Icon aria-hidden="true" />}
          {isPending
            ? strings.crew.settings.info.submitPending
            : state.success
              ? strings.crew.settings.info.saved
              : strings.crew.settings.info.submit}
        </Button>
      </FieldContent>
    </form>
  );
}
