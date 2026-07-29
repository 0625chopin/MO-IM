import type { Id, ISODateTimeString } from "./common.types";

/**
 * NFR-030(KPI-1~5 산출용 이벤트 수집) 대상 행동 이벤트(Task 045).
 *
 * `AuditAction`(`lib/audit/audit-log.ts`)과 성격이 다르다 — 감사 로그는 권한 변경·강퇴·해산
 * 같은 "행위자가 있는 관리 행위"의 포렌식 기록이라 service-role 전용 쓰기 + 클라이언트 완전
 * 거부 RLS다. 이 유니온은 반대로 **평범한 사용자 자신의 행동**을 그 사용자 자신이 self-service로
 * 기록한다(actor_id=auth.uid() RLS, `docs/decisions/observability-browser-045.md` §2).
 *
 * 3종만 둔 이유 — KPI-1(크루별 30일 내 가결 Meetup 비율)·KPI-2(투표 참여율)는 이미 존재하는
 * 상태 전이 타임스탬프(`crews.created_at`·`meetups.created_at`·`poll_votes`/
 * `poll_eligible_voters` 행 수)로 산출 가능해 새 이벤트가 필요 없다(I-071/D-054가 남긴 "같은
 * 사실을 두 곳에 중복 기록하지 않는다" 원칙과 동일). KPI-4(가입 신청 72시간 내 처리율)는
 * `join_requests.decided_at`(같은 Task, 트리거로 채움) 컬럼 추가로 해결했다 — 이것도 이
 * 이벤트 로그가 아니라 엔티티 자신의 속성이라 컬럼으로 두는 편이 맞다고 판단했다. 이 유니온에는
 * **DB 어디에도 원천이 없는 세 가지**(검색 세션, 알림 노출, 알림 클릭)만 남긴다.
 */
export type ProductEventType = "crew_search" | "notification_impression" | "notification_click";

export interface ProductEvent {
  id: Id;
  actorId: Id;
  eventType: ProductEventType;
  payload: Record<string, unknown>;
  occurredAt: ISODateTimeString;
}

export interface RecordProductEventInput {
  actorId: Id;
  eventType: ProductEventType;
  payload?: Record<string, unknown>;
}
