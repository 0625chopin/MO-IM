import { describe, expect, it } from "vitest";

import { computeQuorum, countVotedForQuorum } from "./quorum";

/**
 * D-052 최소 스펙 테스트(24일차). `computeQuorum`은 SQL(`run_poll_auto_close_job`)로도
 * 이중 구현돼 있다(I-071) — 이 테스트는 그 SQL과 대조하지 않는다(범위 밖, I-071 "후속"
 * 참고). 여기서 고정하는 건 **TS 쪽 구현이 D-003·D-032가 문서화한 대로 동작하는가**뿐이다.
 * 이 값이 바뀌면(예: 정족수 비율 변경) SQL 쪽도 함께 고쳐야 한다는 결합은 여전히 수동
 * 규율(코드 리뷰)에 의존한다.
 */
describe("computeQuorum", () => {
  it("D-032: ceil(대상자/3)이다 — floor였다면 0이 될 대상자 2명 케이스로 고정한다", () => {
    const result = computeQuorum({ eligibleVoterCount: 2, votedCount: 0 });
    expect(result.required).toBe(1);
    expect(result.met).toBe(false);
  });

  it("대상자 2명 · 1명 투표 — required 1을 충족한다", () => {
    const result = computeQuorum({ eligibleVoterCount: 2, votedCount: 1 });
    expect(result.required).toBe(1);
    expect(result.met).toBe(true);
  });

  it("대상자 3명 — required가 정확히 1이다(3으로 나누어떨어지는 경계)", () => {
    const result = computeQuorum({ eligibleVoterCount: 3, votedCount: 1 });
    expect(result.required).toBe(1);
    expect(result.met).toBe(true);
  });

  it("대상자 4명 — ceil(4/3)=2로 올림된다", () => {
    const result = computeQuorum({ eligibleVoterCount: 4, votedCount: 1 });
    expect(result.required).toBe(2);
    expect(result.met).toBe(false);
  });

  it("대상자 0명 — required 0, 0표로도 충족된다(방어적 경계값)", () => {
    const result = computeQuorum({ eligibleVoterCount: 0, votedCount: 0 });
    expect(result.required).toBe(0);
    expect(result.met).toBe(true);
  });

  it("actual은 votedCount를 그대로 반영한다", () => {
    const result = computeQuorum({ eligibleVoterCount: 9, votedCount: 5 });
    expect(result.actual).toBe(5);
    expect(result.required).toBe(3);
    expect(result.met).toBe(true);
  });
});

/**
 * `tally.participantCount`를 그대로 돌려준다(I-119, 24일차 — 세 필드를 다시 더하지 않는다).
 * D-031(대상자 5명 미만 + 진행 중이면 선택지별 집계 숨김)이 적용되면 `forCount`·
 * `againstCount`·`abstainCount`는 0으로 오지만 `participantCount`는 항상 정확하다 — 이
 * 비대칭이 이 함수가 세 필드를 합산하던 옛 구현을 버린 이유이므로, "숨김 상태에서도
 * 정확한 값을 돌려주는가"를 회귀 테스트로 고정한다.
 */
describe("countVotedForQuorum", () => {
  it("participantCount를 그대로 반환한다", () => {
    expect(
      countVotedForQuorum({ participantCount: 6, forCount: 3, againstCount: 2, abstainCount: 1 }),
    ).toBe(6);
  });

  it("D-031 숨김 상태(세 필드가 0)에서도 participantCount는 그대로 살아 있다 — I-119 회귀 방지", () => {
    expect(
      countVotedForQuorum({ participantCount: 4, forCount: 0, againstCount: 0, abstainCount: 0 }),
    ).toBe(4);
  });

  it("전부 0이면 0을 반환한다", () => {
    expect(
      countVotedForQuorum({ participantCount: 0, forCount: 0, againstCount: 0, abstainCount: 0 }),
    ).toBe(0);
  });
});
