-- Task 032 (D-019): FR-066/067 참석·불참 응답을 meetups.attending_count 조건부 UPDATE +
-- meetup_attendances upsert 두 문장으로 처리한다. PostgREST는 산술 표현식(attending_count+1)을
-- UPDATE 본문에 실을 수 없어(리터럴 값만 전송 가능) 두 왕복(읽기→쓰기)이 필요해지는데, 그 사이
-- 경쟁 조건이 생기면 카운터와 attendance 행이 어긋날 수 있다. 이 함수는 두 문장을 단일 트랜잭션
-- (함수 호출 자체가 하나의 트랜잭션)으로 묶어 원자성을 보장한다 — D-019가 "복잡해지면 RPC로
-- 옮긴다"고 명시한 대안이다. security invoker라서 RLS(meetups_update_members_scoped_by_trigger·
-- meetup_attendances_insert_self/update_self)와 meetups_guard_attendee_scope 트리거가 그대로
-- 적용된다 — "RLS로 정원을 강제하지 않는다"(D-019)는 그대로 유지되고, 정원 판정은 이 함수 안의
-- WHERE 절(조건부 UPDATE)만 담당한다.
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

  select status into v_existing_status
  from public.meetup_attendances
  where meetup_id = p_meetup_id and profile_id = v_profile_id;

  if v_existing_status = p_status then
    -- FR-067 E2 멱등 처리 — 이미 같은 상태로 응답한 요청은 조용한 성공(변경 없음).
    return query select true, false, null::text;
    return;
  end if;

  if p_status = 'attending' and coalesce(v_existing_status, 'absent') <> 'attending' then
    -- D-019 조건부 UPDATE 본체 — 이 UPDATE 문 하나가 원자성의 근거다(행 락 획득 후
    -- WHERE 재평가). capacity가 null이면 무제한.
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
    -- FR-067 취소 시 자리 반환.
    update public.meetups
    set attending_count = greatest(0, attending_count - 1)
    where id = p_meetup_id;
  end if;

  insert into public.meetup_attendances (meetup_id, profile_id, status, responded_at)
  values (p_meetup_id, v_profile_id, p_status, now())
  on conflict (meetup_id, profile_id)
  do update set status = excluded.status, responded_at = excluded.responded_at;

  return query select true, true, null::text;
end;
$$;

grant execute on function public.respond_meetup_attendance(uuid, text) to authenticated;
revoke execute on function public.respond_meetup_attendance(uuid, text) from public, anon;
