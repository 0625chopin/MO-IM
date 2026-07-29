-- I-107 (CRITICAL): I-106/D-067이 승인·수락의 "완결 지점"(join_requests_sync_membership_
-- on_decision·invitations_sync_membership_on_response)에 role='member' 정규화를 넣었지만,
-- crew_memberships_guard_self_transition이 허용하는 self-service 직접 전이 2종
-- (invited→active, {declined,rejected,left}→requested)은 그 완결 지점을 아예 거치지 않고도
-- 도달 가능하다 — 특히 **invited→active 자기 수락은 invitations 테이블을 전혀 거치지 않고
-- crew_memberships를 직접 PATCH해도 된다**(이 함수 자체의 기존 주석이 그렇게 설계했다고
-- 명시: "초대 수락은 invitee가 invitations를 거치지 않고 자기 crew_memberships 행을 직접
-- invited->active로 옮겨도 된다"). 그 결과 I-106 수정 이후에도 뚫리는 경로가 실측으로
-- 확인됐다.
--
-- 실측(23일차, 실 REST, 신규 테스트 크루로 재현): A가 B를 초대→수락(정상, role=member로
-- 정규화됨, I-106 수정 확인)→A가 B를 staff 임명→A가 B를 강퇴(removed)→A가 B를 재초대
-- (invitations_provision_membership의 ON CONFLICT DO UPDATE가 status만 invited로 바꾸고
-- role은 안 건드려 role=staff 그대로 보존, 기존에 이미 확인한 사실)→**B가 invitations
-- 테이블을 전혀 건드리지 않고 crew_memberships를 직접 PATCH(status=active)** →
-- **200, role=staff, status=active로 확정 — I-106 수정을 완전히 우회해 강퇴됐던 임원
-- 권한이 되살아났다.**
--
-- 근거: D-002(role은 크루 개설·FR-024 임원 임명·FR-025 오너 이양으로만 부여된다),
-- FR-021(초대 수락)·FR-022(재신청)는 이 셋 어디에도 속하지 않으므로 self-service로
-- 도달하는 active/requested 전이는 항상 role=member 결과여야 한다.
--
-- 수정: "완결 지점"(트리거)만으로는 불충분하다는 것이 실측으로 증명됐으므로, **진입점
-- 자체**(crew_memberships_guard_self_transition)에서 role을 강제한다 — self-service로
-- invited→active 또는 {declined,rejected,left}→requested로 전이할 때 new.role을
-- 무조건 'member'로 덮어쓴다. 이제 이 두 완결 지점(I-106)과 이 진입점(I-107)이 이중으로
-- 같은 불변식을 강제한다 — 어느 한쪽에 구멍이 생겨도 다른 쪽이 막는다(21일차 이후 이
-- 저장소가 반복적으로 검증한 "RLS는 어떤 행, 트리거는 어떤 전이" 원칙을 진입점·완결점
-- 이중 방어로 확장한 것).
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
    if (old.status = 'invited' and new.status = 'active')
       or (old.status in ('declined', 'rejected', 'left') and new.status = 'requested') then
      -- I-107 — 초대 수락(FR-021)·재신청(FR-022)은 과거 role을 보존하지 않고 항상
      -- role=member로 정규화한다(D-002). 강퇴·탈퇴 전 staff/owner였더라도 이 전이만으로
      -- 그 role을 되찾을 수 없다 — 복귀는 오너의 FR-024 임명(요건: active 멤버)으로만.
      new.role := 'member';
    elsif new.role is distinct from old.role then
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
  'Task 029A/029B/032/086 누적 + I-107(23일차): self-service invited->active(FR-021 수락)· {declined,rejected,left}->requested(FR-022 재신청) 전이는 role을 항상 member로 강제 정규화한다(D-002) — I-106의 승인/수락 완결 트리거만으로는 invited->active 직접 self-PATCH 우회를 막지 못함을 실측으로 확인해 진입점에도 같은 방어를 이중으로 건다.';
