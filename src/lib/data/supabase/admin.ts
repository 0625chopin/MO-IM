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
 * (26일차, I-077 해소) 예전 이름은 `listPendingReports`였고 `status`가 `ReportStatus`
 * 3종으로만 좁아 있었다 — 대기열 하나만 화면이 있었기 때문이다. 이제 `/admin`에 상태 필터
 * 탭(전체·대기·처리됨·기각됨)이 생겨 `status: ReportStatus | null`로 넓힌다. RPC
 * (`admin_list_reports`)는 처음부터 `p_status is null or r.status = p_status` 분기가 있어
 * `null`을 그대로 넘기면 전체 상태를 반환한다 — 마이그레이션은 필요 없었다. 호출자는
 * `ReportStatusFilter`("all" sentinel 포함)를 쓰고, `"all" → null` 변환은 호출부
 * (`AdminReportsContainer`)가 한다 — 이 함수 자체는 SQL이 실제로 받는 `ReportStatus | null`
 * 타입 그대로 둔다.
 */
export async function listReports(
  status: ReportStatus | null = "pending",
): Promise<AdminReportQueueItem[]> {
  const supabase = await createSupabaseServerClient();
  // `database.types.ts`가 생성한 `Args`는 `{ p_status?: string }`뿐이라 `null`을 타입상
  // 못 받는 것처럼 보인다 — 생성기가 `p_status text default 'pending'`(DEFAULT는 있지만
  // NOT NULL은 아니다)의 nullability를 반영하지 못하는 gap이다. 여기서만 좁게 캐스팅한다
  // (런타임엔 그대로 JSON `null`로 나가고, RPC의 `p_status is null or …` 분기가 그 값을
  // 받는다 — 이미 프로덕션에서 검증된 SQL 분기, 새 캐스팅은 타입 표현만의 문제다).
  const { data, error } = await supabase.rpc("admin_list_reports", {
    p_status: status,
  } as { p_status?: string });
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
