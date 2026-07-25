"use client";

import { Loader2Icon } from "lucide-react";
import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { resolveReportAction, type ResolveReportFormState } from "@/lib/actions/resolve-report";
import { getAvailableResolutionActions } from "@/lib/rules/report-resolution";
import { strings } from "@/lib/strings";
import type { AdminReportQueueItem, ReportResolutionAction } from "@/lib/types";

const INITIAL_STATE: ResolveReportFormState = {};

export interface AdminReportQueueProps {
  reports: AdminReportQueueItem[];
}

/**
 * FR-082 AC1 관리자 콘솔 대기열(Task 042B, D-030 ① 표현 컴포넌트) — `AdminReportsContainer`가
 * `admin_list_reports` RPC 결과를 그대로 props로 내려준다. `MemberList`(`components/crews/`)의
 * 카드 목록 + 행별 확인 다이얼로그 패턴을 그대로 따른다.
 *
 * 처리 액션 3종(기각·콘텐츠 삭제·계정 제재)은 전부 되돌릴 수 없는 조작이라(신고 상태
 * pending→resolved|dismissed는 편도 전이, report-block-042a.md §6) 확인 다이얼로그를 거친다 —
 * `RemoveMemberDialog`·`TransferOwnershipDialog`와 같은 이유.
 */
export function AdminReportQueue({ reports }: AdminReportQueueProps) {
  if (reports.length === 0) {
    return (
      <Empty>
        <EmptyTitle>{strings.admin.reports.empty.title}</EmptyTitle>
        <EmptyDescription>{strings.admin.reports.empty.description}</EmptyDescription>
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {reports.map((report) => (
        <li key={report.reportId}>
          <ReportQueueCard report={report} />
        </li>
      ))}
    </ul>
  );
}

function ReportQueueCard({ report }: { report: AdminReportQueueItem }) {
  const actions = getAvailableResolutionActions(report.targetType, report.status);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{strings.admin.reports.targetTypeLabel[report.targetType]}</Badge>
            {report.targetRemoved && (
              <Badge variant="secondary">{strings.admin.reports.targetRemovedBadge}</Badge>
            )}
            {!report.targetExists && (
              <Badge variant="secondary">{strings.admin.reports.targetMissingBadge}</Badge>
            )}
          </div>
          <p className="text-sm text-foreground">
            {report.targetPreview ?? strings.admin.reports.targetMissingBadge}
          </p>
          {report.targetAuthorHandle && (
            <p className="text-xs text-muted-foreground">@{report.targetAuthorHandle}</p>
          )}
        </div>
        <Badge>{strings.admin.reports.statusLabel[report.status]}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{strings.admin.reports.columns.reporter}</dt>
          <dd className="text-foreground">
            {report.reporterDisplayName} (@{report.reporterHandle})
          </dd>
          <dt className="text-muted-foreground">{strings.admin.reports.columns.reason}</dt>
          <dd className="text-foreground">{report.reason}</dd>
          <dt className="text-muted-foreground">{strings.admin.reports.columns.createdAt}</dt>
          <dd className="text-foreground">{new Date(report.createdAt).toLocaleString("ko-KR")}</dd>
        </dl>
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <ResolveReportDialog key={action} reportId={report.reportId} action={action} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResolveReportDialog({
  reportId,
  action,
}: {
  reportId: string;
  action: ReportResolutionAction;
}) {
  const [state, formAction, isPending] = useActionState(resolveReportAction, INITIAL_STATE);
  const copy = strings.admin.reports.confirm[action];

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant={action === "dismiss" ? "outline" : "destructive"}
          />
        }
      >
        {strings.admin.reports.actionLabel[action]}
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>

          <input type="hidden" name="reportId" value={reportId} />
          <input type="hidden" name="action" value={action} />

          {state.formError && (
            <p role="alert" className="text-sm text-destructive">
              {state.formError}
            </p>
          )}
          {state.success && (
            <p role="status" className="text-sm text-muted-foreground">
              {state.resultStatus
                ? strings.admin.reports.successNotice[state.resultStatus]
                : strings.admin.reports.successNotice.resolved}
            </p>
          )}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {strings.admin.reports.confirm.cancel}
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              {isPending ? strings.admin.reports.submitPending : strings.admin.reports.confirm.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
