import { notFound } from "next/navigation";

import { ArchivedCrewBanner } from "@/components/crews/ArchivedCrewBanner";
import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCrewById, getCrewMembership } from "@/lib/data";
import { isActiveMembership } from "@/lib/rules/crew-membership-transition";

import type { ReactNode } from "react";

/**
 * 크루원 게이트(I-035 해소, **D-039**, Task 016B) — `(app)/crews/[crewId]/*`(board·chat·
 * members·settings) 전체를 이 레이아웃 한 곳이 가드한다. `(app)/layout.tsx`가 보장하는
 * 불변식은 "로그인했다"까지다 — "그 크루의 멤버다"는 별개 판정이고 그 레이아웃이 대신해
 * 주지 않는다(`docs/CONVENTIONS.md` D-030 ④ 절 "`(app)`은 인증 게이트이지 크루원 게이트가
 * 아니다"). 이 레이아웃이 그 별개 판정을 라우트 레벨에서 한 번에 막는다.
 *
 * **`(app)/crews/new`는 이 레이아웃 밖이다** — `new`는 `[crewId]`의 형제 세그먼트라 동적
 * 경로 아래에 있지 않다. 크루 개설은 "그 크루의 멤버"라는 개념 자체가 아직 없는 시점이라
 * 이 게이트가 걸리면 안 된다(그리고 실제로 걸리지 않는다 — Next.js 라우트 그룹·동적
 * 세그먼트 레이아웃은 형제 세그먼트에 적용되지 않는다).
 *
 * **크루 홈(`/crews/[crewId]`)은 대상이 아니다** — 그 라우트는 애초에 `(app)` 밖에 있다
 * (D-007·I-036 해소, `CrewHomeContainer` docstring 참고). "게스트도 공개 크루 소개는 볼 수
 * 있다"는 이 레이아웃이 지켜야 할 불변식과 정반대다.
 *
 * **판정은 "활성 크루원인가"만 본다** — `board:read`처럼 액션별 세밀한 매트릭스 판정
 * (예: 관리자의 게시판 열람 허용)은 이 레이아웃이 대신하지 않는다. 지금 이 저장소의
 * `AuthSession`에는 `system_admin`을 표현할 필드 자체가 없어(Task 042A 이후에나 생긴다)
 * 이 근사가 안전하지만, 관리자 세션이 생기면 이 조건을 다시 검토해야 한다.
 *
 * **기존 `resolveBoardViewer`(`components/board/`)의 컨테이너 레벨 방어는 유지한다** —
 * 제거하지 않았다. 이 레이아웃을 통과한 뒤에도 `BoardListContainer`가 `board:read`를 다시
 * 판정하는 것은 이중 리다이렉트 금지 규칙("(app) 아래 페이지가 redirect('/login')을 다시
 * 호출하는 것")과 다른 종류다 — 그 규칙은 **같은 판정을 같은 방식(리다이렉트)으로 반복**하는
 * 것을 금지하지, `role`을 계산해 `canWrite`(post:create) 같은 **다른 판정**에 재사용하는
 * 코드까지 금지하지 않는다. `resolveBoardViewer`를 지우면 role 계산 로직을 이 레이아웃이나
 * 다른 곳에 새로 만들어야 하고, 그러면서 정작 이 레이아웃은 role의 세부(staff/owner 구분)를
 * 필요로 하지 않아 계산 결과를 어차피 버린다 — 남겨 두는 쪽이 비용이 낮고, 언젠가
 * `BoardListContainer`가 이 레이아웃 밖의 다른 경로에서 재사용될 가능성(예: 관리자 미리보기)에
 * 대한 방어이기도 하다. 근거 전문은 `docs/prioritization-and-risks.md` D-039 참고.
 *
 * **19일차(Task 040 UI/게이트 절반, BOARD) 추가 — 해산된 크루 안내 배너.** I-066(해산된
 * 크루에서도 게시판·채팅 쓰기가 막히지 않는다)·I-067(`CrewHomeContainer`에 archived 분기가
 * 없다)을 닫으며 팀장이 이월을 철회하고 이번 회차에 배정했다. **이 레이아웃은 "알려라"만
 * 담당한다** — `crews.status==='archived'`면 하위 화면 공통으로 `ArchivedCrewBanner`를
 * 띄운다(멤버십 게이트 자체는 바꾸지 않는다, 크루원이면 여전히 읽기·탐색 전부 통과). **쓰기
 * 차단은 이 레이아웃이 아니라 각 쓰기 컨테이너**(`BoardListContainer`의 `canWrite`,
 * `PostWriteContainer`의 진입 차단, `MessageListContainer`의 `canSend`)**가 개별적으로
 * `crew.status`를 확인한다** — 레이아웃은 `children`(이미 렌더된 트리)에 값을 주입할 방법이
 * 없어(RSC는 부모가 자식에게 props를 나중에 꽂아 넣지 못한다) "무엇을 보여줄지"는 여기서
 * 정할 수 없고 "안내를 띄울지"만 정할 수 있다. RLS INSERT 정책(SQL 강제 경계)은 CORE 소관 —
 * 이 레이아웃·컨테이너의 UI 판정은 이번에도(D-039와 같은 원칙) UX 안내일 뿐이다.
 *
 * **I-059(게스트 접근 시 서버 콘솔 오진단 예외)와의 관계(19일차 서술, 아래 24일차 갱신 참고) —
 * 당시엔 이 변경이 그 경로를 건드리지 않았다.** I-059는 `(app)/layout.tsx`가 `RedirectToLogin`
 * (클라이언트 컴포넌트)으로 리다이렉트를 대체하며 생긴 병렬 렌더 부작용이다. 19일차 당시 이
 * 레이아웃(크루원 게이트)의 인증 확인은 `assertAuthenticatedSession`(throw 기반)이었고, 이번
 * 변경(ArchivedCrewBanner)은 그 통과 이후에 배너 하나를 추가로 렌더하는 것뿐이라 그 부작용
 * 경로에 들어가지 않았다.
 *
 * **24일차(I-095) 갱신 — 그 인증 확인 자체가 이제 바뀌었다.** 아래 진입부의
 * `assertAuthenticatedSession(session)` 호출을 `if (!isAuthenticated(session)) return null;`
 * 조기 반환으로 교체했다 — 경위·대체 패턴 근거는 `@/components/shell/auth-session.ts` 모듈
 * docstring 참고. 이 레이아웃 특유의 크루원 게이트(`RouteErrorBoundary` 값 반환, 아래
 * "20일차" 절)는 이미 throw를 쓰지 않고 있었으므로 이 갱신의 대상이 아니다 — 바뀐 것은
 * 그 앞 단계인 "로그인했는가" 확인 하나뿐이다.
 *
 * **20일차(I-069 근본 해결, DESIGN) — 크루원 아님 판정은 더 이상 throw하지 않는다.** 프로덕션
 * 빌드에서 Next.js가 서버 컴포넌트 예외의 `cause`를 클라이언트로 넘기지 않아(공식 보안 동작,
 * `error.md` 확인) `error.tsx`의 `classifyError`가 이 throw를 절대 `forbidden`으로 읽지
 * 못하고 항상 `unknown`으로 떨어뜨렸다(I-069, 19일차 DESIGN이 이 정확한 지점에서 최초 발견).
 * `forbidden()`/`unauthorized()`는 이 Next 버전에서 여전히 experimental/canary라(D-040)
 * 도입하지 않고, 대신 이 레이아웃이 **값을 반환**해 `RouteErrorBoundary(kind="forbidden")`를
 * 직접 렌더한다 — `cause` 직렬화를 거치지 않으므로 프로덕션 정화 문제 자체가 발생하지 않는다.
 *
 * **왜 "판정만 하고 자식에 넘기기"가 아니라 "레이아웃이 직접 렌더"인가**: 이 파일이 이미 위에서
 * 밝혔듯 RSC는 부모가 자식(`children`, 이미 렌더된 트리)에게 값을 나중에 꽂아 넣지 못한다
 * (`ArchivedCrewBanner` 판단에서 확인한 것과 같은 제약). 즉 "판정 결과를 `children`에 넘겨
 * 각 페이지·컨테이너가 다시 렌더 여부를 결정한다"는 선택지가 애초에 없다 — 있다면 이미
 * D-039가 "컨테이너마다 반복하면 하나를 빠뜨린다"고 지적한 문제(I-035)가 그대로 재발한다.
 * 유일한 방법은 이 레이아웃이 `children` 대신 표현 컴포넌트를 직접 렌더하는 것이다. 이때
 * `children`이 차지했을 `<main>` 랜드마크가 비므로(각 페이지가 원래 자기 `<main>`을 소유했다,
 * `docs/CONVENTIONS.md`) 이 레이아웃이 대신 `<main>`을 연다 — `app/not-found.tsx`와 같은 패턴이다.
 *
 * **트레이드오프(정직하게 기록)**: 예외를 던지지 않으므로 HTTP 응답이 500이 아니라 **200**이다.
 * `digest`가 없어 "다시 시도" 버튼도, `reportClientErrorAction`(NFR-028 오류 수집)의 telemetry도
 * 없다 — 이건 예외 상황이 아니라 정상적으로 도달하는 화면 상태이기 때문이다(`PrivateCrewNotice`와
 * 같은 성격). I-044가 우려한 "500이 오류율 지표를 오염시킨다"는 이 네 곳에서는 해소되지만,
 * 요구사항이 명시하는 403 자체는 여전히 아니다(200) — `docs/prioritization-and-risks.md` D-040
 * 갱신 이력과 `docs/decisions/domain-error-channel-069.md` 참고.
 */
export default async function CrewMemberGateLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ crewId: string }>;
}) {
  const { crewId } = await params;

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
  if (!membership || !isActiveMembership(membership.status)) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <RouteErrorBoundary kind="forbidden" />
      </main>
    );
  }

  return (
    <>
      {crew.status === "archived" && <ArchivedCrewBanner />}
      {children}
    </>
  );
}
