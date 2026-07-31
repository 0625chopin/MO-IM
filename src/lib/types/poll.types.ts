import type { Id, ISODateTimeString } from "./common.types";
import type { CrewMembershipStatus } from "./crew.types";

export type PollStatus =
  | "open"
  | "closed_passed"
  | "closed_rejected"
  | "closed_invalid"
  | "cancelled";

/** 종료된 투표의 판정 결과. PollStatus의 closed_* 3종과 1:1 대응(FR-043 AC3, D-035). */
export type PollOutcome = "passed" | "rejected" | "invalid";

export interface Poll {
  id: Id;
  postId: Id;
  opensAt: ISODateTimeString;
  closesAt: ISODateTimeString;
  status: PollStatus;
  /** 종료 주체(제안자/임원/오너의 profileId). 기한 도래로 자동 종료됐으면 null(D-035). */
  closedBy: Id | null;
  result: PollOutcome | null;
  /** 판정 완료 시각. FR-045 AC2의 "5초"는 이 시각이 t=0이다(D-024). */
  decidedAt: ISODateTimeString | null;
}

/**
 * D-025 — 배열 컬럼 `eligibleSnapshot`을 대체하는 조인 테이블. PK는
 * (pollId, profileId). 투표 생성 시각의 대상자 스냅샷을 고정한다(3.4절).
 */
export interface PollEligibleVoter {
  pollId: Id;
  profileId: Id;
  /** 종료 알림 발송 시각·재시도 횟수(D-015 강퇴자 제외 발송, NFR-029 재시도 3회). */
  notifiedAt: ISODateTimeString | null;
  notifyAttempts: number;
}

export type VoteChoice = "for" | "against" | "abstain";

export interface PollVote {
  pollId: Id;
  voterId: Id;
  choice: VoteChoice;
  votedAt: ISODateTimeString;
  /** 강퇴 시 무효화 플래그(D-003) — true면 정족수·판정 집계에서 제외한다. */
  invalidated: boolean;
}

// ---- 판정 입출력 타입 (rules/의 정족수·투표 판정 순수 함수가 이 시그니처를 구현) ----

/**
 * 투표 대상자 스냅샷 1인의 "현재" 크루 멤버십 상태.
 *
 * `PollEligibleVoter`(투표 생성 시각의 스냅샷, D-025)와 그 시점 이후 갱신됐을 수 있는
 * `CrewMembership.status`를 조인한 결과다 — 데이터 접근 레이어(`lib/data`, Task 007)가
 * 이 조인을 만들어 `lib/rules`(Task 009A)의 정족수·종료 트리거③ 판정 함수에 인자로
 * 넘긴다. 데이터가 만들고 규칙이 소비하는 방향이라 원래 `lib/rules/poll-eligibility.ts`에
 * 로컬로 정의돼 있었지만, D-003(정족수 분모)·D-022(트리거③ 미투표자)가 이 같은
 * 스냅샷×멤버십 조인을 서로 다른 필터로 소비하는 공유 계약이고, Mock·Supabase 양쪽
 * 데이터 구현이 같은 타입을 생산해야 하므로(NFR-035) 다른 판정 입력 타입
 * (`QuorumCheckInput`·`PollDecisionInput`·`PermissionCheckInput`)과 같은 원칙에 맞춰
 * 여기로 승격했다(3일차 교차검증에서 CORE가 제기, 팀장 판정으로 확정). 필드는 원래
 * 정의와 동일 — 이름도 늘리지 않았다.
 */
export interface SnapshotVoterStatus {
  profileId: Id;
  currentMembershipStatus: CrewMembershipStatus;
}

/**
 * 대상자 1인의 "현재 멤버십 상태 × 투표 여부"를 신원 없이 담은 익명 다중집합 원소
 * (34일차, I-089 후속).
 *
 * 종료 트리거③(D-022 "미투표자 0명")의 입력이다. `SnapshotVoterStatus`와 다른 점은
 * `profileId`가 없다는 것 하나뿐이다 — `poll_votes`(개인 선택, D-003)를 조인해서만 만들 수
 * 있는 값이라 신원과 함께 반환하면 `poll_vote_tally`(찬반기권 집계, 이미 크루원 전체 공개)와
 * 결합해 소규모 poll(D-031이 5명 미만 특례를 따로 둘 만큼 흔한 사용 경로)에서 상대의 선택이
 * 역산되는 재식별 벡터가 생긴다(팀장 지적, 경위는 `docs/DECISIONS.draft.BOARD.md`) — 그래서
 * 데이터 레이어(`poll_eligible_voter_progress` RPC)가 신원을 아예 떼고 이 값만 만든다.
 * `countRemainingVoters`(`lib/rules/poll-eligibility.ts`)만 소비한다.
 */
export interface EligibleVoterProgress {
  currentMembershipStatus: CrewMembershipStatus;
  hasVoted: boolean;
}

/**
 * 정족수 판정 입력. D-032 — required = ceil(eligibleVoterCount / 3), floor 아님.
 * eligibleVoterCount·votedCount는 호출부가 D-022("스냅샷 ∩ 현재 투표 가능자")로
 * 이미 걸러서 넣는다 — 이 타입 자체는 그 필터링을 강제하지 않는다.
 */
export interface QuorumCheckInput {
  eligibleVoterCount: number;
  votedCount: number;
}

export interface QuorumCheckResult {
  required: number;
  actual: number;
  met: boolean;
}

/**
 * 무효화되지 않은 표의 선택지별 집계. 기권은 정족수 분모에는 포함하되
 * 가결 판정(찬성 > 반대)에서는 제외한다(D-003).
 *
 * **`participantCount`(24일차, I-119) — `forCount+againstCount+abstainCount`의 합과
 * 별개로 반드시 채운다.** D-031(대상자 5명 미만 + 진행 중이면 선택지별 집계 숨김)이
 * 적용되면 `forCount`·`againstCount`·`abstainCount`는 0(원래 `null`)으로 오지만, 참여자
 * "수"는 D-031이 가리는 대상이 아니다(`PollTally.tsx` 컴포넌트 docstring, `poll_vote_tally`
 * SQL 함수의 `participant_count`가 숨김 여부와 무관하게 항상 정확한 이유). 이 필드가 없던
 * 시절 `countVotedForQuorum`이 세 필드의 합으로 참여자 수를 대신 계산해, 대상자 5명 미만인
 * 모든 진행 중 투표에서 "참여 N명"이 실제 투표 수와 무관하게 항상 0으로 보이는 결함이 있었다
 * (I-119 — 실시간 브로드캐스트 결함으로 오인됐던 I-105를 24일차에 재현하다 발견. I-105는
 * 원인 판정이 바뀌어 닫혔다 — "브로드캐스트가 안 온다"가 아니라 "브로드캐스트는 오는데
 * 집계 값이 틀렸다"였다, `docs/ISSUES.md` I-105 정정 참고).
 */
export interface PollTally {
  participantCount: number;
  forCount: number;
  againstCount: number;
  abstainCount: number;
}

export interface PollDecisionInput {
  tally: PollTally;
  quorum: QuorumCheckResult;
}

/**
 * 최종 판정. 규칙(D-003): 정족수 미달 → invalid, 정족수 충족 + 동수 → rejected,
 * 정족수 충족 + 찬성 > 반대 → passed, 그 외(찬성 < 반대) → rejected.
 */
export interface PollDecisionResult {
  outcome: PollOutcome;
  quorum: QuorumCheckResult;
  tally: PollTally;
}
