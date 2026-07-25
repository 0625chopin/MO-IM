-- Task 039: FR-005 회원 탈퇴(사전조건: 오너 크루 없음) + AC3 30일 이내 복구.
-- 참조: D-010, NFR-031, docs/decisions/account-lifecycle-039.md
--
-- respond_meetup_attendance(Task 032, D-019)와 동일한 관례를 따른다: security invoker
-- 단일 public.* 함수(호출자 자신의 데이터만 건드리므로 private.* SECURITY DEFINER 우회가
-- 필요 없다 — 029B의 2단 구조는 "타인 데이터를 인가 재구현하며 열람"할 때만 쓴다),
-- returns table(ok, changed, reason)로 도메인 오류를 예외가 아니라 값으로 표현,
-- 조건부 UPDATE로 원자성 확보, set search_path=''.

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
  -- lib/rules/permission.ts의 profile:withdraw 조건부 판정(hasOwnerSuccessorOrDisband)과
  -- 같은 규칙을 여기서도 재구현한다 — RLS를 우회하지 않는 security invoker라 호출자 본인의
  -- crew_memberships/crews 열람 권한(RLS)이 그대로 적용된다.
  if exists (
    select 1
    from public.crew_memberships cm
    join public.crews c on c.id = cm.crew_id
    where cm.profile_id = v_profile_id
      and cm.role = 'owner'
      and cm.status = 'active'
      and c.status = 'active'
  ) then
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
  'FR-005 정상 흐름 ④ — 본인 계정을 active->deactivated로 전이(30일 유예 시작). AC1: 오너인 활성 크루가 있으면 owns_active_crew로 차단. 비밀번호 재확인(정상 흐름 ③)은 호출 전 애플리케이션이 signInWithPassword로 먼저 재검증한다(이 함수는 그 결과를 신뢰).';

grant execute on function public.request_account_deactivation() to authenticated;
revoke execute on function public.request_account_deactivation() from public, anon;

create or replace function public.restore_deactivated_account()
returns table(ok boolean, changed boolean, reason text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_updated_rows integer;
  v_current_status text;
begin
  if v_profile_id is null then
    return query select false, false, 'forbidden'::text;
    return;
  end if;

  -- 조건부 UPDATE에 30일 유예 자체를 WHERE 절로 실어 원자적으로 판정한다(D-019와 같은
  -- 원칙 — 판정과 반영을 같은 문장에 묶어 TOCTOU를 없앤다).
  update public.profiles
  set status = 'active', deactivated_at = null
  where id = v_profile_id
    and status = 'deactivated'
    and deactivated_at is not null
    and now() - deactivated_at <= interval '30 days';
  get diagnostics v_updated_rows = row_count;

  if v_updated_rows = 1 then
    return query select true, true, null::text;
    return;
  end if;

  -- 실패 사유를 구분해 응답한다 — 이미 active(중복 요청)인지, 유예가 끝났는지(파기 진행/완료).
  select status into v_current_status from public.profiles where id = v_profile_id;
  if v_current_status <> 'deactivated' then
    return query select false, false, 'not_deactivated'::text;
  else
    return query select false, false, 'grace_expired'::text;
  end if;
end;
$$;

comment on function public.restore_deactivated_account() is
  'FR-005 AC3 — 탈퇴 후 30일 미경과 시 본인 계정을 deactivated->active로 복구. 유예 종료(grace_expired) 또는 이미 active(not_deactivated)면 changed=false로 보고한다.';

grant execute on function public.restore_deactivated_account() to authenticated;
revoke execute on function public.restore_deactivated_account() from public, anon;
