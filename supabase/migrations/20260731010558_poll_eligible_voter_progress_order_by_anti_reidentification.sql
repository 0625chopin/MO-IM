-- 34일차 BOARD 실측 후속 — CREW가 3회 반복 재현: 같은 세션에서
-- private.poll_eligible_voters_with_status(profile_id, status)와
-- private.poll_eligible_voter_progress(status, has_voted)를 호출해 반환된 행을 위치(순번)로
-- zip 하면 profile_id ↔ has_voted가 100% 복원됐다. 두 함수가 poll_eligible_voters ×
-- crew_memberships를 동일한 조건으로 ORDER BY 없이 JOIN하므로, 같은 poll_id에 대해 매
-- 호출이 물리적 스캔 순서를 그대로 재현해 행 순서가 안정적으로 일치했다 — 신원과 투표
-- 여부를 같은 행에 묶지 않는다는 poll_eligible_voter_progress 자체의 설계 의도(위
-- 145758 마이그레이션 주석)를 위치 상관이라는 곁채널로 무력화한 것이다. D-003(개인 선택은
-- 비공개, 집계만 공개) 위반.
--
-- 보안 요구사항(D-003 개인 선택 비공개) — 위치 상관 재식별 차단. 성능용 정렬이 아니므로
-- 제거 금지. private.poll_eligible_voter_progress의 최종 return query에 order by 1, 2
-- (current_membership_status, has_voted)를 추가해, with_status가 여전히 물리적 스캔
-- 순서(대체로 profile_id·가입 순)로 반환하는 것과 다른 정렬 기준을 강제한다 — 두 결과의
-- 행 순서가 서로 다른 기준으로 갈라지므로 위치 zip이 더 이상 안정적으로 대응하지 않는다.
--
-- 무작위화(random() 등)는 쓰지 않는다 — 반복 호출로 통계적 복원이 가능해지고 STABLE
-- 표시와도 어긋난다. 결정적 정렬만이 STABLE을 지키면서 재식별을 막는다.
--
-- countRemainingVoters(src/lib/rules/poll-eligibility.ts)는 순서 무관하게 필터링·개수만
-- 세므로 규칙·타입·테스트·TS 코드는 전혀 바뀌지 않는다.
--
-- D-077 관례 B — 함수 시그니처(인자·반환 타입)가 그대로라 CREATE OR REPLACE만으로 기존
-- REVOKE/GRANT가 유지된다(PostgreSQL 표준 동작, 145758 이후 151125 마이그레이션과 동일
-- 판단). 적용 후 has_function_privilege로 anon=false / authenticated=true를 다시 확인한다.

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
    where ev.poll_id = p_poll_id
    order by 1, 2;
end;
$function$;
