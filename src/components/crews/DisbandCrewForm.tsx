"use client";

import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { disbandCrewAction, type DisbandCrewFormState } from "@/lib/actions/disband-crew";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

const INITIAL_DISBAND_STATE: DisbandCrewFormState = {};

export interface DisbandCrewFormProps {
  crewId: Id;
  crewName: string;
}

/**
 * FR-013 크루 해산(D-009 후반, Task 040) — 크루 설정 화면의 오너 전용 섹션. `CrewSettingsContainer`
 * 가 `crew:disband`(오너만 allow)로 이미 걸러야만 이 폼이 렌더된다(R-015, `CrewVisibilityForm`과
 * 같은 원칙). 되돌릴 수 없는 조작이라 `AccountWithdrawSection`(FR-005 탈퇴)과 같은 다이얼로그 +
 * 재입력 확인 패턴을 쓰되, 비밀번호 대신 크루명을 확인한다(오너는 이미 인가된 세션이라 재인증이
 * 필요 없다 — 크루명 재입력은 오클릭 방지용 UX 확인일 뿐이다, `disband-crew.ts` docstring 참고).
 */
export function DisbandCrewForm({ crewId, crewName }: DisbandCrewFormProps) {
  const [state, formAction, isPending] = useActionState(disbandCrewAction, INITIAL_DISBAND_STATE);

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <div>
        <h2 className="text-sm font-medium text-foreground">{strings.crew.settings.disband.trigger}</h2>
        <p className="text-sm text-muted-foreground">{strings.crew.settings.disband.dialogDescription}</p>
      </div>

      <Dialog>
        <DialogTrigger render={<Button type="button" variant="destructive" className="w-fit" />}>
          {strings.crew.settings.disband.trigger}
        </DialogTrigger>
        <DialogContent>
          <form action={formAction} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{strings.crew.settings.disband.dialogTitle}</DialogTitle>
              <DialogDescription>{strings.crew.settings.disband.dialogDescription}</DialogDescription>
            </DialogHeader>

            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              <li>{strings.crew.settings.disband.noticeVotes}</li>
              <li>{strings.crew.settings.disband.noticeMeetups}</li>
              <li>{strings.crew.settings.disband.noticeChat}</li>
            </ul>

            <input type="hidden" name="crewId" value={crewId} />

            {state.formError && (
              <Alert variant="destructive">
                <AlertTriangleIcon aria-hidden="true" />
                <AlertDescription>{state.formError}</AlertDescription>
              </Alert>
            )}

            <Field>
              <FieldLabel htmlFor="disband-crew-confirm">{strings.crew.settings.disband.confirmLabel}</FieldLabel>
              <Input
                id="disband-crew-confirm"
                name="confirmName"
                placeholder={crewName || strings.crew.settings.disband.confirmPlaceholder}
                autoComplete="off"
                required
              />
            </Field>

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                {strings.crew.settings.disband.cancel}
              </DialogClose>
              <Button type="submit" variant="destructive" disabled={isPending}>
                {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
                {isPending ? strings.crew.settings.disband.submitPending : strings.crew.settings.disband.submit}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
