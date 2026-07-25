-- Task 029A: RLS 정책 — Profile · AuthAttempt
-- 참조: D-028(TO 절·서브쿼리 래핑), NFR-011·012, docs/decisions/rls-policies-029a.md
--
-- auth_attempts: 테이블 코멘트("클라이언트 접근 불가")대로 anon/authenticated 모두 완전 거부.
-- 로그인 Server Action이 실제로 이 테이블에 쓰려면 service_role 또는 별도 SECURITY DEFINER
-- 경로가 필요하다 — 이 결정을 policy 부재가 아니라 명시적 using(false)로 문서화한다
-- (advisor의 rls_enabled_no_policy INFO를 "의도된 전체 거부"로 못박기 위함).
create policy "auth_attempts_no_client_access"
  on public.auth_attempts
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- profiles: 로그인한 사용자는 서로의 공개 정보(핸들·표시이름·아바타·bio 등)를 볼 수 있어야
-- 게시글 작성자·채팅 발신자·크루원 표시가 동작한다(D-005 — 검색 옵트아웃은 "검색 결과"
-- 노출만 막지, 이미 알려진 프로필 열람 자체를 막지 않는다. 검색 필터링은 앱 쿼리의 몫).
-- 비로그인(anon)에게는 profiles 정책을 두지 않는다 — 공개 크루 소개(D-007)는 크루 집계
-- 정보만 노출하며 멤버 프로필은 대상이 아니다(guest는 search:by_handle도 deny, 3.3절).
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

-- 가입 시 본인 프로필 행 1건만 스스로 생성할 수 있다(id는 auth.users(id)와 1:1).
create policy "profiles_insert_self"
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()));

-- 자기 프로필 수정(FR-004) — profile:update_own.
create policy "profiles_update_self"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- status 컬럼은 self-service로 "active -> withdrawn"(FR-005 회원 탈퇴) 1건만 허용한다.
-- system_admin의 계정 제재(FR-082, status -> suspended)는 v0.1에서 DB가 admin을 판별할
-- 컬럼/역할 테이블이 없어(D-008 — 관리자 콘솔 자체가 사실상 미사용) 이 트리거의 대상이
-- 아니다 — auth.uid() = old.id(본인이 본인 행을 고치는 경우)일 때만 검사해, 훗날
-- service_role/관리자 경로로 상태를 바꿀 때는(auth.uid()가 그 행의 소유자와 다르거나
-- null) 이 제약에 걸리지 않게 열어 둔다.
create function public.profiles_guard_self_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() = old.id and new.status is distinct from old.status then
    if not (old.status = 'active' and new.status = 'withdrawn') then
      raise exception 'self profile updates may only transition status from active to withdrawn (FR-005)';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.profiles_guard_self_status_transition() is
  'Task 029A — 본인 프로필 상태 전이를 active->withdrawn 1건으로 제한한다. 관리자 제재 경로는 대상 밖(auth.uid()=old.id 조건).';

create trigger trg_profiles_guard_self_status_transition
  before update on public.profiles
  for each row
  execute function public.profiles_guard_self_status_transition();
