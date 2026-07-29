import { describe, expect, it } from "vitest";

import type { PollTally, QuorumCheckResult } from "@/lib/types/poll.types";

import { decidePollOutcome, isPollTie } from "./poll-decision";

/**
 * D-052 최소 스펙 테스트(24일차). `decidePollOutcome`도 `run_poll_auto_close_job`(SQL)로
 * 이중 구현돼 있다(I-071, 트리거①). 이 테스트는 TS 쪽 세 갈래 판정(D-003)만 고정하고,
 * SQL과의 출력 대조는 이번 범위 밖이다.
 */

const met: QuorumCheckResult = { required: 3, actual: 5, met: true };
const notMet: QuorumCheckResult = { required: 3, actual: 1, met: false };

// participantCount(I-119)는 이 파일이 검증하는 판정 분기(정족수·동수·찬반 비교)와 무관하다
// — `decidePollOutcome`·`isPollTie` 둘 다 이 필드를 읽지 않는다. `PollTally`가 요구하는
// 필드라 타입을 맞추기 위해서만 세 필드의 합으로 채운다(이 테스트 파일에서는 D-031 숨김
// 시나리오를 다루지 않으므로 합산해도 안전하다 — 그 시나리오는 quorum.test.ts 몫).
function tally(forCount: number, againstCount: number, abstainCount = 0): PollTally {
  return { participantCount: forCount + againstCount + abstainCount, forCount, againstCount, abstainCount };
}

describe("decidePollOutcome", () => {
  it("정족수 미달이면 찬반 집계와 무관하게 invalid다(FR-044 AC3) — 찬성이 압도적이어도", () => {
    const result = decidePollOutcome({ tally: tally(10, 0), quorum: notMet });
    expect(result.outcome).toBe("invalid");
  });

  it("정족수 충족 + 찬성 > 반대 → passed(FR-044 AC1)", () => {
    const result = decidePollOutcome({ tally: tally(5, 3), quorum: met });
    expect(result.outcome).toBe("passed");
  });

  it("정족수 충족 + 동수 → rejected(D-003 '동수 처리: 부결', 타이브레이커 없음)", () => {
    const result = decidePollOutcome({ tally: tally(4, 4), quorum: met });
    expect(result.outcome).toBe("rejected");
  });

  it("정족수 충족 + 찬성 < 반대 → rejected", () => {
    const result = decidePollOutcome({ tally: tally(2, 6), quorum: met });
    expect(result.outcome).toBe("rejected");
  });

  it("전원 기권(0:0)도 동수로 취급해 rejected다 — 기권은 가결 비교에서 제외되므로", () => {
    const result = decidePollOutcome({ tally: tally(0, 0, 5), quorum: met });
    expect(result.outcome).toBe("rejected");
  });

  it("반환값이 입력 tally·quorum을 그대로 담아 돌려준다", () => {
    const input = { tally: tally(5, 3), quorum: met };
    const result = decidePollOutcome(input);
    expect(result.tally).toEqual(input.tally);
    expect(result.quorum).toEqual(input.quorum);
  });
});

describe("isPollTie", () => {
  it("찬성과 반대가 같으면 true다", () => {
    expect(isPollTie(tally(3, 3))).toBe(true);
  });

  it("0:0도 동수로 판정한다", () => {
    expect(isPollTie(tally(0, 0))).toBe(true);
  });

  it("찬성과 반대가 다르면 false다", () => {
    expect(isPollTie(tally(4, 3))).toBe(false);
  });
});
