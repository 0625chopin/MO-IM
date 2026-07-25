import { AdminReportQueue } from "@/components/admin/AdminReportQueue";
import { AdminReportQueueSkeleton } from "@/components/admin/AdminReportQueueSkeleton";
import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { defineSection } from "@/components/sample/showcase-types";
import { ErrorState } from "@/components/ui/error-state";
import { strings } from "@/lib/strings";
import type { AdminReportQueueItem } from "@/lib/types";

import type { ReactNode } from "react";

/** `moderation.tsx`의 `LabeledDemo`와 같은 패턴. */
function LabeledDemo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const SAMPLE_REPORTS: AdminReportQueueItem[] = [
  {
    reportId: "sample-report-1",
    reporterId: "sample-profile-1",
    reporterHandle: "seo_runs",
    reporterDisplayName: "서지훈",
    targetType: "post",
    targetId: "sample-post-1",
    reason: "광고성 게시글이에요",
    status: "pending",
    createdAt: "2026-07-24T09:00:00.000Z",
    targetExists: true,
    targetRemoved: false,
    targetPreview: "강아지 산책 모임 홍보합니다 (스팸성 링크 포함)",
    targetAuthorId: "sample-profile-9",
    targetAuthorHandle: "loud_user",
  },
  {
    reportId: "sample-report-2",
    reporterId: "sample-profile-2",
    reporterHandle: "yuna_book",
    reporterDisplayName: "김유나",
    targetType: "chat_message",
    targetId: "sample-message-1",
    reason: "욕설이 포함돼 있어요",
    status: "pending",
    createdAt: "2026-07-25T02:30:00.000Z",
    targetExists: true,
    targetRemoved: false,
    targetPreview: "야 진짜 그만 좀 해라 ***",
    targetAuthorId: "sample-profile-9",
    targetAuthorHandle: "loud_user",
  },
  {
    reportId: "sample-report-3",
    reporterId: "sample-profile-3",
    reporterHandle: "minjun",
    reporterDisplayName: "박민준",
    targetType: "profile",
    targetId: "sample-profile-9",
    reason: "다른 사용자를 사칭하고 있어요",
    status: "pending",
    createdAt: "2026-07-25T05:15:00.000Z",
    targetExists: true,
    targetRemoved: false,
    targetPreview: "loud_user",
    targetAuthorId: "sample-profile-9",
    targetAuthorHandle: "loud_user",
  },
  {
    reportId: "sample-report-4",
    reporterId: "sample-profile-1",
    reporterHandle: "seo_runs",
    reporterDisplayName: "서지훈",
    targetType: "comment",
    targetId: "sample-comment-1",
    reason: "이미 삭제된 댓글인데 신고가 남아있는 경우를 보여줘요",
    status: "pending",
    createdAt: "2026-07-23T11:00:00.000Z",
    targetExists: true,
    targetRemoved: true,
    targetPreview: null,
    targetAuthorId: "sample-profile-9",
    targetAuthorHandle: "loud_user",
  },
];

/**
 * FR-082 관리자 콘솔(Task 042B, D-008·D-014, NFR-015). 실제 사용처는 `/admin`
 * (`AdminReportsContainer`) — 관리자(`profiles.is_system_admin`)만 접근할 수 있다(AC2, 일반
 * 회원은 404). 처리 3종(기각·콘텐츠 삭제·계정 제재)은 `admin_resolve_report` SQL RPC 단일
 * 트랜잭션으로 `reports.status` 전이 + 소프트삭제/계정 제재 + `audit_logs` 기록을 함께
 * 처리한다(D-050). 대기열 조회는 `admin_list_reports` RPC — 둘 다 SECURITY DEFINER 내부에서
 * `is_system_admin`을 재확인한다(D-049).
 *
 * **이 컴포넌트는 실제 Server Action(`resolveReportAction`)에 연결돼 있다** — `ReportDialog`
 * 샘플과 같은 이유로, 게스트/비관리자 세션에서 제출하면 실제 `notAllowed`/`forbidden` 오류가
 * 표시된다(권한 판정이 실제로 작동한다는 증거). "오류" 패널은 그 외 RPC `reason_code` 6종을
 * 정적으로 나란히 보여준다.
 */
export const adminSection = defineSection({
  id: "admin",
  label: "관리자 콘솔",
  title: "관리자 콘솔",
  description:
    "FR-082(D-008·D-014, NFR-015). 신고 대기열을 확인하고 기각·콘텐츠 삭제·계정 제재 중 하나로 처리합니다(admin_resolve_report RPC, D-050). /admin은 system_admin만 접근할 수 있고 일반 회원은 404를 봅니다(AC2, D-049).",
  items: [
    {
      name: "AdminReportQueue",
      note: "실제 컴포넌트입니다. 처리 버튼은 대상 유형에 따라 달라집니다 — profile 신고는 콘텐츠 삭제를 제공하지 않습니다(getAvailableResolutionActions). 확인 다이얼로그를 열고 제출하면 실제 Server Action이 호출됩니다.",
      panels: {
        default: (
          <PreviewFrame height={720}>
            <div className="p-4">
              <AdminReportQueue reports={SAMPLE_REPORTS} />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={260}>
            <div className="p-4">
              <AdminReportQueueSkeleton />
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={180}>
            <div className="p-4">
              <AdminReportQueue reports={[]} />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={360}>
            <div className="flex flex-col gap-3 p-4">
              <LabeledDemo label="관리자 아님(forbidden) — 이 세션으로 실제 제출해도 재현됩니다">
                <ErrorState title={strings.admin.reports.errors.forbidden} />
              </LabeledDemo>
              <LabeledDemo label="이미 처리됨(already_handled) — 다른 관리자가 먼저 처리한 경우">
                <ErrorState title={strings.admin.reports.errors.already_handled} />
              </LabeledDemo>
              <LabeledDemo label="계정 신고에 콘텐츠 삭제 시도(cannot_remove_profile_content)">
                <ErrorState title={strings.admin.reports.errors.cannot_remove_profile_content} />
              </LabeledDemo>
              <LabeledDemo label="이미 제재된 계정(account_not_suspendable)">
                <ErrorState title={strings.admin.reports.errors.account_not_suspendable} />
              </LabeledDemo>
            </div>
          </PreviewFrame>
        ),
      },
    },
  ],
});
