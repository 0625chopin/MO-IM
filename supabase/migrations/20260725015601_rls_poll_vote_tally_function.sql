-- 작성: CORE (Task 029B)
-- 029A §8.2/§10 인계: poll_votes는 본인+임원 이상만 개별 행을 볼 수 있어(D-003 "집계만 공개"
-- 구현), 크루원 전체에게 찬성/반대/기권 집계를 보여줄 방법이 없었다. D-031(대상자 5명 미만
-- 특례 — 진행 중엔 집계를 숨기고 "N명 참여"만 노출, 종료 후 공개)까지 만족하려면 개별 행을
-- 절대 노출하지 않는 집계 전용 함수가 필요하다. public 스키마에 두어 PostgREST RPC로
-- 노출한다(비노출 private 헬퍼와 성격이 다르다 — 이건 앱이 직접 호출하는 계약이다).
--
-- 참고: 이 함수는 후속 마이그레이션(rls_move_definer_logic_to_private_wrappers)에서
-- private.poll_vote_tally(실제 SECURITY DEFINER 구현) + public.poll_vote_tally(SECURITY
-- INVOKER 얇은 래퍼) 2단 구조로 재구성된다(anon/authenticated_security_definer_function_
-- executable WARN을 구조적으로 해소하기 위함). 아래는 최초 버전이며 최종 정의는 그 마이그레이션
-- 파일을 참고할 것.
create or replace function public.poll_vote_tally(p_poll_id uuid)
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

  -- D-031: 대상자 5명 미만 + 진행 중이면 집계를 숨기고 참여 인원만 노출한다.
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

-- public 스키마 신규 함수라 15일차 교훈대로 anon/authenticated 개별 grant가 자동 부여된다.
-- 투표는 크루 내부 기능이라 anon에게는 열지 않는다.
revoke all on function public.poll_vote_tally(uuid) from public, anon, authenticated;
grant execute on function public.poll_vote_tally(uuid) to authenticated;
