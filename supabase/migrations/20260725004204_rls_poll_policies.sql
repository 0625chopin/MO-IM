-- Task 029A: RLS 정책 — Poll · PollEligibleVoter · PollVote
-- 참조: FR-034·041·043, 3.4절(D-003·D-022·D-025·D-031·D-032), NFR-032, D-028
--
-- 앱 규칙 대조에서 발견한 불일치(문서 §매트릭스 대조 참고): 028의
-- poll_votes_guard_immutability 트리거가 choice/voted_at 변경을 "항상" 막고 있었다.
-- 그런데 3.4절 D-003은 "투표 변경: 종료 전까지 무제한 변경 가능"을 확정했고, NFR-032는
-- "탈퇴·강퇴 이후에도 투표 집계의 역사적 정합성이 유지된다"(즉 종료·확정된 이후의
-- 불변성)를 요구한다 — "항상 불변"은 D-003을 어긴다. 이 마이그레이션이 트리거를
-- "poll이 open일 때는 변경 허용, open이 아니면 차단"으로 고친다.

create or replace function public.poll_votes_guard_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  poll_still_open boolean;
begin
  if new.choice is distinct from old.choice or new.voted_at is distinct from old.voted_at then
    select (p.status = 'open') into poll_still_open
    from public.polls p
    where p.id = old.poll_id;

    if poll_still_open is not true then
      raise exception 'poll_votes.choice/voted_at은 투표가 open 상태일 때만 변경할 수 있습니다(D-003 변경 허용, NFR-032 종료 후 불변)';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.poll_votes_guard_immutability() is
  'Task 029A — D-003(open 동안 무제한 변경)과 NFR-032(종료 후 불변)를 함께 반영하도록 수정. invalidated는 항상 갱신 허용.';

-- polls -----------------------------------------------------------------

create policy "polls_select_members"
  on public.polls
  for select
  to authenticated
  using (
    post_id in (
      select p.id from public.posts p
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

-- 모임 제안글 작성(FR-034) 시 제안자가 투표를 함께 만든다(정상 흐름④, 게시글과 동시 open).
create policy "polls_insert_proposal_author"
  on public.polls
  for insert
  to authenticated
  with check (
    post_id in (
      select p.id from public.posts p
      where p.author_id = (select auth.uid()) and p.type = 'meetup_proposal'
    )
  );

-- 조기 종료(FR-043) — 제안자 본인(각주⁵) 또는 임원 이상.
create policy "polls_update_proposal_author_or_staff"
  on public.polls
  for update
  to authenticated
  using (
    post_id in (select p.id from public.posts p where p.author_id = (select auth.uid()))
    or post_id in (
      select p.id from public.posts p
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  )
  with check (
    post_id in (select p.id from public.posts p where p.author_id = (select auth.uid()))
    or post_id in (
      select p.id from public.posts p
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

-- poll_eligible_voters ------------------------------------------------------
-- D-025 스냅샷 — 발송 상태 부기 컬럼이라 일반 크루원에게는 노출하지 않는다(본인 행 제외).

create policy "poll_eligible_voters_select_self_or_staff"
  on public.poll_eligible_voters
  for select
  to authenticated
  using (
    profile_id = (select auth.uid())
    or poll_id in (
      select po.id from public.polls po
      join public.posts p on p.id = po.post_id
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

-- 스냅샷 생성 — 투표(=제안글) 생성자 또는 임원 이상만 대상자 명단을 채울 수 있다.
create policy "poll_eligible_voters_insert_proposal_author_or_staff"
  on public.poll_eligible_voters
  for insert
  to authenticated
  with check (
    poll_id in (
      select po.id from public.polls po
      join public.posts p on p.id = po.post_id
      where p.author_id = (select auth.uid())
    )
    or poll_id in (
      select po.id from public.polls po
      join public.posts p on p.id = po.post_id
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

-- notified_at/notify_attempts 갱신 — 발송 주체(제안자 또는 임원 이상)만.
create policy "poll_eligible_voters_update_proposal_author_or_staff"
  on public.poll_eligible_voters
  for update
  to authenticated
  using (
    poll_id in (select po.id from public.polls po join public.posts p on p.id = po.post_id where p.author_id = (select auth.uid()))
    or poll_id in (
      select po.id from public.polls po
      join public.posts p on p.id = po.post_id
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  )
  with check (
    poll_id in (select po.id from public.polls po join public.posts p on p.id = po.post_id where p.author_id = (select auth.uid()))
    or poll_id in (
      select po.id from public.polls po
      join public.posts p on p.id = po.post_id
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

-- poll_votes ----------------------------------------------------------------
-- D-003 "개인 선택은 비공개, 집계만 공개"를 그대로 지키려면 본인 표만 노출해야 한다.
-- 크루원 전체에 공개할 집계(찬성/반대/기권 수, D-031의 5명 미만 특례 포함)는 개별 행을
-- 노출하지 않는 별도 집계 뷰/RPC가 필요하다 — 029B로 이월(문서 참고).

create policy "poll_votes_select_self_or_staff"
  on public.poll_votes
  for select
  to authenticated
  using (
    voter_id = (select auth.uid())
    or poll_id in (
      select po.id from public.polls po
      join public.posts p on p.id = po.post_id
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

-- 투표 참여(FR-041) — 본인 명의, open 상태의 투표, 대상자 스냅샷에 포함된 경우만.
create policy "poll_votes_insert_eligible_self"
  on public.poll_votes
  for insert
  to authenticated
  with check (
    voter_id = (select auth.uid())
    and poll_id in (select id from public.polls where status = 'open')
    and exists (
      select 1 from public.poll_eligible_voters pev
      where pev.poll_id = poll_votes.poll_id and pev.profile_id = poll_votes.voter_id
    )
  );

-- 재투표(D-003, open 동안)는 본인, 무효화(강퇴 시 invalidated)는 임원 이상.
create policy "poll_votes_update_self_or_staff"
  on public.poll_votes
  for update
  to authenticated
  using (
    voter_id = (select auth.uid())
    or poll_id in (
      select po.id from public.polls po
      join public.posts p on p.id = po.post_id
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  )
  with check (
    voter_id = (select auth.uid())
    or poll_id in (
      select po.id from public.polls po
      join public.posts p on p.id = po.post_id
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

create index idx_poll_votes_voter on public.poll_votes (voter_id);
