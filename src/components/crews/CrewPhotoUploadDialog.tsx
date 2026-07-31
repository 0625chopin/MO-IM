"use client";

import { CheckCircle2Icon, ImagePlus, Loader2Icon } from "lucide-react";
import { useActionState, useState } from "react";

import type { CrewPhotoMeetupOption } from "@/components/crews/crew-photo-view-models";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  uploadCrewPhotoAction,
  type UploadCrewPhotoFormState,
} from "@/lib/actions/upload-crew-photo";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

const INITIAL_STATE: UploadCrewPhotoFormState = {};

/** 파일 입력의 `accept` — 버킷·Server Action의 허용 목록과 같은 형식들이다. */
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export interface CrewPhotoUploadDialogProps {
  crewId: Id;
  /** 연결할 수 있는 모임 목록(지난 모임). 비어 있으면 그 필드 자체를 그리지 않는다. */
  meetupOptions: CrewPhotoMeetupOption[];
}

/**
 * 활동 사진 업로드 다이얼로그(팀장 요청). 유일한 클라이언트 경계 — 파일 선택 상태와 제출
 * 진행 상태를 소유한다. 권한은 컨테이너가 이미 판정해 이 컴포넌트를 그릴지 말지 정했고,
 * Server Action이 요청 자체를 다시 검증한다(Server Function은 UI를 거치지 않고 직접 POST될
 * 수 있다) — 그래서 실패 응답을 항상 화면에 그린다.
 *
 * **모임 선택 값은 `Select`가 아니라 hidden input이 실어 보낸다.** Base UI `Select`는 폼
 * 제출에 값을 싣는 방식이 브라우저 네이티브 `<select>`와 달라, 값의 출처를 하나로 묶어 두는
 * 편이 읽기 쉽다 — 선택 상태는 여기 `useState` 하나가 갖고, 폼은 그 값을 그대로 보낸다.
 *
 * **성공해도 다이얼로그를 코드가 닫지 않는다** — 버튼이 "올렸어요"로 바뀌고 닫는 것은
 * 사용자 몫이다(`InviteMemberDialog`와 같은 관례). 성공 응답을 보고 `useEffect`에서 상태를
 * 되돌리는 방식은 효과 안에서의 연쇄 렌더를 만들고, 이 저장소의 lint 규칙이 그걸 막는다.
 * 서버가 이미 `refresh()`로 목록을 갱신하므로 다이얼로그 뒤의 갤러리는 닫는 즉시 새 사진을
 * 보여준다.
 */
export function CrewPhotoUploadDialog({ crewId, meetupOptions }: CrewPhotoUploadDialogProps) {
  const s = strings.crew.photos.upload;
  const [state, formAction, isPending] = useActionState(uploadCrewPhotoAction, INITIAL_STATE);
  const [meetupId, setMeetupId] = useState<string>("");

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>
        <ImagePlus aria-hidden="true" />
        {s.button}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{s.dialogTitle}</DialogTitle>
          <DialogDescription>{s.dialogDescription}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="crewId" value={crewId} />
          <input type="hidden" name="meetupId" value={meetupId} />

          <Field>
            <FieldLabel htmlFor="crew-photo-file">{s.fileLabel}</FieldLabel>
            <Input
              id="crew-photo-file"
              name="file"
              type="file"
              accept={ACCEPT}
              required
              disabled={isPending}
              className="file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-sm file:text-secondary-foreground"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="crew-photo-caption">{s.captionLabel}</FieldLabel>
            <Textarea
              id="crew-photo-caption"
              name="caption"
              rows={2}
              maxLength={500}
              placeholder={s.captionPlaceholder}
              disabled={isPending}
            />
          </Field>

          {meetupOptions.length > 0 && (
            <Field>
              <FieldLabel htmlFor="crew-photo-meetup">{s.meetupLabel}</FieldLabel>
              <Select value={meetupId} onValueChange={(value) => setMeetupId(String(value ?? ""))}>
                <SelectTrigger id="crew-photo-meetup" disabled={isPending}>
                  <SelectValue placeholder={s.meetupNone} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{s.meetupNone}</SelectItem>
                  {meetupOptions.map((option) => (
                    <SelectItem key={option.meetupId} value={option.meetupId}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {state.formError && (
            <p role="alert" className="text-sm text-destructive">
              {state.formError}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending || state.success}>
              {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              {state.success && <CheckCircle2Icon aria-hidden="true" className="size-3.5" />}
              {isPending ? s.submitPending : state.success ? s.uploadedNotice : s.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
