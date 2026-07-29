-- CREW의 Task 045 교차검증(22일차)이 발견: join_requests_stamp_decided_at 트리거가
-- `new.decided_at is null`일 때만 now()로 채워, 클라이언트가 이미 decided_at 값을 실어
-- 보내면(REST 직접 호출) 그 위조값이 그대로 저장됐다 — pending→approved/rejected 전이에서
-- decided_at을 임의 과거 시각으로 조작해 KPI-4(72시간 내 처리율) 집계를 왜곡할 수 있었다.
-- 실측(begin...rollback): self-service withdrawn 전이 + decided_at='2020-01-01' 동시 전송 →
-- 위조값 그대로 저장. staff의 정당한 approved 처리 + decided_at='2019-01-01' 동시 전송 →
-- 역시 위조값 그대로 저장.
--
-- D-054의 "거부가 아니라 덮어쓰기" 패턴을 재사용한다 — NULL 여부를 보지 않고 조건을 만족하는
-- 전이(pending→approved/rejected)에서는 클라이언트가 무엇을 보내든 항상 now()로 재계산해
-- 덮어쓴다. 이미 처리된 요청(전이 조건 미충족)의 decided_at은 old 값으로 고정해 재조작을
-- 막는다.

create or replace function public.join_requests_stamp_decided_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    -- 정당한 처리 전이 — 클라이언트가 보낸 값과 무관하게 항상 지금 시각으로 덮어쓴다.
    new.decided_at := now();
  else
    -- 그 외 모든 전이(withdrawn 자진 철회 포함)는 decided_at을 사람 세션이 손댈 수 없다 —
    -- old 값으로 고정한다(위조 방지).
    new.decided_at := old.decided_at;
  end if;
  return new;
end;
$$;
