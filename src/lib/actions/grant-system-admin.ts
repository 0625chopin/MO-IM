"use server";

import { refresh } from "next/cache";

import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { grantSystemAdminByHandle } from "@/lib/data";
import { strings } from "@/lib/strings";
import type { SystemAdminGrantReasonCode } from "@/lib/types";

/**
 * I-075(D-076·D-078, 27일차) 관리자 지정 Server Action — `GrantSystemAdminButton`이
 * `useActionState(grantSystemAdminAction, ...)`로 건다.
 *
 * **`invite-crew-member.ts`와 겉모습은 비슷해도 의도적으로 다른 패턴이다.** 그쪽은 앱
 * 레이어가 `getProfileByHandle`(service-role)로 handle을 id로 먼저 바꾼 뒤 인가 판정으로
 * 넘어간다 — 크루 초대는 "누가 이 핸들을 가졌는지" 자체가 노출돼도 되는 정보다. 관리자
 * 지정은 다르다: 비관리자가 "이 핸들의 사용자가 존재하는가"를 알아내면 R-012 위반이고,
 * 앱 레이어에서 "handle 해석 → 인가 검사" 순서로 조립하면 그 창이 열린다(I-074가 정확히
 * 이 순서 실수로 두 번 뚫렸던 자리 — `admin-grant-revoke-rpcs-075.md` 참고). 그래서 이
 * 액션은 handle을 **한 번도 직접 해석하지 않는다** — `grantSystemAdminByHandle` RPC
 * (`admin_grant_system_admin_by_handle`)가 내부에서 "권한 검사 → handle 해석" 순서를
 * SQL 실행 순서로 강제한 뒤 그 결과만 돌려준다.
 *
 * **인가는 직접 `session.isSystemAdmin`을 확인한다** — 이 도메인(I-075)은
 * `docs/requirements/requirements.md` 3.3절 권한 매트릭스 37개 액션에 속하지 않는 별도
 * 운영 기능이라 `checkPermission`(그 매트릭스 전용 순수 함수)에 새 액션 키를 추가하지
 * 않았다 — `(app)/admin/layout.tsx`·`AdminReportsContainer`가 이미 같은 화면에서 쓰는
 * 직접 확인 방식을 그대로 따른다. 이 확인은 세션이 stale해도(예: 다른 세션에서 막 관리자
 * 권한이 회수된 직후) 화면을 조기에 막는 앱 레이어 방어일 뿐이고, **최종 방어는 여전히
 * RPC 내부의 `is_system_admin` 재확인**이다 — 세션이 stale한 채로 여기를 통과해도 RPC가
 * `forbidden`으로 막고(handle 조회는 실행되지 않는다), 그 오류는 아래 `errors.forbidden`
 * 문구로 표시된다.
 *
 * `cannot_target_self`(D-076)·`already_admin`은 `admin-grant-revoke-rpcs-075.md` §4가
 * "정상 흐름에서는 도달하지 않아야 한다"고 명시한 대로, `SystemAdminList`가 사전에 자기
 * 자신 대상 여부를 걸러 이 버튼 자체를 숨긴다 — 아래 `errors`는 그 사전 검증이 새는 경우의
 * 방어선 문구다(핸들을 직접 타이핑해 자기 자신을 지정하려는 경우 등). `handle_not_found`도
 * RPC의 reason_code를 그대로 옮긴 것뿐이다 — 이 코드는 인가를 통과한 관리자에게만 나오므로
 * (§ 위 RPC 문서) 열거 오라클이 아니다.
 */
export interface GrantSystemAdminFormState {
  formError?: string;
  success?: boolean;
}

export async function grantSystemAdminAction(
  _prevState: GrantSystemAdminFormState,
  formData: FormData,
): Promise<GrantSystemAdminFormState> {
  const handle = String(formData.get("handle") ?? "").trim();

  const session = await getAuthSession();
  if (!isAuthenticated(session) || !session.isSystemAdmin) {
    return { formError: strings.admin.systemAdmins.grant.errors.notAllowed };
  }

  const result = await grantSystemAdminByHandle(handle);
  if (!result.ok) {
    const code = result.error.message as SystemAdminGrantReasonCode;
    return {
      formError: strings.admin.systemAdmins.grant.errors[code] ?? strings.admin.systemAdmins.grant.errors.failed,
    };
  }

  refresh();
  return { success: true };
}
