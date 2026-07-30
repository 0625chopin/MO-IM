import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { listSystemAdmins } from "@/lib/data";
import { strings } from "@/lib/strings";

import { SystemAdminList } from "./SystemAdminList";

import type { SystemAdminRowViewModel } from "./system-admin-view-models";

/**
 * I-075(D-076·D-078, 27일차) 관리자 지정/회수 컨테이너 — `/admin/page.tsx`가 조립한다
 * (D-030 ①). `AdminReportsContainer`와 같은 이유로 이 컨테이너 자신도 `isAuthenticated`·
 * `isSystemAdmin` 조기 반환을 한다(I-095·I-115와 같은 구조 — `(app)/admin/layout.tsx` 게이트가
 * 아직 판정을 끝내지 않은 병렬 렌더링 브랜치에서도 이 컨테이너는 독립적으로 실행돼
 * `admin_list_system_admins`를 호출하기 때문이다).
 *
 * **`admin-grant-revoke-rpcs-075.md` §4의 사전 검증을 여기서 계산한다.** RPC/트리거
 * 예외 메시지를 파싱해 분기하지 않고, `listSystemAdmins()` 결과만으로 호출 **전에** 판정한다:
 * - **자기 자신 대상**(D-076): 각 행의 `profileId`를 세션 프로필 id와 비교한다.
 * - **마지막 관리자**(D-078): 배열 길이가 1이면 그 유일한 행의 회수 버튼을 막는다 — "이
 *   행이 나인지"와 독립적인 조건이다(다른 세션에서 지정한 두 번째 관리자가 이 화면을 보는
 *   경우도 있다).
 *
 * 조회 실패(네트워크 등)는 여기서 잡지 않는다 — `AdminReportsContainer`와 같은 관례로 Next.js
 * 라우트 오류 경계(`error.tsx`)에 위임한다(NFR-028).
 */
export async function SystemAdminsContainer() {
  const session = await getAuthSession();
  if (!isAuthenticated(session) || !session.isSystemAdmin) {
    // (app)/admin 레이아웃 게이트가 이미 미인증·비관리자 분기를 선택했을 병렬 렌더링의
    // 폐기 브랜치다(I-095·I-115와 같은 구조).
    return null;
  }

  const admins = await listSystemAdmins();
  const isLastAdmin = admins.length === 1;

  const rows: SystemAdminRowViewModel[] = admins.map((admin) => {
    const isSelf = admin.profileId === session.profileId;
    const canRevoke = !isSelf && !isLastAdmin;
    // 두 조건이 함께 걸릴 수 있는 유일한 경우(관리자 1명뿐이고 그게 나 자신)는 SQL의 가드
    // 순서(last_admin_forbidden이 cannot_target_self보다 먼저, `admin-grant-revoke-rpcs-075.md`
    // §3)와 같은 우선순위로 문구를 고른다 — last-admin을 먼저 본다.
    const revokeBlockedReason = canRevoke
      ? null
      : isLastAdmin
        ? strings.admin.systemAdmins.revokeBlockedReason.lastAdmin
        : strings.admin.systemAdmins.revokeBlockedReason.self;

    return {
      profileId: admin.profileId,
      handle: admin.handle,
      displayName: admin.displayName,
      avatarUrl: admin.avatarUrl,
      status: admin.status,
      isSelf,
      canRevoke,
      revokeBlockedReason,
    };
  });

  return <SystemAdminList admins={rows} />;
}
