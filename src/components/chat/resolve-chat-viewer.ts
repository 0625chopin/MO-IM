import "server-only";

import type { AuthSession } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCrewMembership } from "@/lib/data";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import type { Id, UserRole } from "@/lib/types";

export interface ChatViewer {
  session: AuthSession;
  role: UserRole;
}

/**
 * 채팅 컨테이너가 공유하는 "현재 접속자 → 권한 판정용 역할" 조회.
 * `components/board/resolve-board-viewer.ts`와 같은 패턴이다(도메인마다 한 벌씩 두는 것이
 * 기존 관례 — 두 파일을 하나로 합칠 만한 공유 지점이 아직 없다). 실제 허용 여부 판정은
 * 호출부가 `checkPermission`으로 한다(NFR-036) — 이 함수는 크루 멤버십을 조회해 `UserRole`을
 * 만들어 주기만 한다.
 *
 * 로그인하지 않았으면(guest) 크루 멤버십을 조회할 이유가 없으므로 곧장 `"guest"`로 반환한다.
 */
export async function resolveChatViewer(crewId: Id): Promise<ChatViewer> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { session, role: "guest" };
  }
  const membership = await getCrewMembership(crewId, session.profileId);
  return { session, role: deriveUserRoleForPermissionCheck(membership) };
}
