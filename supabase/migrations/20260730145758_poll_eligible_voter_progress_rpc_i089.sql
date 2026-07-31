-- I-089/D-054 실렌더 후속(34일차, BOARD) — cast-vote.ts의 종료 트리거③(D-022 "미투표자
-- 0명")이 투표자 본인 세션으로 poll_eligible_voters·poll_votes를 직접 조회했는데, 둘 다
-- "본인 OR staff/owner" RLS라 일반 멤버는 자기 자신 1행만 봐서 미투표자 수가 항상 0으로
-- 계산돼 다른 크루원이 투표하기도 전에 poll이 조기 종료되는 결함이 있었다(FR-041·D-022
-- 위반). 익명 카운트만 필요하므로 신원(profile_id)은 아예 반환하지 않는다 — 팀장 지적대로
-- profile_id를 반환하면 poll_vote_tally(찬반기권 집계, 이미 role 무관 공개)와 결합해 소규모
-- poll(D-031이 5명 미만 특례를 따로 둘 만큼 흔한 사용 경로)에서 "내가 아는 내 표 + 남은 표"로
-- 상대의 선택이 역산되는 재식별 벡터가 생긴다(D-003 "개인 선택 비공개" 우회). 그래서 이
-- 함수는 신원과 투표 여부를 절대 같은 행에 묶어 반환하지 않는다 — 익명 다중집합(각 대상자를
-- "현재 멤버십 상태·투표 여부" 두 값으로만 표시)만 돌려준다.
--
-- D-022의 실제 판정(active AND NOT 투표함, 그 개수 세기)은 SQL로 옮기지 않는다 — 그 필터는
-- 여전히 lib/rules/poll-eligibility.ts의 countRemainingVoters(TS 순수 함수, vitest 커버)가
-- 한다(NFR-036·R-015, "판정 로직은 한 벌만"). 이 함수는 "이 대상자가 투표했는가"라는 사실
-- 하나를 poll_votes와 조인해 표시할 뿐이다 — choice 컬럼은 SELECT하지 않는다(D-003).

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

create or replace function public.poll_eligible_voter_progress(p_poll_id uuid)
returns table (
  current_membership_status text,
  has_voted boolean
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.poll_eligible_voter_progress(p_poll_id)
$function$;

-- D-077 관례 B — 신규 함수는 예외 없이 명시적 REVOKE 후 필요한 롤에만 GRANT.
revoke all on function private.poll_eligible_voter_progress(uuid) from public, anon, authenticated;
revoke all on function public.poll_eligible_voter_progress(uuid) from public, anon, authenticated;
grant execute on function private.poll_eligible_voter_progress(uuid) to authenticated;
grant execute on function public.poll_eligible_voter_progress(uuid) to authenticated;
