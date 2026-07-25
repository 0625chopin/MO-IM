-- Task 028: Crew · CrewMembership · Invitation · JoinRequest (PRD §7)
-- 참조: D-007(공개범위 2단계), D-006/D-026(팔레트 12색), D-002(임원 임명, 오너 1명),
--       R-003(src/lib/types/crew.types.ts, invitation.types.ts, join-request.types.ts와 대조)

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null,
  visibility text not null check (visibility in ('public', 'private')),
  -- D-006/D-026: 12색 팔레트(src/lib/crew-palette.ts CREW_PALETTE) 인덱스. 배정은
  -- 순수 함수(hash(crewId) mod 12, lib/rules/) 몫이고 이 컬럼은 결과값만 담는다.
  color_key smallint not null check (color_key between 0 and 11),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

comment on table public.crews is 'PRD §7 Crew. owner_id 변경(오너 이양)은 UPDATE, 크루 해산은 status=archived(하드 삭제 아님).';

-- D-007: public 크루는 비로그인 방문자도 검색·목록 열람 가능해야 하므로 목록 조회
-- 경로(visibility+status)를 인덱싱한다. D-017: private 크루는 이 경로로 노출되지
-- 않아야 하며, 그 판정은 RLS(029A/029B) 몫이다 — 이 인덱스는 성능만 다룬다.
create index idx_crews_visibility_status on public.crews (visibility, status);
create index idx_crews_category on public.crews (category);

create table public.crew_memberships (
  crew_id uuid not null references public.crews (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  role text not null check (role in ('owner', 'staff', 'member')),
  status text not null
    check (status in ('invited', 'requested', 'active', 'declined', 'rejected', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  -- 강퇴 사유. status<>'removed'면 보통 null(도메인 타입 주석) — 값 자체를 강제하지는 않는다.
  removed_reason text,
  primary key (crew_id, profile_id)
);

comment on table public.crew_memberships is 'PRD §7 CrewMembership. 자연 복합키(crewId, profileId) — 도메인 타입에 id 없음.';

create index idx_crew_memberships_profile on public.crew_memberships (profile_id);
create index idx_crew_memberships_crew_active
  on public.crew_memberships (crew_id) where status = 'active';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete restrict,
  invitee_id uuid not null references public.profiles (id) on delete restrict,
  inviter_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired')),
  -- 발급 후 14일 만료(요구사항 2.2절 용어집) — 값 자체는 애플리케이션이 계산해 저장한다.
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on column public.invitations.created_at is '도메인 타입(Invitation)에 없는 운영 부기 컬럼 — R-003 대조 결과에 기록.';

create index idx_invitations_invitee_status on public.invitations (invitee_id, status);
create index idx_invitations_crew on public.invitations (crew_id);
-- 같은 크루-대상자 조합의 중복 pending 초대 방지
create unique index uq_invitations_pending_crew_invitee
  on public.invitations (crew_id, invitee_id) where status = 'pending';

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete restrict,
  requester_id uuid not null references public.profiles (id) on delete restrict,
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  decided_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on column public.join_requests.created_at is '도메인 타입(JoinRequest)에 없는 운영 부기 컬럼 — R-003 대조 결과에 기록.';

create index idx_join_requests_crew_status on public.join_requests (crew_id, status);
create index idx_join_requests_requester on public.join_requests (requester_id);
create unique index uq_join_requests_pending_crew_requester
  on public.join_requests (crew_id, requester_id) where status = 'pending';

alter table public.crews enable row level security;
alter table public.crew_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.join_requests enable row level security;
