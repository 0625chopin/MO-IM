-- 후속 수정(같은 회차) — v1이 크루 비소속자에 대해 'forbidden'이 아니라 'not_found'를 반환하는
-- 것을 자체 재실측으로 발견했다. 원인: meetups SELECT 자체가 meetups_select_members RLS
-- (활성 크루원만)로 걸려 있어, security invoker 컨텍스트에서 비소속자는 crew_id 조회 단계에서
-- 이미 0행을 받는다 — is_active_crew_member() 검사에 도달하기도 전에 조용히 "없음"으로
-- 보인다. CORE가 요구한 대로 "권한 없음"과 "존재하지 않음"을 구분하려면 crew_id 조회
-- 자체가 RLS를 우회해야 한다 — private.crew_directory_summary·private.poll_vote_tally와
-- 같은 이유로 이 조회 하나만 담당하는 좁은 SECURITY DEFINER 헬퍼를 새로 둔다(그 외 아무것도
-- 하지 않는다 — 이 함수가 반환하는 crew_id는 그 자체로 민감 정보가 아니다, meetups 테이블에
-- 이미 크루원 전용 SELECT 정책이 있는 이유는 제목·설명 등 나머지 필드를 감추기 위함이다).
create or replace function private.get_meetup_crew_id(p_meetup_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select crew_id from public.meetups where id = p_meetup_id;
$$;

revoke execute on function private.get_meetup_crew_id(uuid) from public, anon;
grant execute on function private.get_meetup_crew_id(uuid) to authenticated;

create or replace function public.respond_meetup_attendance(
  p_meetup_id uuid,
  p_status text
)
returns table(ok boolean, changed boolean, reason text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_crew_id uuid;
  v_existing_status text;
  v_updated_rows integer;
begin
  if p_status not in ('attending', 'absent') then
    raise exception 'invalid attendance status: %', p_status;
  end if;

  if v_profile_id is null then
    return query select false, false, 'forbidden'::text;
    return;
  end if;

  v_crew_id := private.get_meetup_crew_id(p_meetup_id);
  if v_crew_id is null then
    return query select false, false, 'not_found'::text;
    return;
  end if;

  if not private.is_active_crew_member(v_crew_id) then
    return query select false, false, 'forbidden'::text;
    return;
  end if;

  select status into v_existing_status
  from public.meetup_attendances
  where meetup_id = p_meetup_id and profile_id = v_profile_id;

  if v_existing_status = p_status then
    return query select true, false, null::text;
    return;
  end if;

  if p_status = 'attending' and coalesce(v_existing_status, 'absent') <> 'attending' then
    update public.meetups
    set attending_count = attending_count + 1
    where id = p_meetup_id
      and (capacity is null or attending_count < capacity);
    get diagnostics v_updated_rows = row_count;
    if v_updated_rows = 0 then
      return query select false, false, 'full'::text;
      return;
    end if;
  elsif p_status = 'absent' and v_existing_status = 'attending' then
    update public.meetups
    set attending_count = greatest(0, attending_count - 1)
    where id = p_meetup_id;
    get diagnostics v_updated_rows = row_count;
    if v_updated_rows = 0 then
      return query select false, false, 'forbidden'::text;
      return;
    end if;
  end if;

  insert into public.meetup_attendances (meetup_id, profile_id, status, responded_at)
  values (p_meetup_id, v_profile_id, p_status, now())
  on conflict (meetup_id, profile_id)
  do update set status = excluded.status, responded_at = excluded.responded_at;

  return query select true, true, null::text;
end;
$$;
