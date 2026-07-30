import { describe, expect, it } from "vitest";

import { canTransitionCrewMembership, transitionCrewMembershipStatus } from "./crew-membership-transition";

/**
 * I-143 해소(30일차) 최소 스펙 테스트. `src/lib/data/mock/crew.ts`의
 * `rejectCrewMembership`(임원 반려)이 `reject_request` 이벤트를 이 모듈 경유로 호출해
 * `requested --> rejected`(D-086, 임원 반려·본인 자진 철회 공용 종착 상태)를 만든다는
 * 사실을 여기서 고정한다.
 *
 * **31일차 갱신**: 대칭을 이루던 Mock `withdrawPendingCrewMembership`(본인 자진 철회)은
 * Task 032(18일차)부터 호출부가 0건이던 죽은 코드로 확인돼 삭제됐다(I-144). 이 테스트가
 * 고정하는 `reject_request` 전이 자체는 `rejectCrewMembership`을 통해 여전히 살아 있다.
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
