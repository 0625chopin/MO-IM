import type { InvitationRowViewModel } from "@/components/invitations/invitation-view-models";
import { InvitationList } from "@/components/invitations/InvitationList";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCrewById, getProfileById, listInvitationsForProfile } from "@/lib/data";
import { strings } from "@/lib/strings";
import type { Invitation } from "@/lib/types";

/**
 * 받은 초대함 컨테이너(SC-20, FR-021·028, D-030 ①, Task 017B) — 로그인 사용자가 받은 대기 중
 * 크루 초대 목록을 조립하는 단일 지점이다.
 *
 * `(app)/invitations`는 이미 `(app)/layout.tsx`가 인증을 보장하는 트리 안이라
 * `isAuthenticated` 조기 반환으로 타입만 좁힌다(`NotificationCenterContainer`와 같은 패턴,
 * 실제 리다이렉트는 하지 않는다).
 *
 * **24일차(I-095)** — 원래 throw 기반 `assertAuthenticatedSession`을 썼다. 경위·대체 패턴
 * 근거는 `@/components/shell/auth-session.ts` 모듈 docstring 참고.
 *
 * **대기 중(`pending`)만 보여준다** — 응답 완료(`accepted`·`declined`)·만료(`expired`) 건은
 * "받은 초대함"이 답할 목록이 아니다(FR-021이 정의하는 이 화면의 역할은 지금 응답이 필요한
 * 초대뿐이다). 크루가 이미 삭제됐거나(방어적 케이스, Mock에서는 발생하지 않는다) 초대를 보낸
 * 프로필을 찾을 수 없는 항목은 조용히 건너뛴다 — 고아 레코드를 화면에 반쪽짜리로 보여주는
 * 것보다 안전하다.
 */
export async function InvitationInboxContainer() {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    // (app) 레이아웃이 이미 미인증 분기를 선택했을 병렬 렌더링의 폐기 브랜치다(I-095).
    return null;
  }

  const pendingInvitations = await listInvitationsForProfile(session.profileId, "pending");

  const rows = (
    await Promise.all(pendingInvitations.map((invitation) => toInvitationRowViewModel(invitation)))
  ).filter((row): row is InvitationRowViewModel => row !== null);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{strings.invitation.inbox.description}</p>
      <InvitationList invitations={rows} />
    </div>
  );
}

async function toInvitationRowViewModel(invitation: Invitation): Promise<InvitationRowViewModel | null> {
  const [crew, inviter] = await Promise.all([
    getCrewById(invitation.crewId),
    getProfileById(invitation.inviterId),
  ]);
  if (!crew) return null;

  return {
    id: invitation.id,
    crewId: crew.id,
    crewName: crew.name,
    crewColorIndex: crew.colorKey,
    inviterDisplayName: inviter?.displayName ?? strings.common.profile.unknownAuthor,
    expiresAt: invitation.expiresAt,
  };
}
