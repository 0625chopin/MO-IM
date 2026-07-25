-- I-085(MAJOR, CORE 21일차 발견, 수정 CREW) — FR-023 가입 신청 승인이 앱 레이어
-- (checkPermission)에만 강제돼 있고 DB(RLS)는 신청자 본인의 임의 status 자가 UPDATE를
-- 막지 않았다. 실측: 신청자 본인이 자기 pending 신청을 직접 status='approved'로 UPDATE →
-- 1행 성공, crew_memberships가 즉시 active로 동기화됨(승인 절차 완전 우회).
--
-- 고침: join_requests_update_requester_or_staff의 WITH CHECK를 좁힌다 — 신청자 본인
-- (requester_id=self) 분기는 새 값이 'withdrawn'일 때만 통과시킨다(FR-022 E4 자진 철회,
-- withdrawJoinRequest가 실제로 쓰는 유일한 self-service 목표 상태). staff/owner 분기는
-- 변경하지 않는다 — 그쪽이 approved/rejected를 실제로 수행해야 하는 정당한 경로다.
-- USING은 그대로 둔다(행 자체를 볼 수 있는지는 이미 올바르다 — 본인 신청은 항상 보여야
-- 철회 버튼이 동작한다) — 문제는 오직 WITH CHECK(어떤 값으로 바꿀 수 있는가)였다.

drop policy if exists join_requests_update_requester_or_staff on public.join_requests;

create policy join_requests_update_requester_or_staff
  on public.join_requests
  for update
  to authenticated
  using (
    requester_id = (select auth.uid())
    or crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid())
        and cm.status = 'active'
        and cm.role = any (array['staff', 'owner'])
    )
  )
  with check (
    (requester_id = (select auth.uid()) and status = 'withdrawn')
    or crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid())
        and cm.status = 'active'
        and cm.role = any (array['staff', 'owner'])
    )
  );

comment on policy join_requests_update_requester_or_staff on public.join_requests is
  'I-085(21일차) 수정 — self-service(requester_id=self) 분기는 status=''withdrawn''(FR-022 E4 자진 철회)일 때만 허용한다. approved/rejected는 staff/owner 분기(역할 조건)로만 가능 — 이전에는 self 분기가 상태값을 제한하지 않아 신청자 본인이 자기 신청을 approved로 자가 승인할 수 있었다(FR-023 완전 우회).';
