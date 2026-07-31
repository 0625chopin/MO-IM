-- I-089 후속 — 팀장 지적(34일차): 두 RPC(`poll_eligible_voters_with_status`·
-- `poll_eligible_voter_progress`)가 poll_eligible_voters × crew_memberships를 INNER JOIN해서,
-- 스냅샷 대상자의 멤버십 행이 없으면(D-003 불변식 위반) 원본 TS(`listEligibleVotersWith
-- CurrentStatus`)처럼 예외를 던져 멈추는 대신 그 행을 조용히 지운 채 결과를 반환했다. 그
-- 지워진 행 수는 곧바로 countQuorumEligibleVoters(정족수 분모)·countRemainingVoters(트리거③
-- 미투표자)로 들어가므로, "RLS가 행을 조용히 줄이는" 지금 고치는 결함과 정확히 같은 실패
-- 형태(조용한 축소)를 JOIN 레벨에서 재도입하는 것이었다. 스냅샷 불변식상 항상 매치된다는
-- 판단이 맞더라도, 불변식이 깨졌을 때 "조용히 틀린 답"과 "멈춤"은 다르다 — 이번 회차
-- CREW의 나이브 RLS 실측("에러 없이 조용한 0행은 아무도 못 알아챈다")과 같은 교훈이다.
--
-- LEFT JOIN으로 먼저 결손 여부를 확인해 있으면 raise exception(poll_id·profile_id 포함,
-- 다음 진단자를 위해)으로 멈추고, 없으면 원래의 INNER JOIN 결과를 그대로 반환한다 — 불변식이
-- 항상 참이면 이 사전 확인은 SELECT 1회 추가일 뿐 동작을 바꾸지 않는다.

create or replace function private.poll_eligible_voters_with_status(p_poll_id uuid)
returns table (
  profile_id uuid,
  current_membership_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_crew_id uuid;
  v_missing_profile_id uuid;
begin
  select b.crew_id
    into v_crew_id
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

  select ev.profile_id
    into v_missing_profile_id
  from public.poll_eligible_voters ev
  left join public.crew_memberships cm
    on cm.crew_id = v_crew_id and cm.profile_id = ev.profile_id
  where ev.poll_id = p_poll_id and cm.profile_id is null
  limit 1;

  if v_missing_profile_id is not null then
    raise exception 'crew % 의 멤버십(%)을 찾을 수 없다 — poll % 스냅샷과 불일치.',
      v_crew_id, v_missing_profile_id, p_poll_id;
  end if;

  return query
    select ev.profile_id, cm.status
    from public.poll_eligible_voters ev
    join public.crew_memberships cm
      on cm.crew_id = v_crew_id and cm.profile_id = ev.profile_id
    where ev.poll_id = p_poll_id;
end;
$function$;

create or replace function private.poll_eligible_voter_progress(p_poll_id uuid)
returns table (
  current_membership_status text,
  has_voted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_crew_id uuid;
  v_missing_profile_id uuid;
begin
  select b.crew_id
    into v_crew_id
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

  select ev.profile_id
    into v_missing_profile_id
  from public.poll_eligible_voters ev
  left join public.crew_memberships cm
    on cm.crew_id = v_crew_id and cm.profile_id = ev.profile_id
  where ev.poll_id = p_poll_id and cm.profile_id is null
  limit 1;

  if v_missing_profile_id is not null then
    raise exception 'crew % 의 멤버십(%)을 찾을 수 없다 — poll % 스냅샷과 불일치.',
      v_crew_id, v_missing_profile_id, p_poll_id;
  end if;

  return query
    select
      cm.status,
      exists (
        select 1 from public.poll_votes pv
        where pv.poll_id = p_poll_id and pv.voter_id = ev.profile_id and not pv.invalidated
      )
    from public.poll_eligible_voters ev
    join public.crew_memberships cm
      on cm.crew_id = v_crew_id and cm.profile_id = ev.profile_id
    where ev.poll_id = p_poll_id;
end;
$function$;

-- public 래퍼·REVOKE/GRANT는 이전 마이그레이션에서 이미 걸려 있다 — 함수 시그니처(인자·반환
-- 타입)가 그대로라 CREATE OR REPLACE만으로 충분하고, 권한 재부여가 필요 없다(PostgreSQL은
-- 함수 본문 교체 시 기존 GRANT를 유지한다).
