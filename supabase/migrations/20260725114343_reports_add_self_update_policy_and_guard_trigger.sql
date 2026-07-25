-- Task 042A 후속(같은 회차) — create_report의 ON CONFLICT DO UPDATE(신고 병합, FR-080 AC1)가
-- reports에 UPDATE 정책이 전혀 없어(029A/B는 SELECT/INSERT self만 만들었다) RLS
-- "USING expression" 위반으로 막히는 것을 실측(begin…rollback)에서 발견해 바로 추가한다.
--
-- RLS UPDATE 정책은 "어떤 행"만 표현하고 "어떤 컬럼"은 표현 못 한다(029A §7.2와 같은 원칙) —
-- 그래서 트리거로 self-service가 reason 외 컬럼(특히 status)을 못 바꾸게 막는다. status 전이는
-- Task 042B(관리자 콘솔, 범위 밖)가 service_role 경로로 처리할 것을 전제로, auth.uid()가 없는
-- 컨텍스트(service_role)는 이 트리거가 건드리지 않는다.

create policy reports_update_self
on public.reports for update
to authenticated
using (reporter_id = (select auth.uid()))
with check (reporter_id = (select auth.uid()));

create or replace function public.reports_guard_self_update_reason_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    -- service_role/시스템 경로(향후 관리자 콘솔, Task 042B) — 이 트리거는 self-service만 제한한다.
    return new;
  end if;

  if new.status is distinct from old.status
     or new.reporter_id is distinct from old.reporter_id
     or new.target_type is distinct from old.target_type
     or new.target_id is distinct from old.target_id then
    raise exception 'self-service report update may only change reason (status changes require the admin console, Task 042B)';
  end if;
  return new;
end;
$$;

create trigger trg_reports_guard_self_update_reason_only
before update on public.reports
for each row execute function public.reports_guard_self_update_reason_only();
