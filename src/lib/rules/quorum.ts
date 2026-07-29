import type { PollTally, QuorumCheckInput, QuorumCheckResult } from "@/lib/types/poll.types";

/**
 * 정족수 판정 (D-003 · D-032).
 *
 * `required = ceil(eligibleVoterCount / 3)`. **floor가 아니라 ceil**인 이유(D-032):
 * 대상자가 2명인 크루에서 floor(2/3) = 0이 되면 아무도 투표하지 않아도 정족수가
 * 충족된 것으로 판정된다 — 정족수 규칙 자체가 무의미해진다. `Poll.quorumRatio` 같은
 * 가변 비율 컬럼은 두지 않는다(D-032) — 1/3은 코드 상수다.
 *
 * `eligibleVoterCount`(정족수 분모)·`votedCount`(참여자 수, 기권 포함)는 호출부가
 * D-003(분모 계산 — 강퇴자 제외, 자진 탈퇴자는 포함)·D-022(트리거③ 미투표자 —
 * "스냅샷 ∩ 현재 투표 가능자"라는 별개 집합, 분모 정의 자체는 D-003 그대로 둔다)로
 * 이미 걸러 넣는다 — 이 함수 자체는 그 필터링을 하지 않는다. 분모 계산은
 * `poll-eligibility.ts`의 `countQuorumEligibleVoters`, 참여자 수 계산은 이 파일의
 * `countVotedForQuorum`을 쓴다.
 */
export function computeQuorum(input: QuorumCheckInput): QuorumCheckResult {
  const required = Math.ceil(input.eligibleVoterCount / 3);
  const actual = input.votedCount;
  return { required, actual, met: actual >= required };
}

/**
 * 정족수 분모에 들어가는 "참여자 수"를 집계에서 뽑아낸다.
 *
 * D-003 — 기권은 명시적 3번째 선택지이며 **정족수에는 포함**하되(투표를 하긴 했으므로)
 * **가결 판정(찬성 > 반대)에서는 제외**한다. 가결 판정은 `poll-decision.ts`에서
 * `forCount`·`againstCount`만 비교한다 — 이 비대칭이 D-003의 핵심이라 두 함수로 분리했다.
 *
 * **`tally.participantCount`를 쓴다 — 세 필드를 다시 더하지 않는다(I-119, 24일차).**
 * D-031(대상자 5명 미만 + 진행 중이면 선택지별 집계 숨김)이 적용된 `PollTally`는
 * `forCount`·`againstCount`·`abstainCount`가 전부 0(숨김)이지만 `participantCount`는
 * 항상 정확하다 — 세 필드를 합산했다면 숨김 상태의 모든 진행 중 투표에서 참여자 수가
 * 실제 값과 무관하게 0으로 나왔을 것이다(실제로 그랬던 결함, `poll.types.ts`의
 * `PollTally` docstring 참고).
 */
export function countVotedForQuorum(tally: PollTally): number {
  return tally.participantCount;
}
