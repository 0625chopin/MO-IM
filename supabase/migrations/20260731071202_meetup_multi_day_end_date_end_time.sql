-- 다일(멀티데이) 모임 지원 — 모임 일정이 하루로 끝나지 않을 수 있게 종료일·종료 시각을 더한다.
--
-- **기존 행의 의미는 바뀌지 않는다.** `end_date`는 `date`로 백필되고 `end_time`은 null로 남는다 —
-- "하루짜리 모임"은 이제 "시작일 = 종료일"인 기간 모임의 특수한 경우로 표현된다. 그래서
-- `end_date`를 nullable로 두지 않았다: null이 "하루짜리"를 뜻하게 하면 캘린더 겹침 조회가
-- 매번 `coalesce(end_date, date)`를 타야 하고, 그 coalesce를 한 군데라도 빠뜨리면 진행 중인
-- 기간 모임이 목록에서 조용히 사라진다(조회 조건이 `date`만 보게 되므로). NOT NULL이면
-- 그 실수가 구조적으로 불가능하다.
--
-- **시각은 nullable을 유지한다**(D-013 "시각은 선택 입력"). `end_time`만 있고 `start_time`이
-- 없는 조합은 CHECK로 막는다 — "언제 끝나는지는 아는데 언제 시작하는지는 모른다"는 표시할
-- 방법도 의미도 없다.
--
-- **기간 상한 30일**: 요구사항에 명시된 값이 아니라 오타 방어선이다(`2026-08-14` → `2036-08-14`
-- 같은 입력이 캘린더 전 구간을 채우는 것을 막는다). 앱 레이어의 같은 상한은
-- `src/lib/rules/meetup-proposal-schedule.ts`의 `MAX_MEETUP_DURATION_DAYS`에 있고, 두 값은
-- 함께 고쳐야 한다.

-- ============================================================================
-- 1. meetups — end_date(NOT NULL, 백필) + end_time
-- ============================================================================

alter table public.meetups add column end_date date;
update public.meetups set end_date = date where end_date is null;
alter table public.meetups alter column end_date set not null;

alter table public.meetups add column end_time text;

alter table public.meetups
  add constraint meetups_end_date_check check (end_date >= date),
  add constraint meetups_duration_days_check check (end_date - date <= 30),
  add constraint meetups_end_time_format_check
    check (end_time is null or end_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  add constraint meetups_end_time_requires_start_time_check
    check (end_time is null or start_time is not null),
  -- 같은 날 안에서 끝나는 모임만 시각 역전을 검사한다 — 하루를 넘기면 "22:00 시작 → 다음 날
  -- 02:00 종료"가 정상이라 end_time < start_time이 참이어도 역전이 아니다.
  add constraint meetups_same_day_time_order_check
    check (end_date > date or end_time is null or start_time is null or end_time > start_time);

comment on column public.meetups.end_date is
  '모임 종료일(NOT NULL). 하루짜리면 date와 같다 — null이 "하루"를 뜻하지 않는다. 캘린더 겹침
   조회(listMeetupsByCrews)가 date <= to and end_date >= from으로 진행 중인 기간 모임까지
   잡아내는 근거다.';
comment on column public.meetups.end_time is
  '모임 종료 시각(선택, D-013). start_time이 없으면 채울 수 없다(CHECK). 같은 날 종료면
   start_time보다 뒤여야 한다 — 날짜를 넘기면 그 제약을 적용하지 않는다.';

-- 캘린더 겹침 조회의 두 번째 경계(end_date >= from). 기존 idx_meetups_crew_date는 그대로 둔다.
create index idx_meetups_crew_end_date on public.meetups (crew_id, end_date);

-- ============================================================================
-- 2. posts — 모임 제안글의 종료일·종료 시각(둘 다 선택 입력)
-- ============================================================================

alter table public.posts add column meetup_end_date date;
alter table public.posts add column end_time text;

-- general 글에서 모임 필드가 전부 null이어야 한다는 기존 제약에 새 두 필드를 더한다.
alter table public.posts drop constraint posts_check;

alter table public.posts
  add constraint posts_check
  check (
    (type in ('meetup_proposal', 'meetup_reschedule_proposal'))
    or (
      meetup_date is null and start_time is null and place is null and capacity is null
      and meetup_end_date is null and end_time is null
    )
  );

alter table public.posts
  -- 제안글에서 종료일은 선택 입력이다(비우면 하루짜리) — 다만 채웠다면 시작일이 있어야 하고
  -- 시작일보다 앞설 수 없다.
  add constraint posts_meetup_end_date_check
    check (meetup_end_date is null or (meetup_date is not null and meetup_end_date >= meetup_date)),
  add constraint posts_meetup_duration_days_check
    check (meetup_end_date is null or meetup_end_date - meetup_date <= 30),
  add constraint posts_end_time_format_check
    check (end_time is null or end_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  add constraint posts_end_time_requires_start_time_check
    check (end_time is null or start_time is not null),
  add constraint posts_same_day_time_order_check
    check (
      end_time is null or start_time is null
      or coalesce(meetup_end_date, meetup_date) > meetup_date
      or end_time > start_time
    );

comment on column public.posts.meetup_end_date is
  '모임 제안글(meetup_proposal·meetup_reschedule_proposal)의 종료일. **선택 입력이라 nullable
   이며, null이면 하루짜리 제안이다** — meetups.end_date(NOT NULL)와 의도적으로 다르다.
   finalize_closed_poll이 가결 시 coalesce(meetup_end_date, meetup_date)로 옮겨 담는다.';
comment on column public.posts.end_time is
  '모임 제안글의 종료 시각(선택). start_time 없이 채울 수 없다(CHECK).';

-- ============================================================================
-- 3. meetup_schedule_changes — 변경 이력에도 종료일·종료 시각 스냅샷
-- ============================================================================

alter table public.meetup_schedule_changes
  add column previous_end_date date,
  add column previous_end_time text,
  add column new_end_date date,
  add column new_end_time text;

-- 기존 이력은 전부 하루짜리 모임이었다 — 시작일과 같은 값으로 백필한다.
update public.meetup_schedule_changes
set previous_end_date = previous_date, new_end_date = new_date
where previous_end_date is null or new_end_date is null;

alter table public.meetup_schedule_changes
  alter column previous_end_date set not null,
  alter column new_end_date set not null;

comment on column public.meetup_schedule_changes.previous_end_date is
  '변경 전 종료일. meetups.end_date와 같은 이유로 NOT NULL이다(하루짜리면 previous_date와 같다).';
comment on column public.meetup_schedule_changes.new_end_date is
  '변경 후 종료일. NOT NULL — 하루짜리면 new_date와 같다.';

-- ============================================================================
-- 4. finalize_closed_poll — 가결 시 종료일·종료 시각까지 옮겨 담는다
--    (20260729152504_meetup_reschedule_pipeline_079 판본에 새 4필드만 더한 것)
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
  v_meetup_end_date date;
  v_start_time text;
  v_end_time text;
  v_place text;
  v_capacity integer;
  v_prev_date date;
  v_prev_end_date date;
  v_prev_start_time text;
  v_prev_end_time text;
  v_prev_place text;
  v_prev_capacity integer;
  v_updated_rows integer;
begin
  select po.status, po.result, po.post_id, b.crew_id,
         p.type, p.target_meetup_id,
         p.title, p.body, p.meetup_date,
         -- 제안글의 종료일은 선택 입력(null이면 하루짜리)이지만 meetups.end_date는 NOT NULL이다.
         -- 이 coalesce가 두 표현을 잇는 유일한 지점이다.
         coalesce(p.meetup_end_date, p.meetup_date),
         p.start_time, p.end_time, p.place, p.capacity
    into v_status, v_result, v_post_id, v_crew_id,
         v_post_type, v_target_meetup_id,
         v_post_title, v_post_body, v_meetup_date, v_meetup_end_date,
         v_start_time, v_end_time, v_place, v_capacity
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
          select date, end_date, start_time, end_time, place, capacity
            into v_prev_date, v_prev_end_date, v_prev_start_time, v_prev_end_time,
                 v_prev_place, v_prev_capacity
          from public.meetups
          where id = v_target_meetup_id;

          update public.meetups
          set date = v_meetup_date,
              end_date = v_meetup_end_date,
              start_time = v_start_time,
              end_time = v_end_time,
              place = v_place,
              capacity = v_capacity,
              attending_count = 0
          where id = v_target_meetup_id and status = 'confirmed';
          get diagnostics v_updated_rows = row_count;

          if v_updated_rows > 0 then
            insert into public.meetup_schedule_changes (
              meetup_id, poll_id,
              previous_date, previous_end_date, previous_start_time, previous_end_time,
              previous_place, previous_capacity,
              new_date, new_end_date, new_start_time, new_end_time, new_place, new_capacity
            ) values (
              v_target_meetup_id, p_poll_id,
              v_prev_date, v_prev_end_date, v_prev_start_time, v_prev_end_time,
              v_prev_place, v_prev_capacity,
              v_meetup_date, v_meetup_end_date, v_start_time, v_end_time, v_place, v_capacity
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
        insert into public.meetups (
          crew_id, poll_id, title, description, date, end_date, start_time, end_time, place, capacity
        )
        values (
          v_crew_id, p_poll_id, v_post_title, v_post_body, v_meetup_date, v_meetup_end_date,
          v_start_time, v_end_time, v_place, v_capacity
        )
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
-- 5. hot_public_meetups — 반환에 종료일·종료 시각 추가 + "예정" 판정 기준 변경
--
--    `m.date >= current_date`(시작일 기준)를 그대로 두면 **오늘 진행 중인 3일짜리 모임이
--    둘째 날부터 목록에서 사라진다.** 기준을 `m.end_date >= current_date`로 옮겨 아직
--    끝나지 않은 모임을 계속 노출한다. 정렬 키(meetup_date asc)는 그대로다 — 진행 중인
--    모임이 시작일 기준으로 가장 앞에 오는 것이 자연스럽다.
--
--    반환 테이블 컬럼이 바뀌므로 `create or replace`로는 교체할 수 없다(drop 후 재생성).
--    public 래퍼가 private을 참조하므로 래퍼부터 지운다.
-- ============================================================================

drop function if exists public.hot_public_meetups(integer);
drop function if exists private.hot_public_meetups(integer);

create or replace function private.hot_public_meetups(p_limit integer default 5)
returns table (
  id uuid,
  crew_id uuid,
  crew_name text,
  crew_category text,
  crew_color_key smallint,
  title text,
  meetup_date date,
  meetup_end_date date,
  start_time text,
  end_time text,
  attending_count integer,
  capacity integer,
  activity_score integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with since as (select (now() - interval '7 days') as t),
  crew_activity as (
    select c.id as crew_id,
           (3 * coalesce(pc.n, 0) + 2 * coalesce(vc.n, 0) + coalesce(mc.n, 0))::integer as score
    from public.crews c
    left join lateral (
      select count(*)::integer n
      from public.posts p
      join public.boards b on b.id = p.board_id
      where b.crew_id = c.id
        and p.deleted_at is null
        and p.created_at >= (select t from since)
    ) pc on true
    left join lateral (
      select count(*)::integer n
      from public.poll_votes pv
      join public.polls pl on pl.id = pv.poll_id
      join public.posts p2 on p2.id = pl.post_id
      join public.boards b2 on b2.id = p2.board_id
      where b2.crew_id = c.id
        and pv.invalidated = false
        and pv.voted_at >= (select t from since)
    ) vc on true
    left join lateral (
      select count(*)::integer n
      from public.chat_messages cm
      join public.chat_rooms cr on cr.id = cm.room_id
      where cr.crew_id = c.id
        and cm.deleted_at is null
        and cm.created_at >= (select t from since)
    ) mc on true
  ),
  ranked as (
    select m.id,
           c.id as crew_id,
           c.name as crew_name,
           c.category as crew_category,
           c.color_key as crew_color_key,
           m.title,
           m.date as meetup_date,
           m.end_date as meetup_end_date,
           m.start_time,
           m.end_time,
           m.attending_count,
           m.capacity,
           ca.score as activity_score,
           row_number() over (partition by c.id order by m.date asc, m.id asc) as rn_in_crew
    from public.meetups m
    join public.crews c on c.id = m.crew_id
    join crew_activity ca on ca.crew_id = c.id
    where c.visibility = 'public'
      and c.status = 'active'
      and m.status = 'confirmed'
      and m.end_date >= current_date
  )
  select id, crew_id, crew_name, crew_category, crew_color_key, title, meetup_date,
         meetup_end_date, start_time, end_time, attending_count, capacity, activity_score
  from ranked
  where rn_in_crew = 1
  order by activity_score desc, attending_count desc, meetup_date asc, id asc
  limit greatest(1, least(coalesce(p_limit, 5), 20))
$$;

comment on function private.hot_public_meetups(integer) is
  'D-109 · 메인 화면 "핫한 모임" 목록. 공개·활성 크루의 아직 끝나지 않은 확정 모임만(end_date >= current_date — 진행 중인 다일 모임을 둘째 날에 떨어뜨리지 않는다), 크루당 1건. place와 description은 의도적으로 반환하지 않는다 — D-048이 세운 "Meetup 콘텐츠 비노출" 경계를 넓히되 오프라인 집결지는 계속 감춘다. 이 제약을 푸는 변경은 D-109를 다시 열어야 한다.';

revoke all on function private.hot_public_meetups(integer) from public, anon, authenticated;
grant execute on function private.hot_public_meetups(integer) to anon, authenticated;

create or replace function public.hot_public_meetups(p_limit integer default 5)
returns table (
  id uuid,
  crew_id uuid,
  crew_name text,
  crew_category text,
  crew_color_key smallint,
  title text,
  meetup_date date,
  meetup_end_date date,
  start_time text,
  end_time text,
  attending_count integer,
  capacity integer,
  activity_score integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.hot_public_meetups(p_limit)
$$;

comment on function public.hot_public_meetups(integer) is
  'D-109 · private.hot_public_meetups의 SECURITY INVOKER 래퍼. 게스트(anon) 노출이 의도된 유일한 Meetup 경로다 — meetup_directory_summary(D-048)와 달리 anon에게 EXECUTE를 준다.';

revoke all on function public.hot_public_meetups(integer) from public, anon, authenticated;
grant execute on function public.hot_public_meetups(integer) to anon, authenticated;
