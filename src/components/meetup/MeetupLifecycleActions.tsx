"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
import { ErrorState } from "@/components/ui/error-state";
import { cancelMeetupAction } from "@/lib/actions/cancel-meetup";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

/** `lib/data/contracts`의 `DataErrorCode`와 값이 같은 로컬 유니온 — 이 파일은 표현 컴포넌트
 *  (zone 4)라 `@/lib/data/*`를 직접 import할 수 없다(D-030 ①, `PostActions.tsx`
 *  `ActionErrorCode`와 같은 패턴). */
type MeetupActionErrorCode = "not_found" | "forbidden" | "conflict" | "validation_failed";

const ERROR_MESSAGE: Record<MeetupActionErrorCode, string> = {
  not_found: strings.meetup.lifecycle.errors.notFound,
  forbidden: strings.meetup.lifecycle.errors.forbidden,
  conflict: strings.meetup.lifecycle.errors.conflict,
  validation_failed: strings.meetup.lifecycle.errors.submitFailed,
};

export interface MeetupLifecycleActionsProps {
  crewId: Id;
  meetupId: Id;
  boardWriteHref: string;
}

/**
 * Meetup 취소·일정 변경(FR-065) — `MeetupAttendanceActions`와 나란히 카드 하단에 붙는 별도
 * 액션 그룹(제안 작성자·임원·오너에게만 보인다, `canCancelOrUpdate`가 이미 컨테이너에서
 * 판정됨). `PostActions.tsx`의 삭제 확인 Dialog와 같은 패턴 — 두 버튼 모두 서버에서는
 * **같은** `cancelMeetupAction`을 부른다("일정 변경"은 취소 + 글쓰기 화면 이동일 뿐 별도
 * 날짜 수정 API가 없다, D-003 — `docs/decisions/community-expansion-041.md` §3).
 */
export function MeetupLifecycleActions({ crewId, meetupId, boardWriteHref }: MeetupLifecycleActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelMeetupAction({ crewId, meetupId }, { intent: "cancel" });
      if (!result.ok) {
        setError(ERROR_MESSAGE[result.error.code]);
      }
    });
  }

  function handleReschedule() {
    setError(null);
    startTransition(async () => {
      const result = await cancelMeetupAction({ crewId, meetupId }, { intent: "reschedule" });
      if (!result.ok) {
        setError(ERROR_MESSAGE[result.error.code]);
        return;
      }
      router.push(boardWriteHref);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <ErrorState title={strings.meetup.lifecycle.errors.submitFailed} description={error} />}
      <div className="flex gap-2">
        <Dialog>
          <DialogTrigger render={<Button variant="outline" size="sm" disabled={pending} />}>
            {strings.meetup.lifecycle.rescheduleTrigger}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{strings.meetup.lifecycle.rescheduleConfirmTitle}</DialogTitle>
              <DialogDescription>
                {strings.meetup.lifecycle.rescheduleConfirmDescription}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                {strings.meetup.lifecycle.cancelAction}
              </DialogClose>
              <Button onClick={handleReschedule} disabled={pending}>
                {pending ? strings.meetup.lifecycle.pending : strings.meetup.lifecycle.rescheduleConfirmAction}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger render={<Button variant="destructive" size="sm" disabled={pending} />}>
            {strings.meetup.lifecycle.cancelTrigger}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{strings.meetup.lifecycle.cancelConfirmTitle}</DialogTitle>
              <DialogDescription>{strings.meetup.lifecycle.cancelConfirmDescription}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                {strings.meetup.lifecycle.cancelAction}
              </DialogClose>
              <Button variant="destructive" onClick={handleCancel} disabled={pending}>
                {pending ? strings.meetup.lifecycle.pending : strings.meetup.lifecycle.cancelConfirmAction}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
