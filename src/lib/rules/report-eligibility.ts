/**
 * 신고 입력 검증 — 순수 함수(NFR-036, R-015, Task 042A). FR-080 AC1의 두 전제조건(사유
 * 필수·자기 프로필 신고 금지)을 클라이언트에서 미리 판정해 즉각적인 폼 피드백을 준다.
 *
 * **이 함수는 최종 방어선이 아니다** — 최종 방어는 `create_report` SQL RPC의 동일 검사다
 * (`supabase/migrations/20260725114157_report_block_rpcs_042a.sql`). RPC를 우회하는 경로가
 * 없으므로(신고 INSERT는 이 RPC 하나뿐, `blocks`처럼 client가 `.from("reports").insert(...)`를
 * 직접 호출하지 않는다) 이 함수가 없어도 안전하지만, 있으면 왕복 없이 즉시 오류를 보여줄 수
 * 있다 — `handle-validation.ts` 같은 다른 클라이언트측 사전 검증과 같은 위치다.
 */
import type { Id, ReportTargetType } from "@/lib/types";

export type ReportIneligibleReason = "reason_required" | "cannot_report_self";

export type ReportEligibility =
  | { eligible: true }
  | { eligible: false; reason: ReportIneligibleReason };

export interface ReportEligibilityInput {
  reporterId: Id;
  targetType: ReportTargetType;
  targetId: Id;
  reason: string;
}

export function evaluateReportEligibility(input: ReportEligibilityInput): ReportEligibility {
  const { reporterId, targetType, targetId, reason } = input;

  if (reason.trim().length === 0) {
    return { eligible: false, reason: "reason_required" };
  }
  if (targetType === "profile" && targetId === reporterId) {
    return { eligible: false, reason: "cannot_report_self" };
  }
  return { eligible: true };
}
