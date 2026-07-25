-- Task 039: NFR-031 — 탈퇴(deactivated) 후 30일 유예가 끝난 계정의 개인정보를 배치 파기한다.
-- 참조: D-010(파기 대상: 이메일·핸들·표시이름·아바타·소개 / 보존 대상: 작성 콘텐츠·투표),
--       docs/decisions/chat-retention-035.md(같은 pg_cron 패턴의 선례), docs/decisions/account-lifecycle-039.md
--
-- Task 035(purge_expired_chat_messages)의 관례를 그대로 재사용한다: public.* 단일 함수
-- (private.* SECURITY DEFINER 우회 불필요 — postgres role이 rolbypassrls=true라 RLS와
-- 무관하게 동작한다, 실측: has_table_privilege('postgres','auth.users','UPDATE') = true),
-- 배치 루프 + statement_timeout 이중 방어(CON-10), revoke/grant를 public·anon·authenticated
-- 모두에서 명시적으로 처리(11149 마이그레이션이 남긴 교훈 — `revoke ... from public`만으로는
-- Supabase가 신규 함수에 기본으로 붙이는 anon/authenticated EXECUTE를 회수하지 못한다).
--
-- profiles(공개 스키마)와 auth.users(GoTrue 관리 스키마)를 한 함수 안에서 함께 갱신한다 —
-- 이메일은 Profile 도메인 타입에 없고 auth.users에만 있어(src/lib/types/profile.types.ts
-- 대조), D-010이 요구하는 "이메일 파기"를 만족하려면 auth.users까지 손대야 한다. 직접 SQL로
-- auth.users를 쓰는 것은 Supabase가 공식 지원하는 경로(Admin API `updateUserById`)가 아니지만,
-- pg_cron은 순수 SQL만 실행할 수 있어 HTTP Admin API를 호출할 방법이 없다(pg_net으로 우회하려면
-- 별도 시크릿 저장·비동기 응답 처리가 필요해 이번 회차 범위를 넘는다 — I-056로 등재). auth.identities.
-- identity_data->>'email'은 이 갱신 대상에서 제외한다 — 이 프로젝트 코드는 그 값을 어디서도
-- 읽지 않고(grep 확인), banned_until로 로그인 자체를 막으므로 실질적 위험이 없다.

create or replace function public.anonymize_expired_deactivated_profiles(
  batch_size integer default 500,
  max_duration interval default interval '7 minutes'
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  started_at timestamptz := clock_timestamp();
  affected_count integer;
  total_affected bigint := 0;
  batch_ids uuid[];
begin
  -- CON-10 방어선(1, 하드): 배치(statement) 단위로 매번 리셋된다. chat purge(2min)보다
  -- 짧게 잡는다 — 이 배치는 UPDATE 2개(profiles·auth.users) + placeholder 문자열 계산뿐이라
  -- delete보다 가볍다.
  set local statement_timeout = '1min';

  loop
    select array_agg(id) into batch_ids
    from (
      select id
      from public.profiles
      where status = 'deactivated'
        and deactivated_at is not null
        and deactivated_at <= now() - interval '30 days'
      order by deactivated_at
      limit batch_size
    ) as expired;

    exit when batch_ids is null or array_length(batch_ids, 1) is null;

    update public.profiles
    set
      display_name = '탈퇴한 사용자',
      handle = 'withdrawn-' || substr(id::text, 1, 8),
      avatar_url = null,
      bio = null,
      search_opt_out = true,
      status = 'withdrawn',
      anonymized_at = now()
    where id = any(batch_ids);
    get diagnostics affected_count = row_count;
    total_affected := total_affected + affected_count;

    -- auth.users 파기 — email은 unique 제약이 있어 id 기반 placeholder로 유일성을 보장한다.
    -- banned_until을 먼 미래로 설정해 GoTrue 로그인 자체를 차단한다(애플리케이션 계층의
    -- profiles.status='withdrawn' 체크와 이중 방어).
    update auth.users
    set
      email = 'withdrawn+' || id::text || '@anonymized.invalid',
      raw_user_meta_data = '{}'::jsonb,
      banned_until = 'infinity'::timestamptz
    where id = any(batch_ids);

    exit when clock_timestamp() - started_at > max_duration;
  end loop;

  return total_affected;
end;
$$;

comment on function public.anonymize_expired_deactivated_profiles(integer, interval) is
  'Task 039 — NFR-031/D-010: deactivated_at 기준 30일 경과 profiles를 익명화하고 status=withdrawn·anonymized_at을 기록한다. auth.users.email/banned_until도 함께 파기해 재로그인을 막는다(공식 Admin API 미사용 — pg_cron은 순수 SQL만 호출 가능, I-056). CON-10 — 배치 루프(기본 7min) + statement_timeout(1min) 이중 방어. search_path 고정.';

revoke execute on function public.anonymize_expired_deactivated_profiles(integer, interval)
  from public, anon, authenticated;
grant execute on function public.anonymize_expired_deactivated_profiles(integer, interval)
  to postgres, service_role;

-- 매일 18:30 UTC(KST 03:30) — purge_expired_chat_messages(18:00 UTC)와 겹치지 않게 30분 offset.
select cron.schedule(
  'anonymize_expired_deactivated_profiles',
  '30 18 * * *',
  $$select public.anonymize_expired_deactivated_profiles();$$
);
