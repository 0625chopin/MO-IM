-- Task 038(BOARD): D-005·NFR-016 핸들 검색 레이트 리밋(계정당 분당 20회) 카운터.
-- email_resend_attempts(Task 030)와 같은 패턴 — 서버 전용 카운터 테이블, RLS 완전 거부.
-- identifier는 email_resend_attempts(text, 이메일)와 달리 uuid다 — D-005가 "계정당"이라 명시하고
-- 핸들 검색은 guest:deny(항상 인증 세션 존재)라 profiles.id를 직접 FK로 쓸 수 있다.
create table public.handle_search_attempts (
  id bigint generated always as identity primary key,
  identifier uuid not null references public.profiles (id) on delete cascade,
  requested_at timestamptz not null default now()
);

comment on table public.handle_search_attempts is
  'D-005·NFR-016 핸들 검색 레이트 리밋(계정당 분당 20회) 카운터. 클라이언트 접근 불가 — RLS는 email_resend_attempts와 동일하게 전체 거부.';

-- D-028 4대 규약: TO 절 명시. 정책 컬럼(identifier, requested_at) 인덱스.
create index idx_handle_search_attempts_identifier_requested_at
  on public.handle_search_attempts (identifier, requested_at desc);

alter table public.handle_search_attempts enable row level security;

create policy handle_search_attempts_no_client_access
  on public.handle_search_attempts
  for all
  to anon, authenticated
  using (false)
  with check (false);
