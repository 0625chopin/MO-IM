import "server-only";

import type { ReportTargetType } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { createSupabaseServerClient } from "./server";

/**
 * Report 실데이터 구현 (Task 042A, FR-080). Mock 구현은 만들지 않았다 — Task 032부터 이
 * 저장소의 쓰기 경로는 전부 실 Supabase로 전환됐고(`write-path-realdata-032.md`), 그 이후
 * 신설된 도메인(계정 생애주기 Task 039, 크루 생애주기 Task 040)도 같은 전례를 따라 mock
 * 대응물을 만들지 않았다 — 이 도메인도 그 전례를 그대로 잇는다.
 *
 * **쓰기는 `create_report` RPC 하나뿐이다(I-054 회피)** — 신고 중복 병합(FR-080 AC1)이
 * `INSERT ... ON CONFLICT ... DO UPDATE`로 원자적이어야 하므로 client가 "먼저 조회, 그 다음
 * insert/update"를 흉내내지 않는다. RPC 계약(`{ok, reasonCode, id, merged}`)은
 * `respond_meetup_attendance`(Task 032)와 같은 형태다.
 */

export type CreateReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
};

export type CreateReportSuccess = { id: string; merged: boolean };

/**
 * `reasonCode`는 SQL 함수가 돌려주는 문자열 그대로다 — `not_authenticated`(정상 경로에서는
 * 도달하지 않는다, 세션 확인은 Server Action 몫)·`reason_required`·`cannot_report_self`·
 * `validation_failed`(target_type CHECK 위반 등 방어적 흡수). 호출자는
 * `strings.report.errors[reasonCode]`로 문구를 찾는다.
 */
export async function createReport(input: CreateReportInput): Promise<DataResult<CreateReportSuccess>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_report", {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_reason: input.reason,
  });
  if (error) throw error;

  const row = data?.[0];
  if (!row || !row.ok) {
    return err("validation_failed", row?.reason_code ?? "unknown_error");
  }
  return ok({ id: row.id as string, merged: row.merged });
}
