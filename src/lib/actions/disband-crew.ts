"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { getCrewHomeHref } from "@/components/crews/crew-links";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { recordAuditLog } from "@/lib/audit/audit-log";
import {
  createNotification,
  disbandCrew,
  getCrewById,
  getCrewMembership,
  listCrewMembers,
} from "@/lib/data";
import { deriveUserRoleForPermissionCheck, isActiveMembership } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";

/**
 * FR-013 크루 해산 Server Action(D-009 후반, Task 040). 크루 설정 화면의 "크루 해산" 다이얼로그가
 * `useActionState(disbandCrewAction, ...)`로 건다.
 *
 * **모든 부수효과(크루 archived 전이·진행 중 투표 cancelled·미래 Meetup cancelled·채팅 즉시
 * 파기)는 `public.disband_crew` SECURITY DEFINER RPC 하나가 원자적으로 처리한다**(운영 규칙 2).
 * 이 액션은 그 결과를 UX로 옮기는 얇은 껍데기다 — 인가(오너 본인·크루명 일치)도 SQL이 다시
 * 강제하므로, 여기서의 사전 확인은 친절한 오류 문구를 위한 이중화다.
 *
 * 성공하면 크루 홈(`/crews/[crewId]`, `(app)` 밖)으로 보낸다. 해산된 크루의 홈은 과거 데이터를
 * 열람 전용으로 계속 보여준다는 전제다(FR-013 AC2) — 이번 회차에서 `CrewHomeContainer`가
 * `status==='archived'`를 실제로 그렇게 렌더하는지는 검증하지 못했다(미검증, 인계 사항 참고).
 *
 * **`refresh()`를 `redirect()` 앞에 호출한다(I-061 점검 반영, 19일차)** — 애초 docstring은
 * "`leave-crew.ts`와 같은 이유로 `refresh()` 대신 `redirect()`를 쓴다"고 적었으나, 이건
 * `restore-account.ts`에서 실제로 결함이던 것과 같은 근거 없는 가정이었다(I-061 — `redirect()`
 * 다음 페이지가 서버에서 새로 조회하는 것과, 그 페이지가 공유하는 루트 레이아웃(`HeaderNav`
 * 등)의 **클라이언트 라우터 캐시**가 갱신되는 것은 별개다). `redirect()`는 예외를 던져 렌더를
 * 즉시 종료시키므로 `refresh()`는 반드시 그 이전에 호출해야 효과가 있다(`next/dist/docs/
 * 01-app/03-api-reference/04-functions/refresh.md`). `leave-crew.ts`·`create-crew.ts`도 같은
 * 가정을 쓰고 있어 같은 위험이 있을 수 있으나, 이번 Task 040 범위 밖(다른 Task 산출물)이라
 * 고치지 않았다 — 다음 회차 점검 대상으로 `docs/ISSUES.md`에 남긴다.
 */
export interface DisbandCrewFormState {
  formError?: string;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). 호출부(`DisbandCrewForm`)가 타입만 가져다 직접 만든다.

export async function disbandCrewAction(
  _prevState: DisbandCrewFormState,
  formData: FormData,
): Promise<DisbandCrewFormState> {
  const crewId = String(formData.get("crewId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "");

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { formError: strings.crew.settings.disband.errors.sessionExpired };
  }

  const crew = await getCrewById(crewId);
  if (!crew) {
    return { formError: strings.error.notFound.description };
  }

  const membership = await getCrewMembership(crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);
  const permission = checkPermission({ role, action: "crew:disband" });
  if (!permission.allowed) {
    return { formError: strings.crew.settings.disband.errors.notAllowed };
  }

  if (confirmName !== crew.name) {
    return { formError: strings.crew.settings.disband.errors.nameMismatch };
  }

  // 알림 발송 대상(전 크루원)은 해산 전에 미리 읽어 둔다 — RPC가 crew_memberships를 바꾸지
  // 않으므로(크루만 archived로 전이) 순서는 상관없지만, "해산 시점의 크루원"이라는 의도를
  // 코드로도 분명히 남긴다.
  const activeMembers = (await listCrewMembers(crewId)).filter((m) => isActiveMembership(m.status));

  const result = await disbandCrew(crewId, confirmName);
  if (!result.ok) {
    return {
      formError:
        result.error.code === "conflict"
          ? strings.crew.settings.disband.errors.alreadyDisbanded
          : result.error.code === "validation_failed"
            ? strings.crew.settings.disband.errors.nameMismatch
            : strings.crew.settings.disband.errors.failed,
    };
  }

  // NFR-015 감사 로그(Task 038 인터페이스, Task 040이 호출). targetId=crewId — 팀장 지적
  // 반영(당초 actorId를 넣었으나, RecordAuditLogInput의 targetId는 "행위 대상"이고 해산의
  // 대상은 행위자 자신이 아니라 그 크루다. crewId 필드와 값이 중복되지만 "해산의 대상은 그
  // 크루"라는 사실 자체는 정확하고 중복은 무해하다 — actorId를 넣으면 "누가 누구에게" 축이
  // 무너져 나중에 로그를 읽는 사람이 오독한다).
  await recordAuditLog({
    actorId: session.profileId,
    crewId,
    action: "crew.disbanded",
    targetId: crewId,
  });

  // FR-013 정상 흐름 ⑤ "전 크루원에게 알림" — 실패해도 해산 자체는 이미 끝난 뒤다.
  await Promise.all(
    activeMembers.map((member) =>
      createNotification({
        recipientId: member.profileId,
        type: "crew_disbanded",
        channel: "in_app",
        payload: { crewId, crewName: crew.name },
      }).catch((error) => console.error("[disband-crew] 크루원 알림 실패", member.profileId, error)),
    ),
  );

  refresh();
  redirect(getCrewHomeHref(crewId));
}
