-- Task 028: 데이터베이스 스키마 마이그레이션 — Profile · AuthAttempt (PRD §7)
-- 참조: NFR-035(도메인 타입 원본 src/lib/types/profile.types.ts), D-010(탈퇴 익명화),
--       D-020(계정 잠금 자체 구현), D-037(전용 프로젝트 damruradpliktkrlkakl)
--
-- 열거형 표현: 네이티브 Postgres ENUM이 아니라 text + CHECK 제약을 쓴다.
-- 근거: ENUM 값 추가(ALTER TYPE ... ADD VALUE)는 동일 트랜잭션 내에서 그 값을
-- 바로 사용할 수 없어 apply_migration의 단일 트랜잭션 적용과 상충하고,
-- CHECK 제약은 값 추가 시 한 번의 ALTER TABLE로 끝난다(docs/decisions/schema-migration-028.md 참고).

create table public.profiles (
  -- Supabase Auth 사용자와 1:1(NFR-010). auth.users가 삭제되면 프로필 행도 함께
  -- 삭제되지만, posts/comments 등 콘텐츠 테이블이 profiles(id)를 on delete restrict로
  -- 참조하므로 콘텐츠가 하나라도 남아 있으면 이 CASCADE는 실제로 발동하지 못한다 —
  -- 즉 "진짜 삭제"가 아니라 D-010의 익명화 워크플로만 통하도록 스키마 차원에서 강제한다.
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique,
  display_name text not null,
  avatar_url text,
  bio text,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'withdrawn')),
  -- true면 핸들 검색 결과에서 제외(D-005 3필드 검색 대상에서 빠짐, NFR-013)
  search_opt_out boolean not null default false,
  -- 탈퇴 익명화 시각. null이면 탈퇴 전(D-010)
  anonymized_at timestamptz,
  -- FR-004 AC1(30일 1회 제한) 근거 필드
  handle_changed_at timestamptz,
  -- 도메인 타입(Profile)에는 없는 운영용 부기 컬럼 — 데이터 접근 레이어는 이 컬럼을
  -- 선택하지 않는다(NFR-035, R-003 대조 결과 참고)
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'PRD §7 Profile. src/lib/types/profile.types.ts와 대조(R-003).';
comment on column public.profiles.created_at is '도메인 타입에 없는 운영 부기 컬럼. Mock/Supabase 데이터 접근 레이어는 노출하지 않는다.';

-- D-005: 검색은 핸들 정확 일치 + 활성 상태 + 옵트아웃하지 않은 사용자만 대상으로 한다.
create index idx_profiles_searchable_handle
  on public.profiles (handle)
  where status = 'active' and search_opt_out = false;

-- AuthAttempt(D-020): 로그인 경로(Server Action/Edge Function) 전용, 클라이언트 접근 없음.
-- identifier는 profiles.id가 아니라 로그인 시도에 쓰인 식별자 문자열(핸들 등) —
-- 존재하지 않는 계정에 대한 시도도 잠금 판정에 필요하므로 FK를 걸지 않는다.
create table public.auth_attempts (
  id bigint generated always as identity primary key,
  identifier text not null,
  attempted_at timestamptz not null default now(),
  succeeded boolean not null
);

comment on table public.auth_attempts is 'PRD §7 AuthAttempt(D-020). 클라이언트 접근 불가 — RLS는 029A/029B에서 전체 거부로 확정.';

-- 계정 잠금 판정(예: 15분 내 5회 실패) 조회 패턴을 지원하는 인덱스
create index idx_auth_attempts_identifier_time
  on public.auth_attempts (identifier, attempted_at desc);

-- NFR-011: 모든 테이블에 RLS를 켜고 기본 거부로 시작한다. 정책 설계는 Task 029A/029B —
-- 여기서는 정책 없이 켜기만 해 "정책 없는 테이블 = 전체 공개"(NFR-011의 경고)를
-- 이번 회차부터 차단한다(service_role은 RLS를 우회하므로 서버 경로는 영향받지 않는다).
alter table public.profiles enable row level security;
alter table public.auth_attempts enable row level security;
