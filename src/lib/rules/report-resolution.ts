/**
 * 관리자 콘솔 처리 액션 판정 — 순수 함수(NFR-036, R-015, Task 042B, FR-082).
 *
 * `admin_resolve_report` SQL RPC의 최종 판정을 클라이언트에서 미리 보여주기 위한 것이다
 * (`report-eligibility.ts`와 같은 위치 — 왕복 없는 즉각 피드백, 최종 방어선은 아니다).
 * 여기서 "가능"으로 판정한 액션이라도 RPC가 경합 조건(다른 관리자가 먼저 처리·대상이 이미
 * 삭제됨)으로 거부할 수 있다 — `ReportResolutionReasonCode`가 그 경우들을 표현한다.
 *
 * `remove_content`는 `targetType==="profile"` 신고에는 제공하지 않는다 — 사람은 소프트삭제
 * 대상이 아니다(계정 제재만 가능). `pending` 상태가 아닌 신고는 이미 처리됐으므로 액션 자체를
 * 제공하지 않는다(재처리 버튼을 누르게 하고 나서야 `already_handled`로 걸러내는 것보다,
 * 처음부터 버튼을 숨기는 편이 관리자에게 더 정직하다).
 */
import type {
  ReportResolutionAction,
  ReportStatus,
  ReportStatusFilter,
  ReportTargetType,
} from "@/lib/types";

export function getAvailableResolutionActions(
  targetType: ReportTargetType,
  status: ReportStatus,
): readonly ReportResolutionAction[] {
  if (status !== "pending") {
    return [];
  }
  if (targetType === "profile") {
    return ["suspend_account", "dismiss"];
  }
  return ["remove_content", "suspend_account", "dismiss"];
}

/**
 * `/admin` 상태 탭 순서(I-077, 26일차) — 대기열이 가장 자주 쓰는 화면이라 두 번째에 둔다
 * (전체를 첫 탭에 두는 흔한 관례보다, 운영자가 실제로 매일 보는 화면을 앞쪽에 두는 편을
 * 택했다. "전체"는 감사·이력 조회용 보조 탭이다).
 */
export const REPORT_STATUS_FILTERS = [
  "pending",
  "all",
  "resolved",
  "dismissed",
] as const satisfies readonly ReportStatusFilter[];

/**
 * `?status=` 쿼리스트링 → `ReportStatusFilter` 파싱(순수 함수). 값이 없거나
 * `REPORT_STATUS_FILTERS` 밖이면(오타·구버전 북마크·조작된 값) 기존 화면 기본값이던
 * `"pending"`으로 조용히 되돌린다 — 잘못된 쿼리로 404·크래시를 내지 않는다.
 */
export function parseReportStatusFilter(value: string | undefined): ReportStatusFilter {
  if (value && (REPORT_STATUS_FILTERS as readonly string[]).includes(value)) {
    return value as ReportStatusFilter;
  }
  return "pending";
}
