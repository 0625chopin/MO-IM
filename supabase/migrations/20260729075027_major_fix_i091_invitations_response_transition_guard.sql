-- I-091 다음 회차 1순위 — invitations self-service UPDATE가 컬럼값을 전혀 제한하지 않던 결함
-- (BEFORE 트리거 없음, RLS WITH CHECK도 상태값 미검사) 수정. 실측(begin…rollback, 22일차)으로
-- 확인한 4가지 우회 경로를 전부 막는다:
--  1) 이미 accepted/declined한 초대를 다른 값으로 되돌리는 반복 전환 (invitations.status가
--     crew_memberships.status와 영구적으로 어긋나는 감사 기록 오염 — 실측 step 3/4/7)
--  2) declined -> accepted 재전환으로 초대자 의사 없이 새 응답을 위조 (실측은 crew_memberships
--     쪽 재입장까지는 이어지지 않았다 — sync_membership_on_response의 `where status='invited'`
--     가드가 우연히 막아 준다. 다만 invitations 테이블 자체의 상태 위조는 그대로 성공한다)
--  3) 이미 expires_at이 지난 pending 초대를 직접 REST accept — FR-021 E1("만료된 초대 →
--     처리 불가")이 앱 레이어(evaluateInvitationResponseEligibility)에만 있고 DB가 독립
--     강제하지 않아, 이 경로는 실제로 crew_memberships를 invited->active로 전이시킨다
--     (다운스트림 트리거 캐스케이드 있음 — I-091 심각도 기준 충족, 실측 step 8/9)
--  4) invitations_update_invitee_or_staff RLS가 "본인"과 "임원 이상"을 OR로 묶어 두어, staff/
--     owner가 타인의 pending 초대를 본인 동의 없이 accepted로 강제 전이시켜 크루에 강제 편입시킬
--     수 있었다(원 코멘트 "초대 수락·거절(FR-021, 본인) + 임원 이상의 취소/관리"의 "본인" 원칙
--     위반, 실측으로 확인) — FR-021 행위자는 "초대받은 회원"뿐이다.
--
-- 해법은 21일차에 이미 확립된 패턴(RLS는 "어떤 행"만 표현하고 "어떤 컬럼·전이"는 표현 못
-- 한다 — reports_guard_self_update_reason_only·crew_memberships_guard_self_transition과 동일
-- 구조)을 따른다. 새 메커니즘을 만들지 않는다: BEFORE UPDATE 트리거로 (a) status 외 컬럼은
-- 전혀 못 바꾸게 막고 (b) status 전이는 pending -> accepted|declined 단 한 번만 허용하고
-- (c) 그 전이의 행위자가 반드시 invitee 본인이어야 하며 (d) 그 시점에 만료되지 않았어야 한다.
-- pg_trigger_depth() > 1(향후 시스템 경로) 또는 auth.uid() is null(service_role) 컨텍스트는
-- self-service 제한 대상이 아니므로 통과시킨다(reports_guard_self_update_reason_only와 동일
-- 컨벤션).

create or replace function public.invitations_guard_response_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    -- 신뢰된 중첩 호출(향후 시스템 경로) 또는 service_role 컨텍스트 — self-service 제한
    -- 대상이 아니다(reports_guard_self_update_reason_only와 같은 컨벤션).
    return new;
  end if;

  if new.crew_id is distinct from old.crew_id
     or new.invitee_id is distinct from old.invitee_id
     or new.inviter_id is distinct from old.inviter_id
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at then
    raise exception 'invitations: this update may only change status (FR-021)';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'invitations: only a pending invitation may be responded to (FR-021)';
    end if;
    if new.status not in ('accepted', 'declined') then
      raise exception 'invitations: a pending invitation may only become accepted or declined (FR-021)';
    end if;
    if auth.uid() is distinct from old.invitee_id then
      raise exception 'invitations: only the invitee may respond to this invitation (FR-021, 행위자 = 초대받은 회원)';
    end if;
    if old.expires_at <= now() then
      raise exception 'invitations: this invitation has expired and can no longer be responded to (FR-021 E1)';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_invitations_guard_response_transition
before update on public.invitations
for each row execute function public.invitations_guard_response_transition();

-- 트리거 전용 함수의 client EXECUTE 회수 (I-054/029A §3와 같은 패턴 — 15일차·042A에서
-- 반복된 실수를 처음부터 피한다).
revoke all on function public.invitations_guard_response_transition() from public, anon, authenticated;
