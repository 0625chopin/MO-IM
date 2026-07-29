"use client";

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
import { withdrawPollAction } from "@/lib/actions/withdraw-poll";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

export interface PollWithdrawControlProps {
  crewId: Id;
  pollId: Id;
}

/**
 * 제안 철회 트리거(FR-046 AC1·AC3) — `PollEarlyCloseControl`과 같은 형태(Dialog 확인 →
 * `useTransition` 직접 호출). `PollPanel`이 `poll.canWithdraw`(제안자 본인 또는 임원 이상,
 * `poll:close_early`와 동일 판정)일 때만 렌더한다 — 이 컴포넌트 자체는 권한을 다시 판정하지
 * 않는다(D-030 ①, NFR-036).
 *
 * 성공하면 `withdrawPollAction` 안의 `refresh()`가 `PollPanelContainer`를 다시 그려 poll이
 * `cancelled` 상태로 바뀌고, `PollPanel`은 `PollResult`로 전환돼 이 컴포넌트 자체가 트리에서
 * 사라진다 — 로컬 상태로 Dialog를 닫는 후처리를 따로 하지 않는다.
 *
 * Server Function은 UI를 거치지 않고 직접 호출될 수 있으므로 `withdrawPollAction`이 권한·
 * 종료 여부를 서버에서 다시 판정한다(그 아래 `polls_guard_decision_integrity` 트리거가 DB
 * 레벨 최종 방어선이다) — 이 버튼은 "겉보기 허용"일 뿐이고, 실패하면 `result.error.message`를
 * 그대로 보여준다.
 */
export function PollWithdrawControl({ crewId, pollId }: PollWithdrawControlProps) {
  const [pending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleConfirm() {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await withdrawPollAction({ crewId, pollId });
      if (!result.ok) {
        setErrorMessage(result.error.message || strings.vote.withdraw.forbidden);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Dialog>
        <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
          {strings.vote.withdraw.trigger}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{strings.vote.withdraw.confirmTitle}</DialogTitle>
            <DialogDescription>{strings.vote.withdraw.confirmDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {strings.vote.withdraw.cancelAction}
            </DialogClose>
            <Button type="button" variant="destructive" onClick={handleConfirm} disabled={pending}>
              {pending ? strings.vote.withdraw.pending : strings.vote.withdraw.confirmAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {errorMessage && (
        <ErrorState title={strings.error.conflict.title} description={errorMessage} />
      )}
    </div>
  );
}
