import "server-only";

import { MUTABLE_NOTIFICATION_TYPES } from "@/lib/rules/notification-preference-rules";
import type { Id, NotificationPreference, NotificationType } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { toNotificationPreference } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * NotificationPreference 실데이터 구현(Task 044, FR-072). `NotificationPreference` 모델
 * 자체는 Task 006·028에서 선반영됐지만(스키마·타입만 존재) 읽기·쓰기는 이번이 처음이다 — 다른
 * 도메인처럼 "Task 031 읽기 / Task 032 쓰기"로 나뉘지 않고 이 한 파일이 전부 담당한다
 * (`comment.ts`와 같은 사정).
 *
 * `notification_preferences_select_self`·`_insert_self`·`_update_self`·`_delete_self`(029A)가
 * 본인 행만 허용한다. **AC3(투표 종료·강퇴는 끌 수 없다)는 여기서 앱 레이어로도 막지만
 * (`isNotificationTypeMandatory`), 실제 방어선은 DB의 `notification_preferences_guard_
 * mandatory_types` 트리거다** — 이 함수들을 거치지 않고 REST를 직접 때려도 트리거가 막는다
 * (`docs/decisions/remaining-c-features-044.md` §3 실측).
 */

/** 설정 화면(AC1·AC2)이 필요로 하는 전체 목록 — 전역(crew_id null) + 크루별 오버라이드 전부. */
export async function listNotificationPreferences(profileId: Id): Promise<NotificationPreference[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).map(toNotificationPreference);
}

/**
 * 유형별 전역 토글(AC1). `enabled=true`로 되돌리는 경우는 행을 지운다 — 기본값이 이미 "켬"이라
 * (행 부재 = 켬, `notifications_broadcast` docstring) 굳이 `enabled=true` 행을 남겨 둘 이유가
 * 없고, 남겨 두면 "명시적으로 켰다"와 "건드린 적 없다"를 구분 못 하는 불필요한 상태가 하나
 * 늘어난다.
 *
 * **`.upsert()`(ON CONFLICT)를 쓰지 않는다** — `(profile_id, type)` 유일성은 부분 유니크
 * 인덱스(`uq_notification_prefs_global`, `where crew_id is null`)로만 걸려 있다(028이
 * `crew_id` nullable 자연 복합키를 부분 유니크 2종으로 나눈 설계, `schema-migration-028.md`).
 * Postgres의 `ON CONFLICT (col1, col2)` 열거형 추론은 조건 없는 대상이라 부분 인덱스와
 * 매치되지 않는다 — 실측(`begin…rollback`)으로 `42P10 there is no unique or exclusion
 * constraint matching the ON CONFLICT specification`을 직접 재현해 확인했다. 대신
 * `sendMessage`(chat.ts)의 23505 복구 관용구처럼 **UPDATE 먼저 시도 → 없으면 INSERT**로
 * 우회한다.
 */
export async function setGlobalNotificationTypePreference(
  profileId: Id,
  type: NotificationType,
  enabled: boolean,
): Promise<DataResult<void>> {
  if (!enabled && !MUTABLE_NOTIFICATION_TYPES.includes(type)) {
    // AC3 — 앱 레이어 선제 방어. DB 가드 트리거가 최종 방어선이다(모듈 docstring).
    return err("forbidden", `${type} 알림은 끌 수 없다(FR-072 AC3).`);
  }

  const supabase = await createSupabaseServerClient();

  if (enabled) {
    const { error } = await supabase
      .from("notification_preferences")
      .delete()
      .eq("profile_id", profileId)
      .eq("type", type)
      .is("crew_id", null);
    if (error) throw error;
    return ok(undefined);
  }

  const { data: updated, error: updateError } = await supabase
    .from("notification_preferences")
    .update({ enabled: false })
    .eq("profile_id", profileId)
    .eq("type", type)
    .is("crew_id", null)
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (updated) return ok(undefined);

  const { error: insertError } = await supabase
    .from("notification_preferences")
    .insert({ profile_id: profileId, type, crew_id: null, enabled: false });
  if (insertError) {
    // 동시 요청 경합(드묾) — 방금 UPDATE가 0행을 본 사이 다른 요청이 먼저 INSERT했다. 결과적
    // 상태(음소거됨)는 이미 달성됐으므로 성공으로 취급한다(sendMessage의 clientKey 23505
    // 복구와 같은 판단).
    if (insertError.code === "23505") return ok(undefined);
    throw insertError;
  }
  return ok(undefined);
}

/**
 * 크루별 일괄 음소거(AC2, "그 크루의 알림 끄기"). `MUTABLE_NOTIFICATION_TYPES`(11종) 전부에
 * `crew_id=crewId` 스코프로 `enabled=false` 행을 만든다 — 개별 유형별 크루 스코프 UI는 두지
 * 않는다(AC2 원문이 "크루별 알림 끔"만 요구하고 유형×크루 매트릭스까지는 요구하지 않는다,
 * `docs/decisions/remaining-c-features-044.md` §4 설계 근거).
 *
 * 삭제 후 재삽입으로 처리한다(`setGlobalNotificationTypePreference`와 같은 이유로 `.upsert()`
 * 를 쓰지 않는다 — `uq_notification_prefs_per_crew`도 같은 부분 유니크 인덱스 문제를 갖는다).
 * "그 크루 스코프를 전부 지운 뒤, 켜는 경우라면 11종을 다시 채운다" — 크루 음소거는 켬/끔
 * 둘 중 하나뿐이라(유형별 부분 음소거를 두지 않는다) 이 방식이 조건부 UPDATE보다 단순하고
 * 항상 정확하다(중간 상태가 없다).
 */
export async function setCrewNotificationMute(
  profileId: Id,
  crewId: Id,
  muted: boolean,
): Promise<DataResult<void>> {
  const supabase = await createSupabaseServerClient();

  const { error: deleteError } = await supabase
    .from("notification_preferences")
    .delete()
    .eq("profile_id", profileId)
    .eq("crew_id", crewId);
  if (deleteError) throw deleteError;

  if (!muted) return ok(undefined);

  const { error: insertError } = await supabase.from("notification_preferences").insert(
    MUTABLE_NOTIFICATION_TYPES.map((type) => ({
      profile_id: profileId,
      type,
      crew_id: crewId,
      enabled: false,
    })),
  );
  if (insertError) {
    // 동시 요청 경합(드묾, 이 화면에서 두 번 연속 클릭 등) — 이미 같은 상태(음소거됨)로
    // 귀결됐다고 보고 성공 취급한다(위 전역 토글과 같은 판단).
    if (insertError.code === "23505") return ok(undefined);
    throw insertError;
  }
  return ok(undefined);
}
