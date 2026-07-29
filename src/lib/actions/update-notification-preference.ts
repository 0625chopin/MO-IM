"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import { setCrewNotificationMute, setGlobalNotificationTypePreference } from "@/lib/data";
import { type DataResult, err } from "@/lib/data/contracts";
import { strings } from "@/lib/strings";
import type { Id, NotificationType } from "@/lib/types";

/**
 * 알림 유형별 전역 토글(FR-072 AC1) Server Action. `NotificationPreferencesContainer`가 그리는
 * `NotificationTypeToggleList`(표현 컴포넌트)의 유일한 호출부. 소유권은 세션에서 가져온다 —
 * 클라이언트가 profileId를 넘기지 않는다(다른 사람의 설정을 바꾸는 경로를 원천 차단, `mark-
 * notification-read.ts`와 같은 이유).
 *
 * AC3(필수 알림은 끌 수 없다)는 `setGlobalNotificationTypePreference` 자체가 앱 레이어에서
 * 먼저 막고, DB `notification_preferences_guard_mandatory_types` 트리거가 최종 방어선이다
 * (`docs/decisions/remaining-c-features-044.md` §3).
 */
export async function updateGlobalNotificationTypePreferenceAction(
  type: NotificationType,
  enabled: boolean,
): Promise<DataResult<void>> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return err("forbidden", strings.error.forbidden.description);
  }

  const result = await setGlobalNotificationTypePreference(session.profileId, type, enabled);
  if (result.ok) {
    refresh();
  }
  return result;
}

/**
 * 크루별 알림 끄기(FR-072 AC2) Server Action. `NotificationPreferencesContainer`가 그리는
 * `CrewNotificationMuteList`의 유일한 호출부. 대상 크루는 클라이언트가 넘긴 `crewId` 하나뿐 —
 * 소속 여부는 확인하지 않는다(음소거는 "그 크루 이벤트의 토스트를 안 보겠다"는 순전히 개인
 * 설정값이라 다른 크루원·크루 자체에 영향이 없다, I-091의 "위험 낮음" 판단과 같은 근거 —
 * AC3 대상인 poll_closed·member_removed만 예외이고 그건 `MUTABLE_NOTIFICATION_TYPES`가 애초에
 * 빼 둔다).
 */
export async function updateCrewNotificationMuteAction(
  crewId: Id,
  muted: boolean,
): Promise<DataResult<void>> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return err("forbidden", strings.error.forbidden.description);
  }

  const result = await setCrewNotificationMute(session.profileId, crewId, muted);
  if (result.ok) {
    refresh();
  }
  return result;
}
