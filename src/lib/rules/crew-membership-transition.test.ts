import { describe, expect, it } from "vitest";

import { canTransitionCrewMembership, transitionCrewMembershipStatus } from "./crew-membership-transition";

/**
 * I-143 해소(30일차) 최소 스펙 테스트. `src/lib/data/mock/crew.ts`의
 * `rejectCrewMembership`(임원 반려)·`withdrawPendingCrewMembership`(본인 자진 철회)이
 * 같은 이벤트(`reject_request`)를 이 모듈 경유로 호출한다 — 두 함수가 우연히 같은 결과값을
 * 내던 것이 아니라 애초에 같은 전이 하나를 공유한다는 사실을 여기서 고정한다.
 */
describe("crew-membership-transition — reject_request (I-143)", () => {
  it("requested --reject_request--> rejected (FR-023 반려 · FR-022 E4 자진 철회 공용)", () => {
    expect(transitionCrewMembershipStatus("requested", "reject_request")).toBe("rejected");
  });

  it("requested가 아닌 상태에서는 reject_request가 불허(null)다", () => {
    expect(transitionCrewMembershipStatus("active", "reject_request")).toBeNull();
    expect(transitionCrewMembershipStatus("invited", "reject_request")).toBeNull();
    expect(transitionCrewMembershipStatus("rejected", "reject_request")).toBeNull();
  });

  it("canTransitionCrewMembership이 같은 판정을 boolean으로 반영한다", () => {
    expect(canTransitionCrewMembership("requested", "reject_request")).toBe(true);
    expect(canTransitionCrewMembership("active", "reject_request")).toBe(false);
  });
});
