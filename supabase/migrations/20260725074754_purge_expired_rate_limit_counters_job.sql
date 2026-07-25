-- Task 038 후속(18일차 교차검증 minor 1, CORE) — 레이트 리밋 카운터 3종
-- (handle_search_attempts·email_resend_attempts·auth_attempts) 정리 잡이 없어 무한 증식하는
-- 문제. CORE 판정대로 세 테이블 모두 기존 패턴 계승(Task 028/030)이라 이번 결함은 아니지만,
-- 운영 기반(Task 038)이 정확히 이 문제를 다루는 자리라 여기서 해소한다.
--
-- **스키마는 바꾸지 않는다** — email_resend_attempts·auth_attempts는 CREW(Task 030) 소유라
-- 컬럼·인덱스에 손대지 않고 행을 지우는 함수+잡만 추가한다.
--
-- **보존 기간 근거(리밋 윈도 기준, "며칠씩 남길 이유 없음" — 교차검증 지적 반영)**:
--   - handle_search_attempts: D-005 윈도 60초 → 60배 여유를 둔 **1시간** 보존.
--     (`evaluateFixedWindowRateLimit`은 창 밖 행을 어차피 무시하므로 그 이상 보존해도
--     판정에 영향 없다 — 순수하게 디버깅 여유값이다.)
--   - email_resend_attempts: FR-001 E4 "시간당 5회" 판정이 최근 **1시간** 이력을 본다
--     (`evaluateResendCooldown`, `lib/rules/auth-credentials.ts`) → 2배 여유를 둔 **2시간**.
--   - auth_attempts: D-020 잠금 판정(`evaluateLoginLockout`)은 `getRecentAuthAttempts`가 가져오는
--     **최근 10건만** 보고, 잠금 자체는 마지막 실패로부터 15분 뒤 풀린다 — 그러나 활동이
--     뜸한 계정은 "최근 10건"이 15분보다 오래 걸쳐 쌓일 수 있고, 지원팀이 무차별 대입 패턴을
--     되짚어볼 여지도 있어 세 테이블 중 가장 길게 **1일** 보존.
--
-- Task 035(purge_expired_chat_messages)·Task 039(anonymize_expired_deactivated_profiles)와
-- 같은 SECURITY INVOKER + statement_timeout 패턴을 따른다. 다만 **배치 루프는 두지 않는다**
-- — 세 테이블 모두 리밋 윈도가 짧아(최대 1시간) 정상 운영 중에는 절대 대량으로 쌓이지 않는다
-- (12개월 보존하는 chat_messages·30일 보존하는 deactivated profiles와는 데이터 규모 자체가
-- 다르다) — 배치 루프는 이 규모에 불필요한 복잡도라 판단했다(근거는 결정 문서
-- `docs/decisions/ops-foundation-038.md`에도 남긴다).

create or replace function public.purge_expired_rate_limit_counters()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_count integer;
  total_deleted bigint := 0;
begin
  -- 세 테이블 모두 작아서(리밋 윈도가 짧아 상시 소규모) 단일 DELETE로 충분하다.
  -- 그래도 예상 밖 폭증(예: 공격성 트래픽)에 대비해 statement마다 타임아웃을 건다.
  set local statement_timeout = '1min';

  delete from public.handle_search_attempts
  where requested_at < now() - interval '1 hour';
  get diagnostics deleted_count = row_count;
  total_deleted := total_deleted + deleted_count;

  delete from public.email_resend_attempts
  where requested_at < now() - interval '2 hours';
  get diagnostics deleted_count = row_count;
  total_deleted := total_deleted + deleted_count;

  delete from public.auth_attempts
  where attempted_at < now() - interval '1 day';
  get diagnostics deleted_count = row_count;
  total_deleted := total_deleted + deleted_count;

  return total_deleted;
end;
$$;

comment on function public.purge_expired_rate_limit_counters() is
  'Task 038 후속(18일차) — handle_search_attempts(1시간)·email_resend_attempts(2시간)·
  auth_attempts(1일) 레이트 리밋 카운터를 각 테이블의 판정 윈도 기준 여유값으로 정리한다.
  스키마 변경 없음(email_resend_attempts·auth_attempts는 CREW/Task 030 소유). 배치 루프 없음
  — 세 테이블 모두 리밋 윈도가 짧아 상시 소규모라 chat_messages·profiles 파기 잡(대용량 대상)과
  달리 불필요. search_path 고정(function_search_path_mutable WARN 예방).';

revoke execute on function public.purge_expired_rate_limit_counters()
  from public, anon, authenticated;
grant execute on function public.purge_expired_rate_limit_counters()
  to postgres, service_role;

-- 매일 19:00 UTC(KST 04:00) — purge_expired_chat_messages(18:00 UTC)·
-- anonymize_expired_deactivated_profiles(18:30 UTC)와 겹치지 않게 30분 offset.
select cron.schedule(
  'purge_expired_rate_limit_counters',
  '0 19 * * *',
  $$select public.purge_expired_rate_limit_counters();$$
);
