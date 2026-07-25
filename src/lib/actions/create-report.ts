"use server";

import { refresh } from "next/cache";

import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { createReport } from "@/lib/data";
import { checkPermission } from "@/lib/rules/permission";
import { evaluateReportEligibility } from "@/lib/rules/report-eligibility";
import { strings } from "@/lib/strings";
import type { ReportTargetType } from "@/lib/types";

/**
 * FR-080 신고 접수 Server Action(Task 042A). `ReportDialog`가
 * `useActionState(createReportAction, ...)`로 건다.
 *
 * **크루 스코프가 아니다** — `report:create`는 매트릭스상 로그인한 회원 전체에게 동일하게
 * "allow"다(`search-user-by-handle.ts`와 같은 이유로 `role = isAuthenticated(...) ? "member"
 * : "guest"`만으로 좁힌다, 크루 멤버십을 조회하지 않는다).
 *
 * **최종 방어는 `create_report` SQL RPC다(I-054 회피, 신고 병합)** — 이 액션의
 * `evaluateReportEligibility` 사전 확인은 왕복 없는 즉각 피드백일 뿐이다. RPC의
 * `reason_code`(`reason_required`·`cannot_report_self`·`validation_failed`)를 그대로
 * `strings.report.errors`에 매핑해 보여준다 — 판정 로직을 두 곳에 따로 유지하지 않는다.
 */
export interface CreateReportFormState {
  formError?: string;
  success?: boolean;
}

export async function createReportAction(
  _prevState: CreateReportFormState,
  formData: FormData,
): Promise<CreateReportFormState> {
  const targetType = String(formData.get("targetType") ?? "") as ReportTargetType;
  const targetId = String(formData.get("targetId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  const session = await getAuthSession();
  const role = isAuthenticated(session) ? "member" : "guest";
  const permission = checkPermission({ role, action: "report:create" });
  if (!permission.allowed || !isAuthenticated(session)) {
    return { formError: strings.report.errors.notAllowed };
  }

  const eligibility = evaluateReportEligibility({
    reporterId: session.profileId,
    targetType,
    targetId,
    reason,
  });
  if (!eligibility.eligible) {
    return { formError: strings.report.errors[eligibility.reason] };
  }

  const result = await createReport({ targetType, targetId, reason });
  if (!result.ok) {
    const code = result.error.message as keyof typeof strings.report.errors;
    return { formError: strings.report.errors[code] ?? strings.report.errors.failed };
  }

  refresh();
  return { success: true };
}
