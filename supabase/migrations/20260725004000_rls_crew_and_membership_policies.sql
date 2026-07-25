-- Task 029A: RLS 정책 — Crew · CrewMembership
-- 참조: D-028(자기참조 재귀 회피), D-007(공개 범위), D-002(오너 1명), NFR-011·012
--
-- 재귀 회피 설계(D-028 핵심): crew_memberships의 "SELECT 다른 사람 행" 정책이 스스로를
-- 서브쿼리하면(예: "같은 크루의 active 멤버는 서로를 볼 수 있다") PostgreSQL이
-- "infinite recursion detected in policy for relation crew_memberships" 오류를 낸다.
-- 이 회차는 private 스키마 SECURITY DEFINER 헬퍼(029B 범위)를 만들지 않으므로,
-- crew_memberships 자신의 정책은 "자기 행" 또는 "crews.owner_id"(다른 테이블) 조건만
-- 쓴다. 반대로 이 뒤에 나오는 다른 모든 테이블(crews 포함)의 정책이 crew_memberships를
-- 서브쿼리하는 것은 재귀가 아니다 — crew_memberships 정책 자체는 자기 행만 보므로
-- "내가 속한 크루 집합"을 구하는 서브쿼리(profile_id = (select auth.uid()))는 항상
-- crew_memberships의 SELECT 정책(자기 행)을 그대로 통과해 종료된다.

-- crews -----------------------------------------------------------------

-- 비로그인 방문자: public 크루만(D-007).
create policy "crews_select_anon_public"
  on public.crews
  for select
  to anon
  using (visibility = 'public');

-- 로그인 사용자: public 크루 + 내가 오너인 크루 + 내가 active 멤버인 크루(private 포함).
-- "비소속 회원에게 private 크루가 안 보인다"(D-007)는 이 조건으로 성립한다. 반대로 3.3절
-- 매트릭스 표는 "일반회원 = ●"로만 적어 이 구분이 드러나지 않는다 — D-007이 더 구체적인
-- 결정이라 이쪽을 따랐다(docs/decisions/rls-policies-029a.md §매트릭스 대조 참고).
create policy "crews_select_authenticated"
  on public.crews
  for select
  to authenticated
  using (
    visibility = 'public'
    or owner_id = (select auth.uid())
    or id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

-- 크루 개설(FR-010) — 제출자가 즉시 오너가 된다(D-008, 승인 단계 없음).
create policy "crews_insert_self_owner"
  on public.crews
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

-- 크루 정보 수정 — 임원 이상(crew:update_info). visibility·status·owner_id(존폐·이양에
-- 준하는 필드)는 이 정책만으로는 임원에게도 열리므로 아래 트리거로 오너 전용을 강제한다.
create policy "crews_update_staff_or_owner"
  on public.crews
  for update
  to authenticated
  using (
    id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  )
  with check (
    id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

-- crew:update_visibility(FR-012)·crew:disband(FR-013)·오너 이양(FR-025, owner_id 변경)은
-- 매트릭스상 오너 전용이다. RLS 정책은 UPDATE 행 단위 권한만 표현할 수 있고 "어떤 컬럼이
-- 바뀌었는가"는 표현하지 못하므로 트리거로 보강한다(028의 poll_votes 불변성 트리거와 같은
-- 패턴).
create function public.crews_guard_owner_only_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.visibility is distinct from old.visibility
      or new.status is distinct from old.status
      or new.owner_id is distinct from old.owner_id)
     and old.owner_id <> (select auth.uid()) then
    raise exception 'only the crew owner may change visibility, status, or owner_id (FR-012·FR-013·FR-025)';
  end if;
  return new;
end;
$$;

comment on function public.crews_guard_owner_only_fields() is
  'Task 029A — crews.visibility/status/owner_id 변경은 오너 전용(임원의 UPDATE 권한에서 제외).';

create trigger trg_crews_guard_owner_only_fields
  before update on public.crews
  for each row
  execute function public.crews_guard_owner_only_fields();

create index idx_crews_owner_id on public.crews (owner_id);

-- crew_memberships --------------------------------------------------------

-- 본인 행은 항상(어떤 status든) 보인다 + 크루 오너는 자기 크루의 전 멤버십 행을 본다.
-- "같은 크루 멤버끼리 서로 보인다"(임원·일반 멤버가 다른 멤버 목록을 보는 것)는 자기참조
-- 재귀 없이는 여기서 표현할 수 없다 — 029B의 SECURITY DEFINER 헬퍼로 이월(문서 참고).
create policy "crew_memberships_select_self_or_owner"
  on public.crew_memberships
  for select
  to authenticated
  using (
    profile_id = (select auth.uid())
    or crew_id in (select c.id from public.crews c where c.owner_id = (select auth.uid()))
  );

-- INSERT: ① 본인이 가입 신청(FR-022, status=requested) ② 크루 생성 직후 오너 본인의
-- active 행 부트스트랩 ③ 오너가 다른 사용자를 초대(FR-020, status=invited)한다.
-- 임원의 초대(매트릭스 crew:invite_member는 임원도 허용)는 "임원인가"를 판정하려면
-- crew_memberships를 자기참조해야 해 재귀에 걸린다 — 029A는 오너만 허용하고 임원 몫은
-- 029B로 이월한다(문서 §029B 인계 참고).
create policy "crew_memberships_insert_self_or_owner"
  on public.crew_memberships
  for insert
  to authenticated
  with check (
    (profile_id = (select auth.uid()) and status = 'requested')
    or (
      profile_id = (select auth.uid()) and role = 'owner' and status = 'active'
      and crew_id in (select c.id from public.crews c where c.owner_id = (select auth.uid()))
    )
    or (
      status = 'invited'
      and crew_id in (select c.id from public.crews c where c.owner_id = (select auth.uid()))
    )
  );

-- UPDATE: 본인 행(초대 수락/거절, 탈퇴) 또는 오너가 관리하는 크루의 행(승인/반려/강퇴/
-- 임원 임명/오너 이양). 임원의 강퇴(crew:remove_member 각주⁴)도 같은 이유로 029B 이월.
create policy "crew_memberships_update_self_or_owner"
  on public.crew_memberships
  for update
  to authenticated
  using (
    profile_id = (select auth.uid())
    or crew_id in (select c.id from public.crews c where c.owner_id = (select auth.uid()))
  )
  with check (
    profile_id = (select auth.uid())
    or crew_id in (select c.id from public.crews c where c.owner_id = (select auth.uid()))
  );

-- 본인 행에 대해서는 role을 스스로 바꿀 수 없고(권한 상승 차단), status 전이도
-- crew-membership-transition.ts 2.4절 다이어그램의 self-service 간선(invited->active/
-- declined, active->left)만 허용한다. 오너가 자기 크루 행을 고치는 경로는 대상 밖이다.
create function public.crew_memberships_guard_self_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  acting_as_owner boolean;
begin
  acting_as_owner := exists (
    select 1 from public.crews c
    where c.id = new.crew_id and c.owner_id = (select auth.uid())
  );

  if not acting_as_owner then
    if new.role is distinct from old.role then
      raise exception 'members cannot change their own crew role';
    end if;
    if not (
      (old.status = 'invited' and new.status in ('active', 'declined'))
      or (old.status = 'active' and new.status = 'left')
    ) then
      raise exception 'unsupported self-service membership transition: % -> %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.crew_memberships_guard_self_transition() is
  'Task 029A — 본인 크루 멤버십 self-service 전이를 2.4절 다이어그램의 초대 수락/거절·탈퇴로 제한, role 자가 상승 차단.';

create trigger trg_crew_memberships_guard_self_transition
  before update on public.crew_memberships
  for each row
  execute function public.crew_memberships_guard_self_transition();
