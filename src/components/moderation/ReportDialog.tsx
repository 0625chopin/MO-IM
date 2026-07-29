"use client";

import { FlagIcon, Loader2Icon } from "lucide-react";
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
  /** 트리거 버튼 문구를 다르게 쓰고 싶은 호출부용(기본값 "신고"). `triggerVariant="icon"`이면
   *  화면에는 보이지 않고 `aria-label`로만 쓰인다. */
  triggerLabel?: string;
  /** "button"(기본, outline 버튼 — `MemberList` 등 여유 있는 공간용) | "icon"(아이콘만,
   *  `MessageBubble`처럼 한 줄에 여러 컨트롤이 붙는 좁은 공간용 — 채팅 삭제 버튼과 같은 자리) |
   *  "text"(테두리 없는 텍스트 링크 — `CommentItem`의 답글·수정·삭제와 같은 줄에 나란히 쓴다). */
  triggerVariant?: "button" | "icon" | "text";
}

/**
 * FR-080 신고 다이얼로그(Task 042A, D-030 ① 표현 컴포넌트) — post·comment·chat_message·profile
 * 4종 어디서든 `targetType`+`targetId`만 넘기면 재사용된다. `MemberList`의 `TransferOwnershipDialog`·
 * `RemoveMemberDialog`(Task 040)와 같은 다이얼로그+`useActionState` 패턴이다.
 *
 * **`lib/data`·Supabase 클라이언트를 import하지 않는다** — 신고 대상 존재 확인은 이 컴포넌트의
 * 책임이 아니다(호출자가 이미 렌더한 대상이므로 존재는 항상 참이다, `create_report` RPC
 * docstring 참고). 그래서 컨테이너가 따로 필요 없다 — props만으로 완결된다.
 *
 * **4종 실제 배선(I-117 해소, 25일차)**: `MemberList`(`targetType="profile"`, Task 042A) ·
 * `PostActions`(`targetType="post"`) · `CommentItem`(`targetType="comment"`) ·
 * `MessageBubble`(`targetType="chat_message"`, `triggerVariant="icon"`). 이전에는 이 컴포넌트
 * 자체는 4종을 지원했지만 실제로 렌더하는 호출부가 `MemberList` 하나뿐이었다(백엔드는 4종 다
 * 완비돼 있었던 순수 UI 배선 누락).
 *
 * **중복 신고 병합 안내(25일차, 팀장 지시)**: `state.merged`가 true면 `sentNotice` 대신
 * `mergedNotice`("이미 신고한 대상이에요. 사유를 갱신했어요")를 보여준다 — `createReportAction`
 * (`src/lib/actions/create-report.ts`)이 `createReport`의 `merged` 응답을 그대로 옮겨 준다.
 * 신고 진입점이 이 회차에 1곳→4곳으로 늘면서 같은 대상을 두 번 신고하는 경로가 실사용
 * 가능해져, 접수 성공 문구가 "첫 신고"와 "중복 신고"를 구분하지 못하면 사용자가 오인할 수
 * 있었다(FR-080 AC1 "중복 신고는 1건으로 합쳐진다"에 이미 문구가 있었는데 안 쓰이고 있었다).
 */
export function ReportDialog({
  targetType,
  targetId,
  triggerLabel,
  triggerVariant = "button",
}: ReportDialogProps) {
  const [state, formAction, isPending] = useActionState(createReportAction, INITIAL_STATE);
  const label = triggerLabel ?? strings.report.trigger;

  return (
    <Dialog>
      {triggerVariant === "icon" ? (
        <DialogTrigger
          render={
            <button
              type="button"
              aria-label={label}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            />
          }
        >
          <FlagIcon aria-hidden="true" className="size-3.5" />
        </DialogTrigger>
      ) : triggerVariant === "text" ? (
        <DialogTrigger
          render={
            <button
              type="button"
              className="font-medium text-muted-foreground hover:text-foreground"
            />
          }
        >
          {label}
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
          {label}
        </DialogTrigger>
      )}
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
              {state.merged ? strings.report.mergedNotice : strings.report.sentNotice}
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
