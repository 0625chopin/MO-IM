"use client";

import { CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  updateCrewVisibilityAction,
  type UpdateCrewVisibilityFormState,
} from "@/lib/actions/update-crew-visibility";
import { CREW_VISIBILITIES } from "@/lib/rules/crew-visibility";
import { strings } from "@/lib/strings";
import type { CrewVisibility, Id } from "@/lib/types";

const INITIAL_UPDATE_VISIBILITY_STATE: UpdateCrewVisibilityFormState = {};

export interface CrewVisibilityFormProps {
  crewId: Id;
  initialVisibility: CrewVisibility;
}

/**
 * FR-012 크루 공개 범위 변경 폼(SC-15, D-007, D-002, Task 017B). 오너 전용 —
 * `CrewSettingsContainer`가 `crew:update_visibility`(오너만 allow)로 이미 걸러야만 이 폼이
 * 렌더된다(R-015, 이 컴포넌트는 판정을 다시 하지 않는다). `CrewInfoForm`과 별도 폼·별도
 * 액션으로 분리한 이유는 `update-crew-visibility.ts` 모듈 docstring 참고(권한 등급이 다르다).
 *
 * 선택지는 `CREW_VISIBILITIES`(`lib/rules/crew-visibility.ts`)를 순회해 만든다 — 개설 폼
 * (`CrewCreateForm`)과 같은 목록·같은 라벨 소스를 쓰므로 "개설 때 고를 수 있던 공개 범위가
 * 설정에서는 안 보이는" 어긋남이 생기지 않는다.
 */
export function CrewVisibilityForm({ crewId, initialVisibility }: CrewVisibilityFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateCrewVisibilityAction,
    INITIAL_UPDATE_VISIBILITY_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="crewId" value={crewId} />
      <FieldSet>
        <FieldLegend variant="label">{strings.crew.settings.visibility.heading}</FieldLegend>
        <FieldDescription>{strings.crew.settings.visibility.description}</FieldDescription>
        <RadioGroup name="visibility" defaultValue={initialVisibility}>
          {CREW_VISIBILITIES.map((visibility) => (
            <Field key={visibility} orientation="horizontal">
              <RadioGroupItem id={`crew-settings-visibility-${visibility}`} value={visibility} />
              <FieldContent>
                <FieldLabel htmlFor={`crew-settings-visibility-${visibility}`}>
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

      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}

      <div>
        <Button type="submit" disabled={isPending} variant="outline">
          {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          {state.success && !isPending && <CheckCircle2Icon aria-hidden="true" />}
          {isPending
            ? strings.crew.settings.visibility.submitPending
            : state.success
              ? strings.crew.settings.visibility.saved
              : strings.crew.settings.visibility.submit}
        </Button>
      </div>
    </form>
  );
}
