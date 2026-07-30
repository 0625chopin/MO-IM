-- I-079 후속 수정 — meetups_guard_attendee_scope가 finalize_closed_poll의 일정 변경 UPDATE를
-- 막던 것을 실측(회귀 검증)으로 발견해 수정한다. 두 가지 원인:
--   1) trigger①(pg_cron → run_poll_auto_close_job → finalize_closed_poll)은 auth.uid()가 없다
--      (postgres 시스템 컨텍스트) — polls_guard_decision_integrity와 같은 "actor 없으면 통과"
--      원칙을 여기도 적용한다.
--   2) trigger②/③(사람이 직접 종료)에서도 이 가드는 new.poll_id(=meetup을 만든 "원래" 제안)의
--      작성자만 authorized로 인정한다. 일정 변경 제안(target_meetup_id=이 meetup)의 작성자는
--      전혀 다른 post의 작성자라 이 조건에 걸리지 않는다 — meetup:cancel_or_update 각주⁵
--      ("제안 작성자 본인")가 요구하는 대상에 reschedule 제안 작성자도 포함해야 한다.
create or replace function public.meetups_guard_attendee_scope()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  can_edit_full boolean;
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    return new;
  end if;

  can_edit_full := exists (
    select 1 from public.crew_memberships cm
    where cm.crew_id = new.crew_id
      and cm.profile_id = v_actor
      and cm.status = 'active'
      and cm.role in ('staff', 'owner')
  ) or exists (
    select 1 from public.polls po
    join public.posts p on p.id = po.post_id
    where po.id = new.poll_id and p.author_id = v_actor
  ) or exists (
    select 1 from public.posts p
    where p.target_meetup_id = new.id and p.author_id = v_actor
  );

  if not can_edit_full and (to_jsonb(new) - 'attending_count') is distinct from (to_jsonb(old) - 'attending_count') then
    raise exception 'only staff/owner/proposal author may edit meetup fields other than attending_count (D-019 conditional UPDATE excepted)';
  end if;

  return new;
end;
$function$;
