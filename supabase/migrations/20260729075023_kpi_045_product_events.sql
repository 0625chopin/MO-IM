-- NFR-030 KPI-3(투표 종료 알림 클릭률)·KPI-5(크루 검색 → 가입 신청 전환율) 산출용 원천 이벤트.
--
-- audit_logs(Task 038)와의 차이: audit_logs는 권한 변경·강퇴·해산 같은 "행위자가 있는 관리
-- 행위"의 포렌식 기록이라 service-role 전용 쓰기 + anon/authenticated 완전 거부 RLS다.
-- product_events는 반대로 "평범한 사용자 자신의 행동"(검색·알림 열람·알림 클릭)을 그 사용자
-- 자신이 self-service로 기록한다 — service-role을 거치지 않고 인증된 세션이 직접 INSERT한다.
-- 그래서 RLS는 "자기 행 삽입만 허용, 그 외 전부 거부"(감사 로그처럼 전부 거부가 아니다).
--
-- 읽기(집계)는 v0.1에 화면이 없다 — service_role로만 조회한다(감사 로그와 같은 이유, 이번
-- Task 045 범위는 "이벤트 수집"까지다. 대시보드는 범위 밖).

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  event_type text not null check (event_type in ('crew_search', 'notification_impression', 'notification_click')),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

comment on table public.product_events is
  'NFR-030 KPI 산출용 행동 이벤트 로그(Task 045). audit_logs와 달리 self-service INSERT —
   actor_id=auth.uid() RLS로 강제. 읽기는 v0.1에 화면이 없어 service_role 전용(집계).';

create index product_events_type_occurred_at_idx on public.product_events (event_type, occurred_at);
create index product_events_actor_id_idx on public.product_events (actor_id);

alter table public.product_events enable row level security;

-- self-service INSERT만 허용 — 본인 행동만 자기 이름으로 기록할 수 있다(남의 actor_id로
-- 위조 불가). UPDATE/DELETE 정책은 두지 않는다(추가 후 불변 — poll_votes의 choice/voted_at과
-- 같은 이유, 이벤트 로그를 사후에 고치면 로그로서의 의미가 없다).
create policy product_events_insert_self
  on public.product_events
  for insert
  to authenticated
  with check (actor_id = auth.uid());

-- 이 프로젝트의 새 테이블은 기본적으로 anon/authenticated에 ALL 권한이 GRANT된다
-- (I-090이 실측한 것과 같은 프로젝트 전역 기본 권한) — RLS만 믿지 않고 명시적으로 좁힌다.
revoke all on public.product_events from anon;
revoke select, update, delete on public.product_events from authenticated;
