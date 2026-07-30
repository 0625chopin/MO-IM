import type { Id } from "@/lib/types";

/**
 * `SystemAdminList`(표현)가 받는 관리자 한 행의 모양(I-075, 27일차, D-030 ①) —
 * `MemberRowViewModel`(`crews/crew-member-view-models.ts`)과 같은 위치 관례. `listSystemAdmins()`
 * 결과에 `isSelf`·`canRevoke`·`revokeBlockedReason`을 얹는다.
 *
 * **`admin-grant-revoke-rpcs-075.md` §4가 요구하는 사전 검증**을 이 파일이 아니라
 * `SystemAdminsContainer`(호출부)에서 계산한다 — `listSystemAdmins()`의 배열 길이(마지막
 * 관리자 여부)와 세션 프로필 id 비교(자기 자신 여부) 둘 다 컨테이너가 조회 시점에 이미
 * 가진 값이라 여기서 별도 판정 함수를 두지 않는다(`CrewMembersContainer`가 `canRemove`를
 * 직접 계산하는 것과 같은 선례 — R-015, 새 판정을 만들지 않는다. RPC/트리거 예외 메시지
 * 파싱 금지 원칙과도 같다).
 */
export interface SystemAdminRowViewModel {
  profileId: Id;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** `admin_list_system_admins`가 필터 없이 `is_system_admin` 행을 전부 반환하므로(§2) 이론상
   *  `"active"`가 아닌 값도 나올 수 있다 — 그 경우만 배지로 드러낸다. */
  status: string;
  /** 이 행이 지금 화면을 보는 관리자 본인인가(D-076). */
  isSelf: boolean;
  /** 이 행을 회수할 수 있는가 — `!isSelf && 전체 관리자 수 > 1`(D-076·D-078). false면
   *  `revokeBlockedReason`이 채워진다. */
  canRevoke: boolean;
  /** `canRevoke===false`일 때만 채워지는 안내 문구. */
  revokeBlockedReason: string | null;
}
