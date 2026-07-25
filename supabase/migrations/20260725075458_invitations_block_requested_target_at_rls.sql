-- 18일차 교차검증(CORE) 잔여 갭: Task 032 major 2(`requested` 상태 사용자 초대 차단)를
-- src/lib/rules/invite-eligibility.ts(앱 레이어)에서만 막았는데, `invitations_insert_staff_
-- or_owner`(029A)의 WITH CHECK가 초대 대상(invitee)의 현재 crew_memberships.status를 전혀
-- 보지 않아 앱을 거치지 않고 `invitations`에 직접 INSERT하면(예: 스크립트, 향후 다른
-- 클라이언트) 그 차단이 우회됐다 — 실측 확인(begin/rollback, requested 상태 대상에게 오너가
-- 직접 INSERT → 성공). 그 결과가 조용한 실패다: invitations.status는 'accepted'까지 정상
-- 진행되는데 crew_memberships는 `invitations_provision_membership()`의 ON CONFLICT WHERE
-- 목록에 'requested'가 없어(트리거는 이번에도 건드리지 않는다 — 팀장 결정, 상태도에 없는
-- requested->invited 전이를 "만들지" 않기로 한 것과 이번 조치는 반대 방향으로 같은 전이를
-- "금지"하는 것이라 일관된다) 'requested'에 멈춘 채 UI·DB 양쪽에서 "성공"으로 보인다.
--
-- 수정: WITH CHECK에 "초대 대상의 crew_memberships.status가 'requested'가 아님"을 추가한다.
-- 막을 대상은 requested 하나뿐이다 — FR-020 AC1(비멤버 초대 성공)·FR-021 AC2(거절 이후
-- 재초대 성공)는 그대로 유지해야 한다.
--
-- private 헬퍼 없이 직접 서브쿼리로 처리한다: 이 정책을 통과하려면 호출자가 이미 그 크루의
-- 활성 staff/owner여야 하고(위 두 번째 AND절), crew_memberships_select_self_or_fellow_member
-- 정책(029B)의 qual이 `profile_id = auth.uid() OR private.is_active_crew_member(crew_id)`라
-- 활성 크루원은 같은 크루의 다른 사람 행(대상자의 requested 행 포함)을 이미 SELECT할 권한이
-- 있다 — 그래서 이 서브쿼리가 SECURITY DEFINER 우회 없이도 정상 동작한다(재귀 걱정 없음:
-- crew_memberships의 정책은 invitations를 참조하지 않으므로 정책 A→B→A 순환이 생기지 않는다,
-- 029A §2 재귀 회피 논증과 같은 이유). 서브쿼리 안에서 바깥 행을 가리킬 때는
-- `invitations.crew_id`/`invitations.invitee_id`로 명시적으로 테이블 한정해, 서브쿼리 자체의
-- 별칭(cm2)과 이름이 겹쳐 스코프가 안쪽으로 잘못 잡히는(자기 자신과 비교하는 항진명제가 되는)
-- 사고를 피한다.
drop policy "invitations_insert_staff_or_owner" on public.invitations;

create policy "invitations_insert_staff_or_owner"
on public.invitations
for insert
to authenticated
with check (
  (inviter_id = (select auth.uid()))
  and (crew_id in (
    select cm.crew_id from public.crew_memberships cm
    where cm.profile_id = (select auth.uid())
      and cm.status = 'active'
      and cm.role = any (array['staff', 'owner'])
  ))
  and not exists (
    select 1 from public.crew_memberships cm2
    where cm2.crew_id = invitations.crew_id
      and cm2.profile_id = invitations.invitee_id
      and cm2.status = 'requested'
  )
);
