import { describe, expect, it } from "vitest";

import type { SnapshotVoterStatus } from "@/lib/types/poll.types";

import {
  countQuorumEligibleVoters,
  countRemainingVoters,
  shouldAutoCloseByAllVoted,
} from "./poll-eligibility";

function voter(profileId: string, status: SnapshotVoterStatus["currentMembershipStatus"]) {
  return { profileId, currentMembershipStatus: status };
}

/**
 * D-052 최소 스펙 테스트(24일차). `countQuorumEligibleVoters`(D-003 분모)와
 * `countRemainingVoters`(D-022 트리거③ 미투표자)는 **의도적으로 다른 집합**을 센다 — 이
 * 차이가 이 모듈의 핵심이라 두 함수를 나란히 비교하는 테스트를 포함한다.
 */
describe("countQuorumEligibleVoters", () => {
  it("removed만 분모에서 제외한다(D-003)", () => {
    const voters = [
      voter("a", "active"),
      voter("b", "removed"),
      voter("c", "left"),
      voter("d", "invited"),
      voter("e", "declined"),
    ];
    // removed(b) 하나만 빠지고 나머지 4명은 분모에 남는다.
    expect(countQuorumEligibleVoters(voters)).toBe(4);
  });

  it("left는 removed와 달리 분모에 그대로 남는다(자진 탈퇴자는 미투표 처리, D-003)", () => {
    expect(countQuorumEligibleVoters([voter("a", "left")])).toBe(1);
  });

  it("빈 스냅샷이면 0이다", () => {
    expect(countQuorumEligibleVoters([])).toBe(0);
  });
});

describe("countRemainingVoters", () => {
  it("active이면서 아직 투표하지 않은 사람만 센다(D-022)", () => {
    const voters = [voter("a", "active"), voter("b", "active"), voter("c", "left")];
    const voted = new Set(["a"]);
    // b(active, 미투표)만 남는다. c는 active가 아니라 애초에 제외.
    expect(countRemainingVoters(voters, voted)).toBe(1);
  });

  it("left·removed는 영원히 투표할 수 없어도 미투표자로 세지 않는다 — 트리거가 죽지 않게 하는 D-022의 핵심", () => {
    const voters = [voter("a", "left"), voter("b", "removed")];
    expect(countRemainingVoters(voters, new Set())).toBe(0);
  });

  it("active 전원이 투표하면 0이다", () => {
    const voters = [voter("a", "active"), voter("b", "active")];
    const voted = new Set(["a", "b"]);
    expect(countRemainingVoters(voters, voted)).toBe(0);
  });

  it("정족수 분모(countQuorumEligibleVoters)와 다른 집합을 센다는 것을 같은 스냅샷으로 대조한다", () => {
    // left 상태인 한 명만 있는 스냅샷: 분모에는 남지만(정족수), 트리거③ 미투표자로는 안 센다.
    const voters = [voter("a", "left")];
    expect(countQuorumEligibleVoters(voters)).toBe(1);
    expect(countRemainingVoters(voters, new Set())).toBe(0);
  });
});

describe("shouldAutoCloseByAllVoted", () => {
  it("미투표자 0명이면 true다(D-003 트리거③)", () => {
    expect(shouldAutoCloseByAllVoted(0)).toBe(true);
  });

  it("미투표자가 1명이라도 남으면 false다", () => {
    expect(shouldAutoCloseByAllVoted(1)).toBe(false);
  });
});
