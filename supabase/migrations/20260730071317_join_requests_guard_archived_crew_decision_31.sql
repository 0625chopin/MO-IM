-- 31일차(CREW, archived 크루 쓰기 표면 감사) — join_requests_update_requester_or_staff RLS는
-- "이 크루의 활성 staff/owner인가"만 검사하고 crew.status는 보지 않았다. disband_crew RPC가
-- join_requests를 정리하지 않아 해산 직전의 대기 중(pending) 신청이 그대로 남을 수 있고,
-- 그 상태에서 오너가 이 UPDATE 경로(decide-join-request.ts → decideJoinRequest)로 "승인"하면
-- join_requests_sync_membership_on_decision 트리거가 실제로 archived 크루에 새 active
-- 멤버를 만들었다(실측: 배포된 정책·트리거 본문을 pg_policies/pg_proc로 직접 확인).
--
-- invitations_insert_staff_or_owner가 이미 쓰는 private.is_crew_active(crew_id)를 그대로
-- 재사용한다(새 함수·새 패턴 없음). USING·WITH CHECK 둘 다에 같은 조건을 더해 "볼 수 있는
-- 행"과 "쓸 수 있는 값" 양쪽에서 archived 크루를 막는다.
alter policy join_requests_update_requester_or_staff on public.join_requests
  to authenticated
  using (
    crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid())
        and cm.status = 'active'
        and cm.role = any (array['staff', 'owner'])
    )
    and private.is_crew_active(crew_id)
  )
  with check (
    crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid())
        and cm.status = 'active'
        and cm.role = any (array['staff', 'owner'])
    )
    and private.is_crew_active(crew_id)
  );
