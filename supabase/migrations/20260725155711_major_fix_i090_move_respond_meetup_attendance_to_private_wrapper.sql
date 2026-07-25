-- I-090 후속 정정(같은 회차, CORE 자체 발견) — 직전 마이그레이션이 public.respond_meetup_
-- attendance를 그대로 SECURITY DEFINER로 바꿔서 `get_advisors(security)`에 새 WARN
-- (authenticated_security_definer_function_executable)이 생겼다. 이 저장소는 이미 같은
-- 문제를 "private.<fn>(SECURITY DEFINER 실구현) + public.<fn>(SECURITY INVOKER 얇은
-- 래퍼)" 2단 구조로 해소해 온 확립된 패턴이 있다(crew_directory_summary·meetup_directory_
-- summary·disband_crew 전부 이 구조라 advisor가 public 쪽을 SECURITY DEFINER로 보지 않는다).
-- 이번 것만 이 패턴을 안 따를 이유가 없어 같은 구조로 옮긴다 — 시그니처·반환 타입은 완전히
-- 동일해 TS 호출부(`respondAttendance`, `src/lib/data/supabase/meetup.ts`)는 무변경이다.

create or replace function private.respond_meetup_attendance(p_meetup_id uuid, p_status text)
returns table(ok boolean, changed boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

revoke all on function private.respond_meetup_attendance(uuid, text) from public, anon, authenticated;
grant execute on function private.respond_meetup_attendance(uuid, text) to authenticated;

create or replace function public.respond_meetup_attendance(p_meetup_id uuid, p_status text)
returns table(ok boolean, changed boolean, reason text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.respond_meetup_attendance(p_meetup_id, p_status)
$$;

revoke all on function public.respond_meetup_attendance(uuid, text) from public, anon, authenticated;
grant execute on function public.respond_meetup_attendance(uuid, text) to authenticated;

comment on function public.respond_meetup_attendance(uuid, text) is
  'I-090(21일차) — 얇은 SECURITY INVOKER 래퍼. 실구현은 private.respond_meetup_attendance(SECURITY DEFINER) — 2단 구조로 anon/authenticated의 "SECURITY DEFINER 함수 직접 노출" advisor WARN을 피한다(crew_directory_summary·meetup_directory_summary·disband_crew와 같은 패턴).';
