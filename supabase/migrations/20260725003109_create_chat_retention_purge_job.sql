-- Task 035: 채팅 12개월 자동 파기 배치 (D-009, D-033, NFR-033, CON-10)
-- 참조: docs/decisions/chat-retention-035.md
--   - 보존 기간 12개월: requirements.md 5.2절 ChatMessage 행("작성 12개월 후 배치 파기,
--     크루 해산 시 함께 파기") + NFR-033/D-009.
--   - D-033: 파티셔닝(pg_partman) 미채택 — Task 028이 만든 idx_chat_messages_created
--     btree 인덱스로 범위 스캔하는 배치 DELETE 루프.
--   - CON-10(잡당 10분·동시 잡 8개, pg_cron이 강제하지 않는 규약): 함수 내부에
--     (1) 배치 크기 제한 루프 (2) statement_timeout 두 겹으로 방어한다.
--   - RLS 상호작용(실측): 이 함수는 SECURITY INVOKER다. 실제로 호출하는 pg_cron 잡은
--     postgres role로 등록되고(cron.job.username), 이 프로젝트의 postgres role은
--     rolbypassrls=true(테이블 소유자이기도 하다)라 chat_messages의 RLS(정책 0개,
--     기본 거부) 상태와 무관하게 삭제가 수행된다 — SECURITY DEFINER 불필요.
--     029A가 만드는 정책 객체는 이 마이그레이션에서 건드리지 않는다.

create or replace function public.purge_expired_chat_messages(
  batch_size integer default 5000,
  max_duration interval default interval '8 minutes'
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
  -- CON-10 방어선(1): 단일 실행이 무한정 걸리지 않도록 statement_timeout을 건다.
  -- 전체 잡 예산(10분) 안에서 여유(1분)를 남겨, 타임아웃이 나더라도 그 사실이
  -- cron.job_run_details에 'failed'로 정상 기록되게 한다.
  set local statement_timeout = '9min';

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
    -- CON-10 방어선(2): 배치 루프 자체의 시간 예산(기본 8분). 하루치 삭제 대상이
    -- 이 예산을 넘으면 남은 행은 다음날 잡이 이어서 처리한다(자기 수렴 — 파티셔닝
    -- 없이도 무한정 밀리지 않는다).
    exit when clock_timestamp() - started_at > max_duration;
  end loop;

  return total_deleted;
end;
$$;

comment on function public.purge_expired_chat_messages(integer, interval) is
  'Task 035 — NFR-033/D-009: 작성 12개월 경과 chat_messages 배치 삭제. '
  'D-033(파티셔닝 미채택) — idx_chat_messages_created(028)로 범위 스캔. '
  'CON-10 — 배치 루프(기본 8분) + statement_timeout(9분) 이중 방어. '
  'search_path 고정(function_search_path_mutable WARN 예방). '
  '크루 해산 시 즉시 파기(D-009)는 이 함수의 범위 밖 — docs/decisions/chat-retention-035.md 참고.';

-- 기본 함수 실행 권한(PUBLIC)을 회수하고 실제로 이 함수를 쓰는 역할에만 부여한다.
-- postgres: pg_cron 잡 실행 주체. service_role: 향후 수동/서버 트리거 대비.
revoke all on function public.purge_expired_chat_messages(integer, interval) from public;
grant execute on function public.purge_expired_chat_messages(integer, interval) to postgres, service_role;

-- 매일 18:00 UTC(KST 03:00, 저트래픽 시간대) 1회 실행. 잡 이름은 함수명과 맞춰
-- cron.job/cron.job_run_details 조인 조회(NFR-029, cron-foundation.md 4절 패턴)에서
-- 바로 식별되게 한다.
select cron.schedule(
  'purge_expired_chat_messages',
  '0 18 * * *',
  $$select public.purge_expired_chat_messages();$$
);
