"use client";

import { Loader2Icon } from "lucide-react";
import { useActionState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { createReportAction, type CreateReportFormState } from "@/lib/actions/create-report";
import { strings } from "@/lib/strings";
import type { Id, ReportTargetType } from "@/lib/types";

const INITIAL_STATE: CreateReportFormState = {};

export interface ReportDialogProps {
  targetType: ReportTargetType;
  targetId: Id;
  /** 트리거 버튼 문구를 다르게 쓰고 싶은 호출부용(기본값 "신고"). */
  triggerLabel?: string;
}

/**
 * FR-080 신고 다이얼로그(Task 042A, D-030 ① 표현 컴포넌트) — post·comment·chat_message·profile
 * 4종 어디서든 `targetType`+`targetId`만 넘기면 재사용된다. `MemberList`의 `TransferOwnershipDialog`·
 * `RemoveMemberDialog`(Task 040)와 같은 다이얼로그+`useActionState` 패턴이다.
 *
 * **`lib/data`·Supabase 클라이언트를 import하지 않는다** — 신고 대상 존재 확인은 이 컴포넌트의
 * 책임이 아니다(호출자가 이미 렌더한 대상이므로 존재는 항상 참이다, `create_report` RPC
 * docstring 참고). 그래서 컨테이너가 따로 필요 없다 — props만으로 완결된다.
 */
export function ReportDialog({ targetType, targetId, triggerLabel }: ReportDialogProps) {
  const [state, formAction, isPending] = useActionState(createReportAction, INITIAL_STATE);

  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
        {triggerLabel ?? strings.report.trigger}
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{strings.report.dialogTitle}</DialogTitle>
            <DialogDescription>{strings.report.dialogDescription}</DialogDescription>
          </DialogHeader>

          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />

          {state.formError && (
            <p role="alert" className="text-sm text-destructive">
              {state.formError}
            </p>
          )}
          {state.success && (
            <p role="status" className="text-sm text-muted-foreground">
              {strings.report.sentNotice}
            </p>
          )}

          <Field>
            <FieldLabel htmlFor={`report-reason-${targetType}-${targetId}`}>
              {strings.report.reasonLabel}
            </FieldLabel>
            <Textarea
              id={`report-reason-${targetType}-${targetId}`}
              name="reason"
              placeholder={strings.report.reasonPlaceholder}
              required
              rows={3}
            />
          </Field>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {strings.report.cancel}
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              {isPending ? strings.report.submitPending : strings.report.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
