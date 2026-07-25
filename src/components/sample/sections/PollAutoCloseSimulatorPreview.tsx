"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { simulateScheduledPollClosureAction } from "@/lib/actions/close-poll";
import { strings } from "@/lib/strings";

/**
 * `/sample` 전용 클라이언트 경계 — D-003 종료 트리거①(기한 도래 자동 종료)의 **발화 버튼**을
 * 시연한다. `sections/poll.tsx`(서버 컴포넌트)는 `onClick` 클로저를 Client Component prop으로
 * 직렬화해 넘길 수 없으므로(`BoardErrorStatePreview`·`ConnectionBannerPreview`와 같은 이유)
 * 이 클라이언트 래퍼가 `simulateScheduledPollClosureAction`을 직접 호출한다.
 *
 * **Task 034(20일차)부터 이 버튼은 유일한 트리거①이 아니다** — 실제로는 pg_cron 잡
 * `poll_auto_close_and_finalize`(5분 주기, `docs/decisions/poll-pipeline-034.md`)가 마감
 * 시각이 지난 `open` 투표를 자동으로 찾아 종료한다. 이 버튼은 5분을 기다리지 않고 QA 중
 * 즉시 트리거①의 배선을 확인하려는 수동 단축 경로로 남겨 뒀다 — 걷어내지 않기로 했다.
 *
 * **실제 크루 데이터를 건드리지 않는다** — `pollId`는 실재하지 않는 값
 * (`sample-poll-auto-close`)이라 항상 `not_found`로 안전하게 실패한다
 * (`MeetupAttendanceActions`가 가짜 `meetupId`로 안전하게 실패하는 것과 같은 관례). 이 버튼이
 * 보여주는 것은 **"트리거①을 사람이 대신 발화하는 자리가 실제로 동작한다"** 는 배선 자체이지,
 * 실제 판정 결과가 아니다 — 실제 판정(정족수·가결/부결)은 `PollResult`·`PollTally` 항목이 이미
 * 보여준다.
 */
export function PollAutoCloseSimulatorPreview() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await simulateScheduledPollClosureAction({ pollId: "sample-poll-auto-close" });
      if (result.ok) {
        setIsError(false);
        setMessage("종료 처리됨(실제로는 발생하지 않음 — 데모용 ID)");
      } else {
        setIsError(true);
        setMessage(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? "발화 중…" : "트리거① 발화(마감 시각 도래 자동 종료)"}
      </Button>
      {message &&
        (isError ? (
          <ErrorState title={strings.error.notFound.title} description={message} />
        ) : (
          <p className="text-xs text-muted-foreground">{message}</p>
        ))}
    </div>
  );
}
