import type {
  Id,
  Poll,
  PollEligibleVoter,
  PollOutcome,
  PollTally,
  PollVote,
  SnapshotVoterStatus,
  VoteChoice,
} from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { generateId, store } from "./fixtures";

/**
 * Poll·PollEligibleVoter·PollVote 데이터 접근 (FR-040~045).
 *
 * 정족수 판정·가결/부결 판정은 `lib/rules`의 순수 함수(`QuorumCheckResult`·
 * `PollDecisionResult`, `poll.types.ts`) 몫이다. 이 레이어는 판정에 필요한 원시
 * 집계(`getPollTally`)만 제공하고, 판정 **결과**를 저장하는 `closePoll`은 이미
 * 계산된 `outcome`을 인자로 받는다 — 판정 로직 자체를 데이터 레이어에 넣지 않는다
 * (NFR-036, "React 비의존 순수 함수"와 "데이터 접근"의 책임 분리).
 */

export async function getPollByPostId(postId: Id): Promise<Poll | null> {
  return store.polls.find((p) => p.postId === postId) ?? null;
}

export async function getPollById(id: Id): Promise<Poll | null> {
  return store.polls.find((p) => p.id === id) ?? null;
}

export interface CreatePollInput {
  postId: Id;
  opensAt: string;
  closesAt: string;
  /** 투표 생성 시각의 대상자 스냅샷(D-025) — 호출자가 크루원 목록에서 미리 계산해 넘긴다. */
  eligibleVoterIds: Id[];
}

/** 찬반 투표 생성(FR-040). D-025 — 스냅샷을 조인 테이블(`PollEligibleVoter`)로 함께 만든다. */
export async function createPoll(input: CreatePollInput): Promise<Poll> {
  const poll: Poll = {
    id: generateId("poll"),
    postId: input.postId,
    opensAt: input.opensAt,
    closesAt: input.closesAt,
    status: "open",
    closedBy: null,
    result: null,
    decidedAt: null,
  };
  store.polls.push(poll);
  store.pollEligibleVoters.push(
    ...input.eligibleVoterIds.map((profileId) => ({
      pollId: poll.id,
      profileId,
      notifiedAt: null,
      notifyAttempts: 0,
    })),
  );
  return poll;
}

export async function listEligibleVoters(pollId: Id): Promise<PollEligibleVoter[]> {
  return store.pollEligibleVoters.filter((v) => v.pollId === pollId);
}

/**
 * 대상자 스냅샷 × 현재 크루 멤버십 상태 조인(`SnapshotVoterStatus`, `poll.types.ts`).
 * `lib/rules/poll-eligibility.ts`의 정족수 분모(D-003)·종료 트리거③ 미투표자(D-022)
 * 판정 함수가 이 반환값을 그대로 인자로 받는다 — 두 판정이 서로 다른 필터(전자는
 * `removed`만 제외, 후자는 `active`만 남김)를 적용하므로 이 함수는 필터링하지 않고
 * "현재 상태"만 그대로 넘긴다(필터링은 rules의 몫).
 *
 * poll → post → board → crew 경로로 crewId를 찾아 그 크루의 `CrewMembership`과
 * 조인한다. 스냅샷에 이름이 남은 사람은 투표 생성 시각에 반드시 `CrewMembership` 행이
 * 있었고 그 뒤로는 상태만 바뀔 뿐 행 자체가 삭제되지 않으므로(D-003 — 자진 탈퇴·강퇴
 * 모두 상태 전이), 멤버십을 못 찾으면 예상 가능한 실패가 아니라 데이터 정합성이 깨진
 * 것이다 — 그래서 `DataResult`가 아니라 예외로 알린다.
 */
export async function listEligibleVotersWithCurrentStatus(
  pollId: Id,
): Promise<SnapshotVoterStatus[]> {
  const poll = store.polls.find((p) => p.id === pollId);
  if (!poll) return [];
  const post = store.posts.find((p) => p.id === poll.postId);
  const board = post ? store.boards.find((b) => b.id === post.boardId) : undefined;
  if (!board) return [];

  return store.pollEligibleVoters
    .filter((voter) => voter.pollId === pollId)
    .map((voter) => {
      const membership = store.crewMemberships.find(
        (m) => m.crewId === board.crewId && m.profileId === voter.profileId,
      );
      if (!membership) {
        throw new Error(
          `crew ${board.crewId} 의 멤버십(${voter.profileId})을 찾을 수 없다 — poll ${pollId} 스냅샷과 불일치.`,
        );
      }
      return { profileId: voter.profileId, currentMembershipStatus: membership.status };
    });
}

export async function listVotes(pollId: Id): Promise<PollVote[]> {
  return store.pollVotes.filter((v) => v.pollId === pollId);
}

/**
 * 무효화되지 않은 표의 선택지별 집계(FR-042). 판정 자체는 호출자가 `lib/rules`로 한다.
 * Mock은 D-031 숨김을 흉내 내지 않는다(실데이터 `getPollTally`만 RPC 숨김을 반영) — 그래서
 * `participantCount`는 항상 세 필드의 합과 같다(I-119).
 */
export async function getPollTally(pollId: Id): Promise<PollTally> {
  const votes = store.pollVotes.filter((v) => v.pollId === pollId && !v.invalidated);
  return {
    participantCount: votes.length,
    forCount: votes.filter((v) => v.choice === "for").length,
    againstCount: votes.filter((v) => v.choice === "against").length,
    abstainCount: votes.filter((v) => v.choice === "abstain").length,
  };
}

export interface CastVoteInput {
  pollId: Id;
  voterId: Id;
  choice: VoteChoice;
}

/**
 * 투표 참여(FR-041). 대상자 스냅샷(`PollEligibleVoter`)에 없거나 이미 종료된 투표면
 * conflict. 같은 사람이 다시 투표하면 선택지를 덮어쓴다(재투표 허용 — 종료 전까지는
 * 마음을 바꿀 수 있다는 전제. 재투표 자체를 막을 근거가 요구사항에 없다).
 */
export async function castVote(input: CastVoteInput): Promise<DataResult<PollVote>> {
  const poll = store.polls.find((p) => p.id === input.pollId);
  if (!poll) return err("not_found", `poll ${input.pollId} 를 찾을 수 없다.`);
  if (poll.status !== "open") {
    return err("conflict", `poll ${input.pollId} 는 이미 종료됐다.`);
  }
  const eligible = store.pollEligibleVoters.some(
    (v) => v.pollId === input.pollId && v.profileId === input.voterId,
  );
  if (!eligible) {
    return err("validation_failed", `profile ${input.voterId} 는 poll ${input.pollId} 의 투표 대상이 아니다.`);
  }

  const existing = store.pollVotes.find(
    (v) => v.pollId === input.pollId && v.voterId === input.voterId,
  );
  if (existing) {
    existing.choice = input.choice;
    existing.votedAt = new Date().toISOString();
    return ok(existing);
  }
  const vote: PollVote = {
    pollId: input.pollId,
    voterId: input.voterId,
    choice: input.choice,
    votedAt: new Date().toISOString(),
    invalidated: false,
  };
  store.pollVotes.push(vote);
  return ok(vote);
}

export interface ClosePollInput {
  pollId: Id;
  /** 조기 종료 처리자(제안자/임원/오너). 기한 도래 자동 종료는 null(D-035). */
  closedBy: Id | null;
  /** `lib/rules`의 판정 순수 함수가 이미 계산한 결과. */
  outcome: PollOutcome;
}

const STATUS_BY_OUTCOME: Record<PollOutcome, Poll["status"]> = {
  passed: "closed_passed",
  rejected: "closed_rejected",
  invalid: "closed_invalid",
};

/** 투표 종료 처리(FR-043) + 결과 저장(FR-044). */
export async function closePoll(input: ClosePollInput): Promise<DataResult<Poll>> {
  const poll = store.polls.find((p) => p.id === input.pollId);
  if (!poll) return err("not_found", `poll ${input.pollId} 를 찾을 수 없다.`);
  if (poll.status !== "open") {
    return err("conflict", `poll ${input.pollId} 는 이미 종료됐다.`);
  }
  poll.status = STATUS_BY_OUTCOME[input.outcome];
  poll.closedBy = input.closedBy;
  poll.result = input.outcome;
  poll.decidedAt = new Date().toISOString();
  return ok(poll);
}
