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
import type { ReportResolutionAction, ReportStatus, ReportTargetType } from "@/lib/types";

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
