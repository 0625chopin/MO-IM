import "server-only";

import type { Id } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { createSupabaseServerClient } from "./server";

/**
 * Block 실데이터 구현 (Task 042A, FR-081). Mock 구현은 만들지 않았다 — `report.ts` 모듈
 * docstring과 같은 이유(Task 032 이후 신설 도메인은 mock 대응물을 만들지 않는 전례).
 *
 * **차단 생성은 `create_block` RPC**(I-054 회피, 자기 차단 거부를 친절한 reason_code로 감싼다).
 * **차단 해제(`removeBlock`)는 단일 DELETE**로 충분하다 — `blocks_delete_self` RLS(본인 스코프)
 * 하나로 완결되는 단일 문장이라 I-054가 우려하는 "여러 PostgREST 호출을 순서대로" 패턴이
 * 애초에 성립하지 않는다.
 */

export type CreateBlockSuccess = { alreadyBlocked: boolean };

export async function createBlock(blockedId: Id): Promise<DataResult<CreateBlockSuccess>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_block", { p_blocked_id: blockedId });
  if (error) throw error;

  const row = data?.[0];
  if (!row || !row.ok) {
    return err("validation_failed", row?.reason_code ?? "unknown_error");
  }
  return ok({ alreadyBlocked: row.already_blocked });
}

/** FR-081 관리 UX — 차단 해제. `blocks_delete_self` RLS가 본인이 만든 차단만 허용한다. */
export async function removeBlock(blockedId: Id): Promise<DataResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from("blocks")
    .delete({ count: "exact" })
    .eq("blocked_id", blockedId);
  if (error) throw error;
  if (!count) {
    return err("not_found", `block target ${blockedId} 를 찾을 수 없다.`);
  }
  return ok(null);
}

/**
 * 내가 차단한 프로필 id 목록. `blocks_select_self` RLS가 `blocker_id = auth.uid()`만
 * 허용하므로 이 함수는 자연히 뷰어 본인의 차단 목록만 반환한다 — `viewerId` 인자는 두지 않는다
 * (세션이 곧 필터, `listCrews`의 `viewerProfileId`와 다른 이유 — 저건 대상 크루 필터가 옵션이라
 * null도 유효했지만, 이건 "본인 차단 목록"이라는 개념 자체가 세션과 분리될 수 없다).
 */
export async function listMyBlockedProfileIds(): Promise<Id[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("blocks").select("blocked_id").order("created_at", {
    ascending: false,
  });
  if (error) throw error;
  return (data ?? []).map((row) => row.blocked_id);
}
