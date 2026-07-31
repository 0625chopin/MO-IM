/**
 * 권한 매트릭스 순수 함수 — Task 009B (NFR-036, R-015).
 *
 * 요구사항 `docs/requirements/requirements.md` 3.3절 권한 매트릭스는 총 35행이다.
 * 그중 회원가입(FR-001)·로그인/로그아웃(FR-002) 2행은 크루 스코프 role이 아니라
 * 세션·라우트 경계라 `PermissionAction`에서 이미 제외돼 있다(`permission.types.ts`
 * 참고) — 남는 33행을 이 판정 대상으로 삼는다. 그중 "자기 게시글 수정·삭제"
 * (FR-032) 1행은 "타인 게시글 삭제"가 이미 별행인 것과 대칭을 맞추려고
 * `post:update_own`·`post:delete_own` 두 액션으로 나눴다 — 그래서 `PermissionAction`
 * ·`PERMISSION_MATRIX`의 실제 항목 수는 33행이 아니라 **34개 액션**이었다. 이 34개
 * 액션 전부를 여기 표로 옮기고, 각주 ¹~⁵의 조건부 허용(○)만 `PermissionCheckContext`
 * 로 판정한다.
 *
 * **Task 041(FR-033, 21일차 BOARD) 추가** — "댓글 작성"(comment:create) 1행만 매트릭스에
 * 있었고 댓글 수정·삭제 3행(post:update_own/delete_own/delete_any와 대칭)이 원 33행 집계에서
 * 빠져 있었다. `comment:update_own`·`comment:delete_own`·`comment:delete_any`를 더해 실제
 * 액션 수는 34개에서 **37개**가 됐다.
 *
 * **팀장 요청(D-111, 2026-07-31)으로 활동 사진 3행이 더해져 이제 40개다** —
 * `photo:create`·`photo:delete_own`·`photo:delete_any`. 3.3절 매트릭스에 대응 행이 없는
 * 신규 기능이라 게시글 3분할과 같은 값으로 새로 열었다(근거는 `permission.types.ts` 주석).
 *
 * React·Next·데이터 레이어를 import하지 않는다(zone 1, `eslint.config.mjs`).
 * 데이터(예: 크루 공개 범위, 강퇴 대상 role)는 전부 `context` 인자로 받는다 —
 * 이 함수가 직접 크루·멤버십을 조회하지 않는다.
 */

import type {
  PermissionAction,
  PermissionCheckContext,
  PermissionCheckInput,
  PermissionCheckResult,
  UserRole,
} from "@/lib/types";

/**
 * 매트릭스 셀. 3.3절 범례(● 허용 / ○ 조건부 허용 / − 불가)를 코드로 옮긴 값.
 * "conditional"인 셀만 {@link resolveConditional}이 추가로 판정한다.
 */
type Allowance = "allow" | "conditional" | "deny";

const ROLES = [
  "guest",
  "member",
  "crew_member",
  "crew_staff",
  "crew_owner",
  "system_admin",
] as const satisfies readonly UserRole[];

/**
 * 3.3절 33행(회원가입·로그인 2행 제외) 중 FR-032 1행을 `post:update_own`·
 * `post:delete_own` 두 액션으로 나누고, Task 041(FR-033)이 댓글 수정·삭제 3행을 더한
 * 40개 액션 전부(D-111의 사진 3행 포함). 열 순서는 표와 동일
 * (비회원·일반회원·크루원·임원·오너·관리자). `Record<PermissionAction,
 * Record<UserRole, Allowance>>` 타입 자체가 "액션 하나라도 빠지면 컴파일
 * 에러"를 강제한다 — 매트릭스 누락을 컴파일 타임에 잡는다.
 */
const PERMISSION_MATRIX: Record<PermissionAction, Record<UserRole, Allowance>> = {
  // 자기 프로필 수정 — FR-004. isSelf는 checkPermission에서 별도 확인(OWN_SCOPED_ACTIONS).
  "profile:update_own": {
    guest: "deny",
    member: "allow",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 회원 탈퇴 — FR-005. crew_member·crew_staff는 각주¹(항상 허용, 부수효과만 있음),
  // crew_owner는 각주²(오너 이양/해산 전제조건, hasOwnerSuccessorOrDisband).
  "profile:withdraw": {
    guest: "deny",
    member: "allow",
    crew_member: "conditional",
    crew_staff: "conditional",
    crew_owner: "conditional",
    system_admin: "allow",
  },
  // 핸들로 사용자 검색 — FR-006, D-005(전 회원 허용).
  "search:by_handle": {
    guest: "deny",
    member: "allow",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 크루 개설 — FR-010.
  "crew:create": {
    guest: "deny",
    member: "allow",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 크루 검색·목록 열람 — FR-014. 비회원은 각주³(public 크루만, D-007).
  "crew:browse": {
    guest: "conditional",
    member: "allow",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 크루 상세(공개 정보) 열람 — FR-011. 비회원은 각주³(public 크루만, D-007).
  "crew:read": {
    guest: "conditional",
    member: "allow",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 크루 정보 수정 — FR-011. 일반 크루원은 불가, 임원 이상만.
  "crew:update_info": {
    guest: "deny",
    member: "deny",
    crew_member: "deny",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 크루 공개 범위 변경 — FR-012. 오너 전용(D-002 귀결 — 존폐에 준하는 결정).
  "crew:update_visibility": {
    guest: "deny",
    member: "deny",
    crew_member: "deny",
    crew_staff: "deny",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 크루 해산 — FR-013. 오너 전용.
  "crew:disband": {
    guest: "deny",
    member: "deny",
    crew_member: "deny",
    crew_staff: "deny",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 크루원 초대 — FR-020. 관리자는 크루 운영에 개입하지 않으므로 불가.
  "crew:invite_member": {
    guest: "deny",
    member: "deny",
    crew_member: "deny",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 초대 수락·거절 — FR-021. 초대 대상은 정의상 아직 크루 미소속(member)이다.
  "invitation:respond": {
    guest: "deny",
    member: "allow",
    crew_member: "deny",
    crew_staff: "deny",
    crew_owner: "deny",
    system_admin: "deny",
  },
  // 가입 신청 — FR-022. 신청자는 정의상 아직 크루 미소속(member)이다.
  "crew:request_join": {
    guest: "deny",
    member: "allow",
    crew_member: "deny",
    crew_staff: "deny",
    crew_owner: "deny",
    system_admin: "deny",
  },
  // 가입 신청 승인·반려 — FR-023. 임원 이상.
  "crew:approve_join_request": {
    guest: "deny",
    member: "deny",
    crew_member: "deny",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 임원 임명·해임 — FR-024, D-002. 오너 전용.
  "crew:appoint_staff": {
    guest: "deny",
    member: "deny",
    crew_member: "deny",
    crew_staff: "deny",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 오너 이양 — FR-025, D-002(크루당 오너 1명의 귀결). 오너 전용.
  "crew:transfer_ownership": {
    guest: "deny",
    member: "deny",
    crew_member: "deny",
    crew_staff: "deny",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 크루 탈퇴 — FR-026. 오너는 각주²(이양/해산 전제조건 없이는 탈퇴 불가).
  "crew:leave": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "conditional",
    system_admin: "deny",
  },
  // 크루원 강퇴 — FR-027. 임원은 각주⁴(일반 크루원만 강퇴 가능, targetRole).
  "crew:remove_member": {
    guest: "deny",
    member: "deny",
    crew_member: "deny",
    crew_staff: "conditional",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 게시판 열람 — FR-031. 크루 스코프라 비소속 일반회원은 불가.
  "board:read": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 게시글 작성 — FR-030.
  "post:create": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 자기 게시글 수정 — FR-032. isSelf는 checkPermission에서 별도 확인.
  "post:update_own": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 자기 게시글 삭제 — FR-032. isSelf는 checkPermission에서 별도 확인.
  "post:delete_own": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 타인 게시글 삭제 — FR-032. 임원 이상(운영 목적)·관리자.
  "post:delete_any": {
    guest: "deny",
    member: "deny",
    crew_member: "deny",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 댓글 작성 — FR-033.
  "comment:create": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 자기 댓글 수정 — FR-033. isSelf는 checkPermission에서 별도 확인. post:update_own과 대칭
  // (Task 041, 21일차 BOARD).
  "comment:update_own": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 자기 댓글 삭제 — FR-033. isSelf는 checkPermission에서 별도 확인.
  "comment:delete_own": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 타인 댓글 삭제 — FR-033. post:delete_any와 대칭으로 임원 이상(운영 목적)·관리자만.
  "comment:delete_any": {
    guest: "deny",
    member: "deny",
    crew_member: "deny",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 활동 사진 업로드 — 팀장 요청 신설. post:create와 같은 값(크루원만, 관리자는 크루 콘텐츠를
  // 직접 만들지 않는다).
  "photo:create": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 자기가 올린 사진 삭제. isSelf는 checkPermission에서 별도 확인(post:delete_own과 대칭).
  "photo:delete_own": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 타인이 올린 사진 삭제 — 임원 이상(운영 목적)·관리자.
  "photo:delete_any": {
    guest: "deny",
    member: "deny",
    crew_member: "deny",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 모임 제안글 작성 — FR-034.
  "poll:create_proposal": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 투표 참여 — FR-041.
  "poll:vote": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 투표 조기 종료 — FR-043. 일반 크루원은 각주⁵(제안 작성자 본인만).
  "poll:close_early": {
    guest: "deny",
    member: "deny",
    crew_member: "conditional",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 채팅 메시지 전송 — FR-051.
  "chat:send_message": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 자기 메시지 삭제 — FR-054. isSelf는 checkPermission에서 별도 확인.
  "chat:delete_own_message": {
    guest: "deny",
    member: "deny",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 타인 메시지 삭제 — FR-054. 임원 이상·관리자.
  "chat:delete_any_message": {
    guest: "deny",
    member: "deny",
    crew_member: "deny",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // 캘린더 열람(자기 소속 크루) — FR-061. 일반회원도 허용(소속 크루가 없으면
  // 빈 캘린더가 보일 뿐 — 이 판정 함수는 "역할이 허용되는가"만 보고, 실제로
  // 표시할 Meetup 목록을 좁히는 것은 데이터 조회 레이어의 몫이다.
  "calendar:view": {
    guest: "deny",
    member: "allow",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "allow",
  },
  // Meetup 취소·변경 — FR-065. 일반 크루원은 각주⁵(제안 작성자 본인만).
  "meetup:cancel_or_update": {
    guest: "deny",
    member: "deny",
    crew_member: "conditional",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 신고 — FR-080.
  "report:create": {
    guest: "deny",
    member: "allow",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 사용자 차단 — FR-081.
  "block:create": {
    guest: "deny",
    member: "allow",
    crew_member: "allow",
    crew_staff: "allow",
    crew_owner: "allow",
    system_admin: "deny",
  },
  // 신고 처리·계정 제재 — FR-082. 관리자 전용.
  "report:handle": {
    guest: "deny",
    member: "deny",
    crew_member: "deny",
    crew_staff: "deny",
    crew_owner: "deny",
    system_admin: "allow",
  },
};

/**
 * 매트릭스가 "●"(allow)라도 실질적으로 "본인 소유물"을 전제하는 행위 —
 * `permission.types.ts`의 `isSelf` 각주¹("자기 프로필 수정, 자기 게시글
 * 수정·삭제 등")이 가리키는 대상. 3.3절 표는 행 이름 자체("자기 게시글
 * 수정·삭제")로 이미 "본인"을 전제하지만, 판정을 호출자(컴포넌트)의 암묵적
 * 스코핑에 맡기면 R-015 신호(판정이 화면에 인라인됨)가 되므로 이 순수
 * 함수가 `context.isSelf`로 명시적으로 확인한다.
 */
const OWN_SCOPED_ACTIONS: ReadonlySet<PermissionAction> = new Set([
  "profile:update_own",
  "post:update_own",
  "post:delete_own",
  "chat:delete_own_message",
  // Task 041(FR-033, 21일차 BOARD) — post:update_own/delete_own과 같은 이유.
  "comment:update_own",
  "comment:delete_own",
  // 활동 사진(팀장 요청 신설) — 같은 이유.
  "photo:delete_own",
]);

/**
 * 매트릭스 셀이 "○"(conditional)인 행위만 여기서 각주 1~5에 따라 판정한다.
 * 이 함수에 들어오는 (action, role) 조합은 항상 `PERMISSION_MATRIX`에서
 * "conditional"로 표시된 셀뿐이다 — 즉 role은 이미 그 행위에 대해 조건부
 * 허용 대상으로 좁혀져 있다.
 */
function resolveConditional(
  action: PermissionAction,
  role: UserRole,
  context: PermissionCheckContext,
): PermissionCheckResult {
  switch (action) {
    case "crew:browse":
    case "crew:read":
      // 각주³ / D-007: public 크루만 비회원 열람 허용.
      return context.crewVisibility === "public"
        ? { allowed: true }
        : { allowed: false, reason: "crew_not_public" };

    case "crew:leave":
    case "profile:withdraw":
      // 매트릭스상 crew_member·crew_staff의 profile:withdraw만 "conditional"이면서
      // role !== "crew_owner"인 경우다 — 3.3절 각주¹: 탈퇴 자체는 항상 허용되고,
      // 소속 크루 멤버십이 모두 left로 전이되는 것은 부수효과(crew-membership-
      // transition.ts 소관)라 여기서는 막지 않는다.
      if (role !== "crew_owner") {
        return { allowed: true };
      }
      // 각주²: 오너는 오너 이양(FR-025) 또는 크루 해산(FR-013)이 선행되지
      // 않으면 크루 탈퇴도 회원 탈퇴도 할 수 없다(FR-005 AC1).
      return context.hasOwnerSuccessorOrDisband === true
        ? { allowed: true }
        : { allowed: false, reason: "owner_requires_successor_or_disband" };

    case "crew:remove_member":
      // 각주⁴: 임원은 대상이 일반 크루원(targetRole === "member")일 때만 강퇴 가능.
      // 오너·임원을 대상으로 하면 거부 — 그 경우는 오너만 강퇴할 수 있다.
      return context.targetRole === "member"
        ? { allowed: true }
        : { allowed: false, reason: "staff_can_only_remove_member" };

    case "poll:close_early":
    case "meetup:cancel_or_update":
      // 각주⁵: 제안 작성자 본인만 조기 종료·취소/변경 가능.
      return context.isProposalAuthor === true
        ? { allowed: true }
        : { allowed: false, reason: "not_proposal_author" };

    default:
      // 방어적 분기 — PERMISSION_MATRIX에 "conditional" 셀을 추가하면서
      // 이 switch에 케이스를 빠뜨렸을 때만 도달한다(R-015 신호: 새 조건부
      // 행위를 매트릭스에는 넣고 판정 로직은 빠뜨리는 실수).
      return { allowed: false, reason: "unhandled_conditional_action" };
  }
}

/**
 * 3.3절 권한 매트릭스 판정. 순수 함수 — role·action·context만으로 결정되고
 * 그 외 어떤 것도(현재 시각, 전역 상태, 데이터 조회) 참조하지 않는다.
 *
 * 호출자는 role·context를 직접 조립해서 넘긴다 — 이 함수는 크루 멤버십을
 * 조회하지 않는다(NFR-036, zone 1). 크루 멤버십 → `UserRole` 변환은
 * `crew-membership-transition.ts`의 `deriveUserRoleForPermissionCheck`를 쓴다.
 */
export function checkPermission(input: PermissionCheckInput): PermissionCheckResult {
  const { role, action, context = {} } = input;
  const cell = PERMISSION_MATRIX[action][role];

  if (cell === "deny") {
    return { allowed: false, reason: "role_not_permitted" };
  }

  if (cell === "conditional") {
    return resolveConditional(action, role, context);
  }

  // cell === "allow"
  if (OWN_SCOPED_ACTIONS.has(action) && context.isSelf !== true) {
    return { allowed: false, reason: "not_self" };
  }
  return { allowed: true };
}

/** 테스트·디버깅용 — 러너 미도입(R-002) 상태라 당장은 수동 확인에만 쓴다. */
export function listAllowedActionsForRole(role: UserRole): readonly PermissionAction[] {
  return (Object.keys(PERMISSION_MATRIX) as PermissionAction[]).filter(
    (action) => PERMISSION_MATRIX[action][role] !== "deny",
  );
}

/** 매트릭스가 실제로 다루는 역할 목록 — 순회·테스트용. `UserRole`과 항상 동기화된다. */
export const PERMISSION_MATRIX_ROLES = ROLES;
