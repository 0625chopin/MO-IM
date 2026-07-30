-- 27일차 후속(같은 회차) — §8/docs/decisions/admin-grant-revoke-rpcs-075.md 참고. 이전
-- 후속 마이그레이션(admin_grant_revoke_rpcs_075_fix_decision_number_refs)은 `comment on
-- function`(pg_description)만 고쳤을 뿐, 함수 본문 내부의 SQL 주석(pg_proc.prosrc에 그대로
-- 저장됨)은 여전히 D-077을 참조하고 있었다(실측: `select prosrc from pg_proc where proname =
-- 'admin_revoke_system_admin' and pronamespace = 'private'::regnamespace` 확인). 로직 변경
-- 없이 그 한 줄 주석만 D-078로 고친다.

create or replace function private.admin_revoke_system_admin(p_profile_id uuid)
returns table(ok boolean, reason_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_target public.profiles%rowtype;
  v_remaining_admins integer;
begin
  if v_admin is null or not exists (
    select 1 from public.profiles where id = v_admin and is_system_admin
  ) then
    return query select false, 'forbidden'::text;
    return;
  end if;

  select * into v_target from public.profiles where id = p_profile_id for update;
  if not found then
    return query select false, 'target_not_found'::text;
    return;
  end if;
  if v_target.status <> 'active' then
    return query select false, 'target_not_active'::text;
    return;
  end if;
  if not v_target.is_system_admin then
    return query select false, 'not_admin'::text;
    return;
  end if;

  -- D-078(27일차) — 이 회수를 적용하면 남는 관리자 수가 0인가. 위 주석 참고 — 의도적으로
  -- cannot_target_self보다 먼저 본다.
  select count(*) into v_remaining_admins
    from public.profiles
    where is_system_admin and id <> p_profile_id;
  if v_remaining_admins = 0 then
    return query select false, 'last_admin_forbidden'::text;
    return;
  end if;

  if p_profile_id = v_admin then
    return query select false, 'cannot_target_self'::text;
    return;
  end if;

  update public.profiles set is_system_admin = false where id = p_profile_id;
  insert into public.audit_logs (actor_id, crew_id, action, target_id)
    values (v_admin, null, 'admin.revoked', p_profile_id);

  return query select true, null::text;
end;
$$;

comment on function private.admin_revoke_system_admin(uuid) is
  'I-075 AC — 관리자 회수(D-076·D-078). 호출자가 관리자가 아니거나(forbidden), 대상이 없거나(target_not_found)/비활성이거나(target_not_active)/이미 관리자가 아니면(not_admin) 거부한다. 이 회수로 관리자가 0명이 되면 last_admin_forbidden(D-078, 최소 1명 보장) — cannot_target_self(D-076)보다 먼저 검사한다(마이그레이션 상단 주석 참고).';

-- create or replace로 함수를 재생성했으므로 D-074/D-077(신규 함수 예외 없이 명시적 REVOKE)
-- 요건에 따라 권한을 다시 명시한다 — PostgreSQL은 함수 본문 교체 시 기존 GRANT/REVOKE를
-- 유지하지만(OID 불변), 이 프로젝트 관례상 함수 정의가 있는 마이그레이션마다 권한 절을
-- 명시적으로 반복해 "이 함수가 무엇에 노출되는지"를 그 자리에서 읽을 수 있게 한다.
revoke all on function private.admin_revoke_system_admin(uuid) from public, anon, authenticated;
grant execute on function private.admin_revoke_system_admin(uuid) to authenticated;
revoke all on function public.admin_revoke_system_admin(uuid) from public;
grant execute on function public.admin_revoke_system_admin(uuid) to authenticated;
revoke execute on function public.admin_revoke_system_admin(uuid) from anon;
