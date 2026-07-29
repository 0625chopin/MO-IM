-- I-102 (CRITICAL): crew_memberships_insert_self_request RLS의 WITH CHECK가
-- profile_id=auth.uid() AND status='requested'만 보고 (1) role 컬럼 (2) 대상 크루의
-- visibility/status를 전혀 검사하지 않았다.
--
-- 실측(23일차, 실 REST, chopin0625@gmail.com=A(오너)·0625chopin@gmail.com=B(공격자),
-- 신규 테스트 크루로 재현 — 시드 데이터 미오염):
--   1) B가 A 소유 PUBLIC 크루에 자기 행을 role=owner, status=requested로 직접 INSERT → 201
--   2) B가 같은 크루에 정상적으로 보이는 join_requests(가입 신청)를 제출 → 201
--   3) A(오너)가 그 신청을 평범한 decideJoinRequest 승인 흐름으로 승인(PATCH join_requests
--      status=approved) → 200
--   4) trg_join_requests_sync_membership_on_decision이 crew_memberships.status만
--      'active'로 바꾸고 role은 건드리지 않는다 → B의 행이 role=owner, status=active로
--      확정됨. **B는 정상적인 가입 승인 한 번만으로 크루 공동 오너가 됐다.**
--   5) 별도로: B가 A 소유 PRIVATE 크루에 같은 방식으로 role=member, status=requested를
--      직접 INSERT → 201(성공, FR-022 사전조건 "크루가 public"·E1 "private → API 403"
--      위반). 대조군으로 같은 크루에 join_requests INSERT 시도 → 403(정상 차단) — 즉
--      join_requests 정책은 이미 안전한데 crew_memberships 직접 INSERT만 뚫려 있었다.
--
-- 근거: FR-022 사전조건("크루가 public, 신청자가 비멤버")·E1("private 크루 → 버튼
-- 미노출·API 403")·D-017(모든 조회 경로에서 private 크루는 비소속자에게 제외), 3.2절
-- 크루당 오너 1명 원칙(D-002, "role=owner는 개설·이양으로만 부여되어야 한다").
--
-- I-101(BOARD, 22일차)과 같은 축의 결함이다 — RLS INSERT 정책이 유일한 문이었는데
-- 도메인 불변식(이번엔 role·크루 공개여부)을 보지 않았다. 다만 I-101과 달리 정당한
-- 생성 경로가 SECURITY DEFINER 함수가 아니라 **클라이언트 직접 INSERT 자체**다
-- (join-request.ts의 createJoinRequest가 이 테이블에 직접 쓴다) — D-064 원칙에 따라
-- REVOKE가 아니라 BEFORE INSERT 트리거 가드를 쓴다.
--
-- pg_trigger_depth() > 1로 "신뢰된 중첩 호출"을 우회한다 — crew_memberships_guard_self_
-- transition(UPDATE 가드)이 이미 쓰는 것과 같은 관용구(029A §3). 이 필드가 있어야
-- trg_crews_provision_owner_bootstrap(크루 개설 시 role=owner,status=active 부트스트랩
-- INSERT, AFTER INSERT on crews 안에서 실행)과 trg_invitations_provision_membership
-- (초대 시 role=member,status=invited INSERT, AFTER INSERT on invitations 안에서 실행)
-- 둘 다 중첩 트리거 컨텍스트(depth>1)에서 실행되므로 이 가드를 그대로 통과한다.
--
-- SECURITY DEFINER로 만든다 — I-092/D-055가 확립한 원칙("가드 로직이 다른 테이블의
-- RLS 가시성에 의존하면 우연한 방어가 된다")을 따라, crews.visibility/status 조회가
-- 호출자(비멤버일 수 있는 신청자)의 RLS 가시성에 좌우되지 않고 항상 정확한 값을
-- 보게 한다.
create function public.crew_memberships_guard_self_insert_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visibility text;
  v_crew_status text;
begin
  if pg_trigger_depth() > 1 then
    -- 신뢰된 중첩 호출(크루 개설 오너 부트스트랩·초대 프로비저닝) — 그대로 통과.
    return new;
  end if;

  -- 여기부터는 RLS crew_memberships_insert_self_request가 허용하는 self-service
  -- 직접 INSERT(가입 신청, FR-022) 경로다.
  if new.role <> 'member' then
    raise exception 'crew_memberships 자기 가입 신청 INSERT는 role=member만 허용합니다(FR-022, D-002)';
  end if;

  select visibility, status into v_visibility, v_crew_status
  from public.crews
  where id = new.crew_id;

  if v_visibility is null then
    raise exception 'crew_id %를 찾을 수 없습니다', new.crew_id;
  end if;

  if v_visibility <> 'public' or v_crew_status <> 'active' then
    raise exception 'crew_memberships 자기 가입 신청 INSERT는 공개(public)·활성(active) 크루에만 허용됩니다(FR-022 사전조건·E1, D-017)';
  end if;

  return new;
end;
$$;

comment on function public.crew_memberships_guard_self_insert_request() is
  'I-102 — crew_memberships_insert_self_request RLS가 role·크루 공개여부/활성여부를 검사하지 않아 (1) 가입 승인 한 번으로 role=owner 격상 (2) private/archived 크루 직접 가입 신청이 가능했다. BEFORE INSERT로 FR-022·D-002·D-017 불변식을 강제한다.';

create trigger trg_crew_memberships_guard_self_insert_request
  before insert on public.crew_memberships
  for each row
  execute function public.crew_memberships_guard_self_insert_request();
