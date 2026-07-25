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

  const canInvite = checkPermission({ role: viewerRole, action: "crew:invite_member" }).allowed;
  const canApprove = checkPermission({ role: viewerRole, action: "crew:approve_join_request" }).allowed;
  const canAppoint = checkPermission({ role: viewerRole, action: "crew:appoint_staff" }).allowed;
  const canTransferOwnership = checkPermission({ role: viewerRole, action: "crew:transfer_ownership" }).allowed;
  const leavePermission = checkPermission({
    role: viewerRole,
    action: "crew:leave",
    context: { hasOwnerSuccessorOrDisband: false },
  });

  const memberships = (await listCrewMembers(crewId))
    .filter((m) => isActiveMembership(m.status))
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.joinedAt.localeCompare(b.joinedAt));

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
        canRemove: !isSelf && membership.role !== "owner" && removePermission.allowed,
      };
    }),
  );

  let pendingRequests: JoinRequestRowViewModel[] = [];
  let historyRequests: JoinRequestRowViewModel[] = [];

  if (canApprove) {
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
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

      {canApprove && <JoinRequestPanel crewId={crewId} pending={pendingRequests} history={historyRequests} />}
    </div>
  );
}
