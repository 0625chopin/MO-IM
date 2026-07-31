import { notFound } from "next/navigation";

import { ArchivedCrewBanner } from "@/components/crews/ArchivedCrewBanner";
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
 * 다른 경우다(그건 크루가 *있지만* 못 보는 것, 이건 크루 자체가 없는 것). **해산(`archived`)은
 * 이 경우가 아니다** — 해산은 `crews` 행을 지우지 않고 `status`만 바꾸므로(FR-013), 소속
 * 회원에게는 계속 크루 홈이 보여야 한다.
 *
 * **I-067 해소(30일차)** — 이 컨테이너는 활성 멤버십 분기에서 `crew.status`를 전혀 읽지
 * 않아, 해산된 크루의 홈이 일반 크루 홈과 똑같이(설정 버튼 포함) 렌더됐다(브라우저 실측으로
 * 확인). `(app)/crews/[crewId]/layout.tsx`가 이미 게시판·채팅·멤버 관리·설정 하위 라우트
 * 전체에 `ArchivedCrewBanner`를 공통으로 띄우고 있었는데(19일차, D-039 "알려라"만 담당하는
 * 패턴), 정작 그 레이아웃이 대상으로 삼지 않는다고 명시한 크루 홈(`/crews/[crewId]`, `(app)`
 * 밖)만 이 안내에서 빠져 있었다 — 같은 패턴을 여기도 적용해 빈틈을 닫는다. **쓰기 차단
 * (설정 폼이 실제로 편집 가능한 채로 남아 있는 문제, I-070)은 이 변경의 대상이 아니다** —
 * 그 레이아웃과 마찬가지로 이 컨테이너도 "알려라"만 하고, "설정" 버튼 자체는 숨기지 않는다
 * (숨기면 오너가 크루명이라도 다시 확인할 방법이 없어진다 — 배너로 "이 크루는 해산됐다"를
 * 먼저 보여주는 것으로 충분하다는 것이 기존 D-039 판단과 같은 결이다).
 *
 * **31일차(CREW, archived 크루 쓰기 표면 감사) — 비소속 방문자 분기에도 같은 배너를 단다.**
 * 위 30일차 수정은 "활성 멤버십" 분기에만 배너를 달았다 — public archived 크루를 비소속
 * 방문자(게스트 포함)가 보는 `CrewIntroPreview` 분기는 여전히 아무 안내 없이 일반 크루처럼
 * 보였고, `resolveJoinRequestButtonState`는 crew.status를 보지 않아 "가입 신청" 버튼도
 * 그대로 활성으로 떴다(`request-join-crew.ts`가 이번에 실제 사유로 정확히 거부하도록
 * 고쳐졌으므로 클릭해도 데이터는 안전하지만, 애초에 안내가 없는 것은 정직하지 않다).
 * 버튼 자체는 숨기지 않는다(위 문단과 같은 이유 — 실패 시 정확한 문구를 보여주는 것으로
 * 충분하다는 원칙을 여기도 그대로 적용한다) — `ArchivedCrewBanner`만 같은 방식으로 추가한다
 * (새 컴포넌트 없음, 활성 멤버십 분기와 완전히 같은 패턴).
 *
 * **`crew.status`가 여기서 신뢰 가능한 값인지 확인**(`crew.ts`의 `getCrewById` 불변식 참고) —
 * 이 분기는 `crew.visibility === "private"` 조건을 이미 통과한 뒤라(위에서 그 경우는 먼저
 * `PrivateCrewNotice`로 갈라진다) 도달 시점의 크루는 항상 `public`이다. `public` 크루는
 * `crews_select_anon_public`/`crews_select_authenticated` RLS가 멤버십과 무관하게 direct
 * select를 항상 허용하므로, `getCrewById`가 `status`를 항상 `"active"`로 고정해 반환하는
 * private 전용 RPC 폴백(0행일 때만 타는 경로)에는 이 분기가 도달하지 않는다 — 여기서 읽는
 * `crew.status`는 항상 실제 값이다.
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
      <>
        {crew.status === "archived" && <ArchivedCrewBanner />}
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
      </>
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
    <>
      {crew.status === "archived" && <ArchivedCrewBanner />}
      <CrewIntroPreview
        crewId={crew.id}
        name={crew.name}
        description={crew.description}
        category={crew.category}
        colorIndex={crew.colorKey}
        memberCount={memberCount}
        joinState={joinState}
      />
    </>
  );
}
