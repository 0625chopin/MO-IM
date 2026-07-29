-- I-103 (MAJOR): poll_eligible_voters_insert_proposal_author_or_staff RLS의 WITH CHECK가
-- poll_id의 소유(제안자 본인 또는 그 poll이 속한 크루의 staff/owner)만 검사하고 (1)
-- profile_id가 실제로 그 크루의 활성 멤버인지 (2) poll이 아직 open인지를 전혀 검사하지
-- 않았다. 테이블 코멘트 자체가 "스냅샷 고정 — 생성 후 행 삭제/추가 없음(정족수 분모
-- 불변)"이라 명시하고, requirements.md는 이 테이블을 "쓰기는 서버 로직 전용"이라 못
--박았는데 실제로는 클라이언트가 언제든 임의 profile_id를 추가할 수 있었다.
--
-- 실측(23일차, 실 REST, 신규 테스트 크루·글·투표로 재현 — 시드 데이터 미오염):
--   1) A(제안자)가 자기 poll에 자기 자신을 정상 eligible voter로 추가 → 201(정상)
--   2) A가 같은 poll에 **그 크루 멤버가 전혀 아닌 B**를 eligible voter로 추가 → 201(성공,
--      정족수 분모에 유령 인원이 섞임)
--      2-1) B가 그 phantom 자격으로 실제 투표(poll_votes INSERT)를 시도 → 403(현재는
--           막힘 — 그러나 poll_votes_insert_eligible_self의 poll_id 서브쿼리가
--           polls_select_members RLS 가시성에 우연히 기대는 방어라 I-092/D-055가 경고한
--           것과 같은 종류의 "우연한 방어"다. 이 이슈 자체를 막아 그 우연에 기대는
--           상황 자체를 없앤다)
--   3) A가 투표에 실제 투표(for) 후 조기 종료(PATCH polls status=closed_passed) → 200,
--      정상적으로 closed_passed로 확정
--   4) **poll이 이미 closed_passed로 확정된 뒤에도** A가 제3의(크루와 무관한) 프로필을
--      eligible voter로 추가 → 201(성공, D-025 "생성 후 불변" 정면 위반 — 이미 확정된
--      투표의 정족수 분모를 사후에 조작 가능)
--
-- 근거: D-025(PollEligibleVoter는 스냅샷, 생성 후 삭제/추가 없음)·requirements.md
-- "PollEligibleVoter ... 쓰기는 서버 로직 전용"·NFR-032(탈퇴·강퇴 이후에도 투표 집계의
-- 역사적 정합성 유지)·3.4절 D-003(정족수=ceil(대상자/3)).
--
-- I-101·I-102와 같은 축의 결함이다. 정당한 생성 경로는 poll.ts의 createPoll이 poll
-- 생성 직후 크루 활성 멤버 스냅샷을 한 번에 client에서 직접 INSERT하는 것 — SECURITY
-- DEFINER 함수가 아니라 클라이언트 직접 INSERT가 정당 경로이므로(D-064), REVOKE가
-- 아니라 BEFORE INSERT 트리거 가드를 쓴다.
--
-- 가드 범위: profile_id는 그 poll이 속한 크루의 **현재 활성(active) 멤버**여야 하고,
-- poll은 아직 **open**이어야 한다. "생성 시점 단 한 번만" 같은 더 엄격한 단일성 강제는
-- 이번 조사에서 실측된 두 공격(비회원 유령 인원 추가, 종료 후 추가)을 막는 데는
-- 충분하고, 더 엄격하게 가면 "생성 직후 몇 초"류의 취약한 시간창 판정이 필요해져
-- 오히려 불안정해진다 — 이번 수정 범위는 여기까지로 잡는다.
--
-- SECURITY DEFINER로 만든다 — I-092/D-055 원칙(가드가 다른 테이블 RLS 가시성에
-- 의존하면 우연한 방어가 된다)을 따라 poll.status·crew_memberships.status 조회가
-- 호출자의 RLS 가시성과 무관하게 항상 정확한 값을 보게 한다.
create function public.poll_eligible_voters_guard_insert_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll_status text;
  v_crew_id uuid;
  v_member_status text;
begin
  if pg_trigger_depth() > 1 then
    -- 현재는 이 테이블에 이런 경로가 없지만, 향후 신뢰된 중첩 호출(예: poll 생성 시
    -- 스냅샷을 서버 트리거가 대신 채우는 경로)이 생기면 여기서 통과시킨다 — 021일차
    -- crew_memberships_guard_self_transition과 동일한 관용구를 선제적으로 맞춘다.
    return new;
  end if;

  select p.status, b.crew_id
    into v_poll_status, v_crew_id
  from public.polls p
  join public.posts po on po.id = p.post_id
  join public.boards b on b.id = po.board_id
  where p.id = new.poll_id;

  if v_poll_status is null then
    raise exception 'poll_id %를 찾을 수 없습니다', new.poll_id;
  end if;

  if v_poll_status <> 'open' then
    raise exception 'poll_eligible_voters는 투표가 open 상태일 때만 추가할 수 있습니다(D-025 스냅샷 불변)';
  end if;

  select cm.status into v_member_status
  from public.crew_memberships cm
  where cm.crew_id = v_crew_id and cm.profile_id = new.profile_id;

  if v_member_status is distinct from 'active' then
    raise exception 'poll_eligible_voters.profile_id는 그 poll이 속한 크루의 활성 멤버여야 합니다(D-025)';
  end if;

  return new;
end;
$$;

comment on function public.poll_eligible_voters_guard_insert_scope() is
  'I-103 — poll_eligible_voters_insert_proposal_author_or_staff RLS가 profile_id·poll 상태를 검사하지 않아 비회원 유령 인원 추가·투표 종료 후 정족수 분모 사후 조작이 가능했다. BEFORE INSERT로 D-025 스냅샷 불변식을 강제한다.';

create trigger trg_poll_eligible_voters_guard_insert_scope
  before insert on public.poll_eligible_voters
  for each row
  execute function public.poll_eligible_voters_guard_insert_scope();
