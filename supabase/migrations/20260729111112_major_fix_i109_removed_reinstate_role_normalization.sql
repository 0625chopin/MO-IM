-- I-109 (MAJOR): FR-027 E3(강퇴 해제, removed->active)가 role을 정규화하지 않아
-- I-106·I-107이 막 닫은 것과 같은 모양의 잔여 패턴으로 남아 있었다 — "평범해 보이는
-- 단일 액션(강퇴 해제)이 과거에 부여됐던 staff/owner role을 오너의 FR-024 재임명 없이
-- 조용히 복원한다."
--
-- 팀장이 원문을 직접 대조해 판정했다: (1) FR-027 E3 원문("강퇴 해제 → 오너만 가능")은
-- role 복원을 요구하지 않는다 — 부수효과일 뿐 요구사항이 아니다. (2) D-002는 role이
-- 크루 개설·FR-024 임명·FR-025 이양 셋으로만 부여된다고 못박는다 — 강퇴 해제는 이
-- 셋 중 어디에도 속하지 않는다. (3) FR-024 자체가 "대상은 active 멤버"를 사전조건으로
-- 걸므로, 오너가 강퇴자를 다시 임원으로 만들려면 원래 ①member로 복귀 ②FR-024로 임명
-- 두 단계여야 하는데 지금 구조는 그 둘을 강퇴 해제 클릭 한 번으로 뭉친다. (4) 이 전이를
-- 호출하는 Server Action·UI가 저장소 전체에 0건이라("removed"/"reinstate" 검색) "오너가
-- 명시적으로 지목하는 행위이므로 안전하다"는 방어 논리가 성립할 화면 자체가 없다.
--
-- 수정: I-106·I-107·D-067·D-068과 대칭으로, removed->active(FR-027 E3, "남의 행" 분기·
-- 오너 전용) 전이도 role을 무조건 'member'로 정규화한다. staff 복원이 필요하면 오너가
-- FR-024를 별도로(대상이 다시 active가 된 뒤) 눌러야 한다 — 이제 크루 전체에서 role이
-- "정당하게 부여"되는 지점은 정확히 셋(개설 부트스트랩·FR-024 임명·FR-025 이양)뿐이고,
-- 그 외의 모든 상태 전이는 role=member로 수렴한다.
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

comment on function public.crew_memberships_guard_self_transition() is
  'Task 029A/029B/032/086 누적 + I-107(role 정규화, self-service invited->active·{declined,rejected,left}->requested) + I-109(23일차, role 정규화, removed->active FR-027 E3): 크루 개설 부트스트랩·FR-024 임명·FR-025 이양 셋을 제외한 모든 crew_memberships 상태 전이는 role=member로 수렴한다(D-002).';
