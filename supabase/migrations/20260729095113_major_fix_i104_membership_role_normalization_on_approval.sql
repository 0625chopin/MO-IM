-- I-104 (MAJOR): join_requests_sync_membership_on_decision·invitations_sync_membership_
-- on_response는 crew_memberships.status만 'active'로 바꾸고 role은 전혀 건드리지
-- 않는다 — "이 행이 requested/invited로 들어올 때 role이 항상 member였다"는 전제를
-- 검증 없이 신뢰한다.
--
-- 실측(23일차, 실 REST, chopin0625@gmail.com=A(오너)·0625chopin@gmail.com=B, 신규
-- 테스트 크루로 재현): A가 B를 FR-024로 정식 staff 임명 → B가 FR-026 자진 탈퇴
-- (active→left, role='staff' 그대로 보존, 이 전이는 status만 바꾼다) → B가 FR-022
-- 자기 서비스 재신청(left→requested, self-service 전이 가드가 role 불변 조건이라
-- role='staff' 그대로 유지) → B가 새 join_requests 행 제출(완전히 평범해 보이는
-- 신규 가입 신청) → A(오너)가 **평범한 가입 신청으로 착각하고** 승인 →
-- **crew_memberships가 role=staff, status=active로 확정됨 — 오너가 FR-024 임원
-- 임명을 다시 하지 않았는데도 B가 staff 권한을 그대로 되찾았다.**
--
-- I-102가 막은 것은 "진입점(self-insert)에서 role을 조작하는 것"이었다 — 이건 그
-- 진입점을 건드리지 않고도, **정당하게 부여됐던 role이 상태 전이 과정에서 결코
-- reset되지 않아 재신청 승인 한 번으로 되살아나는** 별개의 경로다(팀장 지적).
--
-- 근거: D-002(role은 크루 개설·FR-024 임원 임명·FR-025 오너 이양으로만 부여된다) —
-- FR-021(초대 수락)·FR-023(가입 승인)은 이 셋 중 어디에도 속하지 않으므로, 이
-- 트리거들이 완결하는 "가입"은 항상 role=member 결과여야 한다.
--
-- 수정: 두 함수 모두 status='active'로 확정하는 UPDATE에 role='member'를 함께
-- 강제한다. "role을 함께 리셋"이 아니라 "가입 승인/수락은 항상 member"라는 FR-021·
-- FR-023의 정의 자체를 SQL로 고정하는 것이다.
create or replace function public.invitations_sync_membership_on_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status is distinct from new.status then
    update public.crew_memberships
      set status = 'active', role = 'member'
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
  'Task 029A — invitations UPDATE(FR-021 수락/거절)의 부수효과로 crew_memberships 상태를 동기화. I-104(23일차)로 role=member 정규화 추가 — 과거 staff/owner였던 행이 떠났다가 재초대·수락으로 role을 그대로 되찾는 것을 막는다(D-002).';

create or replace function public.join_requests_sync_membership_on_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    update public.crew_memberships
      set status = 'active', role = 'member'
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
  'Task 029A — join_requests UPDATE(FR-023 승인/반려)의 부수효과로 crew_memberships 상태를 동기화. I-104(23일차)로 role=member 정규화 추가 — 과거 staff였던 행이 탈퇴 후 자진 재신청·승인으로 role을 그대로 되찾는 것을 막는다(D-002).';
