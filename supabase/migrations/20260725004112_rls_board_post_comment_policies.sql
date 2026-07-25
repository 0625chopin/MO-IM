-- Task 029A: RLS 정책 — Board · Post · Comment
-- 참조: FR-030·031·032·033, 3.3절 매트릭스, D-028

-- boards --------------------------------------------------------------------

create policy "boards_select_members"
  on public.boards
  for select
  to authenticated
  using (
    crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

-- 게시판은 크루 생성과 동시에 1건만 만들어진다 — 오너가 자기 크루에 한해 생성.
create policy "boards_insert_owner"
  on public.boards
  for insert
  to authenticated
  with check (crew_id in (select c.id from public.crews c where c.owner_id = (select auth.uid())));

-- posts -----------------------------------------------------------------

create policy "posts_select_members"
  on public.posts
  for select
  to authenticated
  using (
    board_id in (
      select b.id from public.boards b
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

-- 게시글 작성(FR-030) — 크루원 이상, 관리자는 매트릭스상 제외.
create policy "posts_insert_members"
  on public.posts
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and board_id in (
      select b.id from public.boards b
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

-- 수정(FR-032)은 작성자 본인만(post:update_own) — 타인 게시글은 삭제만 가능하고 수정은
-- 매트릭스에 없다. 삭제(soft, deleted_at)는 작성자 본인 또는 임원 이상(post:delete_any).
create policy "posts_update_author_or_staff_delete"
  on public.posts
  for update
  to authenticated
  using (
    author_id = (select auth.uid())
    or board_id in (
      select b.id from public.boards b
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  )
  with check (
    author_id = (select auth.uid())
    or board_id in (
      select b.id from public.boards b
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

-- 작성자가 아닌 갱신자(임원·오너)는 deleted_at 외 어떤 컬럼도 바꿀 수 없다 — 매트릭스가
-- "타인 게시글 삭제"만 허용하고 "타인 게시글 수정"은 어떤 역할에도 주지 않기 때문이다.
create function public.posts_guard_non_author_delete_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.author_id <> (select auth.uid()) and (to_jsonb(new) - 'deleted_at') is distinct from (to_jsonb(old) - 'deleted_at') then
    raise exception 'only the author may edit post content; others may only soft-delete (deleted_at)';
  end if;
  return new;
end;
$$;

comment on function public.posts_guard_non_author_delete_only() is
  'Task 029A — post:delete_any는 소프트 삭제만 허용, 본문 수정은 작성자 전용(post:update_own)으로 제한.';

create trigger trg_posts_guard_non_author_delete_only
  before update on public.posts
  for each row
  execute function public.posts_guard_non_author_delete_only();

-- comments ----------------------------------------------------------------
-- v0.2 대상(schema-migration-028.md 4.2절)이지만 RLS enable + policy 0건은 NFR-011
-- 위반이므로 정책은 posts와 동일 원칙으로 지금 채운다.

create policy "comments_select_members"
  on public.comments
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

create policy "comments_insert_members"
  on public.comments
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and post_id in (
      select p.id from public.posts p
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

create policy "comments_update_author_or_staff_delete"
  on public.comments
  for update
  to authenticated
  using (
    author_id = (select auth.uid())
    or post_id in (
      select p.id from public.posts p
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  )
  with check (
    author_id = (select auth.uid())
    or post_id in (
      select p.id from public.posts p
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

create function public.comments_guard_non_author_delete_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.author_id <> (select auth.uid()) and (to_jsonb(new) - 'deleted_at') is distinct from (to_jsonb(old) - 'deleted_at') then
    raise exception 'only the author may edit comment content; others may only soft-delete (deleted_at)';
  end if;
  return new;
end;
$$;

create trigger trg_comments_guard_non_author_delete_only
  before update on public.comments
  for each row
  execute function public.comments_guard_non_author_delete_only();

create index idx_comments_author on public.comments (author_id);
