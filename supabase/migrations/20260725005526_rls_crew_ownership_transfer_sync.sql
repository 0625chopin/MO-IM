-- Task 029A: 오너 이양(FR-025) 시 crew_memberships.role 동기화
--
-- crews.owner_id는 이미 오너가 바꿀 수 있다(crews_update_staff_or_owner 정책 +
-- crews_guard_owner_only_fields 트리거). 하지만 crew_memberships.role은 그 변경에
-- 맞춰 저절로 따라가지 않는다 — crews.owner_id != crew_memberships(role='owner')인
-- 상태가 남으면 이후의 모든 "오너인가" 판정(다른 테이블들의 owner_id 기반 정책)이
-- crews.owner_id 쪽만 신뢰하므로 조용히 어긋난다. crews AFTER INSERT 트리거와 같은
-- 이유(postgres 소유로 crew_memberships RLS를 우회 — 재귀 없음)로 AFTER UPDATE에도
-- 같은 패턴을 적용해 두 값을 항상 맞춘다.

create function public.crews_sync_membership_on_owner_transfer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    -- 기존 오너: staff로 강등(크루에서 나가는 것이 아니므로 active 유지).
    update public.crew_memberships
      set role = 'staff'
      where crew_id = new.id and profile_id = old.owner_id and role = 'owner';

    -- 신임 오너: 기존 행이 있으면 role만 owner로 올리고, 없으면(드문 경우) 새로 만든다.
    insert into public.crew_memberships (crew_id, profile_id, role, status)
    values (new.id, new.owner_id, 'owner', 'active')
    on conflict (crew_id, profile_id) do update
      set role = 'owner', status = 'active';
  end if;

  return new;
end;
$$;

comment on function public.crews_sync_membership_on_owner_transfer() is
  'Task 029A — 오너 이양(FR-025, crews.owner_id 변경)의 부수효과로 crew_memberships.role을 동기화. crew_memberships RLS를 우회(postgres 소유)하므로 재귀와 무관.';

create trigger trg_crews_sync_membership_on_owner_transfer
  after update on public.crews
  for each row
  execute function public.crews_sync_membership_on_owner_transfer();

revoke execute on function public.crews_sync_membership_on_owner_transfer() from public, anon, authenticated;
