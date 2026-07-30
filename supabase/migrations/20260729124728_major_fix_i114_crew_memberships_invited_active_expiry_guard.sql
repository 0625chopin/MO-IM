-- I-114 (CRITICAL) — I-030(초대 만료 시 짝 crew_memberships 상태 미정의) 조사 중 발견한
-- 별개의 보안 우회. FR-021 E1("만료된 초대 → 처리 불가")은 `invitations` UPDATE 경로에서만
-- 강제된다(I-091 트리거, old.expires_at <= now() 검사). 그런데 `crew_memberships_guard_
-- self_transition`의 self-service `invited->active` 분기는 invitations 테이블을 전혀 참조하지
-- 않는다 — invitee가 `invitations`를 거치지 않고 `crew_memberships` 행을 직접
-- `PATCH {status:"active"}`로 옮기면 만료 여부와 무관하게 통과한다. I-107이 막은 것과 정확히
-- 같은 모양의 "완결 지점만 막고 진입점 중 하나를 놓친" 잔여 경로다.
--
-- 실측(begin…rollback, 24일차): expires_at이 과거인 pending 초대를 만든 뒤 (a) invitations
-- UPDATE로 수락 시도 → I-091 가드가 예외로 정상 거부, (b) 같은 초대에 대응하는 crew_memberships
-- 행을 직접 self-PATCH(invited->active) → **성공**, 최종 상태 role=member/status=active로
-- 확정됨(invitations.status는 여전히 pending으로 남아 있는데도 멤버십은 활성화됨).
--
-- 수정: invitee 본인이 invited->active로 self-PATCH할 때, crew_id·profile_id로 아직
-- 유효한(status='pending' AND expires_at>now()) invitations 행이 존재하는지 SECURITY DEFINER
-- 헬퍼로 확인한다(I-092/D-055 원칙 — 호출자의 invitations SELECT 가시성에 우연히 기대지
-- 않는다. 참고로 invitee는 구조적으로 자기 invitations 행을 볼 권한이 있어 이 사례에서는
-- invoker 모드로도 결과가 같았겠지만, 이 프로젝트의 다른 신규 가드들과 형식을 통일한다).
create or replace function private.has_valid_pending_invitation(p_crew_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.invitations
    where crew_id = p_crew_id
      and invitee_id = p_profile_id
      and status = 'pending'
      and expires_at > now()
  )
$$;

revoke all on function private.has_valid_pending_invitation(uuid, uuid) from public, anon, authenticated;

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
      -- I-114 — invited->active는 지금 이 시점에 아직 유효한(만료되지 않은 pending) 초대가
      -- 실제로 존재할 때만 허용한다(FR-021 E1). invitations 테이블 UPDATE 경로를 우회해 이
      -- 트랜지션에 직접 도달해도 같은 규칙이 적용된다.
      if old.status = 'invited' and new.status = 'active'
         and not private.has_valid_pending_invitation(old.crew_id, old.profile_id) then
        raise exception 'crew_memberships: invited->active self-service transition requires a still-valid pending invitation (FR-021 E1)';
      end if;
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
      -- FR-027 E3 강퇴 해제: 오너만.
      if v_actor_role is distinct from 'owner' then
        raise exception 'only the crew owner may reinstate a removed member (FR-027 E3)';
      end if;
      -- I-109(23일차) — FR-027 E3 원문은 "오너만 해제 가능"만 요구하고 role 복원을
      -- 요구하지 않는다. D-002는 role이 크루 개설·FR-024 임명·FR-025 이양 셋으로만
      -- 부여된다고 못박으므로, 강퇴 해제도 I-106·I-107과 대칭으로 role='member'
      -- 정규화한다. staff 복원이 필요하면 오너가 이 전이 이후 FR-024를 별도로 누른다.
      new.role := 'member';
    else
      raise exception 'unsupported officer-managed status transition: % -> %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;
