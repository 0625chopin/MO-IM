import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/data/supabase/env";
import type { Id } from "@/lib/types";

/**
 * NFR-015 감사 로그 기록 — `public.audit_logs` 쓰기(Task 038, 18일차 BOARD).
 *
 * **`import "server-only"`** — service-role 키를 다루므로 `src/lib/auth/lockout.ts`와 같은
 * 이유로 클라이언트 번들 혼입을 가드한다.
 *
 * `audit_logs`는 Task 028(CORE)이 이미 만들었고(`docs/decisions/rls-policies-029b.md` 계열,
 * `rls_notification_moderation_audit_policies` 마이그레이션), `anon`/`authenticated` **완전
 * 거부** RLS다 — v0.1에 이 로그를 읽는 화면이 없다(요구사항에 열람 FR 없음). 그래서 쓰기도
 * `lockout.ts`와 같은 패턴으로 service-role 클라이언트를 쓴다 — 이 클라이언트는 이 파일 밖으로
 * 내보내지 않는다.
 *
 * **호출부를 막지 않는다** — INSERT 실패는 `console.error`로만 남기고 예외를 던지지 않는다.
 * 감사 로그가 주 행위(임원 임명·투표 종료·게시물 삭제)를 실패시키면 관측성 기능이 핵심 기능을
 * 막는 것이라 배보다 배꼽이 커진다(`I-049`의 트리거③ try/catch 격리와 같은 원칙). NFR-015가
 * 요구하는 "100% 기록"에는 못 미치는 잔여 위험이며, 재시도 큐 없이 단발 INSERT만 하는 한계는
 * `docs/decisions/ops-foundation-038.md`에 남는다.
 *
 * **19일차 Task 040(CREW)이 `AuditAction`에 `crew.*` 3종(오너 이양·강퇴·해산)을 추가했다** —
 * 팀장 승인(대화 기록), 나머지 구조는 무변경. 상세: `docs/decisions/crew-lifecycle-040.md`.
 *
 * **21일차 Task 042B(CREW)가 `report.*` 5종을 추가했다(D-050).** FR-082 AC1 "감사 로그가
 * 남는다"의 근거. **이 5종은 `recordAuditLog()`를 호출하지 않는다** — `report-block-042a.md`
 * §6이 "관리자 콘솔은 service_role 경로로 status를 바꾼다"고 전제했던 것과 달리, 042B는
 * `admin_resolve_report`(SECURITY DEFINER SQL RPC)가 `reports.status` 전이·콘텐츠
 * 소프트삭제/계정 제재·`audit_logs` INSERT를 **단일 SQL 트랜잭션**으로 처리한다(I-054 회피
 * 원칙의 연장 — 여러 왕복을 순서대로 하지 않는다). 그래서 이 5개 값은 TS 쪽에서 실제로 호출되는
 * 자리가 없고, `docs/decisions/admin-console-042b.md`가 정한 어휘를 이 파일에도 동기화해 두는
 * 문서적 역할만 한다 — SQL 리터럴과 이 유니온이 따로 놀지 않게 하기 위해서다.
 */

export type AuditAction =
  | "crew.staff_appointed"
  | "crew.staff_dismissed"
  | "poll.closed_early"
  | "post.force_deleted"
  // Task 040(크루 생애주기, CREW, 19일차)이 추가 — FR-025 오너 이양·FR-027 강퇴·FR-013 해산은
  // Task 038 착수 시점엔 아직 감사 로그를 걸 곳(쓰기 경로 자체)이 없었다. 기존 4개 값·
  // `recordAuditLog` 로직은 건드리지 않은 순수 추가다 — 이 파일 소유팀(BOARD)에 사전 보고 후
  // 응답 대기 중 착수 지연을 피하려 직접 추가했다(`docs/decisions/crew-lifecycle-040.md` 참고).
  | "crew.ownership_transferred"
  | "crew.member_removed"
  | "crew.disbanded"
  // Task 041(BOARD, 21일차) 추가 — FR-033 타인 댓글 강제 삭제(`post.force_deleted`와 대칭)·
  // FR-065 Meetup 취소(제안자 본인도 호출하지만 "취소"는 되돌릴 수 없는 상태 전이라 본인
  // 여부와 무관하게 항상 기록한다 — `post.force_deleted`가 본인 삭제를 감사 대상에서 빼는
  // 것과는 다른 판단이다: 게시글 삭제는 흔한 CRUD지만 Meetup 취소는 이미 캘린더에 확정 노출된
  // 일정을 뒤집는 행위라 "누가 취소했는지" 자체가 항상 기록 가치가 있다고 봤다).
  | "comment.force_deleted"
  | "meetup.cancelled"
  // Task 044(CORE) 추가 — FR-046 AC1 제안 철회. `meetup.cancelled`와 같은 판단(되돌릴 수 없는
  // 상태 전이라 본인 여부와 무관하게 항상 기록한다).
  | "poll.withdrawn"
  // Task 042B(관리자 콘솔, CREW, 21일차) 추가 — FR-082 AC1. 위 docstring 참고: 실제 INSERT는
  // `admin_resolve_report` SQL RPC 안에서 일어나므로 이 값들을 인자로 `recordAuditLog()`를
  // 호출하는 TS 코드는 없다. `report.dismissed`의 targetId는 reports.id(부수효과가 없는
  // 처리라 다른 도메인 엔티티가 없다), 나머지 넷은 실제로 바뀐 엔티티(글/댓글/메시지/계정)의
  // id다 — `post.force_deleted`·`comment.force_deleted`(크루 임원·오너의 강제 삭제, 크루
  // 스코프)와 별개 값을 쓴 이유는 admin-console-042b.md(D-050) 참고 — 행위 주체(관리자 vs
  // 임원)가 다르면 같은 "삭제됨"이라도 감사 로그에서 구분 가능해야 한다는 판단이다.
  | "report.dismissed"
  | "report.post_removed"
  | "report.comment_removed"
  | "report.chat_message_removed"
  | "report.account_suspended";

export interface RecordAuditLogInput {
  /** 행위를 수행한 사람. `profiles.id` — 시스템 자동 처리(트리거①·③)는 감사 대상이 아니다
   *  (책임 소재가 있는 human actor가 없다), 그래서 이 필드는 항상 non-null이다. */
  actorId: Id;
  /** 크루 스코프 밖 행위는 null. */
  crewId: Id | null;
  action: AuditAction;
  /** 행위 대상(피임명자 profileId, pollId, postId 등) — 다형 참조라 FK 없음(`reports.target_id`와
   *  같은 이유, `create_moderation_and_audit_tables` 마이그레이션 주석 참고). */
  targetId: Id;
}

function createSupabaseServiceRoleClient() {
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았다 — .env.local을 확인한다.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: input.actorId,
    crew_id: input.crewId,
    action: input.action,
    target_id: input.targetId,
  });
  if (error) {
    console.error("[audit] audit_logs insert 실패", { input, error });
  }
}
