-- Task 040 (CREW): FR-025 오너 이양 — 대상이 활성 크루원이어야 한다는 규칙을 SQL로 강제한다.
--
-- 029A의 crews_guard_owner_only_fields 트리거는 "누가 owner_id를 바꿀 수 있는가"(오너 본인)만
-- 검사했다 — "어떤 값으로 바꿀 수 있는가"는 검사하지 않는다. crews_sync_membership_on_owner_transfer
-- (029A)는 new.owner_id를 무조건 신뢰해 crew_memberships를 upsert(role='owner', status='active')
-- 한다 — 대상이 이 크루의 멤버가 전혀 아니거나 이미 탈퇴·강퇴된 사람이어도 그대로 오너가 된다.
--
-- 앱 레이어(Server Action)가 대상 멤버십을 미리 조회해 막더라도, publishable key로
-- `/rest/v1/crews?id=eq...`를 직접 PATCH하면 앱 레이어를 완전히 우회한다 — 오너는 owner_id를
-- 바꿀 RLS 권한이 이미 있으므로(crews_update_staff_or_owner), 이 우회 경로는 실재한다.
-- FR-025 예외 흐름 E1("대상이 비활성 → 불가")을 SQL이 강제 경계로 다시 확인해야 한다(운영 규칙 3).
create or replace function public.crews_guard_owner_only_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.visibility is distinct from old.visibility
      or new.status is distinct from old.status
      or new.owner_id is distinct from old.owner_id)
     and old.owner_id <> (select auth.uid()) then
    raise exception 'only the crew owner may change visibility, status, or owner_id (FR-012·FR-013·FR-025)';
  end if;

  if new.owner_id is distinct from old.owner_id then
    if not exists (
      select 1 from public.crew_memberships cm
      where cm.crew_id = new.id
        and cm.profile_id = new.owner_id
        and cm.status = 'active'
    ) then
      raise exception 'ownership can only transfer to an active crew member (FR-025 E1)';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.crews_guard_owner_only_fields() is
  'Task 029A(오너 전용 컬럼 가드) + Task 040(FR-025 대상은 active 멤버여야 함, E1 강제).';
