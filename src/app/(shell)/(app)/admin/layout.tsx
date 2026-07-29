import { notFound } from "next/navigation";

import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";

import type { ReactNode } from "react";

/**
 * 관리자 게이트(FR-082 AC2, Task 042B, SC-21) — `(app)/admin/*` 전체를 이 레이아웃 한 곳이
 * 가드한다. `(app)/layout.tsx`가 보장하는 불변식은 "로그인했다"까지다 — "관리자다"는 별개
 * 판정이라 `(app)/crews/[crewId]/layout.tsx`의 크루원 게이트와 같은 위치·같은 이유로 여기에 둔다.
 *
 * **AC2 "경로 존재를 노출하지 않는다"를 그대로 따른다** — 일반 회원은 403(권한 있음을 암시)이
 * 아니라 `notFound()`(표준 Next.js 404, `app/not-found.tsx`가 그린다)를 본다. 게스트는 이
 * 레이아웃에 도달하기 전에 `(app)/layout.tsx`가 이미 `/login`으로 돌려보낸다 — 그 리다이렉트는
 * `/admin`뿐 아니라 `(app)` 전체에 적용되는 일반 규칙이라 이 경로의 존재를 개별적으로 드러내지
 * 않는다.
 *
 * **이 값은 UI 게이트일 뿐 최종 강제 경계가 아니다** — 진짜 강제는 `admin_list_reports`·
 * `admin_resolve_report` SQL RPC 내부의 `profiles.is_system_admin` 재확인이다(SECURITY
 * DEFINER, 클라이언트가 이 레이아웃을 우회해 RPC를 직접 호출해도 안전 — `docs/decisions/
 * admin-console-042b.md` §4 실측 확인). `AuthSession.isSystemAdmin`이 세션 발급 시점 스냅샷이라
 * stale할 수 있는 것과 대칭이다.
 *
 * **24일차(I-095) — `assertAuthenticatedSession`(throw) 대신 조기 반환을 쓴다.** 경위·대체
 * 패턴 근거는 `@/components/shell/auth-session.ts` 모듈 docstring 참고.
 */
export default async function AdminGateLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    // (app) 레이아웃이 이미 미인증 분기를 선택했을 병렬 렌더링의 폐기 브랜치다(I-095).
    return null;
  }

  if (!session.isSystemAdmin) {
    notFound();
  }

  return <>{children}</>;
}
