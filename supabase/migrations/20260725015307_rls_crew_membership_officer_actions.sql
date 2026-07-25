-- 작성: CORE (Task 029B)
-- 029A §4·§10 인계: crew_memberships_select_self·crew_memberships_update_self가 자기 행
-- 전용 리프 노드라 (1) 동료 조회(FR-028) (2) 임원 임명·해임(FR-024) (3) 강퇴(FR-027)이
-- DB 레벨에서 막혀 있었다. private.* 헬퍼(이전 마이그레이션)로 재귀 없이 푼다.
--
-- 정책 개수 불변 원칙: 029A의 58건 기준선을 지키기 위해 새 정책을 추가하지 않고 기존
-- crew_memberships_select_self·crew_memberships_update_self 2건의 qual/with_check만
-- OR로 넓힌다(정책 1개당 역할·명령 1개 유지 — 029A의 multiple_permissive_policies 회피
-- 관례를 그대로 따른다). 정책 총수는 58건 그대로다.

drop policy if exists "crew_memberships_select_self" on public.crew_memberships;
create policy "crew_memberships_select_self_or_fellow_member"
on public.crew_memberships
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or private.is_active_crew_member(crew_id)
);

drop policy if exists "crew_memberships_update_self" on public.crew_memberships;
create policy "crew_memberships_update_self_or_officer"
on public.crew_memberships
for update
to authenticated
using (
  profile_id = (select auth.uid())
  or private.is_crew_staff_or_owner(crew_id)
)
with check (
  profile_id = (select auth.uid())
  or private.is_crew_staff_or_owner(crew_id)
);

-- 트리거 본문 교체: "자기 행" 분기(029A 원본, 무변경)와 "임원이 남의 행을 바꾸는" 새 분기를
-- old.profile_id = auth.uid() 여부로 나눈다. depth>1(신뢰된 부수효과, 029A §3)은 그대로 통과.
create or replace function public.crew_memberships_guard_self_transition()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_actor_role text;
begin
  if pg_trigger_depth() > 1 then
    -- 신뢰된 중첩 호출(초대·가입승인·오너이양 부수효과 트리거) — 029A §3, 변경 없음.
    return new;
  end if;

  if old.profile_id = (select auth.uid()) then
    -- 본인 self-service 전이 — 029A 원본 로직, 변경 없음.
    if new.role is distinct from old.role then
      raise exception 'members cannot change their own crew role';
    end if;
    if not (
      (old.status = 'invited' and new.status in ('active', 'declined'))
      or (old.status = 'active' and new.status = 'left')
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
      -- FR-027 E3 강퇴 해제: 오너만.
      if v_actor_role is distinct from 'owner' then
        raise exception 'only the crew owner may reinstate a removed member (FR-027 E3)';
      end if;
    else
      raise exception 'unsupported officer-managed status transition: % -> %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$function$;
