-- Task 029A: RLS 정책 — Notification · NotificationPreference · Report · Block · AuditLog
-- 참조: FR-072·080·081·082, NFR-015, D-028

-- notifications ---------------------------------------------------------
-- 생성은 서버 로직 전용(테이블 코멘트) — client INSERT 정책을 두지 않는다. 이후 서버
-- 경로가 실제로 붙을 때 service_role 또는 SECURITY DEFINER 경로가 필요하다(auth_attempts와
-- 동일한 이유). 클라이언트는 본인 알림 열람·읽음 처리만 한다.

create policy "notifications_select_self"
  on public.notifications
  for select
  to authenticated
  using (recipient_id = (select auth.uid()));

create policy "notifications_update_self"
  on public.notifications
  for update
  to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- 자기 알림이라도 read_at 외 컬럼(type/channel/payload 등, 서버가 생성한 내용)은 고칠 수
-- 없다 — "읽음 처리"만 클라이언트 행위다.
create function public.notifications_guard_read_only_self_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'clients may only update notifications.read_at';
  end if;
  return new;
end;
$$;

create trigger trg_notifications_guard_read_only_self_update
  before update on public.notifications
  for each row
  execute function public.notifications_guard_read_only_self_update();

-- notification_preferences -------------------------------------------------
-- FR-072(v1.0 대상)이지만 RLS enable + policy 0건은 NFR-011 위반이므로 지금 채운다 —
-- 전부 본인 스코프.

create policy "notification_preferences_select_self"
  on public.notification_preferences
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "notification_preferences_insert_self"
  on public.notification_preferences
  for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

create policy "notification_preferences_update_self"
  on public.notification_preferences
  for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "notification_preferences_delete_self"
  on public.notification_preferences
  for delete
  to authenticated
  using (profile_id = (select auth.uid()));

-- reports -----------------------------------------------------------------
-- FR-080(신고) — 신고자 본인만 생성·열람. 처리(report:handle, FR-082)는 system_admin
-- 전용인데 이 스키마에는 admin을 판별할 컬럼/역할 테이블이 없다(D-008 — v0.1에서 관리자
-- 콘솔이 사실상 미사용). 상태 변경(UPDATE)은 이번 회차에 어떤 client 정책도 열지 않는다
-- — 관리자 기능이 생기면 profiles.is_system_admin류 컬럼 추가 + 정책 갱신이 선행돼야
-- 한다(문서 §029B 이후 항목).

create policy "reports_select_self"
  on public.reports
  for select
  to authenticated
  using (reporter_id = (select auth.uid()));

create policy "reports_insert_self"
  on public.reports
  for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));

-- blocks --------------------------------------------------------------------
-- FR-081(사용자 차단) — 차단자 본인 스코프. 차단된 사람에게는 노출하지 않는다.

create policy "blocks_select_self"
  on public.blocks
  for select
  to authenticated
  using (blocker_id = (select auth.uid()));

create policy "blocks_insert_self"
  on public.blocks
  for insert
  to authenticated
  with check (blocker_id = (select auth.uid()) and blocked_id <> (select auth.uid()));

create policy "blocks_delete_self"
  on public.blocks
  for delete
  to authenticated
  using (blocker_id = (select auth.uid()));

-- audit_logs ------------------------------------------------------------
-- NFR-015 대상 행위 기록. v0.1에 이 로그를 보여주는 화면이 없고(요구사항에 열람 FR 없음),
-- 쓰기도 서버 로직 전용(테이블 코멘트) — anon/authenticated 양쪽 모두 명시적으로 완전
-- 거부한다(auth_attempts와 동일 패턴, advisor INFO를 "의도된 거부"로 문서화).
create policy "audit_logs_no_client_access"
  on public.audit_logs
  for all
  to anon, authenticated
  using (false)
  with check (false);
