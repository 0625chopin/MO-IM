-- 작성: CORE (Task 029B, 자체 교차검증)
-- get_advisors(security) 실측에서 anon/authenticated_security_definer_function_executable
-- WARN 2건 발견: public.poll_vote_tally·public.crew_directory_summary가 SECURITY DEFINER로
-- PostgREST RPC에 직접 노출되어 있었다(의도된 노출이지만 advisor는 "의도"를 모른다).
-- D-028의 "SECURITY DEFINER는 비노출 스키마에 둔다" 원칙을 정책 헬퍼뿐 아니라 RPC 구현체에도
-- 그대로 적용한다 — 실제 특권 로직은 private.*로 옮기고, public.*는 그 결과를 그대로 넘기는
-- SECURITY INVOKER 얇은 래퍼로 남긴다. 팀장 지시(lint 0건 유지)를 만족시키는 동시에, 특권
-- 코드가 전부 private 스키마 한 곳에 모이는 게 D-028 취지에도 더 맞다.

create or replace function private.poll_vote_tally(p_poll_id uuid)
returns table (
  poll_id uuid,
  poll_status text,
  eligible_count integer,
  participant_count integer,
  for_count integer,
  against_count integer,
  abstain_count integer,
  tally_hidden boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_crew_id uuid;
  v_status text;
  v_eligible_count integer;
  v_participant_count integer;
begin
  select b.crew_id, po.status
    into v_crew_id, v_status
  from public.polls po
  join public.posts p on p.id = po.post_id
  join public.boards b on b.id = p.board_id
  where po.id = p_poll_id;

  if v_crew_id is null then
    raise exception 'poll not found: %', p_poll_id;
  end if;

  if not private.is_active_crew_member(v_crew_id) then
    raise exception 'not authorized to view this poll (crew members only)';
  end if;

  select count(*) into v_eligible_count
  from public.poll_eligible_voters
  where poll_eligible_voters.poll_id = p_poll_id;

  select count(*) into v_participant_count
  from public.poll_votes pv
  where pv.poll_id = p_poll_id and not pv.invalidated;

  if v_eligible_count < 5 and v_status = 'open' then
    return query select
      p_poll_id, v_status, v_eligible_count, v_participant_count,
      null::integer, null::integer, null::integer, true;
  else
    return query select
      p_poll_id, v_status, v_eligible_count, v_participant_count,
      (select count(*)::integer from public.poll_votes pv where pv.poll_id = p_poll_id and not pv.invalidated and pv.choice = 'for'),
      (select count(*)::integer from public.poll_votes pv where pv.poll_id = p_poll_id and not pv.invalidated and pv.choice = 'against'),
      (select count(*)::integer from public.poll_votes pv where pv.poll_id = p_poll_id and not pv.invalidated and pv.choice = 'abstain'),
      false;
  end if;
end;
$function$;

create or replace function public.poll_vote_tally(p_poll_id uuid)
returns table (
  poll_id uuid, poll_status text, eligible_count integer, participant_count integer,
  for_count integer, against_count integer, abstain_count integer, tally_hidden boolean
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.poll_vote_tally(p_poll_id)
$function$;

create or replace function private.crew_directory_summary(p_crew_id uuid)
returns table (
  id uuid, name text, visibility text, category text, description text, member_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_visibility text;
  v_status text;
begin
  select c.visibility, c.status into v_visibility, v_status
  from public.crews c
  where c.id = p_crew_id;

  if v_visibility is null or v_status <> 'active' then
    return;
  end if;

  if v_visibility = 'public' then
    return query
    select c.id, c.name, c.visibility, c.category, c.description,
           (select count(*)::integer from public.crew_memberships cm
              where cm.crew_id = c.id and cm.status = 'active')
    from public.crews c
    where c.id = p_crew_id;
  else
    return query
    select c.id, c.name, c.visibility, null::text, null::text, null::integer
    from public.crews c
    where c.id = p_crew_id;
  end if;
end;
$function$;

create or replace function public.crew_directory_summary(p_crew_id uuid)
returns table (
  id uuid, name text, visibility text, category text, description text, member_count integer
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.crew_directory_summary(p_crew_id)
$function$;

-- private 구현체: 앱이 직접 호출하지 않는다(공용 진입점은 public 래퍼) — 세 대상 명시 회수.
revoke all on function private.poll_vote_tally(uuid) from public, anon, authenticated;
revoke all on function private.crew_directory_summary(uuid) from public, anon, authenticated;

-- public 래퍼가 private 구현체를 호출하려면 invoker(=authenticated/anon) 자신이 EXECUTE 권한을
-- 가져야 한다(SECURITY INVOKER는 호출자 권한으로 실행 — definer와 달리 소유자 권한을 안 빌린다).
grant execute on function private.poll_vote_tally(uuid) to authenticated;
grant execute on function private.crew_directory_summary(uuid) to anon, authenticated;

-- public 래퍼 자체의 grant는 이전 마이그레이션 그대로 유효(revoke...from public 후
-- authenticated/anon에 grant 이미 되어 있음) — CREATE OR REPLACE는 기존 권한을 보존한다.
