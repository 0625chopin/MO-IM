-- Task 040 (CREW): FR-027 AC3 — 강퇴 실행 시 진행 중(open) 투표에서 강퇴자의 표를 무효화한다.
--
-- D-003: "강퇴자의 표는 무효화하고 정족수 분모에서도 제외한다." 분모 제외는 D-022(스냅샷 ∩
-- 현재 투표 가능자)에 따라 조회 시점에 currentMembershipStatus를 다시 확인하는 것으로 이미
-- 자연히 처리된다(트리거 불필요) — 하지만 "이미 던진 표"의 invalidated 플래그는 누군가 명시적으로
-- true로 바꿔야 한다. 029B는 이 트리거를 §11 이월 목록 1번으로 남겼다("트리거만 추가되면 즉시
-- 반영된다") — poll_vote_tally가 invalidated=true를 이미 걸러내도록 만들어 뒀기 때문이다.
--
-- crew_memberships.status가 active->removed로 바뀌는 시점(강퇴, FR-027)에만 발동한다. 강퇴
-- 해제(FR-027 E3, removed->active)는 과거 무효화를 되돌리지 않는다 — D-003 어디에도 "복귀 시
-- 표가 되살아난다"는 규정이 없고, poll이 그새 종료됐을 수도 있어 되돌리면 NFR-032(역사적
-- 정합성)를 건드릴 위험이 더 크다.
create function public.crew_memberships_invalidate_votes_on_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.poll_votes pv
  set invalidated = true
  from public.polls p
  join public.posts po on po.id = p.post_id
  join public.boards b on b.id = po.board_id
  where pv.poll_id = p.id
    and b.crew_id = new.crew_id
    and pv.voter_id = new.profile_id
    and p.status = 'open'
    and pv.invalidated = false;

  return new;
end;
$$;

comment on function public.crew_memberships_invalidate_votes_on_removal() is
  'Task 040 — FR-027 AC3(D-003) 강퇴 시 진행 중 투표의 강퇴자 표를 무효화. crew_memberships RLS를 우회(postgres 소유)하므로 재귀와 무관, poll_votes_guard_immutability는 invalidated 변경을 허용한다.';

create trigger trg_crew_memberships_invalidate_votes_on_removal
  after update on public.crew_memberships
  for each row
  when (new.status = 'removed' and old.status = 'active')
  execute function public.crew_memberships_invalidate_votes_on_removal();

revoke execute on function public.crew_memberships_invalidate_votes_on_removal() from public, anon, authenticated;
