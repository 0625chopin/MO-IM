"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";

import { getPostDetailHref } from "@/components/board/board-links";
import {
  clearPostDraft,
  PENDING_POST_DRAFT_SNAPSHOT,
  resolvePostDraftSnapshot,
  savePostDraft,
  type PostDraftValue,
} from "@/components/board/post-draft-storage";
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
import { Textarea } from "@/components/ui/textarea";
import { checkDuplicateMeetupDateAction } from "@/lib/actions/check-duplicate-meetup-date";
import { createPostAction, type CreatePostFieldErrors } from "@/lib/actions/create-post";
import { strings } from "@/lib/strings";
import type { Id, PostType } from "@/lib/types";

/** D-003 기본 투표 기한(72시간) — `poll-timezone.ts`의 `validatePollDuration` 허용 범위
 *  (1시간~14일) 안이다. 기본값 자체는 이 폼(Task 018B)의 몫이라 여기 둔다. */
const DEFAULT_VOTE_DEADLINE_HOURS = 72;

/** `datetime-local` input이 받는 "YYYY-MM-DDTHH:mm" 로컬 문자열로 변환한다. */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultVoteDeadline(): string {
  return toDatetimeLocalValue(new Date(Date.now() + DEFAULT_VOTE_DEADLINE_HOURS * 60 * 60 * 1000));
}

/** `useSyncExternalStore`가 요구하는 구독 함수. 이 저장소는 다른 탭·경로에서 갱신되는
 *  것을 실시간으로 반영할 필요가 없다(같은 브라우저에서 새로고침 후 재진입 시나리오만
 *  요구, `post-draft-storage.ts` 참고) — 구독하지 않고 항상 같은 정리 함수를 돌려준다. */
function subscribeToNothing(): () => void {
  return () => {};
}

export interface PostWriteFormProps {
  crewId: Id;
}

/**
 * 글쓰기 폼(SC-11, FR-030·034, Task 018B) — 바깥 껍데기. `useSyncExternalStore`로
 * `localStorage` 초안을 읽는다(`resolvePostDraftSnapshot`). **`useEffect` + `setState`로
 * 복구하지 않는다** — React Compiler 계열 린트(`react-hooks/set-state-in-effect`)가
 * 막을뿐더러, 서버 렌더와 하이드레이션 직후 첫 렌더가 값을 달리하면 hydration mismatch
 * 위험이 있다. `useSyncExternalStore`는 정확히 이 문제(서버와 다른 값을 가진 외부 저장소를
 * 읽는 것)를 위한 API라 `getServerSnapshot`에 고정 자리표시자를 주면 서버·하이드레이션
 * 렌더가 일치하고, 하이드레이션 직후에만 실제 값으로 다시 그린다(공식 지원 경로, 경고 없음).
 *
 * `snapshot.resolved`가 뒤집히면(자리표시자 → 실제 값) `key`를 바꿔 `PostWriteFormFields`를
 * 통째로 다시 마운트한다 — 그 컴포넌트의 모든 입력 상태는 `useState`의 **지연 초기화자**로만
 * 채워지고(`initialValues` prop) 이후 그 prop이 바뀌어도 재적용되지 않으므로, "복구된 값을
 * 기존 입력 위에 늦게 덮어쓰는" effect가 필요 없어진다.
 */
export function PostWriteForm({ crewId }: PostWriteFormProps) {
  const cacheRef = useRef<{ crewId: Id; snapshot: ReturnType<typeof resolvePostDraftSnapshot> } | null>(
    null,
  );

  function getSnapshot() {
    if (!cacheRef.current || cacheRef.current.crewId !== crewId) {
      cacheRef.current = { crewId, snapshot: resolvePostDraftSnapshot(crewId, defaultVoteDeadline) };
    }
    return cacheRef.current.snapshot;
  }

  function getServerSnapshot() {
    return PENDING_POST_DRAFT_SNAPSHOT;
  }

  const snapshot = useSyncExternalStore(subscribeToNothing, getSnapshot, getServerSnapshot);
  const formKey = snapshot.resolved ? (snapshot.restored ? "restored" : "fresh") : "pending";

  return (
    <PostWriteFormFields
      key={formKey}
      crewId={crewId}
      initialValues={snapshot.values}
      draftRestored={snapshot.restored}
    />
  );
}

interface PostWriteFormFieldsProps {
  crewId: Id;
  initialValues: PostDraftValue;
  draftRestored: boolean;
}

/**
 * 실제 입력 폼 — 표현/컨테이너 구분이 없는 클라이언트 경계다(`PostActions.tsx`와 같은 이유,
 * `create-post.ts` docstring 참고). 모든 입력 상태를 하나의 `values` 객체로 관리하고
 * `updateField`가 상태 갱신과 임시 저장(`savePostDraft`)을 **이벤트 핸들러 안에서 동시에**
 * 한다 — 디바운스·자동 저장 effect를 두지 않는다(이유는 `post-draft-storage.ts` 참고).
 *
 * 날짜 중복 경고(FR-034 E4)도 같은 이유로 `useEffect` 대신 모임 예정일 필드의 `onBlur`에서
 * 직접 `startTransition`으로 확인한다 — "경고 후 진행 허용"이라 비차단이고, 입력을 마친
 * 시점(blur)에 한 번 확인하는 것으로 충분하다(타이핑 중 매 keystroke마다 서버를 부를
 * 이유가 없다).
 */
function PostWriteFormFields({ crewId, initialValues, draftRestored }: PostWriteFormFieldsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [duplicateChecking, startDuplicateCheck] = useTransition();

  const [values, setValues] = useState<PostDraftValue>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<CreatePostFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  function updateField<K extends keyof PostDraftValue>(key: K, value: PostDraftValue[K]) {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      savePostDraft(crewId, next);
      return next;
    });
  }

  function handleTypeChange(nextType: PostType) {
    updateField("type", nextType);
    if (nextType !== "meetup_proposal") {
      setDuplicateWarning(false);
    }
  }

  function handleMeetupDateChange(value: string) {
    updateField("meetupDate", value);
    setDuplicateWarning(false);
  }

  /**
   * FR-034 E4 비차단 중복 확인. **기간 모임이면 기간 전체가 확인 범위다**(2026-07-31) —
   * 종료일 칸에서도 같은 확인을 돌리는 이유이며(`handleMeetupEndDateChange`), 시작일만 보면
   * "8/1~8/5 제안 vs 8/3 확정 모임"을 놓친다.
   */
  function runDuplicateCheck(date: string, endDate: string) {
    if (values.type !== "meetup_proposal" || !date) return;
    startDuplicateCheck(async () => {
      const result = await checkDuplicateMeetupDateAction({ crewId, date, endDate });
      setDuplicateWarning(result.duplicate);
    });
  }

  function handleMeetupDateBlur() {
    runDuplicateCheck(values.meetupDate, values.meetupEndDate);
  }

  function handleMeetupEndDateChange(value: string) {
    updateField("meetupEndDate", value);
    setDuplicateWarning(false);
  }

  function handleMeetupEndDateBlur() {
    runDuplicateCheck(values.meetupDate, values.meetupEndDate);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    startTransition(async () => {
      const isProposal = values.type === "meetup_proposal";
      const parsedCapacity = values.capacity.trim() === "" ? null : Number(values.capacity);

      const result = await createPostAction({
        crewId,
        type: values.type,
        title: values.title,
        body: values.body,
        meetupDate: isProposal ? values.meetupDate : undefined,
        meetupEndDate: isProposal ? values.meetupEndDate : undefined,
        voteDeadline: isProposal && values.voteDeadline ? new Date(values.voteDeadline).toISOString() : undefined,
        startTime: isProposal ? values.startTime : undefined,
        endTime: isProposal ? values.endTime : undefined,
        place: isProposal ? values.place : undefined,
        capacity: isProposal && parsedCapacity !== null && !Number.isNaN(parsedCapacity) ? parsedCapacity : null,
      });

      if (!result.ok) {
        if (result.kind === "fields") {
          setFieldErrors(result.fieldErrors);
        } else {
          setFormError(
            result.code === "not_found"
              ? strings.error.notFound.description
              : strings.error.forbidden.description,
          );
        }
        return;
      }

      clearPostDraft(crewId);
      router.push(getPostDetailHref(crewId, result.postId));
    });
  }

  const isProposal = values.type === "meetup_proposal";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {draftRestored && (
        <p className="rounded-lg border border-dashed border-border p-2.5 text-sm text-muted-foreground">
          {strings.board.write.draftRestoredNotice}
        </p>
      )}

      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">{strings.board.write.typeToggleLabel}</FieldLegend>
          <RadioGroup value={values.type} onValueChange={(value) => handleTypeChange(value as PostType)}>
            <Field orientation="horizontal">
              <RadioGroupItem id="post-write-type-general" value="general" />
              <FieldContent>
                <FieldLabel htmlFor="post-write-type-general">{strings.board.postType.free}</FieldLabel>
              </FieldContent>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem id="post-write-type-proposal" value="meetup_proposal" />
              <FieldContent>
                <FieldLabel htmlFor="post-write-type-proposal">{strings.board.postType.proposal}</FieldLabel>
              </FieldContent>
            </Field>
          </RadioGroup>
        </FieldSet>

        <Field data-invalid={Boolean(fieldErrors.title)}>
          <FieldLabel htmlFor="post-write-title">{strings.board.write.fields.title}</FieldLabel>
          <Input
            id="post-write-title"
            value={values.title}
            onChange={(event) => updateField("title", event.target.value)}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={fieldErrors.title ? "post-write-title-error" : undefined}
          />
          {fieldErrors.title && <FieldError id="post-write-title-error">{fieldErrors.title}</FieldError>}
        </Field>

        <Field data-invalid={Boolean(fieldErrors.body)}>
          <FieldLabel htmlFor="post-write-body">{strings.board.write.fields.description}</FieldLabel>
          <Textarea
            id="post-write-body"
            value={values.body}
            onChange={(event) => updateField("body", event.target.value)}
            disabled={pending}
            rows={6}
            aria-invalid={Boolean(fieldErrors.body)}
            aria-describedby={fieldErrors.body ? "post-write-body-error" : undefined}
          />
          {fieldErrors.body && <FieldError id="post-write-body-error">{fieldErrors.body}</FieldError>}
        </Field>

        {isProposal && (
          <>
            <Field data-invalid={Boolean(fieldErrors.scheduledDate)}>
              <FieldLabel htmlFor="post-write-meetup-date">
                {strings.board.write.fields.scheduledDate}
              </FieldLabel>
              <Input
                id="post-write-meetup-date"
                type="date"
                value={values.meetupDate}
                onChange={(event) => handleMeetupDateChange(event.target.value)}
                onBlur={handleMeetupDateBlur}
                disabled={pending}
                aria-invalid={Boolean(fieldErrors.scheduledDate)}
                aria-describedby={
                  fieldErrors.scheduledDate
                    ? "post-write-meetup-date-error"
                    : duplicateWarning
                      ? "post-write-meetup-date-duplicate"
                      : undefined
                }
              />
              {fieldErrors.scheduledDate && (
                <FieldError id="post-write-meetup-date-error">{fieldErrors.scheduledDate}</FieldError>
              )}
              {!fieldErrors.scheduledDate && duplicateWarning && (
                <FieldDescription id="post-write-meetup-date-duplicate" className="text-destructive">
                  {strings.board.write.validation.duplicateDateWarning}
                </FieldDescription>
              )}
              {!fieldErrors.scheduledDate && !duplicateWarning && duplicateChecking && (
                <FieldDescription>{strings.common.status.loading}</FieldDescription>
              )}
            </Field>

            <Field data-invalid={Boolean(fieldErrors.scheduledEndDate)}>
              <FieldLabel htmlFor="post-write-meetup-end-date">
                {strings.board.write.fields.scheduledEndDate}
              </FieldLabel>
              <Input
                id="post-write-meetup-end-date"
                type="date"
                // 브라우저 날짜 선택기가 시작일 이전을 아예 못 고르게 한다 — 검증(Server
                // Action·DB CHECK)은 그대로 두고 입력 단계에서 실수를 줄이는 힌트다.
                min={values.meetupDate || undefined}
                value={values.meetupEndDate}
                onChange={(event) => handleMeetupEndDateChange(event.target.value)}
                onBlur={handleMeetupEndDateBlur}
                disabled={pending}
                aria-invalid={Boolean(fieldErrors.scheduledEndDate)}
                aria-describedby={
                  fieldErrors.scheduledEndDate
                    ? "post-write-meetup-end-date-error"
                    : "post-write-meetup-end-date-hint"
                }
              />
              {fieldErrors.scheduledEndDate ? (
                <FieldError id="post-write-meetup-end-date-error">
                  {fieldErrors.scheduledEndDate}
                </FieldError>
              ) : (
                <FieldDescription id="post-write-meetup-end-date-hint">
                  {strings.board.write.fields.scheduledEndDateHint}
                </FieldDescription>
              )}
            </Field>

            <Field data-invalid={Boolean(fieldErrors.voteDeadline)}>
              <FieldLabel htmlFor="post-write-vote-deadline">
                {strings.board.write.fields.voteDeadline}
              </FieldLabel>
              <Input
                id="post-write-vote-deadline"
                type="datetime-local"
                value={values.voteDeadline}
                onChange={(event) => updateField("voteDeadline", event.target.value)}
                disabled={pending}
                aria-invalid={Boolean(fieldErrors.voteDeadline)}
                aria-describedby={fieldErrors.voteDeadline ? "post-write-vote-deadline-error" : undefined}
              />
              {fieldErrors.voteDeadline && (
                <FieldError id="post-write-vote-deadline-error">{fieldErrors.voteDeadline}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="post-write-start-time">{strings.board.write.fields.startTime}</FieldLabel>
              <Input
                id="post-write-start-time"
                type="time"
                value={values.startTime}
                onChange={(event) => updateField("startTime", event.target.value)}
                disabled={pending}
              />
            </Field>

            <Field data-invalid={Boolean(fieldErrors.endTime)}>
              <FieldLabel htmlFor="post-write-end-time">{strings.board.write.fields.endTime}</FieldLabel>
              <Input
                id="post-write-end-time"
                type="time"
                value={values.endTime}
                onChange={(event) => updateField("endTime", event.target.value)}
                disabled={pending}
                aria-invalid={Boolean(fieldErrors.endTime)}
                aria-describedby={fieldErrors.endTime ? "post-write-end-time-error" : undefined}
              />
              {fieldErrors.endTime && (
                <FieldError id="post-write-end-time-error">{fieldErrors.endTime}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="post-write-place">{strings.board.write.fields.location}</FieldLabel>
              <Input
                id="post-write-place"
                value={values.place}
                onChange={(event) => updateField("place", event.target.value)}
                disabled={pending}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="post-write-capacity">{strings.board.write.fields.capacity}</FieldLabel>
              <Input
                id="post-write-capacity"
                type="number"
                min={1}
                value={values.capacity}
                onChange={(event) => updateField("capacity", event.target.value)}
                disabled={pending}
              />
            </Field>
          </>
        )}
      </FieldGroup>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {pending ? strings.board.write.submitPending : strings.board.write.submit}
      </Button>
    </form>
  );
}
