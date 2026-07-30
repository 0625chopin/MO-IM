-- 27일차 후속 — 팀장이 I-075 교차검증 중 profiles_guard_self_status_transition의 예외
-- 메시지가 "D-048"을 인용하는 결함을 발견했다(실제로는 D-049 — system_admin 자가 승격
-- 차단 트리거 그 자체를 설명하는 결정. D-048은 Meetup 상세 비소속자 접근 관련 결정으로
-- 이 트리거와 무관하다). 팀장 배정으로 DB 전수 대조(pg_proc.prosrc·pg_description·정책
-- 코멘트)를 수행했고 두 번째 오참조를 추가로 발견했다 — 상세는
-- docs/ISSUES.draft.CORE.md와 docs/decisions/admin-grant-revoke-rpcs-075.md 부록(아래
-- 마이그레이션 하단 코멘트) 참고.
--
-- 이 마이그레이션은 **메시지 문자열/주석만** 고친다 — 트리거 로직·그랜티는 손대지 않는다.
-- 두 함수 모두 CREATE OR REPLACE로 본문을 재생성하되, 시그니처(이름+인자)가 그대로라
-- PostgreSQL이 기존 proacl(EXECUTE 권한)을 그대로 보존한다 — 이 마이그레이션 끝에 원시
-- 출력(재확인 쿼리 결과)을 주석으로 남긴다.

-- 1) profiles_guard_self_status_transition — 예외 메시지 D-048 -> D-049.
--    D-049(system_admin 식별 = is_system_admin 컬럼 + 자가 승격 차단 트리거)가 정확한 근거다.
--    comment on function은 이미 D-049로 정확했다 — 본문 내부 raise exception 문자열만 틀려
--    있었다(21일차 Task 042B 작성 당시 오타로 추정).
create or replace function public.profiles_guard_self_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() = old.id then
    if new.is_system_admin is distinct from old.is_system_admin then
      raise exception 'self profile updates may not change is_system_admin (FR-082, D-049)';
    end if;
    if new.status is distinct from old.status then
      if old.status = 'active' and new.status = 'deactivated' then
        return new;
      end if;
      if old.status = 'deactivated' and new.status = 'active'
         and old.deactivated_at is not null
         and now() - old.deactivated_at <= interval '30 days' then
        return new;
      end if;
      raise exception 'self profile updates may only transition active<->deactivated within the 30-day grace window (FR-005)';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.profiles_guard_self_status_transition() is
  'Task 042B 확장 — is_system_admin 자가 변경 차단(D-049) + 본인 상태 전이는 active<->deactivated(30일 유예)로 제한(Task 039). 관리자 제재(status->suspended)·관리자 승격은 auth.uid()<>old.id(서비스 경로) 조건 밖이라 이 트리거의 대상이 아니다.';

-- 2) polls_guard_decision_integrity — 본문 내부 주석의 "(해산 시 일괄 취소, D-015)" 오참조
--    제거. D-015는 "투표 종료 알림은 강퇴자에게 발송하지 않는다"이며 크루 해산 시 진행 중
--    투표 일괄 취소(FR-013 AC1)와는 무관하다. 이 취소 동작은 FR-013 AC1 원문 요구사항이지
--    별도로 확정된 결정(D-*)이 아니므로, 틀린 번호를 다른 번호로 바꾸지 않고 그냥 뗀다.
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

  -- FR-046 AC1(철회) · FR-013 AC1(해산 시 일괄 취소 — 원문 요구사항, 별도 결정번호 없음) —
  -- 둘 다 판정 재계산 대상이 아니다. 호출부(withdraw-poll.ts, disband_crew)가 이미
  -- "제안자/임원 이상" 또는 "오너" 인가를 RLS·앱 레이어에서 마친 뒤 status='cancelled'로
  -- UPDATE한다. 여기서는 `polls` 테이블 CHECK와 같은 불변식(result는 비어 있어야 한다)만
  -- 한 번 더 강제하고 decided_at은 "결정된 시각이 아니다"라는 의미를 지키기 위해 항상
  -- null로 고정한다.
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
