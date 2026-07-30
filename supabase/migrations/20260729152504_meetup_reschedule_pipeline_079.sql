-- I-079 (FR-065 AC2) — 기존 Meetup을 겨냥하는 "일정 변경 투표" 스키마 + finalize_closed_poll
-- 분기 + 참석 응답 무효화. docs/decisions/meetup-reschedule-079.md 참고.

-- ============================================================================
-- 1. posts: 새 타입 'meetup_reschedule_proposal' + target_meetup_id
-- ============================================================================

alter table public.posts
  drop constraint posts_type_check;

alter table public.posts
  add constraint posts_type_check
  check (type = any (array['general'::text, 'meetup_proposal'::text, 'meetup_reschedule_proposal'::text]));

alter table public.posts
  drop constraint posts_check;

-- 일정 변경 제안도 meetup_proposal과 같은 4필드(새로 제안하는 날짜·시각·장소·정원)를 쓴다 —
-- general 글에서만 전부 null을 강제한다.
alter table public.posts
  add constraint posts_check
  check (
    (type in ('meetup_proposal', 'meetup_reschedule_proposal'))
    or (meetup_date is null and start_time is null and place is null and capacity is null)
  );

alter table public.posts
  add column target_meetup_id uuid references public.meetups(id) on delete restrict;

-- type='meetup_reschedule_proposal' <=> target_meetup_id가 채워져 있다. 일반 FR-034 제안과
-- 이 컬럼 하나로 구분된다.
alter table public.posts
  add constraint posts_target_meetup_id_check
  check ((type = 'meetup_reschedule_proposal') = (target_meetup_id is not null));

create index posts_target_meetup_id_idx on public.posts (target_meetup_id) where target_meetup_id is not null;

comment on column public.posts.target_meetup_id is
  'I-079/FR-065 AC2. type=meetup_reschedule_proposal일 때만 non-null — 이 제안(투표)이 가결되면
   새 Meetup을 만드는 대신 이 meetup 행을 UPDATE한다(finalize_closed_poll). 일반 FR-034 제안
   (meetup_proposal)과 이 컬럼으로 구분된다 — polls.post_id/meetups.poll_id UNIQUE 제약을
   건드리지 않고 "기존 Meetup을 겨냥하는 새 투표"를 표현하는 자리다.';

-- ----------------------------------------------------------------------------
-- 1.1 크루·상태 스코프 가드 트리거 — CHECK은 다른 테이블을 못 보므로 트리거로 강제한다.
--     "target_meetup_id가 이 post와 같은 크루의 confirmed meetup을 가리키는가"를
--     insert 시점과, type/target_meetup_id/board_id가 사후에 바뀌는 모든 update 시점에 재검증한다
--     (author가 raw REST로 일반 글을 사후에 reschedule 타입으로 바꿔치기하는 경로까지 막는다).
-- ----------------------------------------------------------------------------

create or replace function public.posts_guard_reschedule_target_scope()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_crew_id uuid;
  v_target_crew_id uuid;
  v_target_status text;
begin
  if new.type <> 'meetup_reschedule_proposal' then
    return new;
  end if;

  select b.crew_id into v_crew_id
  from public.boards b
  where b.id = new.board_id;

  select m.crew_id, m.status into v_target_crew_id, v_target_status
  from public.meetups m
  where m.id = new.target_meetup_id;

  if v_target_crew_id is null or v_target_crew_id is distinct from v_crew_id then
    raise exception '일정 변경 제안은 같은 크루의 Meetup만 대상으로 할 수 있다(FR-065 AC2, target_meetup_id=%)', new.target_meetup_id;
  end if;

  if v_target_status is distinct from 'confirmed' then
    raise exception '취소된 Meetup은 일정 변경 대상이 될 수 없다(FR-065 AC3, target_meetup_id=%)', new.target_meetup_id;
  end if;

  return new;
end;
$function$;

revoke execute on function public.posts_guard_reschedule_target_scope() from public, anon, authenticated;

create trigger trg_posts_guard_reschedule_target_scope
before insert or update of type, target_meetup_id, board_id on public.posts
for each row execute function public.posts_guard_reschedule_target_scope();

-- ============================================================================
-- 2. polls_insert_proposal_author RLS — 일정 변경 제안글도 투표를 만들 수 있어야 한다
-- ============================================================================

drop policy polls_insert_proposal_author on public.polls;

create policy polls_insert_proposal_author
on public.polls
for insert
to authenticated
with check (
  post_id in (
    select p.id
    from public.posts p
    where p.author_id = (select auth.uid())
      and p.type in ('meetup_proposal', 'meetup_reschedule_proposal')
  )
);

-- ============================================================================
-- 3. meetup_schedule_changes — FR-065 AC2 "변경 이력" 테이블
-- ============================================================================

create table public.meetup_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups(id) on delete restrict,
  poll_id uuid not null references public.polls(id) on delete restrict,
  previous_date date not null,
  previous_start_time text,
  previous_place text,
  previous_capacity integer,
  new_date date not null,
  new_start_time text,
  new_place text,
  new_capacity integer,
  changed_at timestamptz not null default now(),
  constraint meetup_schedule_changes_poll_id_key unique (poll_id)
);

comment on table public.meetup_schedule_changes is
  'I-079/FR-065 AC2. 일정 변경 투표 가결로 finalize_closed_poll이 기존 meetups 행을 UPDATE할 때
   남기는 변경 전/후 스냅샷. poll_id UNIQUE — 같은 투표가 재시도로 두 번 반영되지 않는다(멱등,
   run_poll_auto_close_job의 재시도 스윕과 같은 원칙). SECURITY DEFINER 함수(finalize_closed_poll)만
   쓴다 — 클라이언트 쓰기 경로 없음.';

create index meetup_schedule_changes_meetup_id_idx on public.meetup_schedule_changes (meetup_id, changed_at desc);

alter table public.meetup_schedule_changes enable row level security;

create policy meetup_schedule_changes_select_members
on public.meetup_schedule_changes
for select
to authenticated
using (
  meetup_id in (
    select m.id
    from public.meetups m
    join public.crew_memberships cm on cm.crew_id = m.crew_id
    where cm.profile_id = (select auth.uid()) and cm.status = 'active'
  )
);

revoke insert, update, delete, truncate on public.meetup_schedule_changes from anon, authenticated;

-- ============================================================================
-- 4. meetup_attendances — 팀장 결정: 일정 변경 시 기존 응답 전부 무효화 + 재확인 요구
-- ============================================================================

alter table public.meetup_attendances
  add column invalidated_at timestamptz;

comment on column public.meetup_attendances.invalidated_at is
  'I-079/FR-065 AC2, 팀장 결정. 소속 meetup의 일정이 변경되면 finalize_closed_poll이 기존 응답
   전부에 이 값을 채운다(무효화) — "7/1에 간다"가 "7/8에 간다"를 의미하지 않으므로 정원(FR-066)
   계산 왜곡을 막기 위해 재확인을 요구한다. respond_meetup_attendance는 이 값이 채워진 행을
   "이전 응답 없음"과 동일하게 취급하고, 재확인 시 null로 되돌린다.';

-- respond_meetup_attendance(FR-066·067) — invalidated_at이 채워진 행은 상태값이 같아도
-- "무응답"으로 취급해 재확인을 강제한다. 재확인이 성공하면 invalidated_at을 null로 되돌린다.
create or replace function private.respond_meetup_attendance(p_meetup_id uuid, p_status text)
returns table(ok boolean, changed boolean, reason text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_profile_id uuid := auth.uid();
  v_crew_id uuid;
  v_existing_status text;
  v_existing_invalidated_at timestamptz;
  v_updated_rows integer;
begin
  if p_status not in ('attending', 'absent') then
    raise exception 'invalid attendance status: %', p_status;
  end if;

  if v_profile_id is null then
    return query select false, false, 'forbidden'::text;
    return;
  end if;

  v_crew_id := private.get_meetup_crew_id(p_meetup_id);
  if v_crew_id is null then
    return query select false, false, 'not_found'::text;
    return;
  end if;

  if not private.is_active_crew_member(v_crew_id) then
    return query select false, false, 'forbidden'::text;
    return;
  end if;

  select status, invalidated_at into v_existing_status, v_existing_invalidated_at
  from public.meetup_attendances
  where meetup_id = p_meetup_id and profile_id = v_profile_id;

  -- I-079 — 무효화된 응답은 값이 같아도 "이전 응답 없음"과 동일하게 취급한다(재확인 강제).
  if v_existing_status = p_status and v_existing_invalidated_at is null then
    return query select true, false, null::text;
    return;
  end if;

  if p_status = 'attending'
     and (coalesce(v_existing_status, 'absent') <> 'attending' or v_existing_invalidated_at is not null) then
    update public.meetups
    set attending_count = attending_count + 1
    where id = p_meetup_id
      and (capacity is null or attending_count < capacity);
    get diagnostics v_updated_rows = row_count;
    if v_updated_rows = 0 then
      return query select false, false, 'full'::text;
      return;
    end if;
  elsif p_status = 'absent'
        and v_existing_status = 'attending'
        and v_existing_invalidated_at is null then
    update public.meetups
    set attending_count = greatest(0, attending_count - 1)
    where id = p_meetup_id;
    get diagnostics v_updated_rows = row_count;
    if v_updated_rows = 0 then
      return query select false, false, 'forbidden'::text;
      return;
    end if;
  end if;

  insert into public.meetup_attendances (meetup_id, profile_id, status, responded_at, invalidated_at)
  values (p_meetup_id, v_profile_id, p_status, now(), null)
  on conflict (meetup_id, profile_id)
  do update set status = excluded.status, responded_at = excluded.responded_at, invalidated_at = null;

  return query select true, true, null::text;
end;
$function$;

-- ============================================================================
-- 5. finalize_closed_poll — 일정 변경 투표 가결 분기 (새 Meetup INSERT 대신 기존 UPDATE)
-- ============================================================================

create or replace function public.finalize_closed_poll(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_result text;
  v_post_id uuid;
  v_crew_id uuid;
  v_post_type text;
  v_target_meetup_id uuid;
  v_post_title text;
  v_post_body text;
  v_meetup_date date;
  v_start_time text;
  v_place text;
  v_capacity integer;
  v_prev_date date;
  v_prev_start_time text;
  v_prev_place text;
  v_prev_capacity integer;
  v_updated_rows integer;
begin
  select po.status, po.result, po.post_id, b.crew_id,
         p.type, p.target_meetup_id,
         p.title, p.body, p.meetup_date, p.start_time, p.place, p.capacity
    into v_status, v_result, v_post_id, v_crew_id,
         v_post_type, v_target_meetup_id,
         v_post_title, v_post_body, v_meetup_date, v_start_time, v_place, v_capacity
  from public.polls po
  join public.posts p on p.id = po.post_id
  join public.boards b on b.id = p.board_id
  where po.id = p_poll_id;

  if v_status is null or v_status not in ('closed_passed', 'closed_rejected', 'closed_invalid') then
    -- poll이 없거나 아직 종료되지 않았다 — 이 함수는 트리거·재시도 스윕에서만 호출되므로
    -- 정상 흐름에서는 도달하지 않지만, 방어적으로 조용히 반환한다(예외로 호출부를 막지 않음).
    return;
  end if;

  if v_result = 'passed' then
    if v_post_type = 'meetup_reschedule_proposal' then
      -- I-079/FR-065 AC2 — 새 Meetup INSERT 대신 기존 행 UPDATE + 이력 기록 + 참석 응답
      -- 무효화(팀장 결정). meetup_schedule_changes.poll_id UNIQUE + 사전 존재 확인으로
      -- 재시도 스윕(run_poll_auto_close_job)의 중복 호출을 멱등하게 흡수한다 — 재적용하면
      -- 이미 재확인된 참석 응답을 또 무효화하고 이력이 중복 기록되므로 반드시 막아야 한다.
      if not exists (select 1 from public.meetup_schedule_changes where poll_id = p_poll_id) then
        begin
          select date, start_time, place, capacity
            into v_prev_date, v_prev_start_time, v_prev_place, v_prev_capacity
          from public.meetups
          where id = v_target_meetup_id;

          update public.meetups
          set date = v_meetup_date,
              start_time = v_start_time,
              place = v_place,
              capacity = v_capacity,
              attending_count = 0
          where id = v_target_meetup_id and status = 'confirmed';
          get diagnostics v_updated_rows = row_count;

          if v_updated_rows > 0 then
            insert into public.meetup_schedule_changes (
              meetup_id, poll_id, previous_date, previous_start_time, previous_place,
              previous_capacity, new_date, new_start_time, new_place, new_capacity
            ) values (
              v_target_meetup_id, p_poll_id, v_prev_date, v_prev_start_time, v_prev_place,
              v_prev_capacity, v_meetup_date, v_start_time, v_place, v_capacity
            );

            -- 팀장 결정 — 날짜 변경 시 기존 참석/불참 응답을 전부 무효화하고 재확인을
            -- 요구한다("7/1에 간다"가 "7/8에 간다"를 의미하지 않는다 — FR-066 정원 계산 왜곡 방지).
            update public.meetup_attendances
            set invalidated_at = now()
            where meetup_id = v_target_meetup_id and invalidated_at is null;
          end if;
          -- v_updated_rows = 0 (대상 meetup이 그 사이 취소됨 등) → 조용히 스킵. 재시도 스윕이
          -- meetup_schedule_changes에 행이 없는 한 계속 재시도한다 — 사람이 get_logs로 확인해야
          -- 하는 상황은 아니라고 판단해 raise warning은 남기지 않는다(이미 취소된 대상은 정상
          -- 종결 상태다).
        exception when others then
          raise warning 'poll % 일정 변경 반영 실패(FR-065 AC2): %', p_poll_id, sqlerrm;
        end;
      end if;
    else
      -- FR-060 AC1·AC2·AC3 — 일반 제안(meetup_proposal)만 새 Meetup을 만든다.
      -- meetups.poll_id UNIQUE + ON CONFLICT DO NOTHING으로 재실행에도 중복 생성되지 않는다
      -- (멱등). Meetup 생성 실패가 알림 적재를 막지 않도록 별도 블록으로 격리한다.
      begin
        insert into public.meetups (crew_id, poll_id, title, description, date, start_time, place, capacity)
        values (v_crew_id, p_poll_id, v_post_title, v_post_body, v_meetup_date, v_start_time, v_place, v_capacity)
        on conflict (poll_id) do nothing;
      exception when others then
        raise warning 'poll % Meetup 생성 실패(FR-060): %', p_poll_id, sqlerrm;
      end;
    end if;
  end if;

  -- FR-045 — 시도 횟수를 먼저 올린다. 성공했을 때만 올리면 계속 실패하는 행이 무한
  -- 재시도되어 NFR-029("실패 시 로그 + 재시도 3회")의 상한이 의미가 없어진다 — 아래
  -- run_poll_auto_close_job의 재시도 스윕이 notify_attempts < 3인 행만 다시 시도한다.
  update public.poll_eligible_voters
  set notify_attempts = notify_attempts + 1
  where poll_id = p_poll_id and notified_at is null;

  begin
    -- D-015 — 강퇴자(status='removed')는 제외한다. 자진 탈퇴자(left)는 그대로 포함된다
    -- (FR-045 AC1 "미투표자는 포함, 강퇴자는 제외").
    insert into public.notifications (recipient_id, type, channel, payload)
    select
      ev.profile_id,
      'poll_closed',
      'in_app',
      jsonb_build_object(
        'pollId', p_poll_id,
        'postId', v_post_id,
        'outcome', v_result,
        'crewId', v_crew_id
      )
    from public.poll_eligible_voters ev
    join public.crew_memberships cm
      on cm.crew_id = v_crew_id and cm.profile_id = ev.profile_id
    where ev.poll_id = p_poll_id
      and ev.notified_at is null
      and cm.status <> 'removed';

    -- 이 poll에 대해 아직 notified_at이 없던 행 전부를 여기서 확정한다 — 방금 알림을 받은
    -- 사람(위 INSERT 대상)과 D-015로 제외된 강퇴자(위 INSERT 대상이 아니었던 사람) 모두
    -- 포함한다. 강퇴자도 "다시 재시도할 대상이 아님"으로 확정해야 재시도 스윕이 그들을
    -- 계속 붙잡지 않는다.
    update public.poll_eligible_voters
    set notified_at = now()
    where poll_id = p_poll_id and notified_at is null;
  exception when others then
    raise warning 'poll % 알림 적재 실패(FR-045, 시도 횟수는 기록됨): %', p_poll_id, sqlerrm;
  end;
end;
$function$;

-- ============================================================================
-- 6. run_poll_auto_close_job — 재시도 스윕이 일정 변경 투표를 무한 재시도하지 않도록 가드
--    (meetup_schedule_changes에 이미 poll_id 행이 있으면 "완료"로 간주)
-- ============================================================================

create or replace function public.run_poll_auto_close_job(batch_size integer default 200, max_duration interval default '00:04:00'::interval)
returns bigint
language plpgsql
set search_path to ''
as $function$
declare
  started_at timestamptz := clock_timestamp();
  v_poll record;
  v_decision record;
  v_closed_count bigint := 0;
begin
  set local statement_timeout = '4min';

  for v_poll in
    select p.id, p.post_id, b.crew_id
    from public.polls p
    join public.posts po on po.id = p.post_id
    join public.boards b on b.id = po.board_id
    where p.status = 'open'
      and (
        p.closes_at <= now()
        or not exists (
          select 1
          from public.poll_eligible_voters ev
          join public.crew_memberships cm
            on cm.crew_id = b.crew_id and cm.profile_id = ev.profile_id
          where ev.poll_id = p.id
            and cm.status = 'active'
            and not exists (
              select 1 from public.poll_votes pv
              where pv.poll_id = ev.poll_id and pv.voter_id = ev.profile_id and not pv.invalidated
            )
        )
      )
    order by p.closes_at
    limit batch_size
  loop
    begin
      select * into v_decision from private.compute_poll_decision(v_poll.id);

      update public.polls
      set status = v_decision.computed_status, result = v_decision.computed_outcome,
          decided_at = now(), closed_by = null
      where id = v_poll.id and status = 'open';

      if found then
        v_closed_count := v_closed_count + 1;
      end if;
    exception when others then
      raise warning 'poll % 자동 종료 실패(트리거①/③): %', v_poll.id, sqlerrm;
    end;

    exit when clock_timestamp() - started_at > max_duration;
  end loop;

  for v_poll in
    select p.id
    from public.polls p
    where p.status in ('closed_passed', 'closed_rejected', 'closed_invalid')
      and (
        exists (
          select 1 from public.poll_eligible_voters ev
          where ev.poll_id = p.id and ev.notified_at is null and ev.notify_attempts < 3
        )
        or (
          p.result = 'passed'
          and not exists (select 1 from public.meetups m where m.poll_id = p.id)
          -- I-079 — 일정 변경 투표는 새 meetups 행을 만들지 않으므로(기존 행 UPDATE) 위 조건이
          -- 항상 참이 되어 영원히 재시도된다. meetup_schedule_changes에 이미 이 poll_id로
          -- 반영된 기록이 있으면 "완료"로 보고 재시도 대상에서 뺀다.
          and not exists (select 1 from public.meetup_schedule_changes msc where msc.poll_id = p.id)
        )
      )
    limit batch_size
  loop
    begin
      perform public.finalize_closed_poll(v_poll.id);
    exception when others then
      raise warning 'poll % 종료 후속 재시도 실패: %', v_poll.id, sqlerrm;
    end;

    exit when clock_timestamp() - started_at > max_duration;
  end loop;

  perform 1
  from public.poll_eligible_voters ev
  where ev.notified_at is null and ev.notify_attempts >= 3
  limit 1;
  if found then
    raise warning 'poll_eligible_voters에 알림 3회 재시도 후에도 실패한 행이 남아 있다 — get_logs·poll_eligible_voters.notify_attempts를 확인할 것';
  end if;

  return v_closed_count;
end;
$function$;
