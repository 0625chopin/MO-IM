import type { PollViewModel } from "@/components/poll/poll-view-models";
import { PollBallot } from "@/components/poll/PollBallot";
import { PollCountdown } from "@/components/poll/PollCountdown";
import { PollEarlyCloseControl } from "@/components/poll/PollEarlyCloseControl";
import { PollPanel } from "@/components/poll/PollPanel";
import { PollPanelSkeleton } from "@/components/poll/PollPanelSkeleton";
import { PollResult } from "@/components/poll/PollResult";
import { PollTally } from "@/components/poll/PollTally";
import { PollWithdrawControl } from "@/components/poll/PollWithdrawControl";
import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { PollAutoCloseSimulatorPreview } from "@/components/sample/sections/PollAutoCloseSimulatorPreview";
import { defineSection } from "@/components/sample/showcase-types";
import { ErrorState } from "@/components/ui/error-state";
import { strings } from "@/lib/strings";

import type { ReactNode } from "react";

/**
 * 투표(FR-040~045, Task 019) — `PollBallot`(참여) · `PollCountdown`(마감) · `PollTally`(진행 중
 * 집계) · `PollResult`(종료 결과) · `PollEarlyCloseControl`(조기 종료, D-003 트리거②) ·
 * `PollPanel`(조립 + 상태 전이 UI) 6종을 다룬다. 실제 화면은 `/crews/[crewId]/board/[postId]`
 * (게시글 상세, FR-031 AC1 "투표 UI가 본문 아래에 함께 렌더된다") — `PollPanelContainer`가
 * `lib/data`·`lib/rules`로 판정을 마친 `PollViewModel`을 조립해 `PollPanel`에 내려준다.
 *
 * 아래 고정 데이터는 `PollPanelContainer`가 만드는 조인 결과 모양을 손으로 채운 것이다
 * (`sections/board.tsx`의 `SAMPLE_POSTS`·`sections/meetup.tsx`의 `DEMO_MEETUP`과 같은 패턴).
 * `showDetailed`·`quorumMet`·`outcome`처럼 **이미 판정된 값**만 props로 넘긴다 — 이 섹션도
 * 정족수·판정 로직을 다시 계산하지 않는다(NFR-036, R-015).
 */

function buildPoll(overrides: Partial<PollViewModel> = {}): PollViewModel {
  return {
    id: "sample-poll-1",
    postId: "sample-post-1",
    status: "open",
    outcome: null,
    closesAt: "2026-08-01T14:00:00.000Z",
    decidedAt: null,
    isAwaitingClosure: false,
    eligibleVoterCount: 10,
    quorumRequired: 4,
    quorumMet: true,
    votedCount: 7,
    tally: { participantCount: 7, forCount: 4, againstCount: 2, abstainCount: 1 },
    showDetailedTally: true,
    remainingMs: 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000, // 2일 3시간
    meetupId: null,
    viewer: { canVote: true, ineligibleReason: null, myChoice: null },
    canCloseEarly: true,
    canWithdraw: true,
    ...overrides,
  };
}

function LabeledDemo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export const pollSection = defineSection({
  id: "poll",
  label: "투표",
  title:
    "투표 — PollBallot · PollCountdown · PollTally · PollResult · PollEarlyCloseControl · PollWithdrawControl · PollPanel",
  description: (
    <>
      찬반 투표(FR-040~045, Task 019) — 참여·현황·마감 카운트다운·종료 결과·조기 종료·상태 전이
      조립 6종을 다룹니다. 정족수(<code>ceil(대상자 수 / 3)</code>, D-032)·판정(D-003)·집계 공개
      범위(D-031)·타임존(<code>lib/rules/poll-timezone.ts</code>)은 전부{" "}
      <code>lib/rules</code>의 순수 함수 몫이며, 아래 예시는 그 결과를 손으로 채운 값입니다.
    </>
  ),
  items: [
    {
      name: "PollBallot",
      note: "투표 참여 컨트롤(FR-041). '기본'은 이미 찬성을 선택한 상태, '빈 상태'는 아직 아무것도 선택하지 않은 최초 진입 상태입니다. '오류'는 도메인 오류 3종 — 크루원 아님(D-039가 대부분 막아 방어적 분기)·스냅샷 이탈(투표 생성 후 가입)·투표 종료(마감 경과)를 나란히 보여줍니다. crewId·pollId가 실재하지 않는 값이라 버튼을 눌러도 castVoteAction이 안전하게 not_found로 실패합니다(MeetupAttendanceActions와 같은 관례).",
      panels: {
        default: (
          <PreviewFrame height={140}>
            <div className="mx-auto w-full max-w-sm p-4">
              <PollBallot
                crewId="sample-crew"
                pollId="sample-poll-ballot"
                isVotable
                viewer={{ canVote: true, ineligibleReason: null, myChoice: "for" }}
              />
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={140}>
            <div className="mx-auto w-full max-w-sm p-4">
              <PollBallot
                crewId="sample-crew"
                pollId="sample-poll-ballot"
                isVotable
                viewer={{ canVote: true, ineligibleReason: null, myChoice: null }}
              />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={320}>
            <div className="flex flex-col gap-3 p-4">
              <LabeledDemo label="대상자 아님 — 크루원 아님">
                <PollBallot
                  crewId="sample-crew"
                  pollId="sample-poll-ballot"
                  isVotable
                  viewer={{ canVote: false, ineligibleReason: "not_crew_member", myChoice: null }}
                />
              </LabeledDemo>
              <LabeledDemo label="대상자 아님 — 스냅샷 이탈(투표 생성 후 가입)">
                <PollBallot
                  crewId="sample-crew"
                  pollId="sample-poll-ballot"
                  isVotable
                  viewer={{ canVote: false, ineligibleReason: "not_in_snapshot", myChoice: null }}
                />
              </LabeledDemo>
              <LabeledDemo label="투표 종료(마감 경과)">
                <PollBallot
                  crewId="sample-crew"
                  pollId="sample-poll-ballot"
                  isVotable={false}
                  viewer={{ canVote: true, ineligibleReason: null, myChoice: "against" }}
                />
              </LabeledDemo>
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "PollCountdown",
      note: "마감 카운트다운(FR-042 AC1). 1초 타이머로 갱신하지 않고 렌더 시각에 한 번만 계산합니다(성능은 렌더링 전략으로, CLAUDE.md). '빈 상태'는 마감 1분 미만으로 남은 극단값, '오류'는 D-024 '결과 집계 중'(자동 종료 지연 창)과 이미 종료된 투표의 종료 시각 표시입니다.",
      panels: {
        default: (
          <PollCountdown
            status="open"
            closesAt="2026-08-01T14:00:00.000Z"
            remainingMs={2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000}
            isAwaitingClosure={false}
          />
        ),
        empty: (
          <PollCountdown
            status="open"
            closesAt="2026-07-24T10:31:00.000Z"
            remainingMs={30_000}
            isAwaitingClosure={false}
          />
        ),
        error: (
          <div className="flex flex-col gap-3">
            <LabeledDemo label="결과 집계 중(D-024) — 자동 종료 작업이 아직 반영 전">
              <PollCountdown
                status="open"
                closesAt="2026-07-24T09:00:00.000Z"
                remainingMs={0}
                isAwaitingClosure
              />
            </LabeledDemo>
            <LabeledDemo label="이미 종료됨">
              <PollCountdown
                status="closed_passed"
                closesAt="2026-07-20T09:00:00.000Z"
                remainingMs={0}
                isAwaitingClosure={false}
              />
            </LabeledDemo>
          </div>
        ),
      },
    },
    {
      name: "PollTally",
      note: "진행 중 투표 현황(FR-042 AC1). '빈 상태'는 D-031 — 대상자 5명 미만이면 진행 중에는 상세 집계를 숨기고 'N명 참여'만 보여줍니다. '오류'는 정족수 미달(참여자가 정족수에 못 미치는 진행 중 상태) 배지입니다.",
      panels: {
        default: (
          <PollTally
            tally={{ participantCount: 9, forCount: 6, againstCount: 2, abstainCount: 1 }}
            eligibleVoterCount={10}
            votedCount={9}
            quorumRequired={4}
            quorumMet
            showDetailed
          />
        ),
        empty: (
          <PollTally
            tally={{ participantCount: 0, forCount: 0, againstCount: 0, abstainCount: 0 }}
            eligibleVoterCount={3}
            votedCount={0}
            quorumRequired={1}
            quorumMet={false}
            showDetailed={false}
          />
        ),
        error: (
          <PollTally
            tally={{ participantCount: 1, forCount: 1, againstCount: 0, abstainCount: 0 }}
            eligibleVoterCount={10}
            votedCount={1}
            quorumRequired={4}
            quorumMet={false}
            showDetailed
          />
        ),
      },
    },
    {
      name: "PollResult",
      note: "종료된 투표의 최종 결과(FR-042 AC3, FR-044). '기본'은 가결 + 확정된 Meetup 링크, '빈 상태'는 정족수 미달로 무효 처리되어 다음 단계(Meetup)로 이어지는 링크가 없는 경우입니다. '오류'는 동수 부결(D-003 '동수 처리: 부결')과 제안 철회(FR-046, cancelled — 사유 문구 없음)입니다.",
      panels: {
        default: (
          <PollResult
            status="closed_passed"
            outcome="passed"
            tally={{ participantCount: 9, forCount: 6, againstCount: 2, abstainCount: 1 }}
            eligibleVoterCount={10}
            votedCount={9}
            quorumRequired={4}
            quorumMet
            meetupHref="#"
          />
        ),
        empty: (
          <PollResult
            status="closed_invalid"
            outcome="invalid"
            tally={{ participantCount: 2, forCount: 1, againstCount: 0, abstainCount: 1 }}
            eligibleVoterCount={10}
            votedCount={2}
            quorumRequired={4}
            quorumMet={false}
            meetupHref={null}
          />
        ),
        error: (
          <div className="flex flex-col gap-3">
            <LabeledDemo label="동수 부결(D-003)">
              <PollResult
                status="closed_rejected"
                outcome="rejected"
                tally={{ participantCount: 6, forCount: 3, againstCount: 3, abstainCount: 0 }}
                eligibleVoterCount={10}
                votedCount={6}
                quorumRequired={4}
                quorumMet
                meetupHref={null}
              />
            </LabeledDemo>
            <LabeledDemo label="제안 철회(FR-046)">
              <PollResult
                status="cancelled"
                outcome={null}
                tally={{ participantCount: 3, forCount: 2, againstCount: 1, abstainCount: 0 }}
                eligibleVoterCount={10}
                votedCount={3}
                quorumRequired={4}
                quorumMet={false}
                meetupHref={null}
              />
            </LabeledDemo>
          </div>
        ),
      },
    },
    {
      name: "PollEarlyCloseControl",
      note: "조기 종료(D-003 트리거②, FR-043 AC3) — 제안자 본인 또는 임원 이상만 렌더된다(`poll.canCloseEarly`, 컨테이너가 이미 판정). Dialog 확인 후 `closePollEarlyAction`을 직접 호출합니다. pollId가 실재하지 않는 값이라 실제로 눌러도 서버가 안전하게 not_found로 실패합니다 — '오류' 패널은 그 실패가 화면에 어떻게 보이는지(이미 종료됨 문구)를 고정값으로 보여줍니다. '로딩'·'빈 상태' 패널은 두지 않았다 — 버튼 하나뿐인 컨트롤이라 '목록이 비었다'는 개념 자체가 없고(`NotificationItem`과 같은 이유), 서버 왕복 중 로딩은 별도 패널이 아니라 버튼 라벨 자체가 `strings.vote.earlyClose.pending`으로 바뀌는 것으로 표현된다.",
      panels: {
        default: <PollEarlyCloseControl crewId="sample-crew" pollId="sample-poll-early-close" />,
        error: (
          <ErrorState
            title={strings.error.conflict.title}
            description={strings.vote.earlyClose.alreadyClosed}
          />
        ),
      },
    },
    {
      name: "PollWithdrawControl",
      note: "제안 철회(FR-046 AC1·AC3, Task 044) — 제안자 본인 또는 임원 이상만 렌더된다(`poll.canWithdraw`, `poll:close_early`와 동일 판정을 재사용). Dialog 확인 후 `withdrawPollAction`을 직접 호출합니다. pollId가 실재하지 않는 값이라 실제로 눌러도 서버가 안전하게 not_found로 실패합니다 — '오류' 패널은 이미 종료·취소된 투표를 다시 철회하려 할 때(AC3)의 문구를 고정값으로 보여줍니다. '로딩'·'빈 상태' 패널은 두지 않았다 — `PollEarlyCloseControl`(같은 형태를 그대로 복제한 컨트롤)과 같은 이유로, 버튼 하나뿐이라 '비었다'는 개념이 없고 로딩은 버튼 라벨이 `strings.vote.withdraw.pending`으로 바뀌는 것으로 표현된다.",
      panels: {
        default: <PollWithdrawControl crewId="sample-crew" pollId="sample-poll-withdraw" />,
        error: (
          <ErrorState
            title={strings.error.conflict.title}
            description={strings.vote.withdraw.alreadyClosed}
          />
        ),
      },
    },
    {
      name: "PollPanel",
      note: "게시글 상세에 얹히는 투표 블록(D-030 ①의 컨테이너는 `PollPanelContainer`, 실제 화면은 `/crews/[crewId]/board/[postId]`). `poll.status`에 따라 진행 중 3종(집계·카운트다운·투표) ↔ `PollResult`로 완전히 전환하는 **상태 전이 UI**가 이 컴포넌트의 몫입니다. '빈 상태'는 대상자 5명 미만이라 상세 집계가 아직 없는(D-031) 갓 생성된 투표, '오류'는 가결+Meetup 링크·결과 집계 중(D-024)·스냅샷 이탈 대상자 3가지 상태 전이 결과를 나란히 보여줍니다.",
      panels: {
        default: <PollPanel crewId="sample-crew" poll={buildPoll()} />,
        loading: <PollPanelSkeleton />,
        empty: (
          <PollPanel
            crewId="sample-crew"
            poll={buildPoll({
              eligibleVoterCount: 3,
              quorumRequired: 1,
              quorumMet: false,
              votedCount: 0,
              tally: { participantCount: 0, forCount: 0, againstCount: 0, abstainCount: 0 },
              showDetailedTally: false,
              viewer: { canVote: true, ineligibleReason: null, myChoice: null },
            })}
          />
        ),
        error: (
          <div className="flex flex-col gap-4">
            <LabeledDemo label="가결 + Meetup 링크">
              <PollPanel
                crewId="sample-crew"
                poll={buildPoll({
                  status: "closed_passed",
                  outcome: "passed",
                  decidedAt: "2026-07-24T09:00:05.000Z",
                  meetupId: "sample-meetup-1",
                })}
              />
            </LabeledDemo>
            <LabeledDemo label="결과 집계 중(D-024)">
              <PollPanel crewId="sample-crew" poll={buildPoll({ isAwaitingClosure: true })} />
            </LabeledDemo>
            <LabeledDemo label="대상자 아님 — 스냅샷 이탈">
              <PollPanel
                crewId="sample-crew"
                poll={buildPoll({
                  viewer: { canVote: false, ineligibleReason: "not_in_snapshot", myChoice: null },
                  canCloseEarly: false,
                  canWithdraw: false,
                })}
              />
            </LabeledDemo>
          </div>
        ),
      },
    },
    {
      name: "투표 종료 트리거 시뮬레이션",
      note: "D-003의 종료 트리거 3종 — ① 마감 시각 도래(자동), ② 조기 종료(사람이 버튼), ③ 미투표자 0명(자동, D-022). **Task 034(20일차)부터 ①은 pg_cron 잡(`poll_auto_close_and_finalize`, 5분 주기)이 실제로 처리합니다** — 이 버튼은 5분을 기다리지 않고 즉시 확인하려는 QA용 수동 발화(`simulateScheduledPollClosureAction`, close-poll.ts)로 남겨 뒀습니다. ②는 위 `PollEarlyCloseControl`이 실제 화면에서 쓰는 버튼과 완전히 같은 것입니다. ③은 `castVoteAction`이 마지막 투표 제출 직후 동기 체크로 우선 판정하고(버튼이 아니라 위 `PollBallot`에서 마지막 한 표를 던지는 순간 발화), 그 동기 체크가 RLS로 조용히 막히는 드문 경우엔 같은 pg_cron 잡이 D-022 조건(스냅샷 ∩ 현재 active 미투표자 0명)으로 다시 잡아 백스톱합니다(write-path-realdata-032.md §8 인계 해소). 판정 자체(정족수·가결)는 세 트리거 전부 100% 동일 공식이고, 가결 시 Meetup 생성(FR-060)·종료 알림 적재(FR-045)도 이제 실제로 일어납니다 — DB 트리거(`finalize_closed_poll`) 하나가 트리거①②③ 전부를 공유합니다.",
      content: <PollAutoCloseSimulatorPreview />,
    },
  ],
});
