-- Task 042A (FR-080·081) — 신고 접수 RPC, 차단 RPC, 차단이 초대를 막는 RLS 확장.
-- I-054 회피: 신고·차단 쓰기는 처음부터 단일 RPC(security invoker, 호출자 소유 행만 다룸 —
-- RLS를 우회할 필요가 없어 private 2단 구조가 필요 없다).

-- 1) 신고 중복 병합(FR-080 AC1) — 같은 사람이 같은 대상을 다시 신고하면 기존 pending 행에
--    사유만 갱신해 병합한다(부분 유니크 인덱스, status='pending'인 행에만 적용 — 이미
--    resolved/dismissed된 신고는 새 신고 주기를 다시 시작할 수 있어야 하므로 제외).
create unique index reports_unique_pending_report
  on public.reports (reporter_id, target_type, target_id)
  where status = 'pending';

-- 2) 자기 프로필 신고 금지 — 테이블 CHECK로 강제(모든 접근 경로에 적용, blocks_check와 같은 원칙).
alter table public.reports
  add constraint reports_no_self_profile_report
  check (not (target_type = 'profile' and target_id = reporter_id));

-- 3) 빈 사유 금지.
alter table public.reports
  add constraint reports_reason_not_blank
  check (length(trim(reason)) > 0);

-- 4) create_report RPC — security invoker(호출자 자신의 reports 행만 건드리므로 RLS 우회 불필요).
--    respond_meetup_attendance·crew_memberships_guard_self_transition와 같은 {ok, reason_code} 계약.
create or replace function public.create_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text
)
returns table(ok boolean, reason_code text, id uuid, merged boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := nullif(trim(p_reason), '');
  v_id uuid;
  v_merged boolean;
begin
  if v_actor is null then
    return query select false, 'not_authenticated'::text, null::uuid, false;
    return;
  end if;

  if v_reason is null then
    return query select false, 'reason_required'::text, null::uuid, false;
    return;
  end if;

  if p_target_type = 'profile' and p_target_id = v_actor then
    return query select false, 'cannot_report_self'::text, null::uuid, false;
    return;
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (v_actor, p_target_type, p_target_id, v_reason)
  on conflict (reporter_id, target_type, target_id) where status = 'pending'
  do update set reason = excluded.reason
  returning public.reports.id, (xmax <> 0) into v_id, v_merged;

  return query select true, null::text, v_id, v_merged;
exception
  when check_violation then
    -- reports_target_type_check 등 나머지 제약 위반을 방어적으로 흡수(클라이언트 입력 오류).
    return query select false, 'validation_failed'::text, null::uuid, false;
end;
$$;

revoke all on function public.create_report(text, uuid, text) from public;
grant execute on function public.create_report(text, uuid, text) to authenticated;

-- 5) create_block RPC — 자기 차단 금지는 이미 blocks_check(테이블 CHECK)가 강제하지만, RPC는
--    친절한 reason_code로 감싼다(RLS 위반 원시 예외를 클라이언트에 그대로 노출하지 않기 위해).
--    멱등 — 이미 차단한 사람을 다시 차단해도 성공하고 already_blocked=true만 알려준다.
create or replace function public.create_block(p_blocked_id uuid)
returns table(ok boolean, reason_code text, already_blocked boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_rows int;
begin
  if v_actor is null then
    return query select false, 'not_authenticated'::text, false;
    return;
  end if;

  if p_blocked_id = v_actor then
    return query select false, 'cannot_block_self'::text, false;
    return;
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_actor, p_blocked_id)
  on conflict (blocker_id, blocked_id) do nothing;
  get diagnostics v_rows = row_count;

  return query select true, null::text, (v_rows = 0);
end;
$$;

revoke all on function public.create_block(uuid) from public;
grant execute on function public.create_block(uuid) to authenticated;

-- 6) private.is_blocked — invitations RLS가 "초대 대상이 나를 차단했는가"를 판정하려면
--    blocker_id <> auth.uid()인 blocks 행을 봐야 하는데 blocks_select_self(본인 스코프)가
--    이를 막는다 — 029B와 같은 이유로 SECURITY DEFINER 헬퍼가 필요하다(재귀 아님 — 029B §2.1
--    논증과 동일: 함수 호출은 정책 재작성 순환 탐지 대상이 아니다).
create or replace function private.is_blocked(p_blocker uuid, p_blocked uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where blocker_id = p_blocker and blocked_id = p_blocked
  );
$$;

revoke all on function private.is_blocked(uuid, uuid) from public;
grant execute on function private.is_blocked(uuid, uuid) to authenticated;

-- 7) FR-081 AC2 — 초대 대상(invitee)이 초대자(inviter)를 차단했으면 초대 INSERT 자체를 막는다
--    (requirements.md FR-020 정상 흐름 E3 "대상자가 나를 차단 → 초대 불가, 사유는 노출하지
--    않음" — RLS 위반은 PostgREST에 일반 42501로만 나가 사유가 노출되지 않는다).
--    18일차 invitations_block_requested_target_at_rls와 같은 방식(drop+create, 기존 3개
--    조건 불변 + 조건 추가) — 정책 개수 증감 없음.
drop policy if exists invitations_insert_staff_or_owner on public.invitations;
create policy invitations_insert_staff_or_owner
on public.invitations for insert
to authenticated
with check (
  inviter_id = (select auth.uid())
  and private.is_crew_active(crew_id)
  and crew_id in (
    select cm.crew_id from public.crew_memberships cm
    where cm.profile_id = (select auth.uid())
      and cm.status = 'active'
      and cm.role = any (array['staff', 'owner'])
  )
  and not exists (
    select 1 from public.crew_memberships cm2
    where cm2.crew_id = invitations.crew_id
      and cm2.profile_id = invitations.invitee_id
      and cm2.status = 'requested'
  )
  and not private.is_blocked(invitations.invitee_id, invitations.inviter_id)
);
