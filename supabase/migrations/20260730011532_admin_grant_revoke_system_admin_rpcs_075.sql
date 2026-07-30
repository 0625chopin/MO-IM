-- I-075 (27일차, CORE) — 관리자 지정/회수 RPC. 선행 결정: D-076(26일차, "관리자가 다른
-- 사람을 관리자로 지정·회수할 수 있되 자기 자신은 대상이 될 수 없다") + D-077(27일차,
-- "회수 결과 관리자가 0명이 되는 경로를 DB에서 막는다 — 최소 1명 보장"). 근거·실측 전문은
-- docs/decisions/admin-grant-revoke-rpcs-075.md.
--
-- admin_resolve_report(20260725142344)의 is_system_admin 자기 확인 패턴을 그대로 재사용한다 —
-- 새 패턴을 발명하지 않는다. 029B 2단 구조(private.* SECURITY DEFINER 실제 로직 + public.*
-- SECURITY INVOKER 얇은 래퍼)도 동일하게 따른다 — public.*가 SECURITY DEFINER인 채로
-- authenticated에 직접 노출되면 authenticated_security_definer_function_executable WARN이
-- 재발한다.
--
-- 인가는 두 함수 모두 내부에서 profiles.is_system_admin을 직접 확인한다 — RLS가 아니라
-- SECURITY DEFINER 안의 명시적 검사가 강제 경계다(042A/042B와 같은 원칙).
--
-- **가드 순서에 대한 의도적 설계 — admin_revoke_system_admin만 해당**:
-- "마지막 관리자 회수 거부"(D-077) 검사를 "자기 자신 대상 거부"(D-076) 검사보다 먼저
-- 수행한다. 두 가드가 항상 같은 호출에서 함께 걸리는 것은 아니다 — 실 DB처럼 관리자가
-- 1명뿐일 때 그 1명이 스스로를 회수하려 하면, 어느 쪽을 먼저 봐도 결국 거부되지만
-- reason_code가 달라진다. last_admin 검사를 먼저 두면 "관리자가 1명뿐인 상태에서 그
-- 1명을 회수 대상으로 삼는" 모든 호출(자기 자신이 호출하든 아니든)이 곧바로
-- last_admin_forbidden으로 걸린다 — 자기반증에서 별도 픽스처 없이 실 데이터(관리자
-- 1명)로 이 경로를 바로 재현할 수 있는 이유다. cannot_target_self는 그 뒤에도 여전히
-- 남아, 관리자가 2명 이상이라 last_admin 검사를 통과하는 상황에서 "그런데도 자기 자신을
-- 대상으로 삼았다"는 경우를 별도로 잡는다. 수학적으로 self-target 가드 하나만으로도
-- "관리자 수가 0이 되는 것"은 순차 호출에서는 이미 불가능하다(호출자는 항상 자기 자신이
-- 아닌 대상을 회수하므로 호출자 자신은 항상 관리자로 남는다) — last_admin 검사는 그
-- 불변식이 깨지는 경우(동시 호출 레이스, 향후 다른 경로에서 is_system_admin이 바뀌는
-- 경우)에 대비한 방어 종심이자, 오늘 결정(D-077)을 SQL 문면에 명시적으로 남기기 위함이다.

create or replace function private.admin_grant_system_admin(p_profile_id uuid)
returns table(ok boolean, reason_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_target public.profiles%rowtype;
begin
  if v_admin is null or not exists (
    select 1 from public.profiles where id = v_admin and is_system_admin
  ) then
    return query select false, 'forbidden'::text;
    return;
  end if;

  if p_profile_id = v_admin then
    return query select false, 'cannot_target_self'::text;
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
  if v_target.is_system_admin then
    return query select false, 'already_admin'::text;
    return;
  end if;

  update public.profiles set is_system_admin = true where id = p_profile_id;
  insert into public.audit_logs (actor_id, crew_id, action, target_id)
    values (v_admin, null, 'admin.granted', p_profile_id);

  return query select true, null::text;
end;
$$;

comment on function private.admin_grant_system_admin(uuid) is
  'I-075 AC — 관리자 지정(D-076). 호출자가 관리자가 아니거나(forbidden), 자기 자신을 대상으로 하거나(cannot_target_self, D-076), 대상이 없거나(target_not_found)/비활성이거나(target_not_active)/이미 관리자면(already_admin) 거부한다. admin_resolve_report와 같은 is_system_admin 자기 확인 패턴.';

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

  -- D-077(오늘) — 이 회수를 적용하면 남는 관리자 수가 0인가. 위 주석 참고 — 의도적으로
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
  'I-075 AC — 관리자 회수(D-076·D-077). 호출자가 관리자가 아니거나(forbidden), 대상이 없거나(target_not_found)/비활성이거나(target_not_active)/이미 관리자가 아니면(not_admin) 거부한다. 이 회수로 관리자가 0명이 되면 last_admin_forbidden(D-077, 최소 1명 보장) — cannot_target_self(D-076)보다 먼저 검사한다(마이그레이션 상단 주석 참고).';

-- 관리자 목록 조회 — 관리자만 열람(admin_list_reports와 같은 원칙: 비관리자는 예외 대신
-- 빈 결과, R-012식 "존재 비노출").
create or replace function private.admin_list_system_admins()
returns table(
  profile_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.handle, p.display_name, p.avatar_url, p.status
  from public.profiles p
  where p.is_system_admin
    and exists (
      select 1 from public.profiles ap where ap.id = (select auth.uid()) and ap.is_system_admin
    )
  order by p.handle asc;
$$;

comment on function private.admin_list_system_admins() is
  'I-075 — 현재 관리자 목록(관리자 전용). is_system_admin 확인은 WHERE EXISTS로 걸어 비관리자는 빈 결과를 받는다(예외 대신).';

-- public.* SECURITY INVOKER 얇은 래퍼 (029B 2단 구조)
create or replace function public.admin_grant_system_admin(p_profile_id uuid)
returns table(ok boolean, reason_code text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.admin_grant_system_admin(p_profile_id)
$$;

comment on function public.admin_grant_system_admin(uuid) is
  'I-075 — 029B 2단 구조의 public INVOKER 얇은 래퍼. 실제 로직은 private.admin_grant_system_admin.';

create or replace function public.admin_revoke_system_admin(p_profile_id uuid)
returns table(ok boolean, reason_code text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.admin_revoke_system_admin(p_profile_id)
$$;

comment on function public.admin_revoke_system_admin(uuid) is
  'I-075 — 029B 2단 구조의 public INVOKER 얇은 래퍼. 실제 로직은 private.admin_revoke_system_admin.';

create or replace function public.admin_list_system_admins()
returns table(
  profile_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  status text
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.admin_list_system_admins()
$$;

comment on function public.admin_list_system_admins() is
  'I-075 — 029B 2단 구조의 public INVOKER 얇은 래퍼. 실제 로직은 private.admin_list_system_admins.';

-- D-074 요건 — 함수 생성마다 명시적 REVOKE(이 환경에서는 ALTER DEFAULT PRIVILEGES가
-- 무효임을 실측 확인했다, D-074). CREW의 I-134(BEFORE 가드 트리거 EXECUTE 권한 관례)는
-- 이 마이그레이션 시점에 아직 확정 전이라 admin_resolve_report와 동일한 관례(authenticated만
-- 허용, anon·public 배제)를 그대로 따른다.
revoke all on function private.admin_grant_system_admin(uuid) from public, anon, authenticated;
grant execute on function private.admin_grant_system_admin(uuid) to authenticated;
revoke all on function public.admin_grant_system_admin(uuid) from public;
grant execute on function public.admin_grant_system_admin(uuid) to authenticated;
revoke execute on function public.admin_grant_system_admin(uuid) from anon;

revoke all on function private.admin_revoke_system_admin(uuid) from public, anon, authenticated;
grant execute on function private.admin_revoke_system_admin(uuid) to authenticated;
revoke all on function public.admin_revoke_system_admin(uuid) from public;
grant execute on function public.admin_revoke_system_admin(uuid) to authenticated;
revoke execute on function public.admin_revoke_system_admin(uuid) from anon;

revoke all on function private.admin_list_system_admins() from public, anon, authenticated;
grant execute on function private.admin_list_system_admins() to authenticated;
revoke all on function public.admin_list_system_admins() from public;
grant execute on function public.admin_list_system_admins() to authenticated;
revoke execute on function public.admin_list_system_admins() from anon;
