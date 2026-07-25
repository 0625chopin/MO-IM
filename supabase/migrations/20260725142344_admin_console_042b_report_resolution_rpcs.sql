-- Task 042B (FR-082) — 관리자 콘솔 신고 처리 RPC 2종. 029B 2단 구조(private SECURITY DEFINER
-- 실제 로직 + public SECURITY INVOKER 얇은 래퍼)를 따른다 — public.*가 SECURITY DEFINER인 채로
-- authenticated에 직접 노출되면 040 후속에서 겪은 authenticated_security_definer_function_
-- executable WARN이 재발한다(20260725093855 disband_crew 선례).
--
-- 인가는 두 함수 모두 내부에서 profiles.is_system_admin을 직접 확인한다 — RLS가 아니라
-- SECURITY DEFINER 안의 명시적 검사가 강제 경계다(042A의 private.is_blocked와 같은 원칙,
-- report-block-042a.md §6이 제안한 "service_role 경로"보다 이 편이 낫다고 판단한 이유는
-- docs/decisions/admin-console-042b.md 참고 — 클라이언트가 publishable key로 직접 호출해도
-- 안전하고, Next.js 서버 코드에 SUPABASE_SERVICE_ROLE_KEY를 추가로 배선할 필요가 없다).

-- 1) admin_list_reports — 신고 대기열 조회. 비관리자는 빈 결과(정보 노출 없음, R-012와 같은
--    원칙 — 존재를 드러내지 않는다).
create or replace function private.admin_list_reports(p_status text default 'pending')
returns table(
  report_id uuid,
  reporter_id uuid,
  reporter_handle text,
  reporter_display_name text,
  target_type text,
  target_id uuid,
  reason text,
  status text,
  created_at timestamptz,
  target_exists boolean,
  target_removed boolean,
  target_preview text,
  target_author_id uuid,
  target_author_handle text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.reporter_id,
    rp.handle,
    rp.display_name,
    r.target_type,
    r.target_id,
    r.reason,
    r.status,
    r.created_at,
    (case r.target_type
      when 'post' then po.id is not null
      when 'comment' then co.id is not null
      when 'chat_message' then cm.id is not null
      when 'profile' then tp.id is not null
      else false
    end) as target_exists,
    (case r.target_type
      when 'post' then po.deleted_at is not null
      when 'comment' then co.deleted_at is not null
      when 'chat_message' then cm.deleted_at is not null
      else false
    end) as target_removed,
    left(coalesce(po.title, co.body, cm.body, tp.handle), 200) as target_preview,
    coalesce(po.author_id, co.author_id, cm.sender_id, tp.id) as target_author_id,
    coalesce(apo.handle, aco.handle, acm.handle, tp.handle) as target_author_handle
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  left join public.posts po on po.id = r.target_id and r.target_type = 'post'
  left join public.comments co on co.id = r.target_id and r.target_type = 'comment'
  left join public.chat_messages cm on cm.id = r.target_id and r.target_type = 'chat_message'
  left join public.profiles tp on tp.id = r.target_id and r.target_type = 'profile'
  left join public.profiles apo on apo.id = po.author_id
  left join public.profiles aco on aco.id = co.author_id
  left join public.profiles acm on acm.id = cm.sender_id
  where exists (
      select 1 from public.profiles ap where ap.id = (select auth.uid()) and ap.is_system_admin
    )
    and (p_status is null or r.status = p_status)
  order by r.created_at asc;
$$;

comment on function private.admin_list_reports(text) is
  'FR-082 AC1 대기열 조회(관리자 콘솔). is_system_admin 확인은 WHERE EXISTS로 걸어 비관리자는 빈 결과를 받는다(예외 대신 — R-012식 존재 비노출).';

create or replace function public.admin_list_reports(p_status text default 'pending')
returns table(
  report_id uuid,
  reporter_id uuid,
  reporter_handle text,
  reporter_display_name text,
  target_type text,
  target_id uuid,
  reason text,
  status text,
  created_at timestamptz,
  target_exists boolean,
  target_removed boolean,
  target_preview text,
  target_author_id uuid,
  target_author_handle text
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.admin_list_reports(p_status)
$$;

comment on function public.admin_list_reports(text) is
  'Task 042B — 029B 2단 구조의 public INVOKER 얇은 래퍼. 실제 로직은 private.admin_list_reports.';

revoke all on function private.admin_list_reports(text) from public, anon, authenticated;
grant execute on function private.admin_list_reports(text) to authenticated;
revoke all on function public.admin_list_reports(text) from public;
grant execute on function public.admin_list_reports(text) to authenticated;
revoke execute on function public.admin_list_reports(text) from anon;

-- 2) admin_resolve_report — FR-082 AC1 "처리(삭제/기각/계정 제재)". 단일 RPC(I-054 회피,
--    reports.status 전이 + 콘텐츠 소프트삭제/계정 제재 + audit_logs 기록을 한 트랜잭션으로).
--    p_action: 'dismiss' | 'remove_content' | 'suspend_account' (report-block-042a.md §6 계약
--    그대로 소비 — pending -> resolved|dismissed).
create or replace function private.admin_resolve_report(
  p_report_id uuid,
  p_action text
)
returns table(ok boolean, reason_code text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_report public.reports%rowtype;
  v_author_id uuid;
  v_deleted_at timestamptz;
  v_found boolean;
begin
  if v_admin is null or not exists (
    select 1 from public.profiles where id = v_admin and is_system_admin
  ) then
    return query select false, 'forbidden'::text, null::text;
    return;
  end if;

  if p_action not in ('dismiss', 'remove_content', 'suspend_account') then
    return query select false, 'invalid_action'::text, null::text;
    return;
  end if;

  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    return query select false, 'not_found'::text, null::text;
    return;
  end if;
  if v_report.status <> 'pending' then
    return query select false, 'already_handled'::text, v_report.status;
    return;
  end if;

  if p_action = 'dismiss' then
    update public.reports set status = 'dismissed' where id = p_report_id;
    insert into public.audit_logs (actor_id, crew_id, action, target_id)
      values (v_admin, null, 'report.dismissed', p_report_id);
    return query select true, null::text, 'dismissed'::text;
    return;
  end if;

  if p_action = 'remove_content' then
    if v_report.target_type = 'profile' then
      return query select false, 'cannot_remove_profile_content'::text, null::text;
      return;
    elsif v_report.target_type = 'post' then
      select deleted_at into v_deleted_at from public.posts where id = v_report.target_id;
      v_found := found;
      if not v_found then
        return query select false, 'target_not_found'::text, null::text;
        return;
      end if;
      if v_deleted_at is not null then
        return query select false, 'target_already_removed'::text, null::text;
        return;
      end if;
      update public.posts set deleted_at = now() where id = v_report.target_id;
      update public.reports set status = 'resolved' where id = p_report_id;
      insert into public.audit_logs (actor_id, crew_id, action, target_id)
        values (v_admin, null, 'report.post_removed', v_report.target_id);
      return query select true, null::text, 'resolved'::text;
      return;
    elsif v_report.target_type = 'comment' then
      select deleted_at into v_deleted_at from public.comments where id = v_report.target_id;
      v_found := found;
      if not v_found then
        return query select false, 'target_not_found'::text, null::text;
        return;
      end if;
      if v_deleted_at is not null then
        return query select false, 'target_already_removed'::text, null::text;
        return;
      end if;
      update public.comments set deleted_at = now() where id = v_report.target_id;
      update public.reports set status = 'resolved' where id = p_report_id;
      insert into public.audit_logs (actor_id, crew_id, action, target_id)
        values (v_admin, null, 'report.comment_removed', v_report.target_id);
      return query select true, null::text, 'resolved'::text;
      return;
    elsif v_report.target_type = 'chat_message' then
      select deleted_at into v_deleted_at from public.chat_messages where id = v_report.target_id;
      v_found := found;
      if not v_found then
        return query select false, 'target_not_found'::text, null::text;
        return;
      end if;
      if v_deleted_at is not null then
        return query select false, 'target_already_removed'::text, null::text;
        return;
      end if;
      update public.chat_messages set deleted_at = now() where id = v_report.target_id;
      update public.reports set status = 'resolved' where id = p_report_id;
      insert into public.audit_logs (actor_id, crew_id, action, target_id)
        values (v_admin, null, 'report.chat_message_removed', v_report.target_id);
      return query select true, null::text, 'resolved'::text;
      return;
    end if;
  end if;

  if p_action = 'suspend_account' then
    if v_report.target_type = 'profile' then
      v_author_id := v_report.target_id;
    elsif v_report.target_type = 'post' then
      select author_id into v_author_id from public.posts where id = v_report.target_id;
    elsif v_report.target_type = 'comment' then
      select author_id into v_author_id from public.comments where id = v_report.target_id;
    elsif v_report.target_type = 'chat_message' then
      select sender_id into v_author_id from public.chat_messages where id = v_report.target_id;
    end if;

    if v_author_id is null then
      return query select false, 'target_not_found'::text, null::text;
      return;
    end if;

    update public.profiles set status = 'suspended'
      where id = v_author_id and public.profiles.status = 'active';
    if not found then
      return query select false, 'account_not_suspendable'::text, null::text;
      return;
    end if;

    update public.reports set status = 'resolved' where id = p_report_id;
    insert into public.audit_logs (actor_id, crew_id, action, target_id)
      values (v_admin, null, 'report.account_suspended', v_author_id);
    return query select true, null::text, 'resolved'::text;
    return;
  end if;

  -- 방어적 종착점 — 위 세 p_action 분기가 전부 return을 거치므로 정상 경로에서는 도달하지
  -- 않는다(042A의 unhandled_conditional_action과 같은 원칙).
  return query select false, 'unhandled_action'::text, null::text;
end;
$$;

comment on function private.admin_resolve_report(uuid, text) is
  'FR-082 AC1 실제 구현(029B 2단 구조). reports.status 전이(report-block-042a.md §6 계약) + 콘텐츠 소프트삭제/계정 제재 + audit_logs 기록을 한 트랜잭션으로 처리한다. 인가는 이 함수 안에서 profiles.is_system_admin을 직접 확인(SECURITY DEFINER가 RLS를 우회하므로).';

create or replace function public.admin_resolve_report(
  p_report_id uuid,
  p_action text
)
returns table(ok boolean, reason_code text, status text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.admin_resolve_report(p_report_id, p_action)
$$;

comment on function public.admin_resolve_report(uuid, text) is
  'Task 042B — 029B 2단 구조의 public INVOKER 얇은 래퍼. 실제 로직은 private.admin_resolve_report.';

revoke all on function private.admin_resolve_report(uuid, text) from public, anon, authenticated;
grant execute on function private.admin_resolve_report(uuid, text) to authenticated;
revoke all on function public.admin_resolve_report(uuid, text) from public;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated;
revoke execute on function public.admin_resolve_report(uuid, text) from anon;
