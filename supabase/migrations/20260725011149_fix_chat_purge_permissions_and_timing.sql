-- Task 035 후속(15일차 교차검증, CORE) — 두 지적을 반영한다.
--
-- 이슈 1(major): `revoke all on function ... from public` 은 Supabase가 신규 함수에
-- 기본으로 붙이는 anon/authenticated 직접 grant를 회수하지 못한다(`public` 슈도롤과
-- anon/authenticated 개별 role은 별개 — 029A에서 CORE가 겪은 것과 동일한 함정).
-- `information_schema.routine_privileges` 실측(수정 전): grantee = anon, authenticated,
-- postgres, service_role 4개 전부. anon/authenticated의 EXECUTE를 명시적으로 회수한다.
--
-- 이슈 2(minor): `statement_timeout`은 배치(statement) 단위로 매 배치마다 리셋되고,
-- `max_duration` 소프트 체크는 각 배치가 "끝난 뒤"에만 평가된다. 기존 값
-- (max_duration 8min + statement_timeout 9min)의 진짜 worst-case는 8min + 9min에
-- 근접한 최대 약 17분까지 갈 수 있어 CON-10(잡당 10분)을 실질적으로 보장하지 못했다.
-- 배치당 statement_timeout을 2분으로 낮추고 소프트 루프 예산을 7분으로 낮춰,
-- worst-case를 7분(마지막 배치 시작 직전까지 누적 가능한 최대 소프트 예산)
-- + 2분(그 마지막 배치가 통째로 하드 타임아웃까지 간 경우) = 9분으로 재계산했다.
-- CON-10의 10분 예산 안에 1분의 여유를 남긴다 — (a) 안 채택, 팀장 지시대로 파라미터를
-- 실제로 좁혀 총합이 10분 안에 들어오도록 만들었다.

create or replace function public.purge_expired_chat_messages(
  batch_size integer default 5000,
  max_duration interval default interval '7 minutes'
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  started_at timestamptz := clock_timestamp();
  deleted_count integer;
  total_deleted bigint := 0;
begin
  -- CON-10 방어선(1, 하드): 배치(statement) 단위로 매번 리셋된다 — 단일 배치가
  -- 이 시간을 넘기면 즉시 에러로 실패하고 cron.job_run_details에 'failed'로 기록된다.
  -- 2분: 인덱스 기반 5000행 삭제가 정상적으로 걸리는 시간보다 넉넉하되,
  -- max_duration(소프트)과 합쳐도 CON-10 10분 예산을 넘지 않도록 좁힌 값이다.
  set local statement_timeout = '2min';

  loop
    delete from public.chat_messages
    where id in (
      select id
      from public.chat_messages
      where created_at < now() - interval '12 months'
      order by created_at
      limit batch_size
    );
    get diagnostics deleted_count = row_count;
    total_deleted := total_deleted + deleted_count;

    exit when deleted_count = 0;
    -- CON-10 방어선(2, 소프트): 배치가 끝난 뒤에만 평가되므로, 이 체크를 통과해
    -- 다음 배치를 시작하는 시점의 경과 시간은 max_duration 미만이 보장되지만
    -- 그 다음 배치 자체의 소요 시간(최대 statement_timeout)은 이 체크에 포함되지
    -- 않는다 — worst-case 총합은 max_duration + statement_timeout로 계산해야 한다
    -- (여기서는 7분 + 2분 = 9분, CON-10 10분 예산 이내).
    exit when clock_timestamp() - started_at > max_duration;
  end loop;

  return total_deleted;
end;
$$;

comment on function public.purge_expired_chat_messages(integer, interval) is
  'Task 035 — NFR-033/D-009: 작성 12개월 경과 chat_messages 배치 삭제. '
  'D-033(파티셔닝 미채택) — idx_chat_messages_created(028)로 범위 스캔. '
  'CON-10 — worst-case = max_duration(소프트, 기본 7min) + statement_timeout(하드, 2min) '
  '= 9min < 10min 예산(15일차 교차검증 CORE 지적 반영, 20260725010000). '
  'search_path 고정(function_search_path_mutable WARN 예방). '
  '크루 해산 시 즉시 파기(D-009)는 이 함수의 범위 밖 — docs/decisions/chat-retention-035.md 참고.';

-- 이슈 1 수정: public 슈도롤뿐 아니라 anon·authenticated 개별 grant를 명시적으로 회수한다.
-- (postgres·service_role은 그대로 유지 — 운영자/cron 실행 주체 전용.)
revoke execute on function public.purge_expired_chat_messages(integer, interval)
  from public, anon, authenticated;

grant execute on function public.purge_expired_chat_messages(integer, interval)
  to postgres, service_role;
