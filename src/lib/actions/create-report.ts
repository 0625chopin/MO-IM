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
  /** `createReport`(`src/lib/data/supabase/report.ts`)가 돌려주는 `merged`를 그대로 옮긴다 —
   *  같은 대상을 이미 `pending` 상태로 신고한 적이 있어 `create_report` RPC가 새 행을 만드는
   *  대신 기존 행의 사유만 갱신했다는 뜻이다(FR-080 AC1 "중복 신고는 1건으로 합쳐진다").
   *  `ReportDialog`가 이 값으로 `sentNotice`/`mergedNotice` 중 하나를 고른다(25일차 —
   *  I-117 작업 중 `strings.report.mergedNotice`가 어디서도 쓰이지 않는 죽은 문자열임을
   *  발견했다가 처음엔 사소하다고 넘겼는데, 신고 진입점이 이번 회차에 1곳→4곳으로 늘어
   *  중복 신고가 실사용 경로가 되면서 팀장 지시로 마저 배선했다 — `merged`는 데이터 레이어
   *  까진 이미 있었고 이 Server Action만 버리고 있었다). */
  merged?: boolean;
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
  return { success: true, merged: result.data.merged };
}
