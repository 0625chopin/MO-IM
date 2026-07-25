-- I-065 해소(20일차 CORE) — 익명(미인증) 회원가입 흐름에서 checkHandleAvailabilityAction이
-- 리밋 없는 핸들 존재 확인 오라클이 되는 문제. 정책은 D-047(docs/prioritization-and-risks.md
-- 6.3절)로 먼저 확정했다 — IP당 분당 10회. D-005/handle_search_attempts(계정당 분당 20회)와
-- identifier 종류가 다르다: 그쪽은 uuid(profiles FK, 항상 인증 세션 존재)이고 이쪽은 IP
-- 문자열(FK 불가) — evaluateFixedWindowRateLimit(순수 함수, lib/rules/rate-limit.ts)은
-- attempts 배열만 받으므로 identifier 종류와 무관하게 그대로 재사용한다.
--
-- 정리 잡은 기존 purge_expired_rate_limit_counters(BOARD 소유, Task 038)를 건드리지 않고
-- 전용 잡을 새로 둔다(팀장 지시) — 그 함수는 handle_search_attempts·email_resend_attempts·
-- auth_attempts 세 테이블 이름이 본문에 하드코딩돼 있어, 네 번째 테이블을 추가하려면 BOARD
-- 소유 함수를 고쳐야 한다.

create table public.handle_availability_check_attempts (
  id bigint generated always as identity primary key,
  identifier text not null,
  requested_at timestamptz not null default now()
);

comment on table public.handle_availability_check_attempts is
  'I-065·D-047 — 익명 회원가입 핸들 존재 확인(blur) 레이트 리밋(IP당 분당 10회) 카운터.
   identifier는 IP 문자열(x-forwarded-for) — 미인증 호출이라 profiles FK 불가
   (handle_search_attempts와 달리 uuid가 아니다). 클라이언트 접근 불가 — RLS 전체 거부.';

-- D-028 4대 규약: TO 절 명시. 정책 컬럼(identifier, requested_at) 인덱스.
create index idx_handle_availability_check_attempts_identifier_requested_at
  on public.handle_availability_check_attempts (identifier, requested_at desc);

alter table public.handle_availability_check_attempts enable row level security;

create policy handle_availability_check_attempts_no_client_access
  on public.handle_availability_check_attempts
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- 정리 잡 — D-005 계열과 동일 원칙(판정 윈도 60초 → 60배 여유를 둔 1시간 보존, 순수 디버깅
-- 여유값. evaluateFixedWindowRateLimit은 창 밖 행을 어차피 무시하므로 그 이상 보존해도 판정에
-- 영향 없다). 기존 잡 3개(18:00·18:30·19:00 UTC, purge_expired_chat_messages·
-- anonymize_expired_deactivated_profiles·purge_expired_rate_limit_counters)와 겹치지 않게
-- 30분 offset을 더 얹은 19:30 UTC.
create or replace function public.purge_expired_handle_availability_check_attempts()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  set local statement_timeout = '1min';

  delete from public.handle_availability_check_attempts
  where requested_at < now() - interval '1 hour';
  get diagnostics deleted_count = row_count;

  return deleted_count;
end;
$$;

comment on function public.purge_expired_handle_availability_check_attempts() is
  'I-065·D-047 후속 — handle_availability_check_attempts를 판정 윈도(60초) 기준 여유값(1시간)
   으로 정리한다. purge_expired_rate_limit_counters(BOARD/Task 038 소유)는 건드리지 않고
   전용 잡을 새로 둔다. search_path 고정(function_search_path_mutable WARN 예방).';

revoke execute on function public.purge_expired_handle_availability_check_attempts()
  from public, anon, authenticated;
grant execute on function public.purge_expired_handle_availability_check_attempts()
  to postgres, service_role;

select cron.schedule(
  'purge_expired_handle_availability_check_attempts',
  '30 19 * * *',
  $$select public.purge_expired_handle_availability_check_attempts();$$
);
