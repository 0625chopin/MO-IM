import { notFound } from "next/navigation";

import { InviteMemberDialog } from "@/components/crews/InviteMemberDialog";
import { JoinRequestPanel } from "@/components/crews/JoinRequestPanel";
import { MemberList } from "@/components/crews/MemberList";
import { getAuthSession } from "@/components/shell/get-auth-session";
import {
  getCrewById,
  getCrewMembership,
  getProfileById,
  listCrewMembers,
  listJoinRequestsForCrew,
  listMyBlockedProfileIds,
} from "@/lib/data";
import { deriveUserRoleForPermissionCheck, isActiveMembership } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import { strings, t } from "@/lib/strings";
import type { CrewMembershipRole, Id, JoinRequest } from "@/lib/types";

import type { JoinRequestRowViewModel, MemberRowViewModel } from "./crew-member-view-models";

/** FR-015 역할 정렬 목록 — 오너 > 임원 > 일반(`docs/requirements/requirements.md`, Task 017A). */
const ROLE_RANK: Record<CrewMembershipRole, number> = { owner: 0, staff: 1, member: 2 };

/**
 * 멤버 관리 컨테이너(SC-14, F009·F010·F012~F015·F032, Task 017A, D-030 ①). 역할 정렬 목록·
 * 초대 다이얼로그·가입 신청 승인/반려 탭·임원 임명 화면 상태를 조립하는 단일 지점이다.
 *
 * **크루원 게이트가 이미 "활성 멤버십"을 보장한다** — `(app)/crews/[crewId]/layout.tsx`가
 * 그 판정을 라우트 레벨에서 먼저 끝낸다(D-039). 이 컨테이너는 그 판정을 반복하지 않고, 대신
 * "역할이 무엇인가"(오너/임원/일반) — 이 화면의 각 기능(초대·승인/반려·임명·탈퇴)마다 다른
 * 판정 — 만 `checkPermission`으로 새로 계산한다.
 *
 * **가입 신청 목록은 승인 권한이 있을 때만 조회한다** — 일반 크루원은 `crew:approve_join_request`가
 * 애초에 거부되므로 `JoinRequestPanel` 자체를 그리지 않는다. 데이터도 그 경우 조회하지 않아
 * 불필요한 프로필 조인을 피한다.
 *
 * **31일차(CREW, archived 크루 쓰기 표면 감사) — 쓰기 버튼을 `crew.status === "active"`로도
 * 가둔다.** 이 컨테이너는 원래 crew.status를 전혀 읽지 않아 archived 크루에서도 초대·가입
 * 신청 승인/반려·임원 임명·오너 이양·강퇴 버튼이 전부 정상 활성 상태로 열려 있었다 —
 * `CrewSettingsContainer`가 I-070에서 겪은 것과 같은 구조의 결함이다(같은 레이아웃의
 * `ArchivedCrewBanner`가 이유는 안내하지만 이 컨테이너의 쓰기 버튼 노출 여부는 그것과
 * 무관하게 결정됐다). 다만 이 화면은 설정 화면과 달리 **멤버 로스터(읽기)가 archived
 * 크루에서도 의미가 있어** 컨테이너 전체를 막지 않고 로스터는 그대로 둔 채 초대·승인/반려·
 * 임명·이양·강퇴만 `crew.status === "active"`로 추가로 가둔다 — `BoardListContainer`의
 * `canWrite = permission && crew?.status === "active"` 패턴과 같다(새 패턴 아님). Server
 * Action 쪽 강제 경계는 각 액션 파일에서 같은 회차에 별도로 추가했다(이 UI 변경은 그 위에
 * 얹는 방어). 본인 탈퇴(`leavePermission`)는 self-service라 제외한다(아래 참고).
 *
 * **33일차(CREW, I-152 처분) — "가입 신청 패널 자체를 표시/조작과 함께 막는다"는 위 31일차
 * 판단을 되돌린다.** BOARD가 I-152를 "`/crews/{id}/settings`에서 대기 중 가입 신청을 볼 수
 * 없다"로 보고했지만, 실제로 그 패널(`JoinRequestPanel`)은 `/settings`(`CrewSettingsContainer`,
 * 순수 쓰기 폼 3개뿐)가 아니라 **이 컨테이너**(`/members`)에만 있다 — 이슈 위치 서술 자체가
 * 부정확했다(팀장 인계 자료도 이 오류를 그대로 옮겨 적었다). 위치를 바로잡고 나면 진짜 결함이
 * 드러난다: 31일차에 "로스터(읽기)는 archived에서도 의미 있다"고 판단해 놓고 바로 옆의
 * 가입 신청 목록(그 자체도 읽기다 — "누가 신청했는가"는 결정 가능 여부와 무관하게 사실이다)은
 * 같은 논리를 적용하지 않고 `canApprove`(쓰기 권한) 뒤에 숨겼다. **"쓰기 전용 라우트는 통째로
 * 막는다"는 19일차 결정을 `/members`처럼 이미 읽기 콘텐츠(로스터)를 가진 화면의 부분 요소에
 * 잘못 옮겨 적용한 것**이라 이번에 되돌린다. `canViewJoinRequests`(역할만 검사, `crew:
 * approve_join_request`가 애초에 crew.status를 안 본다)로 열람 자격을 분리하고, `canDecide
 * JoinRequests`(`canViewJoinRequests && isActive`)만 승인/반려 버튼에 남겨 `JoinRequestPanel`에
 * 내려보낸다. SELECT RLS(`join_requests_select_requester_or_staff`)도 crew.status를 요구하지
 * 않아(활성 멤버십 + staff/owner 역할만 확인) archived 크루에서도 조회 자체는 항상 성공한다 —
 * disband가 `crew_memberships`를 건드리지 않기 때문이다(`docs/decisions/crew-lifecycle-040.md`).
 * 상세 판정 근거는 `docs/DECISIONS.draft.CREW.md`.
 */
export async function CrewMembersContainer({ crewId }: { crewId: Id }) {
  const crew = await getCrewById(crewId);
  if (!crew) {
    notFound();
  }

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    // 크루원 게이트가 이미 인증을 보장하므로 정상 경로에서는 도달하지 않는다 — TypeScript
    // 좁히기(아래 `session.profileId` 접근)를 위한 방어 분기다.
    notFound();
  }

  const viewerMembership = await getCrewMembership(crewId, session.profileId);
  const viewerRole = deriveUserRoleForPermissionCheck(viewerMembership);

  // 31일차(CREW, archived 크루 쓰기 표면 감사) — 아래 "쓰기" 판정에만 곱한다. 로스터·처리
  // 내역 열람과 본인 탈퇴(`leavePermission`)는 archived 크루에서도 여전히 의미가 있어
  // 제외한다(탈퇴는 자기 자신만 대상인 self-service라 다른 쓰기 버튼과 위험도가 다르다).
  const isActive = crew.status === "active";

  const canInvite = checkPermission({ role: viewerRole, action: "crew:invite_member" }).allowed && isActive;
  // 33일차(CREW, I-152) — "볼 수 있는가"와 "결정할 수 있는가"를 분리한다. `crew:approve_join_request`는
  // 역할(임원 이상)만 보고 crew.status를 보지 않는 순수 판정이라 그대로 열람 자격으로 쓴다 — SELECT
  // RLS(`join_requests_select_requester_or_staff`)도 crew.status를 요구하지 않아(멤버십만 확인)
  // archived 크루에서도 조회 자체는 항상 성공한다(disband가 crew_memberships를 건드리지 않는다,
  // `docs/decisions/crew-lifecycle-040.md`). "결정(승인/반려)"만 D-089("해산=동결")에 따라
  // `isActive`를 추가로 곱한다 — 열람 자격이 있어도 archived면 버튼을 못 쓴다.
  const canViewJoinRequests = checkPermission({ role: viewerRole, action: "crew:approve_join_request" }).allowed;
  const canDecideJoinRequests = canViewJoinRequests && isActive;
  const canAppoint = checkPermission({ role: viewerRole, action: "crew:appoint_staff" }).allowed && isActive;
  const canTransferOwnership =
    checkPermission({ role: viewerRole, action: "crew:transfer_ownership" }).allowed && isActive;
  const leavePermission = checkPermission({
    role: viewerRole,
    action: "crew:leave",
    context: { hasOwnerSuccessorOrDisband: false },
  });

  const memberships = (await listCrewMembers(crewId))
    .filter((m) => isActiveMembership(m.status))
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.joinedAt.localeCompare(b.joinedAt));

  // FR-081(Task 042A) — 신고·차단 버튼 노출용. 크루 판정과 무관한 전역 목록이라 역할 계산과
  // 병렬로 조회한다.
  const blockedIds = new Set(await listMyBlockedProfileIds());

  const members: MemberRowViewModel[] = await Promise.all(
    memberships.map(async (membership) => {
      const profile = await getProfileById(membership.profileId);
      const isSelf = membership.profileId === session.profileId;
      // FR-027 각주⁴ — 임원은 일반 크루원만 강퇴 가능. targetRole 컨텍스트로 오너/staff 대상을
      // 여기서 걸러낸다(Server Action이 최종 판정을 다시 하므로 여기서는 버튼 노출용).
      const removePermission = checkPermission({
        role: viewerRole,
        action: "crew:remove_member",
        context: { targetRole: membership.role },
      });
      return {
        profileId: membership.profileId,
        displayName: profile?.displayName ?? strings.common.profile.unknownAuthor,
        handle: profile?.handle ?? "",
        avatarUrl: profile?.avatarUrl ?? null,
        role: membership.role,
        isSelf,
        canAppoint: canAppoint && membership.role !== "owner",
        canLeave: isSelf && leavePermission.allowed,
        leaveBlockedReason:
          isSelf && !leavePermission.allowed
            ? strings.crew.members.leave.errors.ownerMustTransferOrDisband
            : null,
        canTransferOwnership: canTransferOwnership && !isSelf && membership.role !== "owner",
        canRemove: !isSelf && membership.role !== "owner" && removePermission.allowed && isActive,
        isBlockedByViewer: blockedIds.has(membership.profileId),
        canReportOrBlock: !isSelf,
      };
    }),
  );

  let pendingRequests: JoinRequestRowViewModel[] = [];
  let historyRequests: JoinRequestRowViewModel[] = [];

  if (canViewJoinRequests) {
    const requests = await listJoinRequestsForCrew(crewId);
    const toViewModel = async (request: JoinRequest): Promise<JoinRequestRowViewModel> => {
      const requester = await getProfileById(request.requesterId);
      return {
        id: request.id,
        requesterDisplayName: requester?.displayName ?? strings.common.profile.unknownAuthor,
        requesterHandle: requester?.handle ?? "",
        requesterAvatarUrl: requester?.avatarUrl ?? null,
        message: request.message,
        status: request.status,
      };
    };

    [pendingRequests, historyRequests] = await Promise.all([
      Promise.all(requests.filter((r) => r.status === "pending").map(toViewModel)),
      Promise.all(requests.filter((r) => r.status !== "pending").map(toViewModel)),
    ]);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-lg font-medium text-foreground">{strings.crew.members.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t((s) => s.crew.members.memberCountLabel, { count: members.length })}
          </p>
        </div>
        {canInvite && <InviteMemberDialog crewId={crewId} />}
      </header>

      <MemberList crewId={crewId} crewName={crew.name} members={members} />

      {canViewJoinRequests && (
        <JoinRequestPanel
          crewId={crewId}
          pending={pendingRequests}
          history={historyRequests}
          canDecide={canDecideJoinRequests}
        />
      )}
    </div>
  );
}
