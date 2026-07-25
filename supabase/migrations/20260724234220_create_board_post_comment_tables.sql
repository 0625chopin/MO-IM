-- Task 028: Board · Post · Comment (PRD §7)
-- 참조: D-013(Meetup 제안 시각·장소·정원 선택 필드), D-035(PRD §7 누락 필드 복구),
--       R-003(src/lib/types/board.types.ts와 대조)

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null unique references public.crews (id) on delete restrict
);

comment on table public.boards is 'PRD §7 Board. Crew와 1:1(unique crew_id).';

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete restrict,
  author_id uuid not null references public.profiles (id) on delete restrict,
  type text not null check (type in ('general', 'meetup_proposal')),
  title text not null,
  body text not null,
  meetup_date date,
  -- HH:MM 형식의 시각 문자열 — 도메인 타입(Post.startTime: string | null)과 표현을
  -- 맞추기 위해 postgres time 타입 대신 text를 쓴다(생성 타입 라운드트립 단순화).
  start_time text check (start_time is null or start_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  place text,
  capacity integer check (capacity is null or capacity > 0),
  created_at timestamptz not null default now(),
  -- 수정 표시(FR-032 AC1, D-035) 근거 — 수정 이력 없으면 null
  edited_at timestamptz,
  deleted_at timestamptz,
  -- D-013: 모임 제안 필드 4종은 type='meetup_proposal'에서만 값을 가진다
  -- (도메인 타입 주석 "general 게시글에서는 항상 null"을 DB 제약으로 고정)
  check (
    type = 'meetup_proposal'
    or (meetup_date is null and start_time is null and place is null and capacity is null)
  )
);

comment on table public.posts is 'PRD §7 Post. meetup_proposal 4필드는 CHECK로 general 글에서 null을 강제한다.';

create index idx_posts_board_created on public.posts (board_id, created_at desc);
create index idx_posts_author on public.posts (author_id);
create index idx_posts_not_deleted on public.posts (board_id) where deleted_at is null;

-- Comment: FR-033·v0.2 대상이나 PRD §7 엔티티 목록에 포함되어 이번에 함께 만든다
-- (데이터 접근/화면 구현은 v0.2, 스키마만 선반영).
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete restrict,
  author_id uuid not null references public.profiles (id) on delete restrict,
  parent_id uuid references public.comments (id) on delete restrict,
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.comments is 'PRD §7 Comment(v0.2 대상, 스키마만 선반영). created_at은 도메인 타입에 없는 운영 부기 컬럼(R-003).';

create index idx_comments_post on public.comments (post_id);
create index idx_comments_parent on public.comments (parent_id);

alter table public.boards enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
