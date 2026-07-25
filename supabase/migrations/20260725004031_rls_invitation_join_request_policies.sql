-- Task 029A: RLS 정책 — Invitation · JoinRequest
-- 참조: FR-020·021·022·023, D-007(public 크루만 가입 신청 가능), D-028
--
-- crew_memberships를 "자기 행" 서브쿼리로 조회해 "임원 이상인가"를 판정한다 — 이 두
-- 테이블은 crew_memberships가 아니므로 재귀가 아니다(위 마이그레이션 주석 참고).

-- invitations -------------------------------------------------------------

create policy "invitations_select_participant_or_staff"
  on public.invitations
  for select
  to authenticated
  using (
    invitee_id = (select auth.uid())
    or inviter_id = (select auth.uid())
    or crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

-- 크루원 초대(FR-020) — 임원 이상.
create policy "invitations_insert_staff_or_owner"
  on public.invitations
  for insert
  to authenticated
  with check (
    inviter_id = (select auth.uid())
    and crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

-- 초대 수락·거절(FR-021, 본인) + 임원 이상의 취소/관리.
create policy "invitations_update_invitee_or_staff"
  on public.invitations
  for update
  to authenticated
  using (
    invitee_id = (select auth.uid())
    or crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  )
  with check (
    invitee_id = (select auth.uid())
    or crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

create policy "invitations_delete_inviter_or_staff"
  on public.invitations
  for delete
  to authenticated
  using (
    inviter_id = (select auth.uid())
    or crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

create index idx_invitations_inviter on public.invitations (inviter_id);

-- join_requests -------------------------------------------------------------

create policy "join_requests_select_requester_or_staff"
  on public.join_requests
  for select
  to authenticated
  using (
    requester_id = (select auth.uid())
    or crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

-- 가입 신청(FR-022) — public 크루에만, 본인 명의로만(D-007 E1).
create policy "join_requests_insert_self_public_crew"
  on public.join_requests
  for insert
  to authenticated
  with check (
    requester_id = (select auth.uid())
    and crew_id in (select c.id from public.crews c where c.visibility = 'public')
  );

-- 승인·반려(FR-023, 임원 이상) 또는 신청자 본인의 철회.
create policy "join_requests_update_requester_or_staff"
  on public.join_requests
  for update
  to authenticated
  using (
    requester_id = (select auth.uid())
    or crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  )
  with check (
    requester_id = (select auth.uid())
    or crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );
