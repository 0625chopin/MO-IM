-- Task 040 후속 (CREW): disband_crew를 029B 2단 구조(private DEFINER 구현체 + public INVOKER
-- 얇은 래퍼)로 재구성한다. get_advisors(security)가 authenticated_security_definer_function_
-- executable WARN을 냈다 — public.disband_crew가 SECURITY DEFINER인 채로 authenticated에
-- 직접 노출돼 있었기 때문이다(원 마이그레이션 20260725085528). 029B(`rls_move_definer_logic_
-- to_private_wrappers`)가 poll_vote_tally·crew_directory_summary에 대해 이미 세운 원칙 —
-- "SECURITY DEFINER 실제 로직은 private.*로, public.*는 그 결과를 넘기는 SECURITY INVOKER
-- 얇은 래퍼로" — 을 그대로 따른다. 원 마이그레이션 파일은 고치지 않고 이 후속 마이그레이션으로
-- 대체한다(CORE가 세운 절차).
--
-- 내부 인가 검사(auth.uid()·owner_id·status='active'·크루명 일치)는 이 이동으로 전혀 바뀌지
-- 않는다 — private.disband_crew 본문 안에 그대로 남아 실제 강제 경계로 작동한다. auth.uid()는
-- 함수의 SECURITY DEFINER/INVOKER 여부와 무관하게 항상 호출 세션의 request.jwt.claims를
-- 읽으므로(029A 문서에서 이미 확인된 동작), private로 옮겨도 인가 로직의 의미는 동일하다.

create or replace function private.disband_crew(p_crew_id uuid, p_confirm_name text)
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

comment on function private.disband_crew(uuid, text) is
  'Task 040 후속 — FR-013 크루 해산 실제 구현(029B 2단 구조의 private DEFINER 쪽). 인가는 이 함수 안에서 재구현(auth.uid()·owner_id·status·크루명 확인) — SECURITY DEFINER가 RLS를 우회하므로.';

create or replace function public.disband_crew(p_crew_id uuid, p_confirm_name text)
returns table(ok boolean, reason text, cancelled_polls integer, cancelled_meetups integer, purged_messages integer)
language sql
security invoker
set search_path = ''
as $$
  select * from private.disband_crew(p_crew_id, p_confirm_name)
$$;

comment on function public.disband_crew(uuid, text) is
  'Task 040 후속 — 029B 2단 구조의 public INVOKER 얇은 래퍼. 실제 로직은 private.disband_crew.';

-- private 구현체: 세 대상 명시 회수 후, public 래퍼(SECURITY INVOKER)가 호출자 권한으로 이
-- 함수를 실행할 수 있도록 authenticated에게만 다시 부여한다(029B와 동일 패턴 — SECURITY
-- INVOKER는 호출자 자신의 EXECUTE 권한을 요구한다).
revoke all on function private.disband_crew(uuid, text) from public, anon, authenticated;
grant execute on function private.disband_crew(uuid, text) to authenticated;

-- public 래퍼 grant는 원 마이그레이션(20260725085528)에서 이미 authenticated에 부여·anon/public
-- 회수 완료 상태였고, CREATE OR REPLACE는 기존 함수 권한을 보존한다 — 재선언하지 않는다.
