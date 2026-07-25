-- Task 028: Report · Block · AuditLog (PRD §7)
-- 참조: NFR-015(감사 로그 대상 행위), FR-080·081(v0.2 대상, 스키마만 선반영),
--       R-003(moderation.types.ts와 대조)

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete restrict,
  target_type text not null check (target_type in ('post', 'comment', 'chat_message', 'profile')),
  -- 다형 참조(post/comment/chat_message/profile 4종 대상) — 단일 FK로 표현할 수
  -- 없어 애플리케이션이 target_type에 맞는 존재 여부를 검증한다(스키마 제약 없음, 문서화).
  target_id uuid not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

comment on table public.reports is 'PRD §7 Report(FR-080, v0.2 대상). target_id는 다형 참조 — FK 없음(문서화로 대체).';

create index idx_reports_status on public.reports (status);
create index idx_reports_reporter on public.reports (reporter_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete restrict,
  blocked_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

comment on table public.blocks is 'PRD §7 Block(FR-081, v0.2 대상).';

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id) on delete restrict,
  crew_id uuid references public.crews (id) on delete restrict,
  action text not null,
  -- 다형 참조 — reports.target_id와 동일한 이유로 FK 없음
  target_id uuid not null,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is 'PRD §7 AuditLog. NFR-015 대상 행위(권한 변경·강퇴·해산·투표 종료·강제 삭제) 기록. 클라이언트 쓰기 불가 — RLS는 029A/029B.';

create index idx_audit_logs_crew on public.audit_logs (crew_id);
create index idx_audit_logs_actor on public.audit_logs (actor_id);
create index idx_audit_logs_created on public.audit_logs (created_at desc);

alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.audit_logs enable row level security;
