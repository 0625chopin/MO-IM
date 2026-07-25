-- I-086(MAJOR, CORE 21일차 발견, 수정 CREW) — FR-026/FR-005 AC1이 공유하는 조건부 규칙
-- (hasOwnerSuccessorOrDisband, permission.ts 각주②)이 profile:withdraw 경로
-- (request_account_deactivation RPC)에서는 DB로 강제되는데 crew:leave 경로
-- (crew_memberships 자가 UPDATE)에서는 강제되지 않았다 — 오너가 이양·해산 없이 자기
-- crew_memberships를 직접 status='left'로 UPDATE하면 성공해 owner_id는 남고 활성 오너
-- 멤버십이 없는 고아 크루가 된다.
--
-- 고침: "이 profile이 이 crew(또는 전체)의 활성 오너인가"를 판정하는 단일 private 헬퍼
-- private.owns_active_crew(p_crew_id uuid default null)를 신설하고, 두 자리 모두 이
-- 헬퍼를 재사용하게 한다(I-071이 지적한 "같은 규칙의 TS/SQL 이중화"와 같은 재발을 SQL
-- 내부에서라도 피한다) — private.my_crew_role과 같은 스타일(auth.uid() 내부 사용,
-- security definer, stable).
--   - p_crew_id가 NULL이면 "auth.uid()가 소유한 활성 크루가 하나라도 있는가"
--     (profile:withdraw, 계정 전체 스코프).
--   - p_crew_id가 있으면 "auth.uid()가 그 크루의 활성 오너인가"(crew:leave, 크루
--     스코프 하나).

create or replace function private.owns_active_crew(p_crew_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.crew_memberships cm
    join public.crews c on c.id = cm.crew_id
    where cm.profile_id = (select auth.uid())
      and (p_crew_id is null or cm.crew_id = p_crew_id)
      and cm.role = 'owner'
      and cm.status = 'active'
      and c.status = 'active'
  );
$$;

comment on function private.owns_active_crew(uuid) is
  'I-086(21일차) — "auth.uid()가 활성 오너인 활성 크루가 있는가" 단일 판정. p_crew_id 생략(NULL)이면 전체 크루 스코프(profile:withdraw, FR-005 AC1), 지정하면 그 크루 하나(crew:leave, FR-026 E1). permission.ts hasOwnerSuccessorOrDisband(각주②)의 DB측 대응.';

revoke all on function private.owns_active_crew(uuid) from public, anon, authenticated;
grant execute on function private.owns_active_crew(uuid) to authenticated;

-- 1) crew_memberships_guard_self_transition — self-service active->left 전이에 오너 가드 추가.
create or replace function public.crew_memberships_guard_self_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_role text;
begin
  if pg_trigger_depth() > 1 then
    -- 신뢰된 중첩 호출(초대·가입승인·오너이양 부수효과 트리거) — 029A §3, 변경 없음.
    return new;
  end if;

  if old.profile_id = (select auth.uid()) then
    -- 본인 self-service 전이.
    if new.role is distinct from old.role then
      raise exception 'members cannot change their own crew role';
    end if;
    if not (
      (old.status = 'invited' and new.status in ('active', 'declined'))
      or (old.status = 'active' and new.status = 'left')
      -- Task 032 추가: 가입 신청 자진 철회(FR-022 E4) — 대기 중 신청을 반려와 같은 종착
      -- 상태(rejected)로 옮긴다(I-039 근사).
      or (old.status = 'requested' and new.status = 'rejected')
      -- Task 032 추가, 교차검증 MAJOR #6로 수정: 반려/철회/탈퇴 이후 자진 재신청(FR-022)만
      -- self-service로 허용한다. 강퇴(removed)는 FR-022 E3/FR-027 AC2가 "재신청 차단, 오너만
      -- 해제 가능"을 명시하므로 여기 포함하지 않는다 — 강퇴 해제는 아래 "남의 행" 분기의
      -- FR-027 E3(오너 전용, removed->active)로만 가능하다.
      or (old.status in ('declined', 'rejected', 'left') and new.status = 'requested')
    ) then
      raise exception 'unsupported self-service membership transition: % -> %', old.status, new.status;
    end if;
    -- I-086(21일차) — FR-026 E1/FR-005 AC1(hasOwnerSuccessorOrDisband, 각주②): 활성 오너는
    -- 이 크루의 이양·해산 없이는 active->left로 자가 전이할 수 없다. 오너 이양이 실제로
    -- 일어나면 trg_crews_sync_membership_on_owner_transfer가 구오너의 role을 이미 'staff'로
    -- 강등시키므로(029A) 그 시점 이후에는 private.owns_active_crew(old.crew_id)가 false가
    -- 되어 "이양 후 탈퇴" 정상 흐름은 이 가드에 걸리지 않는다.
    if old.status = 'active' and new.status = 'left'
       and private.owns_active_crew(old.crew_id) then
      raise exception 'crew owner must transfer ownership or disband before leaving (FR-026 E1, FR-005 AC1)';
    end if;
    return new;
  end if;

  -- 여기부터는 "남의 행"이다. RLS는 staff/owner만 이 행에 닿게 하지만(위 정책), 정확한
  -- 업무 규칙(누가 무엇을 어떻게 바꿀 수 있는지)은 RLS가 표현할 수 없어 트리거가 맡는다.
  if old.role = 'owner' then
    raise exception 'crew owner membership row cannot be changed via member management (use FR-025 ownership transfer)';
  end if;

  v_actor_role := private.my_crew_role(old.crew_id);

  if v_actor_role is distinct from 'owner' and v_actor_role is distinct from 'staff' then
    raise exception 'only crew officers may change another member''s role or status';
  end if;

  if new.role is distinct from old.role then
    -- FR-024 임원 임명·해임: 오너 전용, 대상은 active 멤버, role은 staff/member만.
    if v_actor_role is distinct from 'owner' then
      raise exception 'only the crew owner may appoint or dismiss staff (FR-024 AC2)';
    end if;
    if old.status <> 'active' then
      raise exception 'target must be an active member to change role (FR-024 사전조건)';
    end if;
    if new.role not in ('staff', 'member') then
      raise exception 'invalid target role for appointment (owner transfer uses FR-025)';
    end if;
    if new.status is distinct from old.status then
      raise exception 'role change and status change must be separate operations';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'removed' then
      -- FR-027 강퇴: 오너는 임원·오너 제외 누구나, 임원은 일반 크루원(role='member')만.
      if old.status <> 'active' then
        raise exception 'only active members can be removed';
      end if;
      if v_actor_role = 'staff' and old.role <> 'member' then
        raise exception 'staff may only remove general members, not other staff (FR-027 E1)';
      end if;
    elsif old.status = 'removed' and new.status = 'active' then
      -- FR-027 E3 강퇴 해제: 오너만. (교차검증 MAJOR #6 이후에도 변경 없음 — "오너가 해제
      -- 가능"은 이 경로가 계속 담당한다.)
      if v_actor_role is distinct from 'owner' then
        raise exception 'only the crew owner may reinstate a removed member (FR-027 E3)';
      end if;
    else
      raise exception 'unsupported officer-managed status transition: % -> %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.crew_memberships_guard_self_transition() is
  'I-086(21일차) 확장 — self-service active->left 전이에 오너 가드(private.owns_active_crew) 추가. 그 외 로직(role 변경 차단, 상태 전이 허용 목록, 임원 관리 규칙)은 무변경.';

-- 2) request_account_deactivation — 인라인 exists() 쿼리를 같은 private.owns_active_crew()로
--    교체한다(로직 동일, 이제 단일 소스). p_crew_id를 생략(NULL)해 "전체 크루 스코프"로 호출.
create or replace function public.request_account_deactivation()
returns table(ok boolean, changed boolean, reason text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_updated_rows integer;
begin
  if v_profile_id is null then
    return query select false, false, 'forbidden'::text;
    return;
  end if;

  -- FR-005 사전조건(AC1): 오너로 있는 활성 크루가 하나라도 있으면 차단한다.
  -- I-086(21일차)부터 private.owns_active_crew()(단일 소스, crew:leave 경로와 공유)를 쓴다 —
  -- 이전에는 이 exists() 쿼리를 이 함수 안에만 인라인했다.
  if private.owns_active_crew() then
    return query select false, false, 'owns_active_crew'::text;
    return;
  end if;

  -- 조건부 UPDATE — status='active'인 행만 대상. 이미 deactivated/withdrawn/suspended면
  -- 0행이 되어 아래에서 'not_active'로 보고한다(중복 처리 방지).
  update public.profiles
  set status = 'deactivated', deactivated_at = now()
  where id = v_profile_id and status = 'active';
  get diagnostics v_updated_rows = row_count;

  if v_updated_rows = 0 then
    return query select false, false, 'not_active'::text;
    return;
  end if;

  return query select true, true, null::text;
end;
$$;

comment on function public.request_account_deactivation() is
  'FR-005 정상 흐름 ④ — 본인 계정을 active->deactivated로 전이(30일 유예 시작). AC1: private.owns_active_crew()로 차단(I-086부터 crew:leave 경로와 공유하는 단일 판정). 비밀번호 재확인(정상 흐름 ③)은 호출 전 애플리케이션이 signInWithPassword로 먼저 재검증한다(이 함수는 그 결과를 신뢰).';
