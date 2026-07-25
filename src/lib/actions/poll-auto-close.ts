import {
  closePoll,
  getPollTallyForDecision,
  listEligibleVotersWithCurrentStatus,
} from "@/lib/data";
import type { DataResult } from "@/lib/data/contracts";
import { decidePollOutcome } from "@/lib/rules/poll-decision";
import { countQuorumEligibleVoters } from "@/lib/rules/poll-eligibility";
import { computeQuorum, countVotedForQuorum } from "@/lib/rules/quorum";
import type { Id, Poll } from "@/lib/types";

/**
 * 투표 종료 판정 파이프라인 — **프로덕션 코드** (FR-043 종료 처리 + FR-044 판정, D-003).
 *
 * 일반 TS 모듈이다("use server" 지시자 없음) — Server Action이 아니라 `cast-vote.ts`(트리거③)·
 * `close-poll.ts`(트리거②, 트리거①의 Mock 시뮬레이션)가 공유하는 내부 헬퍼다. `lib/actions/`에
 * 있는 이유는 `lib/data`(쓰기)를 호출해야 해서다 — `lib/rules`(zone 1)는 데이터 레이어를 import할
 * 수 없다.
 *
 * **이 함수 자체는 종료 "트리거"가 무엇이었는지 모른다** — 어떤 트리거(기한 도래·조기 종료·
 * 미투표자 0명)로 호출됐든 여기서부터는 완전히 같은 판정을 탄다. 3개 트리거의 "발화 방식"만
 * Mock이고(v0.1엔 pg_cron이 없어 사람이 버튼을 누르거나 다음 투표 직후 동기 체크로 대신한다),
 * 판정 로직 자체(`computeQuorum`·`decidePollOutcome`)는 Task 009A의 순수 함수 그대로다(NFR-036,
 * R-015) — Task 034가 pg_cron 잡을 붙일 때 이 함수를 그대로 재사용하면 되고, 걷어낼 대상은
 * 호출부(트리거 발화 방식)이지 이 함수가 아니다.
 *
 * **Meetup 생성(FR-060)·알림 적재(FR-045)는 여기서 하지 않는다** — Task 019(투표 UI)의 참조
 * 범위는 FR-040~045까지이고, FR-060은 Task 034("투표 자동 종료·판정·Meetup 생성·알림
 * 파이프라인")가 명시적으로 소유한다. 그래서 `closed_passed`가 되어도 Meetup 레코드가 즉시
 * 따라오지 않는다 — `PollResult`가 그 간극을 "Meetup이 아직 없으면 링크를 보여주지 않는다"로
 * 방어적으로 다룬다(`getMeetupByPollId`가 null을 정상 상태로 반환).
 *
 * **집계는 `getPollTallyForDecision`을 쓴다 — `getPollTally`(화면 표시용, D-031 숨김 적용)가
 * 아니다.** 이 함수가 `open` 상태에서 호출된다는 사실 때문에 표시용 함수를 쓰면 대상자 5명
 * 미만 크루의 집계가 항상 0으로 보여 정족수·가결이 실제 표와 무관하게 계산되는 결함이
 * 있었다(17일차 핫픽스). 두 함수는 이름이 비슷하지만 계약이 다르므로 되돌리지 말 것 — 아래
 * 호출부 주석과 `docs/decisions/poll-vote-tally-for-decision-hotfix.md`에 전체 경위가 있다.
 */
export async function decideAndClosePoll(
  pollId: Id,
  closedBy: Id | null,
): Promise<DataResult<Poll>> {
  const [tally, voters] = await Promise.all([
    // **`getPollTally`가 아니라 `getPollTallyForDecision`** (17일차 핫픽스, CORE·DESIGN·BOARD
    // 3단 작업). `getPollTally`는 D-031(대상자 5명 미만 + `open`이면 진행 중 집계 숨김)을
    // 강제하는 표시용 함수라 숨김 구간에서 for/against/abstain을 0으로 반환한다 — 그런데 이
    // 함수는 poll이 아직 `open`인 동안 호출되므로(트리거③은 물론, 트리거②로 조기 종료할 때도
    // 호출 시점엔 여전히 `open`이다) 숨김 조건이 그대로 걸려 **실제 표와 무관하게 0 집계로
    // 정족수·가결을 계산**하는 결함이 있었다(`poll.ts`의 `getPollTally` docstring 참고). 두
    // 함수 이름이 비슷해 보여도 되돌리지 말 것 — `getPollTallyForDecision`은 D-003의 세 종료
    // 트리거 중 하나가 지금 참일 때만 실제 집계를 반환하고, 그 조건이 거짓이면(=이 함수가
    // 호출될 정상 상황이 아니면) 예외를 던진다(불변식 위반, `tally_hidden`). 그 예외는 여기서
    // 잡지 않고 호출부(`cast-vote.ts`·`close-poll.ts`)까지 그대로 전파한다 — `DataResult`로
    // 감싸 "그럴 수도 있는 실패"로 취급하면 원래 결함이 형태만 바꿔 되살아난다.
    getPollTallyForDecision(pollId),
    // 스냅샷×현재 멤버십 조인이 깨지면(정합성 오류) 이 함수가 예외를 던진다 — 의도된 동작이다
    // (poll.ts의 docstring 참고, D-030 ③ "스냅샷 이탈"). 여기서 잡지 않고 호출부까지 그대로
    // 전파한다.
    listEligibleVotersWithCurrentStatus(pollId),
  ]);

  const quorum = computeQuorum({
    eligibleVoterCount: countQuorumEligibleVoters(voters),
    votedCount: countVotedForQuorum(tally),
  });
  const decision = decidePollOutcome({ tally, quorum });

  return closePoll({ pollId, closedBy, outcome: decision.outcome });
}
