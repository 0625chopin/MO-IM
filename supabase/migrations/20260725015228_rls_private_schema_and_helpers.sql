-- 작성: CORE (Task 029B)
-- 029A가 재귀 회피를 위해 crew_memberships를 자기 행 전용 리프 노드로 좁히면서 남긴 gap
-- (임원 임명·강퇴 FR-024·027, 동료 조회 FR-028)을 풀기 위한 비노출 SECURITY DEFINER 헬퍼.
-- D-028이 처음부터 권고한 패턴: 헬퍼 내부는 SECURITY DEFINER로 실행되어 정책 재작성 단계의
-- 순환 탐지 대상이 되지 않는다(정책이 정책을 참조할 때만 재귀가 발동하고, 정책이
-- SECURITY DEFINER 함수를 호출하는 것은 다른 경로 — 029A rls-policies-029a.md §4).
-- 함수 소유자는 마이그레이션 실행 role(=postgres, 21개 테이블의 테이블 소유자와 동일 —
-- 029A §0 실측)이라 내부 쿼리가 crew_memberships의 RLS 정책을 우회한다(FORCE ROW LEVEL
-- SECURITY 미설정 확인됨, 029A §6.3).

create schema if not exists private;

comment on schema private is
  'PostgREST 노출 스키마 목록(Project Settings > Data API > Exposed schemas)에 절대 추가하지 않는다. '
  '이 스키마의 함수는 RLS 정책·트리거 내부에서만 호출되는 비노출 헬퍼다(D-028, 029B).';

-- 스키마 자체는 기본적으로 어떤 role에도 USAGE가 없다(public 스키마와 달리 자동 부여가 없음
-- — Supabase "Using Custom Schemas" 문서 실측 확인). authenticated가 정책 평가 중 이 스키마의
-- 함수를 호출하려면 명시적 USAGE가 필요하다.
revoke all on schema private from public;
grant usage on schema private to authenticated, anon, service_role;

-- 1) 내가 활성 멤버인 크루 id 집합
create or replace function private.my_active_crew_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select crew_id
  from public.crew_memberships
  where profile_id = (select auth.uid())
    and status = 'active'
$$;

-- 2) 특정 크루에서 내 role(비활성 멤버십이면 null)
create or replace function private.my_crew_role(p_crew_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.crew_memberships
  where crew_id = p_crew_id
    and profile_id = (select auth.uid())
    and status = 'active'
$$;

-- 3) 특정 크루의 활성 멤버인지
create or replace function private.is_active_crew_member(p_crew_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.crew_memberships
    where crew_id = p_crew_id
      and profile_id = (select auth.uid())
      and status = 'active'
  )
$$;

-- 4) 특정 크루의 임원(staff) 이상인지
create or replace function private.is_crew_staff_or_owner(p_crew_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.my_crew_role(p_crew_id) in ('staff', 'owner')
$$;

-- 함수 EXECUTE 권한: 15일차 교훈 — Supabase가 신규 함수에 anon/authenticated 개별 grant를
-- 자동으로 붙이는 것은 "public" 스키마 한정(ALTER DEFAULT PRIVILEGES가 public에만 걸려 있음)
-- 이라 이 private 스키마의 함수는 자동 부여가 없다. 그래도 명시적으로 세 대상에 우선 REVOKE
-- 후 필요한 role에만 GRANT해 의도를 명확히 남긴다(같은 교훈의 반대 방향 적용).
revoke execute on function private.my_active_crew_ids() from public, anon, authenticated;
revoke execute on function private.my_crew_role(uuid) from public, anon, authenticated;
revoke execute on function private.is_active_crew_member(uuid) from public, anon, authenticated;
revoke execute on function private.is_crew_staff_or_owner(uuid) from public, anon, authenticated;

grant execute on function private.my_active_crew_ids() to authenticated;
grant execute on function private.my_crew_role(uuid) to authenticated;
grant execute on function private.is_active_crew_member(uuid) to authenticated;
grant execute on function private.is_crew_staff_or_owner(uuid) to authenticated;
