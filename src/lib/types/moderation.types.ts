import type { Id, ISODateTimeString } from "./common.types";

/** FR-080 AC1의 신고 대상 4종. v0.2 대상 — 데이터 모델만 선반영. */
export type ReportTargetType = "post" | "comment" | "chat_message" | "profile";

/**
 * 값 집합은 FR-082 AC1("처리(삭제/기각/계정 제재)")에서 역산했다 — 실제로
 * 어떤 조치가 취해졌는지는 이 필드가 아니라 AuditLog.action에 남는다.
 */
export type ReportStatus = "pending" | "resolved" | "dismissed";

/**
 * 관리자 콘솔 상태 필터 값(I-077, 26일차) — `ReportStatus` 3종 + 전체 보기 sentinel `"all"`.
 * `admin_list_reports` RPC의 `p_status`는 SQL `null`로 전체 상태를 받지만, URL 쿼리스트링·문자열
 * 딕셔너리 키에는 `null`을 표현할 수 없어(빈 값과 구분되지 않는다) UI 경계에서만 이 sentinel을
 * 쓴다 — `listReports` 호출 직전(`AdminReportsContainer`)에 `"all" → null`로 변환한다.
 */
export type ReportStatusFilter = ReportStatus | "all";

/** FR-080, v0.2 대상 — 데이터 모델만 선반영. */
export interface Report {
  id: Id;
  reporterId: Id;
  targetType: ReportTargetType;
  targetId: Id;
  reason: string;
  status: ReportStatus;
}

/** FR-081, v0.2 대상 — 데이터 모델만 선반영. */
export interface Block {
  blockerId: Id;
  blockedId: Id;
}

/**
 * FR-082 AC1 "처리(삭제/기각/계정 제재)" 3종(Task 042B, D-050). `admin_resolve_report`
 * RPC(`supabase/migrations/20260725*_admin_console_042b_report_resolution_rpcs.sql`)의
 * `p_action` 파라미터 값과 1:1 대응한다. `remove_content`는 `target_type==="profile"`
 * 신고에는 적용할 수 없다(콘텐츠가 아니라 사람이라 소프트삭제 대상이 없다) —
 * `lib/rules/report-resolution.ts`의 `getAvailableResolutionActions`가 이 제약을 판정한다.
 */
export type ReportResolutionAction = "dismiss" | "remove_content" | "suspend_account";

/**
 * `admin_resolve_report` RPC가 실패를 표현하는 값 — RLS 403류를 그대로 던지지 않고 도메인
 * 오류로 반환한다(D-030 ③). `forbidden`은 정상 경로에서는 도달하지 않는다(Server Action이
 * `checkPermission`으로 먼저 막는다) — RPC 자체의 `is_system_admin` 재확인이 통과하지 못한
 * 경우의 최종 방어선 표현이다.
 */
export type ReportResolutionReasonCode =
  | "forbidden"
  | "invalid_action"
  | "not_found"
  | "already_handled"
  | "cannot_remove_profile_content"
  | "target_not_found"
  | "target_already_removed"
  | "account_not_suspendable"
  | "unhandled_action";

/**
 * 관리자 콘솔 대기열 한 행 — `admin_list_reports` RPC(SECURITY DEFINER)의 반환 컬럼을 그대로
 * camelCase로 옮긴 뷰 전용 타입이다. `Report`(도메인 타입, `reports` 테이블 그대로)와 달리
 * 신고자·대상 미리보기·대상 작성자를 조인해 붙인 **읽기 전용 합성 타입**이라 별도로 둔다 —
 * `Report`에 이 필드들을 얹으면 신고 접수(FR-080) 경로까지 이 넓은 모양을 강제하게 된다.
 */
export interface AdminReportQueueItem {
  reportId: Id;
  reporterId: Id;
  reporterHandle: string;
  reporterDisplayName: string;
  targetType: ReportTargetType;
  targetId: Id;
  reason: string;
  status: ReportStatus;
  createdAt: ISODateTimeString;
  /** 대상 행이 아직 존재하는가(다형 참조라 FK가 없다 — report-block-042a.md §7). */
  targetExists: boolean;
  /** 대상이 이미 소프트삭제됐는가(posts/comments/chat_messages.deleted_at). profile 대상은 항상 false. */
  targetRemoved: boolean;
  /** 대상 콘텐츠 미리보기 200자 — post.title, comment/chat_message.body, profile.handle 중 하나. null이면 targetExists=false. */
  targetPreview: string | null;
  /** 콘텐츠 신고의 작성자(글쓴이/발신자) profileId. profile 신고면 targetId와 동일. */
  targetAuthorId: Id | null;
  targetAuthorHandle: string | null;
}

/**
 * 클라이언트 쓰기 불가 — 서버 로직 전용. NFR-015 대상 행위(권한 변경·강퇴·
 * 해산·투표 종료·게시물 강제 삭제)를 기록한다.
 */
export interface AuditLog {
  id: Id;
  actorId: Id;
  crewId: Id | null;
  action: string;
  targetId: Id;
  createdAt: ISODateTimeString;
}
