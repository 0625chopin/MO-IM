import { AdminReportQueue } from "@/components/admin/AdminReportQueue";
import { AdminReportQueueSkeleton } from "@/components/admin/AdminReportQueueSkeleton";
import { AdminReportStatusTabs } from "@/components/admin/AdminReportStatusTabs";
import type { SystemAdminRowViewModel } from "@/components/admin/system-admin-view-models";
import { SystemAdminList } from "@/components/admin/SystemAdminList";
import { SystemAdminListSkeleton } from "@/components/admin/SystemAdminListSkeleton";
import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { defineSection } from "@/components/sample/showcase-types";
import { ErrorState } from "@/components/ui/error-state";
import { REPORT_STATUS_FILTERS } from "@/lib/rules/report-resolution";
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

/** 처리 이력(I-077, 26일차) — "처리됨"·"기각됨" 탭에서 읽기 전용 카드로 그려지는 예시.
 *  `getAvailableResolutionActions`가 `status !== "pending"`이면 빈 배열을 반환해 두 카드 다
 *  처리 버튼 없이 렌더된다. */
const SAMPLE_REPORT_HISTORY: AdminReportQueueItem[] = [
  {
    reportId: "sample-report-5",
    reporterId: "sample-profile-2",
    reporterHandle: "yuna_book",
    reporterDisplayName: "김유나",
    targetType: "post",
    targetId: "sample-post-2",
    reason: "다른 크루 홍보 도배예요",
    status: "resolved",
    createdAt: "2026-07-20T04:00:00.000Z",
    targetExists: false,
    targetRemoved: true,
    targetPreview: null,
    targetAuthorId: "sample-profile-9",
    targetAuthorHandle: "loud_user",
  },
  {
    reportId: "sample-report-6",
    reporterId: "sample-profile-3",
    reporterHandle: "minjun",
    reporterDisplayName: "박민준",
    targetType: "comment",
    targetId: "sample-comment-2",
    reason: "그냥 마음에 안 들어서 신고했어요",
    status: "dismissed",
    createdAt: "2026-07-18T13:20:00.000Z",
    targetExists: true,
    targetRemoved: false,
    targetPreview: "저도 같이 가고 싶어요!",
    targetAuthorId: "sample-profile-4",
    targetAuthorHandle: "hana_run",
  },
];

/** "전체" 탭 데모용 — 대기·처리됨·기각됨이 섞인 목록. */
const SAMPLE_REPORTS_ALL: AdminReportQueueItem[] = [...SAMPLE_REPORTS, ...SAMPLE_REPORT_HISTORY];

/** 관리자 3명 — 본인(가운데)과 회수 가능한 다른 관리자 2명(I-075, 27일차). */
const SAMPLE_SYSTEM_ADMINS: SystemAdminRowViewModel[] = [
  {
    profileId: "sample-admin-1",
    handle: "chopin_0625",
    displayName: "쇼팽",
    avatarUrl: null,
    status: "active",
    isSelf: false,
    canRevoke: true,
    revokeBlockedReason: null,
  },
  {
    profileId: "sample-admin-2",
    handle: "0625chopin",
    displayName: "쇼팽(부계정)",
    avatarUrl: null,
    status: "active",
    isSelf: true,
    canRevoke: false,
    revokeBlockedReason: strings.admin.systemAdmins.revokeBlockedReason.self,
  },
  {
    profileId: "sample-admin-3",
    handle: "yuna_book",
    displayName: "김유나",
    avatarUrl: null,
    status: "active",
    isSelf: false,
    canRevoke: true,
    revokeBlockedReason: null,
  },
];

/** 관리자 1명뿐 — D-078 "최소 1명 보장"이 회수 버튼 자체를 막는 모습(자기 자신 여부와
 *  무관하게 마지막 관리자 문구가 우선한다, `SystemAdminsContainer` docstring 참고). */
const SAMPLE_SYSTEM_ADMINS_SOLE: SystemAdminRowViewModel[] = [
  {
    profileId: "sample-admin-1",
    handle: "chopin_0625",
    displayName: "쇼팽",
    avatarUrl: null,
    status: "active",
    isSelf: true,
    canRevoke: false,
    revokeBlockedReason: strings.admin.systemAdmins.revokeBlockedReason.lastAdmin,
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
 *
 * **26일차(I-077) — 상태 필터 탭(`AdminReportStatusTabs`) 추가.** `admin_list_reports`
 * RPC는 처음부터 `pending`·`resolved`·`dismissed`·전체(`null`)를 다 받았지만 이 화면은
 * `pending`만 노출했다 — 관리자가 처리 이력을 확인할 방법이 없었다. 카드 자체
 * (`AdminReportQueue`)는 거의 손대지 않았다 — `getAvailableResolutionActions`가 이미
 * `status !== "pending"`이면 빈 액션 배열을 반환해 처리된 신고를 읽기 전용으로 그린다.
 * 새로 필요했던 건 (1) 필터 탭 UI, (2) 필터별 빈 상태 문구(`strings.admin.reports.empty`가
 * 4종 — "대기 중인 신고가 없어요"만으로는 "처리됨" 탭이 비었을 때 의미가 안 맞는다).
 */
export const adminSection = defineSection({
  id: "admin",
  label: "관리자 콘솔",
  title: "관리자 콘솔",
  description:
    "FR-082(D-008·D-014, NFR-015). 신고 대기열·처리 이력을 상태 탭(전체·대기 중·처리됨·기각됨)으로 확인하고, 대기 중인 신고는 기각·콘텐츠 삭제·계정 제재 중 하나로 처리합니다(admin_resolve_report RPC, D-050). /admin은 system_admin만 접근할 수 있고 일반 회원은 404를 봅니다(AC2, D-049). 27일차(I-075)부터 같은 페이지 아래에 시스템 관리자 지정·회수 섹션이 추가됐다(D-076·D-078).",
  items: [
    {
      name: "AdminReportQueue",
      note: "실제 컴포넌트입니다. 처리 버튼은 대상 유형에 따라 달라집니다 — profile 신고는 콘텐츠 삭제를 제공하지 않습니다(getAvailableResolutionActions). 확인 다이얼로그를 열고 제출하면 실제 Server Action이 호출됩니다. status !== \"pending\"인 카드는 액션 버튼이 없습니다(읽기 전용) — 아래 AdminReportStatusTabs 항목의 '처리됨'·'기각됨' 카드가 그 예시입니다.",
      panels: {
        default: (
          <PreviewFrame height={720}>
            <div className="p-4">
              <AdminReportQueue reports={SAMPLE_REPORTS} statusFilter="pending" />
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
          <PreviewFrame height={520}>
            <div className="flex flex-col gap-3 p-4">
              {REPORT_STATUS_FILTERS.map((filter) => (
                <LabeledDemo
                  key={filter}
                  label={`${strings.admin.reports.statusFilter[filter]} 탭 — 0건(I-077, 필터별 빈 상태 문구가 다릅니다)`}
                >
                  <AdminReportQueue reports={[]} statusFilter={filter} />
                </LabeledDemo>
              ))}
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
    {
      name: "AdminReportStatusTabs",
      note: "실제 컴포넌트입니다(I-077, 26일차). /crews의 CrewSearchBar와 같은 이유로 탭을 클릭하면 실제 /admin?status=로 이동합니다(실제 네비게이션을 막지 않았습니다) — 여기서는 '전체' 탭을 기본으로 두어 대기(액션 버튼 있음)·처리됨·기각됨(둘 다 읽기 전용) 카드가 한 목록에 섞여 보이는 모습을 보여줍니다. 로딩·빈·오류 상태는 위 AdminReportQueue 항목에서 이미 보여줘 여기서 다시 만들지 않았습니다 — 이 컴포넌트는 그 위에 얹는 얇은 탭 내비게이션일 뿐입니다.",
      panels: {
        default: (
          <PreviewFrame height={780}>
            <div className="p-4">
              <AdminReportStatusTabs status="all">
                <AdminReportQueue reports={SAMPLE_REPORTS_ALL} statusFilter="all" />
              </AdminReportStatusTabs>
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "SystemAdminList",
      note: "실제 컴포넌트입니다(I-075, 27일차, D-076·D-078). '관리자 지정' 버튼은 실제 UserSearchField(InviteMemberDialog와 공유)를 열고, 지정·회수 둘 다 실제 Server Action에 연결돼 있습니다 — 게스트/비관리자 세션에서 제출하면 실제 forbidden 오류가 표시됩니다. 회수 버튼은 canRevoke===false일 때 아예 비활성 + 이유 문구로 바뀝니다(RPC reason_code를 파싱해 분기하지 않는다는 admin-grant-revoke-rpcs-075.md §4 원칙 — 버튼이 막히는 것 자체가 1차 UX입니다).",
      panels: {
        default: (
          <PreviewFrame height={420}>
            <div className="p-4">
              <SystemAdminList admins={SAMPLE_SYSTEM_ADMINS} />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={200}>
            <div className="p-4">
              <SystemAdminListSkeleton />
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={280}>
            <div className="flex flex-col gap-3 p-4">
              <LabeledDemo label="관리자 0명 — 이론상 도달하지 않아야 하는 방어적 빈 상태(D-078이 DB에서 막는다)">
                <SystemAdminList admins={[]} />
              </LabeledDemo>
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={420}>
            <div className="flex flex-col gap-3 p-4">
              <LabeledDemo label="관리자가 1명뿐 — 그 유일한 행의 회수 버튼이 사전에 막힌다(D-078, '자기 자신' 문구보다 우선)">
                <SystemAdminList admins={SAMPLE_SYSTEM_ADMINS_SOLE} />
              </LabeledDemo>
              <LabeledDemo label="지정 실패 — 핸들을 찾을 수 없음(handle_not_found)">
                <ErrorState title={strings.admin.systemAdmins.grant.errors.handle_not_found} />
              </LabeledDemo>
              <LabeledDemo label="회수 실패 방어선 — cannot_target_self(사전 검증이 새는 경우)">
                <ErrorState title={strings.admin.systemAdmins.revoke.errors.cannot_target_self} />
              </LabeledDemo>
            </div>
          </PreviewFrame>
        ),
      },
    },
  ],
});
