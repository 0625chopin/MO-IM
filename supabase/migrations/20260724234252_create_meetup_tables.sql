-- Task 028: Meetup · MeetupAttendance (PRD §7)
-- 참조: D-013(시각·장소·정원 선택), D-019(정원 원자성=조건부 UPDATE, RLS로 시도 안 함),
--       D-034(status=confirmed/cancelled만), R-003(meetup.types.ts와 대조)

create table public.meetups (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete restrict,
  -- 가결 시 1개(Poll 1:1) — unique로 강제
  poll_id uuid not null unique references public.polls (id) on delete restrict,
  title text not null,
  description text,
  date date not null,
  start_time text check (start_time is null or start_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  place text,
  capacity integer check (capacity is null or capacity > 0),
  -- D-019: attendingCount는 애플리케이션의 조건부 UPDATE(WHERE attending_count < capacity)로
  -- 원자성을 보장한다 — 이 CHECK는 그 결과가 항상 유효 범위 안에 있는지 확인하는
  -- 안전망일 뿐, 동시성 자체는 스키마가 아니라 데이터 접근 레이어의 책임이다.
  attending_count integer not null default 0
    check (attending_count >= 0 and (capacity is null or attending_count <= capacity)),
  -- D-034: 'scheduled' 같은 중간 상태 없음. 투표 가결 즉시 confirmed.
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

comment on table public.meetups is 'PRD §7 Meetup(D-034). 정원 원자성은 D-019에 따라 애플리케이션 조건부 UPDATE가 담당.';

-- NFR-005: 캘린더 월간 뷰가 크루별 Meetup을 날짜순으로 조회하는 핵심 경로
create index idx_meetups_crew_date on public.meetups (crew_id, date);
create index idx_meetups_date on public.meetups (date);

create table public.meetup_attendances (
  meetup_id uuid not null references public.meetups (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  status text not null check (status in ('attending', 'absent')),
  responded_at timestamptz not null default now(),
  -- 자연 복합 PK가 곧 도메인 타입 주석의 UNIQUE(meetupId, profileId) 제약이다(D-019 upsert 전제)
  primary key (meetup_id, profile_id)
);

comment on table public.meetup_attendances is 'PRD §7 MeetupAttendance(D-013). PK 자체가 FR-067 E2 멱등 upsert의 전제.';

create index idx_meetup_attendances_meetup_status
  on public.meetup_attendances (meetup_id) where status = 'attending';

alter table public.meetups enable row level security;
alter table public.meetup_attendances enable row level security;
