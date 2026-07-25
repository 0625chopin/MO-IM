-- Task 028: Poll · PollEligibleVoter · PollVote (PRD §7)
-- 참조: D-025(배열 대신 조인 테이블), D-032(정족수=ceil(대상/3), quorumRatio 컬럼 없음),
--       D-024(decidedAt=t0), NFR-032(투표 기록 역사적 정합성 — 소급 변경 금지),
--       R-003(src/lib/types/poll.types.ts와 대조)

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  -- Post 1:1(제안글이면 1개) — unique로 강제
  post_id uuid not null unique references public.posts (id) on delete restrict,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  status text not null default 'open'
    check (status in ('open', 'closed_passed', 'closed_rejected', 'closed_invalid', 'cancelled')),
  closed_by uuid references public.profiles (id) on delete restrict,
  result text check (result in ('passed', 'rejected', 'invalid')),
  -- FR-045 AC2 "5초"의 t=0(D-024)
  decided_at timestamptz,
  check (closes_at > opens_at),
  -- status와 result의 1:1 대응(D-035/D-024)을 DB 제약으로 고정 — 이 매핑이 어긋나면
  -- 이후 어떤 집계 화면도 신뢰할 수 없으므로 애플리케이션 버그로 깨지지 않게 잠근다.
  check (
    (status = 'open' and result is null and decided_at is null)
    or (status = 'cancelled' and result is null)
    or (status = 'closed_passed' and result = 'passed' and decided_at is not null)
    or (status = 'closed_rejected' and result = 'rejected' and decided_at is not null)
    or (status = 'closed_invalid' and result = 'invalid' and decided_at is not null)
  )
);

comment on table public.polls is 'PRD §7 Poll. quorumRatio 컬럼 없음(D-032 — 1/3 고정, ceil(대상/3)은 lib/rules 순수 함수 몫).';

-- pg_cron 자동 종료 잡(Task 034, Task 027 기반)이 "마감 지난 open 투표"를 찾는 경로
create index idx_polls_open_closes_at on public.polls (closes_at) where status = 'open';

-- D-025: PollEligibleVoter 조인 테이블 — 생성 시각 대상자 스냅샷을 고정한다.
-- 배열 컬럼(eligibleSnapshot)이었다면 대상자별 알림 발송 상태를 담을 자리가 없었다.
create table public.poll_eligible_voters (
  poll_id uuid not null references public.polls (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  notified_at timestamptz,
  notify_attempts integer not null default 0 check (notify_attempts >= 0),
  primary key (poll_id, profile_id)
);

comment on table public.poll_eligible_voters is 'PRD §7 PollEligibleVoter(D-025). 스냅샷 고정 — 생성 후 행 삭제/추가 없음(정족수 분모 불변).';

create index idx_poll_eligible_voters_profile on public.poll_eligible_voters (profile_id);

create table public.poll_votes (
  poll_id uuid not null references public.polls (id) on delete restrict,
  voter_id uuid not null references public.profiles (id) on delete restrict,
  choice text not null check (choice in ('for', 'against', 'abstain')),
  voted_at timestamptz not null default now(),
  -- 강퇴 시 무효화(D-003) — true면 정족수·판정 집계에서 제외
  invalidated boolean not null default false,
  primary key (poll_id, voter_id)
);

comment on table public.poll_votes is 'PRD §7 PollVote. NFR-032에 따라 choice/voted_at은 트리거로 UPDATE를 차단한다(불변).';

-- NFR-032: "탈퇴·강퇴 이후에도 투표 집계의 역사적 정합성이 유지된다(소급 변경 금지)".
-- 스키마 설계 시점이 이 규칙을 되돌릴 수 있는 마지막 기회(투표 데이터가 쌓이기 전)이므로
-- CHECK만으로는 표현할 수 없는 "이전 값과 다르면 안 된다"를 트리거로 고정한다.
-- invalidated만 나중에 true로 바뀔 수 있다(강퇴 시 무효화) — choice·voted_at은 절대 불변.
create function public.poll_votes_guard_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.choice is distinct from old.choice or new.voted_at is distinct from old.voted_at then
    raise exception 'poll_votes.choice와 voted_at은 변경할 수 없습니다(NFR-032 소급 변경 금지)';
  end if;
  return new;
end;
$$;

comment on function public.poll_votes_guard_immutability() is 'NFR-032 — 투표 기록 불변성. invalidated만 갱신 허용.';

create trigger trg_poll_votes_guard_immutability
  before update on public.poll_votes
  for each row
  execute function public.poll_votes_guard_immutability();

alter table public.polls enable row level security;
alter table public.poll_eligible_voters enable row level security;
alter table public.poll_votes enable row level security;
