-- Task 032 교차검증(CORE, 18일차) MAJOR #6 수정: crew_memberships_extend_self_service_join_request_
-- transitions(20260725064550)가 self-service 허용 목록에 (declined|rejected|left|removed)->requested
-- 를 통째로 추가하면서, 강퇴(removed) 이력이 있는 사용자도 자기 행을 직접 PATCH해 'requested'로
-- 돌아갈 수 있게 됐다 — FR-022 E3/AC2·FR-027 AC2("강퇴 이력 → 재신청 차단, 오너만 해제 가능")를
-- DB 레벨에서 어긴다. evaluateJoinRequestEligibility(lib/rules)가 앱 레이어에서는 이를 막고 있었지만,
-- 사용자가 앱을 거치지 않고 자기 세션 키로 crew_memberships를 직접 PATCH하면 이 방어가 우회된다
-- (실측: begin/rollback으로 확인, docs/decisions/write-path-realdata-032.md 교차검증 보고 참고).
--
-- 수정: self-service 재신청 허용 목록에서 'removed'만 제외한다. declined/rejected/left ->
-- requested 자기 재신청은 그대로 둔다(FR-021 AC2 "거절이 영구 차단이 아니다", 세 상태 모두
-- 재신청을 막는 요구사항이 없다). 강퇴 해제(FR-027 E3, removed->active)는 이 트리거의 "남의 행"
-- 분기(오너 전용)에 이미 있고 이번 수정과 무관해 그대로 둔다. removed 크루원에게 오너/임원이
-- 다시 초대(removed->invited)를 보내는 경로는 trg_invitations_provision_membership의 ON CONFLICT
-- WHERE 목록에 이미 'removed'가 있고, 그 UPDATE는 pg_trigger_depth()>1(신뢰된 중첩 호출)로 이
-- 트리거를 아예 통과하지 않으므로 역시 이번 수정의 영향을 받지 않는다.
create or replace function public.crew_memberships_guard_self_transition()
returns trigger
language plpgsql
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
