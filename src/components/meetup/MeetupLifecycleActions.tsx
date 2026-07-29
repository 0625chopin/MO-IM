"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { getMeetupRescheduleHref } from "@/components/meetup/meetup-links";
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
  /** `meetup:cancel_or_update`(제안자 본인·임원·오너) 판정 결과 — "모임 취소" 버튼 노출 여부. */
  canCancelOrUpdate: boolean;
  /** `poll:create_proposal`(활성 크루원 전원) 판정 결과 — "일정 변경 제안" 링크 노출 여부.
   *  `canCancelOrUpdate`와 의도적으로 다른 판정이다 — 근거는 `meetup-view-models.ts`의
   *  `canProposeReschedule` docstring 참고. */
  canProposeReschedule: boolean;
}

/**
 * Meetup 취소·일정 변경 제안 진입(FR-065) — Meetup 상세 카드 하단에 붙는 액션 그룹.
 *
 * **26일차(I-079) 재작성 — "일정 변경"은 더 이상 이 컴포넌트 안에서 `cancelMeetupAction`을
 * 부르지 않는다.** 21일차엔 D-003(가결된 Meetup의 날짜 변경은 재투표를 요구한다)을 만족할
 * 스키마 자리가 없어 "취소 + 새 제안글 작성 안내"가 임시 경로였다(`docs/decisions/
 * community-expansion-041.md` §3). CORE가 이번 회차(`docs/decisions/meetup-reschedule-079.md`)
 * 에 "기존 Meetup을 UPDATE하는 재투표" 스키마를 놓으면서 그 임시 경로를 **대체**했다 — 대체된
 * 범위는 "일정 변경" 버튼의 동작 전부(즉시 취소 → 전용 글쓰기 화면 이동으로)이고, **남긴
 * 범위는 "모임 취소" 버튼과 그 뒤의 `cancelMeetupAction` 자체다**(FR-065 AC3로 여전히 필요한
 * 별개 기능 — 통째로 지우지 않았다).
 *
 * "일정 변경 제안"은 이제 Meetup을 건드리지 않는다 — `getMeetupRescheduleHref`(전용 화면,
 * `MeetupRescheduleContainer`)로 이동해 새 제안글+투표를 만들 뿐이고, 실제 날짜 반영은 그
 * 투표가 가결됐을 때 `finalize_closed_poll`(DB)이 한다. 파괴적 동작이 아니므로 확인 Dialog가
 * 없는 평범한 링크 버튼이다(`BoardList.tsx`의 "글쓰기" 버튼과 같은 성격). "모임 취소"만
 * 여전히 되돌릴 수 없어 Dialog 확인을 남긴다.
 */
export function MeetupLifecycleActions({
  crewId,
  meetupId,
  canCancelOrUpdate,
  canProposeReschedule,
}: MeetupLifecycleActionsProps) {
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

  if (!canCancelOrUpdate && !canProposeReschedule) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <ErrorState title={strings.meetup.lifecycle.errors.submitFailed} description={error} />}
      <div className="flex gap-2">
        {canProposeReschedule && (
          // `render`가 <a>를 만들므로 nativeButton={false}(BoardList.tsx의 "글쓰기" 버튼과
          // 같은 이유) — 이동 동작이라 링크가 맞는 자리다.
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={getMeetupRescheduleHref(meetupId)} />}
          >
            {strings.meetup.lifecycle.rescheduleTrigger}
          </Button>
        )}

        {canCancelOrUpdate && (
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
        )}
      </div>
    </div>
  );
}
