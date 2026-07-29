import { notFound } from "next/navigation";

import { CrewInfoForm } from "@/components/crews/CrewInfoForm";
import { CrewVisibilityForm } from "@/components/crews/CrewVisibilityForm";
import { DisbandCrewForm } from "@/components/crews/DisbandCrewForm";
import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";
import { isAuthenticated } from "@/components/shell/auth-session";
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
 * `crew:update_info`가 거부되면 `RouteErrorBoundary(kind="forbidden")`가 렌더된다. 반면
 * **공개 범위·해산 섹션은 이미 이 화면에 들어온 임원에게 부분적으로만 숨긴다** — 임원은 크루
 * 정보는 고칠 수 있지만 공개 범위·해산은 오너 전용(`crew:update_visibility`·`crew:disband`,
 * D-002)이라, 이 경우는 "권한 없는 화면 진입"이 아니라 "이 화면 안에서 볼 수 있는 조작이
 * 역할별로 다르다"는 정상적인 조건부 렌더다.
 *
 * **20일차(I-069 근본 해결, DESIGN) — `crew:update_info` 거부를 더 이상 throw하지 않는다.**
 * 예전엔 `cause: { code: "forbidden" }`를 던졌지만, 프로덕션 빌드에서 Next.js가 서버 컴포넌트
 * 예외의 `cause`를 클라이언트로 넘기지 않아(공식 보안 동작) `error.tsx`의 `classifyError`가
 * 항상 분류에 실패했다(I-069 — "활성 크루원이지만 임원 미만"이 `/crews/[id]/settings`에 직접
 * 접근하는 경로는 레이아웃 게이트가 "크루원인가"만 보고 "임원인가"는 안 봐서 도달성이 높다,
 * 19일차 영향 범위 인벤토리). 지금은 `<RouteErrorBoundary kind="forbidden" />`를 값으로
 * 직접 반환한다 — `CrewSettingsPage`가 이미 `<main>`을 소유하므로 여기서 새로 열지 않는다.
 * HTTP 응답은 500 대신 200이 된다(트레이드오프는 `docs/decisions/domain-error-channel-069.md`).
 *
 * **24일차(I-095)** — 로그인 여부 확인을 throw 기반 `assertAuthenticatedSession`에서
 * `isAuthenticated` 조기 반환으로 교체했다(위 20일차 절이 다루는 "임원 미만" 거부와는 다른
 * 지점이다 — 그건 이미 값 반환이었다). 경위·대체 패턴 근거는
 * `@/components/shell/auth-session.ts` 모듈 docstring 참고.
 */
export async function CrewSettingsContainer({ crewId }: { crewId: Id }) {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    // (app) 레이아웃이 이미 미인증 분기를 선택했을 병렬 렌더링의 폐기 브랜치다(I-095).
    return null;
  }

  const crew = await getCrewById(crewId);
  if (!crew) {
    notFound();
  }

  const membership = await getCrewMembership(crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);

  const canEditInfo = checkPermission({ role, action: "crew:update_info" }).allowed;
  if (!canEditInfo) {
    return <RouteErrorBoundary kind="forbidden" />;
  }

  const canEditVisibility = checkPermission({ role, action: "crew:update_visibility" }).allowed;
  const canDisband = checkPermission({ role, action: "crew:disband" }).allowed;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-4">
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
