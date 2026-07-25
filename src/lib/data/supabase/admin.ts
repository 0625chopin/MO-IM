import "server-only";

import type { AdminReportQueueItem, ReportResolutionAction, ReportStatus } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { createSupabaseServerClient } from "./server";

/**
 * 관리자 콘솔 실데이터 구현 (Task 042B, FR-082). Mock 구현은 만들지 않았다 — Task 032부터
 * 이 저장소의 신설 도메인은 mock 대응물을 만들지 않는 전례를 그대로 잇는다(`report.ts`·
 * `block.ts` 모듈 docstring과 같은 판단).
 *
 * **읽기·쓰기 둘 다 SECURITY DEFINER RPC 하나씩이다** — `admin_list_reports`·
 * `admin_resolve_report`(둘 다 029B 2단 구조: `private.*` 실제 로직 + `public.*` INVOKER
 * 래퍼). 인가는 RPC 내부에서 `profiles.is_system_admin`을 직접 확인한다 — 이 파일은
 * service-role 클라이언트를 쓰지 않는다(일반 `createSupabaseServerClient`, publishable key로
 * 충분하다). 근거는 `docs/decisions/admin-console-042b.md` §2 — `report-block-042a.md` §6이
 * 제안한 "service_role 경로"보다 클라이언트 호출 가능 RPC + DB 내부 검사 쪽이 042A의
 * `private.is_blocked` 패턴과 일관되고, `SUPABASE_SERVICE_ROLE_KEY`를 이 경로에 추가로
 * 배선할 필요가 없다.
 *
 * **비관리자·anon 호출은 예외를 던지지 않는다** — `admin_list_reports`는 빈 배열을,
 * `admin_resolve_report`는 `{ok:false, reason_code:"forbidden"}`을 반환한다(RPC가 SQL
 * 레벨에서 이미 그렇게 설계됨, R-012식 "존재 비노출" 원칙). 이 레이어는 그 값을 그대로
 * `DataResult`로 옮긴다.
 */

/**
 * `status`는 v0.1 UI가 실제로 쓰는 "pending"이 기본값이다 — RPC 자체는 `p_status`에
 * SQL `null`(전 상태 조회)도 받아들이지만, 처리 이력 화면이 아직 없어(이번 회차 범위 밖)
 * 이 함수의 공개 시그니처에는 아직 열어 두지 않는다. 필요해지면 `status: ReportStatus | null`
 * 로 넓히고 호출부를 갱신한다.
 */
export async function listPendingReports(
  status: ReportStatus = "pending",
): Promise<AdminReportQueueItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_reports", { p_status: status });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    reportId: row.report_id,
    reporterId: row.reporter_id,
    reporterHandle: row.reporter_handle,
    reporterDisplayName: row.reporter_display_name,
    targetType: row.target_type as AdminReportQueueItem["targetType"],
    targetId: row.target_id,
    reason: row.reason,
    status: row.status as ReportStatus,
    createdAt: row.created_at,
    targetExists: row.target_exists,
    targetRemoved: row.target_removed,
    targetPreview: row.target_preview,
    targetAuthorId: row.target_author_id,
    targetAuthorHandle: row.target_author_handle,
  }));
}

export type ResolveReportSuccess = { status: ReportStatus };

/**
 * `reasonCode`는 SQL 함수가 돌려주는 문자열 그대로다(`ReportResolutionReasonCode`) —
 * 호출자는 `strings.admin.reports.errors[reasonCode]`로 문구를 찾는다.
 */
export async function resolveReport(
  reportId: string,
  action: ReportResolutionAction,
): Promise<DataResult<ResolveReportSuccess>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_resolve_report", {
    p_report_id: reportId,
    p_action: action,
  });
  if (error) throw error;

  const row = data?.[0];
  if (!row || !row.ok) {
    return err("validation_failed", row?.reason_code ?? "unknown_error");
  }
  return ok({ status: row.status as ReportStatus });
}
