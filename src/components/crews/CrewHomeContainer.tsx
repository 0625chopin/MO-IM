import { notFound } from "next/navigation";

import { CrewHome } from "@/components/crews/CrewHome";
import { CrewIntroPreview } from "@/components/crews/CrewIntroPreview";
import { PrivateCrewNotice } from "@/components/crews/PrivateCrewNotice";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCrewById, getCrewMembership, getPublicCrewMemberCount, listCrewMembers } from "@/lib/data";
import { deriveUserRoleForPermissionCheck, isActiveMembership } from "@/lib/rules/crew-membership-transition";
import { resolveJoinRequestButtonState } from "@/lib/rules/join-request-button-state";
import { checkPermission } from "@/lib/rules/permission";
import type { Id } from "@/lib/types";

/**
 * 크루 홈 컨테이너(SC-09, FR-011·FR-022, D-007, Task 016B, D-030 ①) — "크루 홈 4분기 화면
 * 상태"(ROADMAP)를 조립하는 단일 지점이다. `public`/`private` × 소속/비소속 조합에서 실제로
 * 다른 모습이 필요한 것은 **세 갈래**뿐이다(소속이면 공개 범위와 무관하게 같은 화면이라
 * 4칸 중 2칸이 겹친다):
 *
 * 1. 활성 멤버십(`crew_member`/`crew_staff`/`crew_owner`) → `CrewHome`(전체 화면).
 * 2. `private` 크루의 비소속자(게스트 포함) → `PrivateCrewNotice`(이름 + "초대 전용" 안내뿐,
 *    D-007 원문 그대로 — 소개조차 보여주지 않는다).
 * 3. `public` 크루의 비소속자 → `CrewIntroPreview` + 가입 신청 버튼 상태 기계
 *    (`resolveJoinRequestButtonState`, `lib/rules`).
 *
 * **이 라우트(`src/app/crews/[crewId]/page.tsx`)는 `(app)` 밖이다** — 게스트도 도달한다
 * (D-007, I-036 해소 결과, `docs/CONVENTIONS.md` D-030 ④ 절 참고). 그래서 `getAuthSession()`을
 * 직접 호출하고 `assertAuthenticatedSession`은 쓰지 않는다 — 그 헬퍼는 `(app)` 레이아웃이
 * 인증을 이미 보장한 경계에서만 쓴다(guest가 여기서는 오류가 아니라 유효한 방문자다,
 * `resolve-board-viewer.ts`와 같은 패턴).
 *
 * 크루가 없으면(해산·오타 URL) `notFound()`로 404 처리한다 — private 크루의 "초대 전용"과는
 * 다른 경우다(그건 크루가 *있지만* 못 보는 것, 이건 크루 자체가 없는 것).
 */
export async function CrewHomeContainer({ crewId }: { crewId: Id }) {
  const crew = await getCrewById(crewId);
  if (!crew) {
    notFound();
  }

  const session = await getAuthSession();
  const isAuthenticated = session.status === "authenticated";
  const membership = isAuthenticated ? await getCrewMembership(crewId, session.profileId) : null;

  if (membership && isActiveMembership(membership.status)) {
    const role = deriveUserRoleForPermissionCheck(membership);
    const canManageSettings = checkPermission({ role, action: "crew:update_info" }).allowed;
    const members = await listCrewMembers(crewId);
    const memberCount = members.filter((m) => isActiveMembership(m.status)).length;

    return (
      <CrewHome
        crewId={crew.id}
        name={crew.name}
        description={crew.description}
        category={crew.category}
        colorIndex={crew.colorKey}
        visibility={crew.visibility}
        memberCount={memberCount}
        canManageSettings={canManageSettings}
      />
    );
  }

  if (crew.visibility === "private") {
    return <PrivateCrewNotice crewName={crew.name} />;
  }

  // I-081 해소 — 이 분기는 비소속 방문자(anon 포함)용이라 listCrewMembers(직접 select)를
  // 쓰면 crew_memberships RLS가 항상 0행을 줘서 멤버 수가 "0명"으로 고정된다. D-007·FR-012
  // AC3가 public 크루의 멤버 수는 게스트도 볼 수 있어야 한다고 요구하므로, RLS를 우회하는
  // crew_directory_summary RPC(getPublicCrewMemberCount)를 쓴다 — 위 활성 멤버십 분기의
  // listCrewMembers는 원래 정확하므로 그대로 둔다.
  const memberCount = await getPublicCrewMemberCount(crewId);
  const joinState = resolveJoinRequestButtonState({
    isAuthenticated,
    crewVisibility: crew.visibility,
    membership,
  });

  return (
    <CrewIntroPreview
      crewId={crew.id}
      name={crew.name}
      description={crew.description}
      category={crew.category}
      colorIndex={crew.colorKey}
      memberCount={memberCount}
      joinState={joinState}
    />
  );
}
