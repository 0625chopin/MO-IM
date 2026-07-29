import type { Id } from "@/lib/types/common.types";
import type { PollTally, PollVote } from "@/lib/types/poll.types";

/**
 * 무효화되지 않은 표만 선택지별로 집계한다.
 *
 * D-003 — 강퇴 시 무효화(`invalidated = true`)된 표는 집계·정족수 어디에도 들어가지
 * 않는다. 이 함수는 그 필터링만 하고, 정족수 분모(`countQuorumEligibleVoters`)나
 * 가결 판정(`decidePollOutcome`)은 별도 함수의 몫이다.
 */
export function computeVoteTally(votes: readonly PollVote[]): PollTally {
  let forCount = 0;
  let againstCount = 0;
  let abstainCount = 0;

  for (const vote of votes) {
    if (vote.invalidated) continue; // D-003 — 강퇴자 표는 집계에서 제외
    if (vote.choice === "for") forCount += 1;
    else if (vote.choice === "against") againstCount += 1;
    else abstainCount += 1; // "abstain"
  }

  // 이 함수는 D-031 숨김 개념이 없다(호출자가 이미 무효화되지 않은 실표만 넘긴다) — 그래서
  // participantCount는 항상 세 필드의 합과 같다. Supabase 실데이터 경로(`getPollTally`)만
  // RPC의 숨김된 0과 별개인 `participant_count`를 그대로 옮겨 쓴다(I-119).
  return { participantCount: forCount + againstCount + abstainCount, forCount, againstCount, abstainCount };
}

/**
 * 강퇴 처리 시 해당 크루원이 던진 표를 무효화한다.
 *
 * D-003 — "강퇴자의 표는 무효화하고 분모에서도 제외". 분모 제외는
 * `poll-eligibility.ts`의 `countQuorumEligibleVoters`(현재 멤버십 상태 기준)가
 * 맡고, 이 함수는 표 자체의 `invalidated` 플래그만 갱신한다. 이미 무효화된 표나
 * 다른 투표자의 표는 그대로 둔다 — 입력 배열을 변형하지 않고 새 배열을 반환한다
 * (순수 함수, NFR-036).
 */
export function invalidateVotesForRemovedMember(
  votes: readonly PollVote[],
  removedProfileId: Id,
): PollVote[] {
  return votes.map((vote) =>
    vote.voterId === removedProfileId && !vote.invalidated
      ? { ...vote, invalidated: true }
      : vote,
  );
}
