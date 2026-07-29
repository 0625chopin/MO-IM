-- Task 044 (CORE) — FR-046(제안 철회·재투표) AC1·AC3.
--
-- ① `polls_guard_decision_integrity`(I-089 핫픽스, major_fix_i089_polls_decision_integrity)가
-- "open → cancelled" 전이를 다루지 않는다는 것을 실측(begin…rollback)으로 확인했다 — old.status
-- = 'open'이고 new.status가 closed_passed/closed_rejected/closed_invalid 중 하나가 아니면
-- new.status를 조용히 old.status로 되돌린다(회귀 방지 목적으로 작성됐지만 'cancelled'라는 합법적
-- 목표 상태를 고려하지 않았다). 그 결과 `update polls set status='cancelled' where status='open'`
-- 형태의 쓰기는 행을 "찾아서 반환"하지만 실제로는 상태가 바뀌지 않는다 — 이 트리거보다 먼저
-- 생겼던 `disband_crew`(FR-013 AC1 "진행 중 투표 2건 → cancelled")도 이 트리거 이후로는 같은
-- 이유로 조용히 무력화됐다(신규 이슈로 별도 등재, docs/ISSUES.md 참고). 이번 수정이 두 경로
-- (FR-046 철회, FR-013 해산) 모두를 함께 고친다.
--
-- ② 이 수정은 동시에 AC3("종료된 투표, 재개 시도 → 거부")를 DB 레벨에서도 강제한다 — 'cancelled'
-- 분기는 old.status = 'open'일 때만 도달하고, old.status가 이미 'open'이 아니면(cancelled 포함)
-- 위쪽 "closed poll result is immutable" 분기가 그대로 막는다(실측 확인: 아래 함수 그대로
-- begin…rollback으로 시나리오 A(open→cancelled 성공)·B(cancelled→open 시도 → 예외) 재현).
create or replace function public.polls_guard_decision_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision record;
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    return new;
  end if;

  if old.status <> 'open' then
    if new.status is distinct from old.status
       or new.result is distinct from old.result
       or new.decided_at is distinct from old.decided_at then
      raise exception 'closed poll result is immutable (FR-044, I-089)';
    end if;
    return new;
  end if;

  -- FR-046 AC1(철회) · FR-013 AC1(해산 시 일괄 취소, D-015) — 둘 다 판정 재계산 대상이 아니다.
  -- 호출부(withdraw-poll.ts, disband_crew)가 이미 "제안자/임원 이상" 또는 "오너" 인가를 RLS·
  -- 앱 레이어에서 마친 뒤 status='cancelled'로 UPDATE한다. 여기서는 `polls` 테이블 CHECK와
  -- 같은 불변식(result는 비어 있어야 한다)만 한 번 더 강제하고 decided_at은 "결정된 시각이
  -- 아니다"라는 의미를 지키기 위해 항상 null로 고정한다.
  if new.status = 'cancelled' then
    if new.result is not null then
      raise exception 'cancelled poll cannot carry a result (FR-046 AC1)';
    end if;
    new.decided_at := null;
    return new;
  end if;

  if new.status not in ('closed_passed', 'closed_rejected', 'closed_invalid') then
    -- I-092(CREW 실측 minor) — open을 유지하는(또는 무효한) 전이에서는 result/decided_at/
    -- closed_by를 건드릴 수 없다. 실제 종료 전이 없이 이 컬럼만 슬쩍 바꾸는 시도를 무해화한다.
    new.status := old.status;
    new.result := old.result;
    new.decided_at := old.decided_at;
    new.closed_by := old.closed_by;
    return new;
  end if;

  select * into v_decision from private.compute_poll_decision(old.id);
  new.status := v_decision.computed_status;
  new.result := v_decision.computed_outcome;
  new.decided_at := now();

  if new.closed_by is not null and new.closed_by is distinct from v_actor then
    new.closed_by := v_actor;
  end if;

  return new;
end;
$$;

comment on function public.polls_guard_decision_integrity() is
  'Task 028/029B 판정 무결성 가드 + Task 044(FR-046) open→cancelled 허용 분기. 종료된(closed_*·
   cancelled) 투표는 어떤 컬럼도 다시 바뀔 수 없다(FR-044 불변식, I-089). open→cancelled는
   result가 비어 있을 때만 허용하고 decided_at을 항상 null로 고정한다.';

-- ③ 알림 타입 폭 확장. `notifications.type`·`notification_preferences.type` CHECK를 함께
-- 넓힌다(schema-migration-028.md가 CHECK를 고른 이유 그대로 — 단일 마이그레이션으로 값 추가
-- 가능). 'poll_withdrawn'은 FR-046 AC1 "대상자에게 알림이 간다"의 신규 값이다.
-- 'ownership_transferred'·'crew_disbanded'는 TS `NotificationType`(Task 040)에는 있지만 이
-- CHECK에는 없던 기존 결함이다 — `insert into notifications (type='crew_disbanded', …)`가
-- 23514(check violation)로 실패함을 실측(begin…rollback)으로 확인했다. `disband-crew.ts`·
-- `transfer-crew-ownership.ts`가 이미 이 두 타입으로 `createNotification`을 호출하고 있어(둘 다
-- `.catch(console.error)`로 감싸 실패를 삼킨다) FR-013·FR-025의 "전 크루원/양측 알림" AC가
-- 이 CHECK 때문에 매번 조용히 실패해 왔다 — 신규 이슈로 등재하고 이 회차에 함께 고친다.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'poll_closed', 'join_request_received', 'join_request_approved', 'join_request_rejected',
    'invitation_received', 'staff_appointed', 'member_removed', 'meetup_created',
    'meetup_cancelled', 'post_commented', 'ownership_transferred', 'crew_disbanded',
    'poll_withdrawn'
  )
);

alter table public.notification_preferences drop constraint notification_preferences_type_check;
alter table public.notification_preferences add constraint notification_preferences_type_check check (
  type in (
    'poll_closed', 'join_request_received', 'join_request_approved', 'join_request_rejected',
    'invitation_received', 'staff_appointed', 'member_removed', 'meetup_created',
    'meetup_cancelled', 'post_commented', 'ownership_transferred', 'crew_disbanded',
    'poll_withdrawn'
  )
);
