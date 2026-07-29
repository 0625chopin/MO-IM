/**
 * 크루 멤버십 상태 전이 순수 함수 — Task 009B (NFR-036, R-015).
 *
 * **I-109·I-110(23일차) 정정**: 이 파일 상단 주석은 원래 `docs/requirements/requirements.md`
 * 2.4절 다이어그램("declined/rejected/left/removed --> [*], 종결 상태, 이후 전이 없음")을
 * 그대로 옮긴 것이었다. 그런데 DB(`crew_memberships_guard_self_transition`·
 * `crew_memberships_extend_self_service_join_request_transitions`·
 * `crews_guard_owner_transfer_target_active`·`invitations_provision_membership` 등,
 * `supabase/migrations/`)는 이미 **세 종류의 "종결 상태 탈출"을 실제로 허용하고 있었다**
 * — `{declined,rejected,left}→requested`(FR-022 자진 재신청)·`removed→active`(FR-027 E3
 * 강퇴 해제, 오너 전용)·`{declined,rejected,left,removed}→invited`(FR-020 재초대, DESIGN이
 * DB→모듈 방향 대조로 추가 발견). 즉 **2.4절 다이어그램 자체가 FR-020·FR-022·FR-027 E3와
 * 모순**되고, 이 모듈("2.4절의 단일 소스"라고 스스로 선언한 곳, NFR-036)이 다이어그램
 * 쪽을 따라가는 바람에 DB·FR과 어긋나 있었다. `requirements.md`의 다이어그램은 이번에
 * 고치지 않는다(CORE가 같은 파일을 FR-063 건으로 동시에 고치고 있어 충돌을 피한다) —
 * 이슈(I-110, 부분 해결)에만 기록하고 다음 회차로 넘긴다. 이 파일은 **DB가 실제로
 * 허용하는 전이를 반영**하도록 아래처럼 갱신한다.
 *
 * ```
 * [*] --> invited   : 오너/임원이 초대 (FR-020)
 * [*] --> requested : 사용자가 가입 신청 (FR-022)
 * invited --> active   : 사용자 수락 (FR-021)
 * invited --> declined : 사용자 거절 (FR-021)
 * requested --> active   : 오너/임원 승인 (FR-023)
 * requested --> rejected : 오너/임원 반려 · 본인 자진 철회 (FR-023 · FR-022 E4)
 * active --> left    : 본인 탈퇴 (FR-026)
 * active --> removed : 강퇴 (FR-027)
 * declined/rejected/left --> requested : 본인 자진 재신청 (FR-022,
 *   `crew_memberships_extend_self_service_join_request_transitions`·
 *   `crew_memberships_block_removed_self_reapply` — `removed`는 이 재신청 대상에서
 *   명시적으로 제외된다, FR-022 E3/FR-027 AC2)
 * removed --> active : 오너의 강퇴 해제 (FR-027 E3, 오너 전용 — `crew_memberships_
 *   guard_self_transition`의 "남의 행" 분기. role은 항상 `member`로 정규화된다,
 *   D-002·D-067·D-068과 대칭)
 * declined/rejected/left/removed --> invited : 오너/임원의 재초대 (FR-020,
 *   `invitations_provision_membership`의 `ON CONFLICT ... WHERE status IN (...)` —
 *   `src/lib/rules/invite-eligibility.ts`가 "FR-020은 FR-022 E3 같은 재초대 제한을 두지
 *   않는다"고 이미 의도된 동작으로 문서화해 뒀다. `removed`도 배제하지 않는다 — 가입
 *   신청과 달리 초대는 오너·임원의 명시적 의사이기 때문이다. 이 전이는 status만 바꾸고
 *   role은 그대로다 — 그 다음 `invited→active`에서 I-107이 role을 `member`로 정규화한다)
 * ```
 *
 * **`isTerminalMembershipStatus`를 삭제했다(I-110, 23일차)**: 위 세 전이(재신청·강퇴 해제·
 * 재초대)가 반영되면서 `declined`·`rejected`·`left`·`removed` 전부가 최소 하나의 outgoing
 * 이벤트를 갖게 됐다 — "종결 상태"라는 개념 자체가 이 도메인에 더 이상 존재하지 않는다.
 * 그 함수는 호출부가 저장소 전체에서 0건이었지만(`npx tsc --noEmit`으로 재확인), 이름이
 * 약속하는 의미("이 상태는 종결인가")와 실제 동작(이제 항상 `false`)이 정반대가 되어
 * 그대로 남기면 다음 개발자가 이름만 보고 잘못 쓸 위험이 이름을 지운 이익보다 컸다 — 개념이
 * 사라졌으면 그 개념의 함수도 함께 지운다. 종결 여부가 필요하면 `isActiveMembership`(소속
 * 여부)이나 개별 `canTransitionCrewMembership` 호출로 판단한다.
 *
 * React·Next·데이터 레이어를 import하지 않는다(zone 1). 실제 멤버십 레코드
 * 조회·갱신은 이 함수의 몫이 아니다 — 호출자(Server Action)가 현재 상태를
 * 인자로 넘기고, 반환된 다음 상태를 저장하는 것도 호출자 책임이다.
 */

import type { CrewMembership, CrewMembershipRole, CrewMembershipStatus, UserRole } from "@/lib/types";

/**
 * 2.4절 다이어그램의 화살표(엣지) 이름. `invite`·`request`는 상태가 없는
 * [*]에서 시작하므로 {@link createCrewMembershipStatus}가 별도로 다룬다.
 */
export type CrewMembershipEvent =
  | "accept_invitation"
  | "decline_invitation"
  | "approve_request"
  | "reject_request"
  | "leave"
  | "remove"
  // I-109(23일차) 추가 — DB가 이미 허용하던 두 탈출 전이를 반영한다(위 파일 docstring
  // "I-109 정정" 참고). 원 2.4절 다이어그램에는 없던 이벤트라 이름도 새로 붙였다.
  | "reapply"
  | "reinstate"
  // I-110(23일차, DESIGN 최종 대조로 추가 발견) — `invitations_provision_membership`의
  // ON CONFLICT WHERE 목록이 네 상태 전부에서 재초대를 허용한다(아래 TRANSITIONS 참고).
  | "reinvite";

/**
 * 상태별 허용 이벤트 → 다음 상태. 값이 없는 이벤트(예: `declined`에서
 * `leave`)는 다이어그램에 화살표가 없다는 뜻 — 정의되지 않은 조합은 전부
 * 여기서 `undefined`가 되고, {@link transitionCrewMembershipStatus}가 이를
 * `null`(불허 전이)로 변환한다.
 *
 * `Record<CrewMembershipStatus, ...>` 타입이 7개 상태를 전부 요구하므로
 * 다이어그램의 상태 하나를 빠뜨리면 컴파일 에러가 난다.
 */
const TRANSITIONS: Record<CrewMembershipStatus, Partial<Record<CrewMembershipEvent, CrewMembershipStatus>>> = {
  invited: {
    accept_invitation: "active",
    decline_invitation: "declined",
  },
  requested: {
    approve_request: "active",
    reject_request: "rejected",
  },
  active: {
    leave: "left",
    remove: "removed",
  },
  // I-109(23일차) — 아래 네 상태는 2.4절 다이어그램상 "종결"로 그려졌지만 DB는 이미
  // 탈출 전이를 허용한다(파일 상단 docstring 참고). `removed`만 재신청 대상에서
  // 명시적으로 제외된다(FR-022 E3/FR-027 AC2, `crew_memberships_block_removed_self_
  // reapply`) — 강퇴자는 `reapply`가 아니라 오너의 `reinstate`로만 돌아올 수 있다.
  //
  // I-110(23일차, DESIGN 최종 대조) — 네 상태 전부에 `reinvite: "invited"`도 추가한다.
  // `invitations_provision_membership`의 `ON CONFLICT ... WHERE status IN ('declined',
  // 'rejected','left','removed')`가 이 네 상태 전부에서 재초대를 허용한다(FR-020,
  // `src/lib/rules/invite-eligibility.ts`가 "FR-020은 FR-022 E3 같은 재초대 제한을 두지
  // 않는다"고 이미 의도된 동작으로 문서화해 뒀다). `reapply`(본인 자진 재신청, FR-022)와
  // 달리 `reinvite`는 오너·임원의 제3자 행위이고 `removed`도 배제하지 않는다 — 강퇴자도
  // 초대는 다시 받을 수 있다(가입 신청과 다른 규칙, 위 참조 파일 근거). 이 전이는 status만
  // `invited`로 바꾸고 role은 건드리지 않는다 — 그다음 `invited→active`(수락)에서 I-107이
  // role을 `member`로 정규화하므로 안전하다.
  declined: {
    reapply: "requested",
    reinvite: "invited",
  },
  rejected: {
    reapply: "requested",
    reinvite: "invited",
  },
  left: {
    reapply: "requested",
    reinvite: "invited",
  },
  removed: {
    reinstate: "active",
    reinvite: "invited",
  },
};

/**
 * 2.4절의 `[*] --> invited`(FR-020 초대) / `[*] --> requested`(FR-022 가입
 * 신청) — 아직 멤버십 레코드가 없는 최초 생성 시점의 상태를 정한다.
 */
export function createCrewMembershipStatus(origin: "invite" | "request"): CrewMembershipStatus {
  return origin === "invite" ? "invited" : "requested";
}

/**
 * 현재 상태에서 이벤트가 발생했을 때의 다음 상태. 다이어그램에 없는
 * (state, event) 조합이면 `null`(전이 불허)을 반환한다 — 예외를 던지지
 * 않는다. 호출자가 UI 에러 상태(D-030 ③ "도메인 오류")로 다루기 쉽도록
 * 값으로 실패를 표현한다.
 */
export function transitionCrewMembershipStatus(
  current: CrewMembershipStatus,
  event: CrewMembershipEvent,
): CrewMembershipStatus | null {
  return TRANSITIONS[current][event] ?? null;
}

/** 현재 상태에서 해당 이벤트가 다이어그램상 허용되는지만 확인한다(부작용 없음). */
export function canTransitionCrewMembership(
  current: CrewMembershipStatus,
  event: CrewMembershipEvent,
): boolean {
  return transitionCrewMembershipStatus(current, event) !== null;
}

/** 크루 컨텍스트 권한 판정(`permission.ts`)이 "소속 중"으로 취급할 상태인지. */
export function isActiveMembership(status: CrewMembershipStatus): boolean {
  return status === "active";
}

/**
 * `CrewMembership.role`(크루별 role: owner/staff/member)과 상태를 3.1절
 * 전역 `UserRole`(권한 판정 입력)로 투영한다. `permission.types.ts`가 명시하듯
 * `UserRole`은 저장 컬럼이 아니라 판정 시점의 파생값이므로, 이 변환을
 * 호출부(컨테이너·Server Action)마다 따로 구현하면 판정이 화면에 흩어지는
 * R-015 신호가 된다 — 여기 한 곳에 모아 둔다.
 *
 * `status !== "active"`이면(예: `invited`·`left`·`removed`) 그 크루에 대해서는
 * 아직/더 이상 소속이 아니므로 가장 낮은 전역 역할인 `"member"`로 취급한다.
 * 실제로 `"member"`조차 아닌 `"guest"`인지는 이 함수가 알 수 없다 — 로그인
 * 여부는 세션·레이아웃 경계(D-030 ④)의 몫이라 호출자가 별도로 판단해야 한다.
 */
export function deriveUserRoleForPermissionCheck(
  membership: Pick<CrewMembership, "role" | "status"> | null,
): UserRole {
  if (!membership || !isActiveMembership(membership.status)) {
    return "member";
  }
  return membershipRoleToUserRole(membership.role);
}

function membershipRoleToUserRole(role: CrewMembershipRole): UserRole {
  switch (role) {
    case "owner":
      return "crew_owner";
    case "staff":
      return "crew_staff";
    case "member":
      return "crew_member";
  }
}
