CREATE OR REPLACE FUNCTION public.anonymize_expired_deactivated_profiles(batch_size integer DEFAULT 500, max_duration interval DEFAULT '00:07:00'::interval)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  affected_count integer;
  total_affected bigint := 0;
  batch_ids uuid[];
begin
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
      -- I-056/§9(36일차) 수정 — D-083의 profiles_handle_check(^[a-z][a-z0-9_]*$, 하이픈
      -- 불허)와 충돌해 이 함수가 항상 실패하던 결함(29일차부터 구조적으로 100% 실패,
      -- deactivated 프로필이 0건이라 6/6 "성공"으로 위장돼 있었다)을 고친다. 하이픈을
      -- 밑줄로 교체하고, 8 hex(32비트)에서 10 hex(40비트, 정확히 20자 상한)로 접미사
      -- 엔트로피를 확장했다(비용 동일). 이 컬럼(handle)에 새 CHECK 제약을 추가하려는
      -- 사람은 반드시 이 줄부터 먼저 확인할 것 — 재발 방지 근거는
      -- docs/design/pii-purge-path-audit-36/README.md §9, docs/ISSUES.draft.CREW.md 참고.
      handle = 'withdrawn_' || substr(replace(id::text, '-', ''), 1, 10),
      avatar_url = null,
      bio = null,
      search_opt_out = true,
      status = 'withdrawn',
      anonymized_at = now()
    where id = any(batch_ids);
    get diagnostics affected_count = row_count;
    total_affected := total_affected + affected_count;

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
$function$;
