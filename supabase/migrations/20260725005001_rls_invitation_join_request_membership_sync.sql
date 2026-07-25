-- Task 029A: invitations/join_requests → crew_memberships 동기화 트리거
--
-- crew_memberships가 자기 행만 쓸 수 있게 좁아졌으므로(재귀 회피, 이전 마이그레이션),
-- 임원 이상이 "다른 사람의" 멤버십에 개입하는 FR-020(초대)·FR-023(가입 승인/반려)은
-- crew_memberships 자체의 정책이 아니라 invitations/join_requests 정책(둘 다
-- crew_memberships를 안전하게 한 방향으로만 참조하므로 재귀가 없다)으로 인가하고,
-- 그 인가된 이벤트의 부수효과로 postgres 소유 트리거가 crew_memberships를 대신 쓴다.
--
-- FR-021(초대 수락/거절)·FR-022(가입 신청)는 애초에 본인 행위라 crew_memberships의
-- self 정책만으로 이미 충분하다(초대 수락은 invitee가 invitations를 거치지 않고 자기
-- crew_memberships 행을 직접 invited->active로 옮겨도 되고, 이 트리거가 반대로
-- invitations.status를 갱신해도 된다 — 여기서는 invitations 쪽을 소스로 둔다).

-- 초대 생성(FR-020, invitations INSERT — invitations 정책이 이미 임원 이상만 허용) →
-- crew_memberships에 invited 행을 만든다(과거 이력이 있으면 invited로 되돌린다).
create function public.invitations_provision_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.crew_memberships (crew_id, profile_id, role, status)
  values (new.crew_id, new.invitee_id, 'member', 'invited')
  on conflict (crew_id, profile_id) do update
    set status = 'invited'
    where public.crew_memberships.status in ('declined', 'rejected', 'left', 'removed');

  return new;
end;
$$;

comment on function public.invitations_provision_membership() is
  'Task 029A — invitations INSERT(FR-020, 임원 이상)의 부수효과로 crew_memberships invited 행을 생성/갱신.';

create trigger trg_invitations_provision_membership
  after insert on public.invitations
  for each row
  execute function public.invitations_provision_membership();

-- 초대 응답(FR-021, invitations UPDATE — invitee 본인 또는 임원 이상) → 수락이면
-- crew_memberships를 active로, 거절이면 declined로 맞춘다. invitee가 crew_memberships를
-- 직접 고치는 경로(self 정책)와 둘 다 열려 있어도 최종 상태는 같다(멱등).
create function public.invitations_sync_membership_on_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status is distinct from new.status then
    update public.crew_memberships
      set status = 'active'
      where crew_id = new.crew_id and profile_id = new.invitee_id and status = 'invited';
  elsif new.status = 'declined' and old.status is distinct from new.status then
    update public.crew_memberships
      set status = 'declined'
      where crew_id = new.crew_id and profile_id = new.invitee_id and status = 'invited';
  end if;

  return new;
end;
$$;

comment on function public.invitations_sync_membership_on_response() is
  'Task 029A — invitations UPDATE(FR-021 수락/거절)의 부수효과로 crew_memberships 상태를 동기화.';

create trigger trg_invitations_sync_membership_on_response
  after update on public.invitations
  for each row
  execute function public.invitations_sync_membership_on_response();

-- 가입 신청 승인/반려(FR-023, join_requests UPDATE — 임원 이상만. join_requests 정책이
-- 이미 검증) → crew_memberships를 active/rejected로 맞춘다. 신청 시점에 requester 본인이
-- crew_memberships에 requested 행을 이미 직접 만들어 둔 상태(self 정책)라고 전제한다.
create function public.join_requests_sync_membership_on_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    update public.crew_memberships
      set status = 'active'
      where crew_id = new.crew_id and profile_id = new.requester_id and status = 'requested';
  elsif new.status = 'rejected' and old.status is distinct from new.status then
    update public.crew_memberships
      set status = 'rejected'
      where crew_id = new.crew_id and profile_id = new.requester_id and status = 'requested';
  end if;

  return new;
end;
$$;

comment on function public.join_requests_sync_membership_on_decision() is
  'Task 029A — join_requests UPDATE(FR-023 승인/반려, 임원 이상)의 부수효과로 crew_memberships 상태를 동기화.';

create trigger trg_join_requests_sync_membership_on_decision
  after update on public.join_requests
  for each row
  execute function public.join_requests_sync_membership_on_decision();
