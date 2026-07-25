-- 작성: CORE (17일차, 팀장 배정 — Task 020C 핫픽스 중 발견된 실재 결함)
--
-- 문제: `src/lib/actions/poll-auto-close.ts`의 `decideAndClosePoll`이 `getPollTally`(=
-- `public.poll_vote_tally` 경유)를 종료 판정에 쓴다. 그 함수는 D-031(대상자 5명 미만 +
-- `open`이면 진행 중 집계를 숨기고 for/against/abstain을 null로 반환)을 강제하는데,
-- `decideAndClosePoll`은 poll이 **`open`인 동안** 호출되므로 숨김 조건이 그대로 걸려 0으로
-- 정족수·가결을 계산한다(D-031은 "표시"를 숨기라 했지 "판정"을 숨기라 하지 않았다 —
-- 표시용 함수 하나를 판정에도 겸용한 것이 버그다). 오늘은 `closePoll`(마지막 저장 단계)이
-- 여전히 Mock 쓰기라 이 잘못된 결과가 저장되지 않지만(Supabase 실 UUID에 대해 항상
-- not_found), 이건 설계된 방어가 아니라 우연한 폐기다 — Task 032가 poll 쓰기를 Supabase로
-- 옮기는 순간 그대로 저장된다.
--
-- 해법: 표시용(`poll_vote_tally`)과 판정용(`poll_vote_tally_for_decision`)을 분리한다.
-- 판정용은 029B의 2단 구조(`private.*` SECURITY DEFINER 구현체 + `public.*` SECURITY INVOKER
-- 얇은 래퍼)를 처음부터 그대로 따른다 — 16일차에 public에 SECURITY DEFINER를 직접 두었다가
-- `anon/authenticated_security_definer_function_executable` WARN이 뜨고 뒤늦게 2단으로
-- 재구성한 실수(`rls_move_definer_logic_to_private_wrappers.sql`)를 반복하지 않는다.
--
-- D-031을 무력화하지 않는다는 논증(핵심): 이 함수가 "진행 중 숨김"을 건너뛰고 실제 집계를
-- 돌려주는 경우는 v_decision_ready가 참일 때뿐이고, 그 조건은 D-003이 정의한 세 종료
-- 트리거(①기한 도래 ②제안자·임원·오너의 조기 종료 권한 ③미투표자 0명) 중 하나가 지금 이
-- 순간 이미 참일 때로 한정했다. 이 세 경우 전부, 진짜 집계는 이미 다른 경로로 곧(또는
-- 즉시) 공개될 숫자다:
--   ① 기한 도래 → 종료 처리되면 poll_vote_tally 자신도 status<>'open'이 되어 숨김이 풀린다.
--   ② 조기 종료 권한자(제안자·임원·오너) → 그 사람은 지금 당장 실제로 종료 버튼을 눌러
--      poll_vote_tally로 같은 숫자를 즉시 공개시킬 수 있는 사람이다. 새 권한을 얻는 게
--      아니라 이미 가진 "종료해서 공개한다" 권한을 한 스텝 앞당길 뿐이다.
--   ③ 미투표자 0명 → 호출자 자신이 방금 마지막 표를 던져 전원이 투표를 마친 시점이다.
--      이 시점 집계는 이 호출 직후 자동 종료로 어차피 공개된다.
-- 세 경우가 아니면(v_decision_ready = false) 이 함수는 private.poll_vote_tally를 그대로
-- 위임 호출해 표시용 함수와 완전히 동일한 결과(숨김 포함)를 돌려준다 — "이 함수가
-- poll_vote_tally보다 더 보여주는 유일한 경우는 트리거가 참일 때뿐"이라는 성질을 SQL
-- 재사용으로 보장한다(숨김 조건을 두 곳에 따로 베끼지 않는다, R-015).
--
-- 알려진 트레이드오프(문서화, 수용): staff/owner는 v_decision_ready 조건 ②를 항상 만족하므로
-- 투표를 종료하지 않고도 이 함수를 반복 호출해 실시간 집계 변화를 관찰할 수 있다 — "종료해서
-- 공개"는 1회성 파괴적 행위(재개 불가)인 반면 이 함수는 비파괴적으로 반복 조회가 가능해
-- 엄밀히는 종료 버튼보다 조금 더 넓은 관찰 창을 준다. 다만 staff/owner는 이미 크루 운영
-- 전권(멤버 강퇴·크루 설정 변경 등)을 가진 신뢰 경계이고, 이 앱의 D-003 종료 트리거②
-- 설계 자체가 "제안자·임원·오너는 아무 때나 종료해 결과를 공개할 수 있다"를 전제하므로
-- 새로운 신뢰 경계를 만드는 것은 아니라고 판단했다. EXECUTE 권한 판단(아래)도 이 판단 위에
-- 서 있다 — anon에게는 절대 열지 않고 authenticated(활성 크루원만, 함수 내부에서 재확인)로
-- 좁힌다.
--
-- 노출 대상: authenticated만(= poll_vote_tally와 동일 정책, 투표는 크루 내부 기능이라
-- anon 비허용). 함수 내부 private.is_active_crew_member가 크루 소속 여부를 다시 확인하므로
-- "로그인만 했지 이 크루원이 아닌 사용자"는 여전히 예외로 거부된다.

create or replace function private.poll_vote_tally_for_decision(p_poll_id uuid)
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
  v_closes_at timestamptz;
  v_post_author uuid;
  v_eligible_count integer;
  v_participant_count integer;
  v_decision_ready boolean;
begin
  select b.crew_id, po.status, po.closes_at, p.author_id
    into v_crew_id, v_status, v_closes_at, v_post_author
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

  v_decision_ready :=
    v_status <> 'open'
    or v_closes_at <= now()
    or (select auth.uid()) = v_post_author
    or private.is_crew_staff_or_owner(v_crew_id)
    or not exists (
      select 1
      from public.poll_eligible_voters ev
      join public.crew_memberships cm
        on cm.crew_id = v_crew_id
       and cm.profile_id = ev.profile_id
       and cm.status = 'active'
      where ev.poll_id = p_poll_id
        and not exists (
          select 1 from public.poll_votes pv
          where pv.poll_id = ev.poll_id and pv.voter_id = ev.profile_id and not pv.invalidated
        )
    );

  if not v_decision_ready then
    return query select * from private.poll_vote_tally(p_poll_id);
    return;
  end if;

  select count(*) into v_eligible_count
  from public.poll_eligible_voters
  where poll_eligible_voters.poll_id = p_poll_id;

  select count(*) into v_participant_count
  from public.poll_votes pv
  where pv.poll_id = p_poll_id and not pv.invalidated;

  return query select
    p_poll_id, v_status, v_eligible_count, v_participant_count,
    (select count(*)::integer from public.poll_votes pv where pv.poll_id = p_poll_id and not pv.invalidated and pv.choice = 'for'),
    (select count(*)::integer from public.poll_votes pv where pv.poll_id = p_poll_id and not pv.invalidated and pv.choice = 'against'),
    (select count(*)::integer from public.poll_votes pv where pv.poll_id = p_poll_id and not pv.invalidated and pv.choice = 'abstain'),
    false;
end;
$function$;

create or replace function public.poll_vote_tally_for_decision(p_poll_id uuid)
returns table (
  poll_id uuid, poll_status text, eligible_count integer, participant_count integer,
  for_count integer, against_count integer, abstain_count integer, tally_hidden boolean
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.poll_vote_tally_for_decision(p_poll_id)
$function$;

revoke all on function private.poll_vote_tally_for_decision(uuid) from public, anon, authenticated;
revoke all on function public.poll_vote_tally_for_decision(uuid) from public, anon, authenticated;

grant execute on function private.poll_vote_tally_for_decision(uuid) to authenticated;
grant execute on function public.poll_vote_tally_for_decision(uuid) to authenticated;
