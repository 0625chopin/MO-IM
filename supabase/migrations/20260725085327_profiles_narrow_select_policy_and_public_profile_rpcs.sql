-- I-058 해소 1단계: profiles_select_authenticated(qual=true, 전 컬럼·전 행 공개)를 self-row
-- 전용으로 좁히고, "작성자 표기" 등 타인 프로필 조회가 필요한 정당한 소비자를 위해 공개
-- 필드 전용 RPC 2종(id 기준·handle 정확 일치 기준)을 private/public 2단 구조로 신설한다.
--
-- 배경(I-058, 팀장 실측): qual=true라 로그인한 아무 계정이나 `select * from profiles`로
-- 21행 전부(옵트아웃 포함)를 한 번에 덤프할 수 있었다. NFR-013(핸들 검색 3필드)·D-005(분당
-- 20회 리밋)·R-012(사용자 열거 방지)·FR-006 옵트아웃이 이 한 정책 때문에 전부 우회됐다
-- (18일차 §14가 이미 "이 리밋은 profile_search RPC 경로만 보호한다"고 한계를 남겼다).
--
-- 왜 이 방식인가: RLS는 행 단위 필터만 표현할 수 있어 "본인은 전 컬럼, 타인은 공개 필드만"을
-- 정책 하나로 표현할 수 없다(컬럼 단위 GRANT/REVOKE는 역할 전역이라 "본인 행이면 전체 허용"과
-- 공존 불가). crew_directory_summary(029B, D-007)가 이미 쓴 해법과 같은 패턴 — RLS로 원본
-- 테이블을 self-row로 좁히고, 컬럼을 제한한 별도 SECURITY DEFINER 함수로 타인 조회를 우회
-- 허용한다.
--
-- 영향 범위 조사(전수, 19일차): src/lib/data/supabase/{board,chat,crew,meetup,poll,
-- notification,invitation,join-request}.ts 중 profiles를 직접 참조하는 파일은 profile.ts
-- 하나뿐이다 — 나머지 도메인 모듈은 getProfileById/getProfileByHandle(profile.ts)을 호출하는
-- 컨테이너·Server Action을 통해서만 프로필을 조인한다(임베디드 FK join 없음). 그 호출부
-- 전수(BoardListContainer·PostDetailContainer·MessageListContainer·CrewMembersContainer·
-- InvitationInboxContainer·MeetupDetailContainer·resolve-post-link-card·send/load/resync-
-- chat-message 계열)가 실제로 읽는 필드는 예외 없이 handle·displayName·avatarUrl 3개뿐이다
-- (bio·status·searchOptOut·anonymizedAt·deactivatedAt·handleChangedAt·onboardingCompletedAt을
-- 타인 행에서 쓰는 곳은 0건, grep 확인). getProfileByHandle의 나머지 3개 내부 소비자
-- (check-handle-availability·invite-crew-member·signup)는 `.id`만 쓰고, FR-006 검색 경로
-- (search-user-by-handle.ts → projectHandleSearchResult)는 handle·displayName·avatarUrl·
-- status·searchOptOut 5개를 쓴다 — 아래 두 RPC의 반환 컬럼은 그 합집합만 담는다.

-- 1) profiles_select_authenticated를 self-row 전용으로 좁힌다.
drop policy if exists "profiles_select_authenticated" on public.profiles;

create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

comment on policy "profiles_select_authenticated" on public.profiles is
  'I-058(19일차) 이후: self-row 전 컬럼만 직접 조회 허용. 타인 행 공개 필드는
   public.get_profile_public_by_id/by_handle RPC를 통해서만 노출한다 — 원본 테이블
   select(*)로 전 회원 명부를 덤프하는 경로를 막는다.';

-- 2) id 기준 "작성자 표기"용 공개 필드 조회. status는 포함하되(정확성 우선 — 029B
--    profile_search 문서가 세운 "고정값으로 속이지 않는다" 원칙과 동일) bio·search_opt_out·
--    시각 컬럼 4종은 제외한다 — 어떤 호출부도 타인 행에서 그 필드를 쓰지 않는다(위 조사
--    참고). 탈퇴 유예(deactivated)·익명화(anonymized) 계정도 걸러내지 않는다 — 게시글·채팅·
--    모임 참석자 목록은 작성 당시 계정 상태와 무관하게 "누가 썼는가"를 계속 보여줘야 하고
--    (익명화 시점에 display_name 자체가 이미 "탈퇴한 사용자"로 치환되므로 별도 필터가
--    필요 없다, meetup-view-models.ts 문서 참고), 이 필터는 FR-006 "검색"에만 필요한
--    것이지 "작성자 표기"에는 적용된 적이 없다(qual=true였던 기존 동작과 동일 수준 유지).
create or replace function private.get_profile_public_by_id(p_id uuid)
returns table (
  id uuid,
  handle text,
  display_name text,
  avatar_url text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.handle, p.display_name, p.avatar_url, p.status
  from public.profiles p
  where p.id = p_id;
$$;

revoke all on function private.get_profile_public_by_id(uuid) from public, anon, authenticated;
grant execute on function private.get_profile_public_by_id(uuid) to authenticated;

create or replace function public.get_profile_public_by_id(p_id uuid)
returns table (
  id uuid,
  handle text,
  display_name text,
  avatar_url text,
  status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_profile_public_by_id(p_id);
$$;

revoke all on function public.get_profile_public_by_id(uuid) from public, anon;
grant execute on function public.get_profile_public_by_id(uuid) to authenticated;

-- 3) handle 정확 일치 조회(가입/초대 시 handle→id 재해석 + FR-006 검색 경로의 직접-조회
--    대체). status·search_opt_out을 함께 반환하는 이유: FR-006 경로
--    (projectHandleSearchResult)가 옵트아웃·비활성 판정에 그 두 값을 그대로 쓴다(이 함수는
--    그 판정을 대신하지 않는다 — R-012 "동일 코드 경로" 불변식은 앱 레이어의
--    projectHandleSearchResult가 계속 담당한다). id를 포함하는 이유: check-handle-
--    availability·invite-crew-member·signup 세 내부 소비자가 실제로 그 값을 쓴다(핸들 검색
--    UI에는 절대 노출하지 않는다 — search-user-by-handle.ts는 projectHandleSearchResult를
--    거치므로 id가 최종 응답에 담기지 않는다). 상태 필터를 두지 않는 이유: 핸들 유일성 확인
--    (가입·초대)은 탈퇴·정지 계정이 쓰던 핸들도 "이미 사용 중"으로 봐야 한다(계정이 사라진
--    게 아니라 30일 유예/익명화 상태일 뿐이고, handle UNIQUE 제약은 상태와 무관하게 걸려
--    있다) — 필터를 넣으면 그 판정이 틀린다.
create or replace function private.get_profile_public_by_handle(p_handle text)
returns table (
  id uuid,
  handle text,
  display_name text,
  avatar_url text,
  status text,
  search_opt_out boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.handle, p.display_name, p.avatar_url, p.status, p.search_opt_out
  from public.profiles p
  where p.handle = p_handle;
$$;

revoke all on function private.get_profile_public_by_handle(text) from public, anon, authenticated;
grant execute on function private.get_profile_public_by_handle(text) to authenticated;

create or replace function public.get_profile_public_by_handle(p_handle text)
returns table (
  id uuid,
  handle text,
  display_name text,
  avatar_url text,
  status text,
  search_opt_out boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_profile_public_by_handle(p_handle);
$$;

revoke all on function public.get_profile_public_by_handle(text) from public, anon;
grant execute on function public.get_profile_public_by_handle(text) to authenticated;
