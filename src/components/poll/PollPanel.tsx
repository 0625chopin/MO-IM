import { getMeetupDetailHref } from "@/components/meetup/meetup-links";
import type { PollViewModel } from "@/components/poll/poll-view-models";
import { PollBallot } from "@/components/poll/PollBallot";
import { PollCountdown } from "@/components/poll/PollCountdown";
import { PollEarlyCloseControl } from "@/components/poll/PollEarlyCloseControl";
import { PollResult } from "@/components/poll/PollResult";
import { PollTally } from "@/components/poll/PollTally";
import { PollWithdrawControl } from "@/components/poll/PollWithdrawControl";
import type { Id } from "@/lib/types";

export interface PollPanelProps {
  crewId: Id;
  poll: PollViewModel;
}

/**
 * 게시글 상세(FR-031 AC1 "투표 UI가 본문 아래에 함께 렌더된다")에 얹는 투표 블록 — Task 019가
 * 만드는 6종 중 조립을 맡는 자리. `PollPanelContainer`가 `lib/data`·`lib/rules`로 이미 판정을
 * 마친 `PollViewModel` 하나를 받아 **`poll.status`에 따라 어떤 하위 컴포넌트 조합을 보여줄지만
 * 고른다**(상태 전이 UI, ROADMAP Task 019 "상태 전이 UI" 항목) — 판정 자체는 하지 않는다
 * (D-030 ①, NFR-036).
 *
 * 두 갈래뿐이다:
 * 1. **`open`** — 진행 중 집계(`PollTally`) + 마감 카운트다운(`PollCountdown`) + 투표
 *    컨트롤(`PollBallot`) + (조기 종료 권한이 있으면) `PollEarlyCloseControl`. 마감은
 *    지났지만 자동 종료가 아직 반영되지 않은 창(`isAwaitingClosure`, D-024)에서는
 *    `PollCountdown`이 "결과 집계 중"으로 바뀌고, `PollBallot`은 `isVotable=false`가 되며,
 *    조기 종료 컨트롤은 더 종료할 것이 없으므로 아예 렌더하지 않는다.
 * 2. **`closed_*`·`cancelled`** — `PollResult`로 완전히 전환한다. 진행 중 3종은 이 상태에서
 *    의미가 없다(투표는 이미 끝났고, 마감 카운트다운도 더 셀 것이 없다).
 */
export function PollPanel({ crewId, poll }: PollPanelProps) {
  const isOpen = poll.status === "open";

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      {isOpen ? (
        <>
          <PollTally
            tally={poll.tally}
            eligibleVoterCount={poll.eligibleVoterCount}
            votedCount={poll.votedCount}
            quorumRequired={poll.quorumRequired}
            quorumMet={poll.quorumMet}
            showDetailed={poll.showDetailedTally}
          />
          <PollCountdown
            status={poll.status}
            closesAt={poll.closesAt}
            remainingMs={poll.remainingMs}
            isAwaitingClosure={poll.isAwaitingClosure}
          />
          <PollBallot
            crewId={crewId}
            pollId={poll.id}
            isVotable={!poll.isAwaitingClosure}
            viewer={poll.viewer}
          />
          {poll.canCloseEarly && !poll.isAwaitingClosure && (
            <PollEarlyCloseControl crewId={crewId} pollId={poll.id} />
          )}
          {/* FR-046 AC1(Task 044) — 철회는 조기 종료와 나란히 둔다(둘 다 제안자 본인 또는
              임원 이상만 보이고, 결과 집계 중에는 더 취소·종료할 것이 없다). */}
          {poll.canWithdraw && !poll.isAwaitingClosure && (
            <PollWithdrawControl crewId={crewId} pollId={poll.id} />
          )}
        </>
      ) : (
        <PollResult
          status={poll.status}
          outcome={poll.outcome}
          tally={poll.tally}
          eligibleVoterCount={poll.eligibleVoterCount}
          votedCount={poll.votedCount}
          quorumRequired={poll.quorumRequired}
          quorumMet={poll.quorumMet}
          meetupHref={poll.meetupId ? getMeetupDetailHref(poll.meetupId) : null}
        />
      )}
    </section>
  );
}
