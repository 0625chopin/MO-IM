-- Task 042B 후속(같은 회차) — 실측 중 발견: private.admin_resolve_report의 반환 타입
-- `returns table(ok boolean, reason_code text, status text)`이 만드는 OUT 파라미터 `status`가
-- PL/pgSQL 함수 본문 안에서 암묵적 변수가 되어, `update public.profiles set status = 'suspended'
-- where id = v_author_id and status = 'active'`의 WHERE절 `status`와 충돌해 42702(컬럼 참조
-- 모호함)를 냈다. `public.profiles.status`로 명시 한정해 해소한다 — 그 외 로직은 무변경.
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

  return query select false, 'unhandled_action'::text, null::text;
end;
$$;
