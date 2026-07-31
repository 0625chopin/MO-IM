-- I-089/D-054 실렌더 후속(34일차, BOARD) — poll_eligible_voters_select_self_or_staff RLS가
-- 일반 크루원(member)에게는 poll_eligible_voters를 "본인 행 1개"만 노출해 대상자 수·정족수
-- 표시가 role별로 조용히 틀리는 결함을 해소한다. 029B 패턴(private SECURITY DEFINER + public
-- 얇은 INVOKER 래퍼) 그대로 재사용 — 새 패턴 0건.
--
-- 반환 컬럼은 profile_id + 현재 멤버십 상태뿐이다 — D-025가 보호하려는 notified_at/
-- notify_attempts(발송 부기 컬럼)는 SELECT 목록에 없어 노출되지 않는다. 반환하는 profile_id
-- 집합도 이미 role 무관 공개인 crew_memberships 로스터(crew_memberships_select_self_or_
-- fellow_member: 본인 OR is_active_crew_member)의 부분집합이라 새 노출이 아니다.
--
-- 게이트는 poll_vote_tally와 동일하게 is_active_crew_member(crew_id) — staff 제한 없음(그
-- 제한은 D-025가 지키려던 부기 컬럼용이었고 이 함수는 그 컬럼을 안 돌려주므로 불필요).

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

  return query
    select ev.profile_id, cm.status
    from public.poll_eligible_voters ev
    join public.crew_memberships cm
      on cm.crew_id = v_crew_id and cm.profile_id = ev.profile_id
    where ev.poll_id = p_poll_id;
end;
$function$;

create or replace function public.poll_eligible_voters_with_status(p_poll_id uuid)
returns table (
  profile_id uuid,
  current_membership_status text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.poll_eligible_voters_with_status(p_poll_id)
$function$;

-- D-077 관례 B — 신규 함수는 예외 없이 명시적 REVOKE 후 필요한 롤에만 GRANT.
revoke all on function private.poll_eligible_voters_with_status(uuid) from public, anon, authenticated;
revoke all on function public.poll_eligible_voters_with_status(uuid) from public, anon, authenticated;
grant execute on function private.poll_eligible_voters_with_status(uuid) to authenticated;
grant execute on function public.poll_eligible_voters_with_status(uuid) to authenticated;
