-- Task 029A: RLS 정책 — Meetup · MeetupAttendance
-- 참조: FR-061·065·066·067, D-013·D-019·D-034, D-028

-- meetups -----------------------------------------------------------------

-- 캘린더 열람(FR-061)은 "member" 역할에도 매트릭스가 ●를 주지만, 실제로 보이는 Meetup은
-- 이 정책이 크루 스코프로 좁힌다 — 소속 크루가 없으면 빈 캘린더(permission.ts 주석과
-- 정합, 3.3절 각주 없음에도 실질 동작은 데이터 레이어가 좁힌다는 그 주석 그대로).
create policy "meetups_select_members"
  on public.meetups
  for select
  to authenticated
  using (
    crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

-- 투표 가결로 생성(D-013) — 제안자 또는 임원 이상만 생성할 수 있다.
create policy "meetups_insert_proposal_author_or_staff"
  on public.meetups
  for insert
  to authenticated
  with check (
    crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
    and (
      poll_id in (select po.id from public.polls po join public.posts p on p.id = po.post_id where p.author_id = (select auth.uid()))
      or crew_id in (
        select cm.crew_id from public.crew_memberships cm
        where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
      )
    )
  );

-- UPDATE는 두 종류를 한 정책 안에 담는다 — ① 취소·변경(FR-065, 제안자 또는 임원 이상,
-- 모든 컬럼) ② 참석 인원 카운터 갱신(D-019, 크루원 누구나, attending_count만). USING은
-- "누가 이 행을 건드릴 수 있는가"(크루원 전체)까지 넓게 열고, 아래 트리거가 "무엇을 바꿀
-- 수 있는가"를 역할별로 좁힌다 — RLS 정책 문법만으로는 컬럼 단위 구분이 불가능하다.
create policy "meetups_update_members_scoped_by_trigger"
  on public.meetups
  for update
  to authenticated
  using (
    crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  )
  with check (
    crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

create function public.meetups_guard_attendee_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  can_edit_full boolean;
begin
  can_edit_full := exists (
    select 1 from public.crew_memberships cm
    where cm.crew_id = new.crew_id
      and cm.profile_id = (select auth.uid())
      and cm.status = 'active'
      and cm.role in ('staff', 'owner')
  ) or exists (
    select 1 from public.polls po
    join public.posts p on p.id = po.post_id
    where po.id = new.poll_id and p.author_id = (select auth.uid())
  );

  if not can_edit_full and (to_jsonb(new) - 'attending_count') is distinct from (to_jsonb(old) - 'attending_count') then
    raise exception 'only staff/owner/proposal author may edit meetup fields other than attending_count (D-019 conditional UPDATE excepted)';
  end if;

  return new;
end;
$$;

comment on function public.meetups_guard_attendee_scope() is
  'Task 029A — D-019 정원 원자성의 조건부 UPDATE(attending_count)는 일반 크루원도 가능해야 하므로, 그 외 필드는 임원/오너/제안자로 제한.';

create trigger trg_meetups_guard_attendee_scope
  before update on public.meetups
  for each row
  execute function public.meetups_guard_attendee_scope();

-- meetup_attendances --------------------------------------------------------

create policy "meetup_attendances_select_self_or_members"
  on public.meetup_attendances
  for select
  to authenticated
  using (
    profile_id = (select auth.uid())
    or meetup_id in (
      select m.id from public.meetups m
      join public.crew_memberships cm on cm.crew_id = m.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

-- 참석/불참 응답(FR-066·067) — 본인 명의, confirmed 상태의 Meetup에 한한다.
create policy "meetup_attendances_insert_self"
  on public.meetup_attendances
  for insert
  to authenticated
  with check (
    profile_id = (select auth.uid())
    and meetup_id in (
      select m.id from public.meetups m
      join public.crew_memberships cm on cm.crew_id = m.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and m.status = 'confirmed'
    )
  );

create policy "meetup_attendances_update_self"
  on public.meetup_attendances
  for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create index idx_meetup_attendances_profile on public.meetup_attendances (profile_id);
