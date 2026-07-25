import type { CrewMembershipRole, Id, JoinRequestStatus } from "@/lib/types";

/**
 * `MemberList`(표현)가 받는 멤버 한 행의 모양(Task 017A, D-030 ①). `role` 정렬(오너 > 임원 >
 * 일반)은 컨테이너가 이미 끝낸 순서 그대로 배열에 담아 넘긴다 — 표현 컴포넌트는 재정렬하지
 * 않는다. `canAppoint`·`canLeave`는 `checkPermission`(`lib/rules/permission.ts`) 판정 결과를
 * 그대로 받은 값이다(R-015 — 새 판정을 만들지 않는다).
 */
export interface MemberRowViewModel {
  profileId: Id;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  role: CrewMembershipRole;
  /** 이 행이 지금 화면을 보는 본인인가. */
  isSelf: boolean;
  /** 오너가 이 행의 역할(임원 ↔ 일반)을 바꿀 수 있는가(FR-024, D-002 — 오너 행은 항상 false). */
  canAppoint: boolean;
  /** 본인 행이고 `crew:leave` 판정을 통과했는가(FR-026). 오너는 항상 false다(오너 이양·해산으로
   *  먼저 자리를 비워야 한다 — `leave-crew.ts` docstring 참고). */
  canLeave: boolean;
  /** `isSelf && !canLeave`일 때만 채워지는 안내 문구(예: 오너의 탈퇴 불가 사유). */
  leaveBlockedReason: string | null;
  /** 오너가 이 행(본인 제외 다른 active 크루원)에게 오너 자리를 넘길 수 있는가(FR-025, D-002).
   *  Task 040. */
  canTransferOwnership: boolean;
  /** 뷰어가 이 행을 강퇴할 수 있는가(FR-027). 오너는 임원·일반 누구나, 임원은 일반 크루원만
   *  (각주⁴) — 최종 판정은 Server Action이 `checkPermission`으로 다시 하므로 여기서는 버튼
   *  노출 여부만 결정한다(R-015, 오너 행은 항상 false). Task 040. */
  canRemove: boolean;
}

/**
 * `JoinRequestPanel`(표현)이 받는 가입 신청 한 건의 모양. `status`가 4값
 * (`pending`|`approved`|`rejected`|`withdrawn`)을 그대로 옮긴다 — I-040이 요구하는 대로
 * "반려됨"과 "철회함"을 화면에서 구분해 보여주려면 이 타입이 애초에 둘을 뭉개지 않아야 한다.
 */
export interface JoinRequestRowViewModel {
  id: Id;
  requesterDisplayName: string;
  requesterHandle: string;
  requesterAvatarUrl: string | null;
  message: string | null;
  status: JoinRequestStatus;
}
