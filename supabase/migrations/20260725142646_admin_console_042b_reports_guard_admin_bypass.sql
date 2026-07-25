-- Task 042B 후속(같은 회차) — 실측 중 발견: report-block-042a.md §6이 "관리자 콘솔은
-- service_role 경로(auth.uid() 없음)로 status를 바꿀 것"이라고 전제했던 것과 달리, 042B는
-- private.admin_resolve_report를 인증된 관리자 세션(auth.uid() = 관리자 profileId, NOT NULL)
-- 에서 실행되는 SECURITY DEFINER RPC로 구현했다(docs/decisions/admin-console-042b.md — RLS/
-- SECURITY DEFINER로 강제하라는 지시에 따라 service_role 키를 앱 코드에 추가로 배선하지
-- 않는 편을 택했다). 그 결과 20260725114343의 reports_guard_self_update_reason_only 트리거
-- (auth.uid() is null일 때만 status 변경 허용)가 관리자 RPC의 UPDATE까지 막아버려 실측
-- 중 `P0001 self-service report update may only change reason`으로 즉시 드러났다.
--
-- 고침: is_system_admin 확인을 통과한 세션도 이 트리거를 통과하게 한다. private.admin_
-- resolve_report가 이미 UPDATE 전에 is_system_admin을 확인하므로 이는 새 구멍이 아니라
-- 트리거의 "self-service만 막는다"는 원래 의도를 정확히 반영하는 확장이다 — 042A 원 트리거
-- 주석이 예고한 "향후 관리자 콘솔(Task 042B)"이 바로 이 갈래다.

create or replace function public.reports_guard_self_update_reason_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    -- service_role/시스템 경로 — 이 트리거는 self-service만 제한한다.
    return new;
  end if;

  if exists (
    select 1 from public.profiles where id = auth.uid() and is_system_admin
  ) then
    -- Task 042B — admin_resolve_report(SECURITY DEFINER)는 인증된 관리자 세션에서 실행되므로
    -- auth.uid()가 NULL이 아니다. 그 RPC가 UPDATE 전에 이미 is_system_admin을 확인했으므로
    -- 여기서도 같은 조건을 통과한 세션은 status 등 전 컬럼 변경을 허용한다.
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

comment on function public.reports_guard_self_update_reason_only() is
  'Task 042A 원본 + Task 042B 확장(admin bypass) — self-service(auth.uid() not null, non-admin)는 reason만 변경 가능. service_role(auth.uid() null) 또는 is_system_admin 세션은 이 제한 밖.';
