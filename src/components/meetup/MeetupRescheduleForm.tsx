"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { getPostDetailHref } from "@/components/board/board-links";
import { MeetupRescheduleConflict } from "@/components/meetup/MeetupRescheduleConflict";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPostAction, type CreatePostFieldErrors } from "@/lib/actions/create-post";
import { strings, t } from "@/lib/strings";
import type { Id } from "@/lib/types";

/** `PostWriteForm.tsx`와 같은 기본값(D-003 기본 투표 기한 72시간, `validatePollDuration`
 *  허용 범위 1시간~14일 안). */
const DEFAULT_VOTE_DEADLINE_HOURS = 72;

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultVoteDeadline(): string {
  return toDatetimeLocalValue(new Date(Date.now() + DEFAULT_VOTE_DEADLINE_HOURS * 60 * 60 * 1000));
}

export interface MeetupRescheduleCurrentSchedule {
  dateLabel: string;
  startTimeLabel: string | null;
  place: string | null;
  capacity: number | null;
}

export interface MeetupRescheduleFormProps {
  crewId: Id;
  /** 이 제안이 겨냥하는 기존 확정 Meetup — 사용자가 고르지 않는다(라우트가 이미 고정한다). */
  targetMeetupId: Id;
  /** 컨테이너가 이미 포맷팅해 내려준 "현재 일정" 표시용(D-030 ①) — 새로 제안하는 값과
   *  비교할 수 있도록 폼 상단에 보여준다. */
  currentSchedule: MeetupRescheduleCurrentSchedule;
}

const DENIED_MESSAGE: Record<"forbidden" | "not_found" | "conflict", string> = {
  forbidden: strings.meetup.reschedule.errors.forbidden,
  not_found: strings.meetup.reschedule.errors.notFound,
  conflict: strings.meetup.reschedule.errors.conflict,
};

/**
 * I-130(27일차) — `duplicate_proposal`은 고정 문구가 아니라 기존 제안글로 가는 링크를 함께
 * 실어야 해서(`conflictingPostId`) `DENIED_MESSAGE`(문자열 하나) 자리에 넣을 수 없다. 폼
 * 인라인 오류를 "고정 문구" | "기존 제안 링크 안내" 둘로 구분해 표현한다.
 */
type RescheduleFormError =
  | { kind: "message"; text: string }
  | { kind: "duplicate_proposal"; conflictingPostId: Id };

/**
 * "일정 변경 제안" 전용 글쓰기 폼(I-079/FR-065 AC2, 26일차 BOARD) — `PostWriteForm`의 모임
 * 제안 필드 세트와 같은 모양이지만 유형 토글이 없다(`meetup_reschedule_proposal` 고정) +
 * `targetMeetupId`를 항상 함께 보낸다. 표현/컨테이너 구분이 없는 클라이언트 경계인 이유도
 * `PostWriteForm`과 같다(임시 저장은 이 화면 범위 밖 — 진입 자체가 Meetup 상세의 버튼
 * 클릭 하나뿐이라 초안 복구 가치가 낮다).
 *
 * 성공하면 새로 만들어진 제안글(투표)로 이동한다(`getPostDetailHref`) — 일반 제안글 작성과
 * 동일한 착지점이다(재투표 자체가 FR-040·FR-041의 기존 파이프라인을 그대로 탄다).
 */
export function MeetupRescheduleForm({ crewId, targetMeetupId, currentSchedule }: MeetupRescheduleFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [meetupDate, setMeetupDate] = useState("");
  const [meetupEndDate, setMeetupEndDate] = useState("");
  const [voteDeadline, setVoteDeadline] = useState(defaultVoteDeadline);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [place, setPlace] = useState("");
  const [capacity, setCapacity] = useState("");

  const [fieldErrors, setFieldErrors] = useState<CreatePostFieldErrors>({});
  const [formError, setFormError] = useState<RescheduleFormError | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    startTransition(async () => {
      const parsedCapacity = capacity.trim() === "" ? null : Number(capacity);

      const result = await createPostAction({
        crewId,
        type: "meetup_reschedule_proposal",
        targetMeetupId,
        title,
        body,
        meetupDate,
        meetupEndDate: meetupEndDate || undefined,
        voteDeadline: voteDeadline ? new Date(voteDeadline).toISOString() : undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        place: place || undefined,
        capacity: parsedCapacity !== null && !Number.isNaN(parsedCapacity) ? parsedCapacity : null,
      });

      if (!result.ok) {
        if (result.kind === "fields") {
          setFieldErrors(result.fieldErrors);
        } else if (result.code === "duplicate_proposal") {
          setFormError({ kind: "duplicate_proposal", conflictingPostId: result.conflictingPostId });
        } else {
          setFormError({ kind: "message", text: DENIED_MESSAGE[result.code] });
        }
        return;
      }

      router.push(getPostDetailHref(crewId, result.postId));
    });
  }

  const capacityLabel =
    currentSchedule.capacity !== null
      ? t((s) => s.meetup.reschedule.capacityLabel, { capacity: currentSchedule.capacity })
      : strings.meetup.reschedule.noCapacityLabel;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{strings.meetup.reschedule.pageTitle}</h1>
        <p className="pt-1 text-sm text-muted-foreground">{strings.meetup.reschedule.description}</p>
      </div>

      <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{strings.meetup.reschedule.currentScheduleLabel}</p>
        <p className="tnum">
          {currentSchedule.dateLabel}
          {currentSchedule.startTimeLabel && <> · {currentSchedule.startTimeLabel}</>}
        </p>
        {currentSchedule.place && <p>{currentSchedule.place}</p>}
        <p className="tnum">{capacityLabel}</p>
      </div>

      <p className="text-sm text-destructive">{strings.meetup.reschedule.invalidationWarning}</p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <FieldGroup>
          <Field data-invalid={Boolean(fieldErrors.title)}>
            <FieldLabel htmlFor="meetup-reschedule-title">{strings.board.write.fields.title}</FieldLabel>
            <Input
              id="meetup-reschedule-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? "meetup-reschedule-title-error" : undefined}
            />
            {fieldErrors.title && (
              <FieldError id="meetup-reschedule-title-error">{fieldErrors.title}</FieldError>
            )}
          </Field>

          <Field data-invalid={Boolean(fieldErrors.body)}>
            <FieldLabel htmlFor="meetup-reschedule-body">{strings.board.write.fields.description}</FieldLabel>
            <Textarea
              id="meetup-reschedule-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={pending}
              rows={6}
              aria-invalid={Boolean(fieldErrors.body)}
              aria-describedby={fieldErrors.body ? "meetup-reschedule-body-error" : undefined}
            />
            {fieldErrors.body && <FieldError id="meetup-reschedule-body-error">{fieldErrors.body}</FieldError>}
          </Field>

          <Field data-invalid={Boolean(fieldErrors.scheduledDate)}>
            <FieldLabel htmlFor="meetup-reschedule-date">{strings.board.write.fields.scheduledDate}</FieldLabel>
            <Input
              id="meetup-reschedule-date"
              type="date"
              value={meetupDate}
              onChange={(event) => setMeetupDate(event.target.value)}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.scheduledDate)}
              aria-describedby={fieldErrors.scheduledDate ? "meetup-reschedule-date-error" : undefined}
            />
            {fieldErrors.scheduledDate && (
              <FieldError id="meetup-reschedule-date-error">{fieldErrors.scheduledDate}</FieldError>
            )}
          </Field>

          <Field data-invalid={Boolean(fieldErrors.scheduledEndDate)}>
            <FieldLabel htmlFor="meetup-reschedule-end-date">
              {strings.board.write.fields.scheduledEndDate}
            </FieldLabel>
            <Input
              id="meetup-reschedule-end-date"
              type="date"
              min={meetupDate || undefined}
              value={meetupEndDate}
              onChange={(event) => setMeetupEndDate(event.target.value)}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.scheduledEndDate)}
              aria-describedby={
                fieldErrors.scheduledEndDate
                  ? "meetup-reschedule-end-date-error"
                  : "meetup-reschedule-end-date-hint"
              }
            />
            {fieldErrors.scheduledEndDate ? (
              <FieldError id="meetup-reschedule-end-date-error">{fieldErrors.scheduledEndDate}</FieldError>
            ) : (
              <FieldDescription id="meetup-reschedule-end-date-hint">
                {strings.board.write.fields.scheduledEndDateHint}
              </FieldDescription>
            )}
          </Field>

          <Field data-invalid={Boolean(fieldErrors.voteDeadline)}>
            <FieldLabel htmlFor="meetup-reschedule-vote-deadline">
              {strings.board.write.fields.voteDeadline}
            </FieldLabel>
            <Input
              id="meetup-reschedule-vote-deadline"
              type="datetime-local"
              value={voteDeadline}
              onChange={(event) => setVoteDeadline(event.target.value)}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.voteDeadline)}
              aria-describedby={fieldErrors.voteDeadline ? "meetup-reschedule-vote-deadline-error" : undefined}
            />
            {fieldErrors.voteDeadline && (
              <FieldError id="meetup-reschedule-vote-deadline-error">{fieldErrors.voteDeadline}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="meetup-reschedule-start-time">{strings.board.write.fields.startTime}</FieldLabel>
            <Input
              id="meetup-reschedule-start-time"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              disabled={pending}
            />
          </Field>

          <Field data-invalid={Boolean(fieldErrors.endTime)}>
            <FieldLabel htmlFor="meetup-reschedule-end-time">{strings.board.write.fields.endTime}</FieldLabel>
            <Input
              id="meetup-reschedule-end-time"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.endTime)}
              aria-describedby={fieldErrors.endTime ? "meetup-reschedule-end-time-error" : undefined}
            />
            {fieldErrors.endTime && (
              <FieldError id="meetup-reschedule-end-time-error">{fieldErrors.endTime}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="meetup-reschedule-place">{strings.board.write.fields.location}</FieldLabel>
            <Input
              id="meetup-reschedule-place"
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              disabled={pending}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="meetup-reschedule-capacity">{strings.board.write.fields.capacity}</FieldLabel>
            <Input
              id="meetup-reschedule-capacity"
              type="number"
              min={1}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              disabled={pending}
            />
          </Field>
        </FieldGroup>

        {formError?.kind === "message" && (
          <p role="alert" className="text-sm text-destructive">
            {formError.text}
          </p>
        )}
        {formError?.kind === "duplicate_proposal" && (
          <div role="alert">
            <MeetupRescheduleConflict
              crewId={crewId}
              conflictingPostId={formError.conflictingPostId}
              className="min-h-0 items-start gap-3 rounded-lg border border-solid border-destructive/40 bg-destructive/5 p-4 text-left"
            />
          </div>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          {pending ? strings.meetup.reschedule.submitPending : strings.meetup.reschedule.submit}
        </Button>
      </form>
    </div>
  );
}
