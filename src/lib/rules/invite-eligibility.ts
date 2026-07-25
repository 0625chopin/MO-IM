/**
 * 크루원 초대 가능 여부 판정 — 순수 함수 (NFR-036, R-015, Task 017A). FR-020 예외 흐름
 * E1(이미 멤버)·E2(대기 중인 초대 존재)를 판정한다. `invite-crew-member.ts`(Server Action)와
 * 향후 초대 다이얼로그의 버튼 비활성화 판정이 같은 기준을 쓰도록 이 한 곳에 모은다
 * (`join-request-eligibility.ts`와 같은 이유).
 *
 * E3(대상자가 나를 차단)·E4(옵트아웃)는 이 함수의 대상이 아니다 — 옵트아웃은
 * `handle-search.ts`가 검색 결과 자체를 `found: false`로 합류시켜 이미 걸러내고(초대 대상을
 * 특정할 수조차 없다), **차단(E3)은 Task 042A(FR-081)가 이 순수 함수가 아니라 DB RLS
 * 경계에서 구현했다** — `invitations_insert_staff_or_owner` 정책에
 * `not private.is_blocked(invitee_id, inviter_id)`가 추가됐다(`supabase/migrations/
 * 20260725114157_report_block_rpcs_042a.sql`). 여기서 판정하지 않은 이유는 클라이언트가
 * "상대가 나를 차단했는가"를 알 수 있는 안전한 경로가 없기 때문이다 — `blocks_select_self`
 * RLS는 본인이 만든 차단만 보여주므로, 이 함수에 그 값을 넘기려면 별도로 상대의 차단 여부를
 * 노출하는 조회가 필요한데 그 자체가 "차단됐다"는 사실을 초대자에게 알려줘 requirements.md
 * FR-020 E3("사유는 노출하지 않음")을 어긴다. `createInvitation`(`invitation.ts`)이 RLS
 * 거부를 `DataResult`로 감싸 일반 오류로 보여준다.
 *
 * **`requested`(대기 중 가입 신청)는 초대 불가로 차단한다(Task 032 교차검증 major 2 수정,
 * 18일차)** — `requirements.md` 2.4절 멤버십 상태도에 `requested → invited` 전이가 없다
 * (`[*] → invited`, `[*] → requested`, `requested → active`(FR-023 승인),
 * `requested → rejected`만 정의됨). 실 DB에서도 `invitations_provision_membership()`의
 * `ON CONFLICT ... WHERE status IN ('declined','rejected','left','removed')`에 `requested`가
 * 없어, `requested`인 사용자를 초대해 수락받아도 멤버십이 `requested`에 머무는 조용한 실패가
 * 났다(CORE 실측). 트리거를 고쳐 상태도에 없는 전이를 새로 만드는 대신, 애초에 이 조합을
 * 만들지 않는 쪽을 택했다 — 정당한 처리 경로는 FR-023(가입 신청 승인·반려)이다.
 */
import type { CrewMembership, Id } from "@/lib/types";

export type InviteIneligibleReason =
  | "self_invite"
  | "already_member"
  | "already_invited"
  | "already_requested";

export type InviteEligibility =
  | { eligible: true }
  | { eligible: false; reason: InviteIneligibleReason };

export interface InviteEligibilityInput {
  inviterId: Id;
  inviteeId: Id;
  /** 초대 대상의 현재 멤버십 레코드. 아직 어떤 관계도 없으면 `null`. */
  membership: Pick<CrewMembership, "status"> | null;
}

export function evaluateInviteEligibility(input: InviteEligibilityInput): InviteEligibility {
  const { inviterId, inviteeId, membership } = input;

  if (inviterId === inviteeId) {
    return { eligible: false, reason: "self_invite" };
  }

  switch (membership?.status) {
    case "active":
      // E1 — 이미 크루원.
      return { eligible: false, reason: "already_member" };
    case "invited":
      // E2 — 이미 대기 중인 초대(중복 발송 차단).
      return { eligible: false, reason: "already_invited" };
    case "requested":
      // 상태도에 requested→invited 전이가 없다(위 docstring) — 정당한 처리 경로는 FR-023
      // (가입 신청 승인·반려)이지 재초대가 아니다.
      return { eligible: false, reason: "already_requested" };
    default:
      // declined·rejected·left·removed·무관계는 전부 초대 가능. 강퇴 이력(removed)도
      // 가입 신청과 달리 초대는 오너·임원의 명시적 의사이므로 차단하지 않는다(FR-020은 FR-022
      // E3 같은 재초대 제한을 두지 않는다).
      return { eligible: true };
  }
}
