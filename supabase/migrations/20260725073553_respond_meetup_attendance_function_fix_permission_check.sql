-- Task 032 교차검증(CORE, 18일차) major 1 수정.
--
-- 발견 1: 크루 비소속자가 attending을 호출하면 meetups UPDATE가 RLS
-- (meetups_update_members_scoped_by_trigger)로 0행이 되는데, 함수가 이 0행을 "정원 마감"과
-- 구분하지 못해 reason='full'을 오반환했다. 비소속자는 애초에 이 함수를 호출할 자격이 없다는
-- 사실(forbidden)과 "자격은 있는데 자리가 없다"는 사실(full)은 다른 도메인 오류이므로
-- UI 문구도 달라야 한다 — 함수 시작부에 private.is_active_crew_member() 명시 검사를 추가해
-- 분리한다.
--
-- 발견 2: absent 분기(자리 반환)의 meetups UPDATE는 row_count를 확인하지 않았다. 크루에서
-- 강퇴·탈퇴한 뒤 잔여 attending 행이 남은 사용자가 absent를 호출하면(발견 1의 신규 검사가
-- 이 경로를 이미 앞단에서 차단하지만, 방어적으로 이 분기도 직접 확인한다) UPDATE가 RLS로
-- 막혀도 함수가 이를 무시하고 meetup_attendances upsert로 진행해 예기치 않은 42501을 던질
-- 수 있었다 — attending 분기와 대칭으로 row_count를 확인해 명확한 실패 사유를 반환한다.
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

  select crew_id into v_crew_id from public.meetups where id = p_meetup_id;
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
