import type { EligibleVoterProgress, SnapshotVoterStatus } from "@/lib/types/poll.types";

/**
 * 아래 두 함수는 `SnapshotVoterStatus`(투표 대상자 스냅샷 1인의 "현재" 멤버십
 * 상태)를 **서로 다른 필터**로 소비한다 — 타입 정의·데이터 레이어와의 계약·승격
 * 경위는 `@/lib/types/poll.types.ts`를 참고한다(3일차에 이 파일의 로컬 정의에서
 * 그쪽으로 승격됨. 필드는 그대로). 이 모듈은 조회하지 않고 인자로만 받는다
 * (NFR-036, R-015 — `@/lib/data/*` import 금지).
 */

/**
 * 정족수 분모(대상자 수)를 스냅샷에서 계산한다.
 *
 * D-003 — **강퇴자(`removed`)는 표를 무효화하고 분모에서도 제외**한다. 반면 **자진
 * 탈퇴자(`left`)는 스냅샷 명단에 남기되 미투표 처리**하므로 분모에 그대로 남는다.
 * 그래서 이 함수는 `removed` 하나만 걸러내고 `left`·`invited`·`declined` 등 그 밖의
 * 상태는 전부 분모에 포함한다.
 */
export function countQuorumEligibleVoters(voters: readonly SnapshotVoterStatus[]): number {
  return voters.filter((voter) => voter.currentMembershipStatus !== "removed").length;
}

/**
 * 종료 트리거③("미투표자 0명이면 즉시 자동 종료")의 미투표자 수를 계산한다.
 *
 * D-022 — 이 트리거의 미투표자는 **"스냅샷 ∩ 현재 투표 가능자(`active`)"**로 센다.
 * `left`·`removed` 상태를 그대로 남겨 두면 그들은 영원히 투표할 수 없으므로 미투표자
 * 수가 결코 0에 닿지 않아 트리거가 죽는다(D-022 맥락) — 그래서 `active`만 센다.
 *
 * 정족수 분모(`countQuorumEligibleVoters`, D-003)와는 **다른 집합**이다: 정족수는
 * `removed`만 빼고 `left`는 남기지만, 이 함수는 `active`가 아니면(= `left`·`removed`
 * 포함) 전부 뺀다. D-022는 D-003을 뒤집지 않고 이 트리거 하나만 보완한다.
 *
 * **34일차(I-089 후속) — 입력이 `EligibleVoterProgress[]`로 바뀌었다(신원 제거).** 이전엔
 * `(voters: SnapshotVoterStatus[], votedProfileIds: ReadonlySet<Id>)`를 받아
 * `voter.profileId`로 `votedProfileIds`를 조회해 매칭했다. 그런데 이 판정식이 실제로 쓰는
 * 것은 "이 대상자가 투표했는가"라는 사실 하나뿐이다 — `profileId` 자체는 판정식에 관여하지
 * 않았고 매칭 키로만 쓰였다. `cast-vote.ts`가 그 매칭을 신원 기반으로 하려면 대상자
 * 명단(`poll_eligible_voters`)과 투표자 명단(`poll_votes`, 개인 선택 D-003)을 둘 다 신원과
 * 함께 조회해야 하는데, `poll_vote_tally`(찬반기권 집계, 이미 크루원 전체 공개)와 결합하면
 * 소규모 poll에서 상대의 선택이 역산되는 재식별 벡터가 된다(팀장 지적, 경위는
 * `docs/DECISIONS.draft.BOARD.md`). 그래서 데이터 레이어가 매칭을 미리 끝내(신원 없는 익명
 * RPC, `poll_eligible_voter_progress`) `hasVoted`를 붙여 주도록 바꿨다 — **판정식
 * 자체(active AND NOT 투표함)는 한 글자도 안 바뀌었다**(NFR-036, 로직 이동이 아니라 입력
 * 모양 변경).
 */
export function countRemainingVoters(entries: readonly EligibleVoterProgress[]): number {
  return entries.filter(
    (entry) => entry.currentMembershipStatus === "active" && !entry.hasVoted,
  ).length;
}

/** D-003 종료 트리거③ — 미투표자(D-022 정의)가 0명이면 마감 전이라도 즉시 종료한다. */
export function shouldAutoCloseByAllVoted(remainingVoters: number): boolean {
  return remainingVoters === 0;
}
