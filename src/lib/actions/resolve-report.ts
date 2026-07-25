"use server";

import { refresh } from "next/cache";

import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { resolveReport } from "@/lib/data";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";
import type { ReportResolutionAction, ReportResolutionReasonCode } from "@/lib/types";

/**
 * FR-082 AC1 관리자 콘솔 처리 Server Action(Task 042B). `AdminReportActions`가
 * `useActionState(resolveReportAction, ...)`로 건다 — `remove-block.ts`와 같은 패턴.
 *
 * **최종 방어는 `admin_resolve_report` SQL RPC다** — 이 액션의 `checkPermission` 확인은
 * 세션이 stale해도(예: 관리자 권한이 다른 세션에서 막 회수된 직후) 화면을 조기에 안전하게
 * 막는 앱 레이어 방어일 뿐이다. RPC는 `auth.uid()`로 `profiles.is_system_admin`을 그때그때
 * 다시 확인하므로, 이 액션의 검사를 건너뛰어도(이론상 불가능하지만) 안전하다 — D-030 ③
 * "도메인 오류도 값으로" 원칙에 따라 RPC의 `reason_code`를 그대로 문구로 옮긴다.
 */
export interface ResolveReportFormState {
  formError?: string;
  success?: boolean;
  /** 처리 후 report 최종 상태 — 성공 토스트 문구 선택에 쓴다. */
  resultStatus?: "resolved" | "dismissed";
}

export async function resolveReportAction(
  _prevState: ResolveReportFormState,
  formData: FormData,
): Promise<ResolveReportFormState> {
  const reportId = String(formData.get("reportId") ?? "");
  const action = String(formData.get("action") ?? "") as ReportResolutionAction;

  const session = await getAuthSession();
  const role = isAuthenticated(session) && session.isSystemAdmin ? "system_admin" : "member";
  const permission = checkPermission({ role, action: "report:handle" });
  if (!permission.allowed || !isAuthenticated(session)) {
    return { formError: strings.admin.reports.errors.notAllowed };
  }

  const result = await resolveReport(reportId, action);
  if (!result.ok) {
    const code = result.error.message as ReportResolutionReasonCode;
    return {
      formError: strings.admin.reports.errors[code] ?? strings.admin.reports.errors.failed,
    };
  }

  refresh();
  return { success: true, resultStatus: result.data.status as "resolved" | "dismissed" };
}
