import { notFound } from "next/navigation";

import { CrewInfoForm } from "@/components/crews/CrewInfoForm";
import { CrewVisibilityForm } from "@/components/crews/CrewVisibilityForm";
import { DisbandCrewForm } from "@/components/crews/DisbandCrewForm";
import { assertAuthenticatedSession } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCrewById, getCrewMembership } from "@/lib/data";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

/**
 * 크루 설정 컨테이너(SC-15, FR-011·FR-012·FR-013, D-030 ①, Task 017B·040) — 크루 정보 수정·
 * 공개 범위 전환·크루 해산 폼을 조립하는 단일 지점이다. 오너 이양(FR-025)은 크루명 대신 대상
 * 크루원을 골라야 해서(핸들 검색이 아니라 이미 크루원인 사람 중에서) 이 화면이 아니라 멤버
 * 관리 화면(`MemberList`, `CrewMembersContainer`)에 둔다 — Task 040 결정, 근거는
 * `docs/decisions/crew-lifecycle-040.md`.
 *
 * **크루원 게이트는 이미 `(app)/crews/[crewId]/layout.tsx`가 끝냈다**(D-039) — "활성 멤버십인가"는
 * 여기서 다시 보지 않는다. 이 컨테이너가 새로 판정하는 것은 "이 화면을 볼 자격(임원 이상)"뿐이다.
 *
 * **일반 크루원은 화면 자체가 거부된다(FR-011 AC1 — "UI 숨김만으로 처리하지 않는다")** —
 * `crew:update_info`가 거부되면 `forbidden` 오류를 던져 전역 `RouteErrorBoundary`로 떨어진다
 * (`(app)/crews/[crewId]/layout.tsx`의 크루원 게이트와 같은 패턴). 반면 **공개 범위·해산 섹션은
 * 이미 이 화면에 들어온 임원에게 부분적으로만 숨긴다** — 임원은 크루 정보는 고칠 수 있지만
 * 공개 범위·해산은 오너 전용(`crew:update_visibility`·`crew:disband`, D-002)이라, 이 경우는
 * "권한 없는 화면 진입"이 아니라 "이 화면 안에서 볼 수 있는 조작이 역할별로 다르다"는 정상적인
 * 조건부 렌더다.
 */
export async function CrewSettingsContainer({ crewId }: { crewId: Id }) {
  const session = await getAuthSession();
  assertAuthenticatedSession(session);

  const crew = await getCrewById(crewId);
  if (!crew) {
    notFound();
  }

  const membership = await getCrewMembership(crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);

  const canEditInfo = checkPermission({ role, action: "crew:update_info" }).allowed;
  if (!canEditInfo) {
    throw new Error("크루 설정은 임원 이상만 볼 수 있다.", {
      cause: { code: "forbidden", message: "crew_settings_forbidden" },
    });
  }

  const canEditVisibility = checkPermission({ role, action: "crew:update_visibility" }).allowed;
  const canDisband = checkPermission({ role, action: "crew:disband" }).allowed;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-lg font-medium text-foreground">{strings.crew.settings.title}</h1>
        <p className="text-sm text-muted-foreground">{strings.crew.settings.description}</p>
      </header>

      <CrewInfoForm
        crewId={crew.id}
        initialName={crew.name}
        initialDescription={crew.description}
        initialCategory={crew.category}
        initialColorKey={crew.colorKey}
      />

      {canEditVisibility && <CrewVisibilityForm crewId={crew.id} initialVisibility={crew.visibility} />}

      {canDisband && <DisbandCrewForm crewId={crew.id} crewName={crew.name} />}
    </div>
  );
}
