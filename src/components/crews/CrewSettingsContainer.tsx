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
 *
 * **31일차(I-070 잔여 실측, CREW) — archived 크루면 폼 자체를 렌더하지 않는다.** 20일차에
 * `updateCrewInfo`·`updateCrewVisibility`가 `crews_guard_archived_immutable` 트리거 거부를
 * `err("forbidden", ...)`로 감싼 뒤에도, 이 컨테이너는 archived 여부를 보지 않고 오너/임원에게
 * 항상 편집 가능한 폼을 열어 줬다 — 30일차 I-067 실측 중 이 사실이 확인됐고 D-030 ③ 대상으로
 * 남겨졌다. 브라우저 실측(archived 픽스처 크루, 오너 계정) 결과 저장을 시도하면 두 폼 모두
 * `strings.crew.settings.info.errors.failed`/`visibility.errors.failed`("저장하지
 * 못했어요"/"변경하지 못했어요. 다시 시도해 주세요")라는 **범용 실패 문구**만 뜬다 — SQL이
 * 실어 보낸 실제 사유(`error.message`)가 Server Action에서 버려지기 때문이다(범용 문구 자체는
 * `updateCrewInfoAction`/`updateCrewVisibilityAction`의 기존 설계, 이번에 손대지 않았다).
 * 데이터는 트리거 덕에 항상 그대로였다(무결성 문제 아님) — 문제는 "저장될 것처럼 보이는 폼을
 * 열어 뒀다가 이유를 알 수 없는 실패를 보여준다"는 UX였다.
 *
 * **고친 방법은 새 패턴이 아니라 이미 있는 것 재사용이다.** `PostWriteContainer`(Task 040,
 * `/board/new`)가 쓰기 전용 라우트에 이미 쓰는 패턴 그대로다 — `crew.status !== "active"`면
 * `RouteErrorBoundary(kind="forbidden")`를 값으로 반환해 폼 자체를 그리지 않는다("쓰기 전용
 * 라우트는 아예 막아도 된다", 19일차 팀장 지시가 이미 이 화면과 같은 성격의 라우트에 적용된
 * 전례다). `/settings`는 정보 수정·공개 범위·해산 셋 다 쓰기뿐이라 같은 분류다 — 해산은 이미
 * archived된 크루에서는 애초에 의미가 없어(재해산 불가) 폼이 안 보이는 쪽이 맞다. 위
 * `crew:update_info` 거부 분기가 이미 같은 컴포넌트 안에서 같은 값(`RouteErrorBoundary
 * kind="forbidden"`)을 반환하므로 이 조건도 그 직후에 같은 방식으로 추가했다 — 컴포넌트
 * 안에 두 번째 `RouteErrorBoundary` 반환 지점이 생기는 것이지 새 컴포넌트나 새 오류 종류를
 * 만들지 않는다. 문구("이 크루의 크루원만 볼 수 있어요")가 "archived라서 막혔다"는 실제
 * 사유와 정확히 들어맞지는 않는다는 트레이드오프도 `PostWriteContainer` 전례와 동일하게
 * 그대로 안고 간다(레이아웃의 `ArchivedCrewBanner`가 바로 위에서 실제 사유를 이미 안내한다).
 * 활성 크루는 이 조건이 항상 거짓이라 회귀 없음(실측: 활성 크루 설정 화면 정상 렌더 확인).
 * 상세·스크린샷은 `docs/design/i070-archived-crew-settings-31/README.md`.
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

  if (crew.status !== "active") {
    // I-070 잔여 실측 후속(31일차) — archived 크루는 SQL 트리거가 어차피 모든 UPDATE를
    // 거부한다(20일차 해소분). 폼을 열어 두면 오너가 저장을 시도했다가 범용 실패 문구만
    // 보게 되므로, `PostWriteContainer`(Task 040)와 같은 패턴으로 폼 자체를 그리지 않는다.
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
