-- Task 040 (CREW): FR-013 크루 해산. 다중 문 쓰기(크루 상태 + 진행 중 투표 취소 + 미래 Meetup
-- 취소 + 채팅 로그 즉시 파기, D-009 후반)를 단일 SECURITY DEFINER RPC로 원자화한다(운영 규칙 2,
-- I-054 재발 방지 — 여러 PostgREST 호출로 나누면 일부만 성공하는 부분 실패가 가능해진다).
--
-- SECURITY DEFINER가 필요한 이유: chat_messages에는 DELETE 정책이 아예 없다(029A·Task 035
-- 문서 — 배치 파기는 postgres의 rolbypassrls로 우회한다). 오너가 자기 크루 채팅을 즉시 파기하려면
-- 같은 우회가 필요하고, 이 함수가 postgres 소유(security definer)로 그 경로를 대신한다. 그 대가로
-- 함수 자신이 인가를 처음부터 끝까지 재구현해야 한다(RLS가 전부 우회되므로) — 아래에서
-- auth.uid()·owner_id·status·크루명 재입력을 전부 함수 안에서 직접 확인한다. 클라이언트가
-- publishable key로 이 RPC를 직접 호출해도(앱 레이어 우회) 이 함수 자체가 강제 경계다.
create or replace function public.disband_crew(p_crew_id uuid, p_confirm_name text)
returns table(ok boolean, reason text, cancelled_polls integer, cancelled_meetups integer, purged_messages integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_owner_id uuid;
  v_status text;
  v_name text;
  v_cancelled_polls integer;
  v_cancelled_meetups integer;
  v_purged_messages integer;
begin
  if v_actor is null then
    return query select false, 'forbidden'::text, 0, 0, 0;
    return;
  end if;

  select owner_id, status, name into v_owner_id, v_status, v_name
  from public.crews
  where id = p_crew_id
  for update;

  if not found then
    return query select false, 'not_found'::text, 0, 0, 0;
    return;
  end if;

  if v_owner_id <> v_actor then
    -- FR-013 사전조건 "오너 본인" — RLS(crews_update_staff_or_owner)는 임원까지 통과시키므로
    -- 이 함수가 오너 단독 권한을 다시 확인해야 한다(매트릭스 crew:disband, 오너 전용).
    return query select false, 'forbidden'::text, 0, 0, 0;
    return;
  end if;

  if v_status <> 'active' then
    return query select false, 'already_disbanded'::text, 0, 0, 0;
    return;
  end if;

  if v_name <> p_confirm_name then
    -- FR-013 예외 흐름 E1 "크루명 오입력 → 진행 차단". UX 확인이 아니라 실수로 인한 돌이킬 수
    -- 없는 삭제(채팅 즉시 파기 포함)를 막는 안전장치라 여기서도 재확인한다.
    return query select false, 'name_mismatch'::text, 0, 0, 0;
    return;
  end if;

  update public.crews set status = 'archived' where id = p_crew_id;

  -- FR-013 AC1 "진행 중 투표 2건 → 해산 시 둘 다 cancelled".
  update public.polls p
  set status = 'cancelled'
  from public.posts po, public.boards b
  where p.post_id = po.id
    and po.board_id = b.id
    and b.crew_id = p_crew_id
    and p.status = 'open';
  get diagnostics v_cancelled_polls = row_count;

  -- FR-013 AC2 "미래 Meetup 바가 사라지고 과거 항목은 열람 전용으로 남는다" — 지난 Meetup은
  -- confirmed로 남긴다.
  update public.meetups
  set status = 'cancelled'
  where crew_id = p_crew_id
    and status = 'confirmed'
    and date >= current_date;
  get diagnostics v_cancelled_meetups = row_count;

  -- D-009 후반 "크루 해산 시에도 채팅 로그를 함께 파기한다" — Task 035가 이월한 항목.
  delete from public.chat_messages
  where room_id in (select id from public.chat_rooms where crew_id = p_crew_id);
  get diagnostics v_purged_messages = row_count;

  return query select true, null::text, v_cancelled_polls, v_cancelled_meetups, v_purged_messages;
end;
$$;

comment on function public.disband_crew(uuid, text) is
  'Task 040 — FR-013 크루 해산을 단일 트랜잭션으로 원자화(크루 archived + 진행 중 투표 cancelled + 미래 Meetup cancelled + 채팅 즉시 파기 D-009). 인가는 함수 내부에서 재구현(SECURITY DEFINER가 RLS를 우회하므로).';

grant execute on function public.disband_crew(uuid, text) to authenticated;
revoke execute on function public.disband_crew(uuid, text) from public, anon;
