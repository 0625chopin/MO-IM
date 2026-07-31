-- 34일차 BOARD — 이전 마이그레이션(20260731010558)의 방어 논증을 정정하는
-- **주석 전용** 마이그레이션이다. 함수 로직은 바뀌지 않는다 — 아래 create or replace는
-- 20260731010558이 배포한 것과 100% 동일한 정의(이미 `order by 1, 2` 포함)를 그대로
-- 재실행하는 멱등 연산이다. 배포 결과(prosecdef·search_path·GRANT·질의 계획·반환 행)에
-- 아무 변화가 없다.
--
-- 왜 20260731010558 파일을 직접 고치지 않고 새 마이그레이션을 추가하는가 — 적용된
-- 마이그레이션의 로컬 파일을 사후 편집하면(주석만 바꿔도) `supabase_migrations.
-- schema_migrations.statements`가 저장한 원격 원문과 로컬 파일이 조용히 갈라진다.
-- 이번 회차 팀장 실측으로 그 갈라짐이 실제로 발생했었다 — 로컬 파일의 주석을 원격 배포
-- 이후에 고쳐 로컬≠원격이 됐고, 우리가 쓰는 무결성 검증(마이그레이션 개수 대조 + version만
-- 이어붙인 MD5)은 파일 "내용"을 보지 않아 그 갈라짐을 탐지하지 못했다(아래 새 이슈로
-- 별도 등재). 그래서 20260731010558은 적용 당시 원문으로 되돌리고, 정정된 논증은 이
-- 새 마이그레이션으로만 추가한다 — "기존 마이그레이션은 수정하지 않고 새 마이그레이션을
-- 추가한다, 원격 기록 버전은 되돌리지 않는다"는 이 프로젝트의 기존 원칙(20260730151125
-- 참고)을 그대로 따른 것이다.
--
-- 정정 내용 — 20260731010558의 방어 논증("with_status가 여전히 물리적 스캔 순서로
-- 반환하는 것과 다른 정렬 기준을 강제한다 — 두 결과의 행 순서가 서로 다른 기준으로
-- 갈라지므로 위치 zip이 더 이상 안정적으로 대응하지 않는다")은 팀장 지적으로 기각됐다 —
-- "두 순서가 다르다"는 것만으로는 무상관을 보장하지 않는다. 두 정렬 기준이 부분적으로
-- 상관되면 위치 zip이 확률적으로는 여전히 복원될 여지가 남는다 — 이는 같은 회차에 이미
-- 한 번 틀렸던 "공통 컬럼이 없으니 결합 불가" 논증과 같은 종류의 약한 논증이었다.
--
-- 실제 근거(정규형 논증) — `order by 1, 2`는 이 함수가 반환하는 컬럼 전부(current_
-- membership_status, has_voted)에 대한 전순 정렬이다. 그래서 출력은 그 두 컬럼의
-- 다중집합만으로 결정되는 정규형(canonical form)이 된다 — 물리적 스캔 순서·인덱스·
-- 이전 호출 이력 중 어느 것도 출력 순서에 남지 않는다. 순서가 운반하는 정보량이 0이므로
-- 다른 결과(with_status 등)와 어떻게 zip하든 애초에 복원할 것이 없다 — "두 순서가 우연히
-- 달라서 안전"이 아니라 "순서 채널 자체가 제거돼서 안전"하다는 것이 핵심이다. 실측에서
-- 위치 zip 결과 5행 중 3행이 우연히 실제 값과 일치했는데, 이는 진실값을 미리 아는
-- 검증자만 관측 가능한 사후 정보이지 공격자가 이용할 수 있는 신호가 아니다 — 정보량이
-- 0인 이상 공격자에게는 어느 zip이 맞는지 구분할 근거가 전혀 없다("몇 %가 맞았는가"는
-- 애초에 잘못된 질문이다).
--
-- 불변식(다음 사람에게) — 이 함수에 반환 컬럼을 추가하면 order by도 그 컬럼까지 반드시
-- 확장한다. 반환 컬럼 중 하나라도 정렬에서 빠지면 그 컬럼에 대해서만 정규형이 깨지고,
-- 그 순간 그 컬럼이 다시 순서 채널(암묵적 조인 키)이 될 수 있다.

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
