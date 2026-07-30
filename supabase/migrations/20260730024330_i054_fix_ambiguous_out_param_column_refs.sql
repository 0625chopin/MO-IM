-- I-054 자기반증 중 발견(28일차, CORE) — private.create_join_request·private.create_poll의
-- `returns table(...)` OUT 파라미터 이름(id·status·crew_id 등)이 함수 본문 안에서 같은 이름의
-- 테이블 컬럼과 겹쳐 "column reference is ambiguous"(42702) 예외를 던졌다. 실측:
-- `select visibility, status into ... from public.crews where id = p_crew_id` 호출이
-- OUT 파라미터 `status`·`id`와 crews.status·crews.id 사이에서 모호성 오류로 즉시 실패했다
-- (정상 흐름조차 도달하지 못함 — 자기반증 스크립트의 Scenario A 첫 호출에서 발견).
-- 모든 바닥 컬럼 참조를 테이블 별칭으로 명시 한정해 해소한다. 로직은 바뀌지 않는다.

create or replace function private.create_join_request(p_crew_id uuid, p_message text default null)
returns table(
  ok boolean,
  reason_code text,
  id uuid,
  crew_id uuid,
  requester_id uuid,
  message text,
  status text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requester uuid := (select auth.uid());
  v_visibility text;
  v_crew_status text;
  v_membership_status text;
  v_row public.join_requests%rowtype;
begin
  if v_requester is null then
    return query select false, 'forbidden'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  select c.visibility, c.status into v_visibility, v_crew_status
  from public.crews c
  where c.id = p_crew_id;

  if v_visibility is null then
    return query select false, 'not_found'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_visibility <> 'public' or v_crew_status <> 'active' then
    return query select false, 'forbidden'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  select cm.status into v_membership_status
  from public.crew_memberships cm
  where cm.crew_id = p_crew_id and cm.profile_id = v_requester
  for update;

  if v_membership_status = 'removed' then
    return query select false, 'forbidden'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  if exists (
    select 1 from public.join_requests jr
    where jr.crew_id = p_crew_id and jr.requester_id = v_requester and jr.status = 'pending'
  ) then
    return query select false, 'conflict'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  begin
    insert into public.join_requests (crew_id, requester_id, message)
    values (p_crew_id, v_requester, p_message)
    returning * into v_row;
  exception when unique_violation then
    return query select false, 'conflict'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end;

  if v_membership_status is null then
    insert into public.crew_memberships (crew_id, profile_id, role, status)
    values (p_crew_id, v_requester, 'member', 'requested');
  elsif v_membership_status in ('declined', 'rejected', 'left') then
    update public.crew_memberships cm
    set role = 'member', status = 'requested', removed_reason = null
    where cm.crew_id = p_crew_id and cm.profile_id = v_requester;
  end if;

  return query select true, null::text,
    v_row.id, v_row.crew_id, v_row.requester_id, v_row.message, v_row.status,
    v_row.decided_by, v_row.decided_at, v_row.created_at;
end;
$function$;

revoke all on function private.create_join_request(uuid, text) from public, anon, authenticated;
grant execute on function private.create_join_request(uuid, text) to authenticated;
revoke all on function public.create_join_request(uuid, text) from public, anon, authenticated;
grant execute on function public.create_join_request(uuid, text) to authenticated;

create or replace function private.create_poll(
  p_post_id uuid,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_eligible_voter_ids jsonb default '[]'::jsonb
)
returns table(
  ok boolean,
  reason_code text,
  id uuid,
  post_id uuid,
  opens_at timestamptz,
  closes_at timestamptz,
  status text,
  closed_by uuid,
  result text,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller uuid := (select auth.uid());
  v_author_id uuid;
  v_post_type text;
  v_row public.polls%rowtype;
begin
  if v_caller is null then
    return query select false, 'forbidden'::text,
      null::uuid, null::uuid, null::timestamptz, null::timestamptz, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select p.author_id, p.type into v_author_id, v_post_type
  from public.posts p
  where p.id = p_post_id;

  if v_author_id is null then
    return query select false, 'not_found'::text,
      null::uuid, null::uuid, null::timestamptz, null::timestamptz, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if v_author_id <> v_caller or v_post_type not in ('meetup_proposal', 'meetup_reschedule_proposal') then
    return query select false, 'forbidden'::text,
      null::uuid, null::uuid, null::timestamptz, null::timestamptz, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  begin
    insert into public.polls (post_id, opens_at, closes_at)
    values (p_post_id, p_opens_at, p_closes_at)
    returning * into v_row;
  exception when unique_violation then
    return query select false, 'conflict'::text,
      null::uuid, null::uuid, null::timestamptz, null::timestamptz, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end;

  insert into public.poll_eligible_voters (poll_id, profile_id)
  select v_row.id, elem::uuid
  from jsonb_array_elements_text(coalesce(p_eligible_voter_ids, '[]'::jsonb)) as elem;

  return query select true, null::text,
    v_row.id, v_row.post_id, v_row.opens_at, v_row.closes_at, v_row.status,
    v_row.closed_by, v_row.result, v_row.decided_at;
end;
$function$;

revoke all on function private.create_poll(uuid, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function private.create_poll(uuid, timestamptz, timestamptz, jsonb) to authenticated;
revoke all on function public.create_poll(uuid, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.create_poll(uuid, timestamptz, timestamptz, jsonb) to authenticated;
