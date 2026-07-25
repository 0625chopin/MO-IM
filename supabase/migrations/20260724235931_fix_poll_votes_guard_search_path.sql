-- Task 028 후속(14일차 교차검증, DESIGN): get_advisors(security)가 지적한
-- function_search_path_mutable WARN을 정리한다 — public.poll_votes_guard_immutability()가
-- search_path를 고정하지 않아 역할(role)별로 가변적인 search_path에 노출돼 있었다.
-- SECURITY DEFINER가 아니고 OLD/NEW 컬럼 비교만 하는 함수라 실질 악용 경로는 없지만,
-- Postgres 함수의 표준 권장(고정 search_path)을 지키도록 정리한다.
-- 트리거(trg_poll_votes_guard_immutability)는 함수를 이름으로 참조하므로 재생성이 필요 없다 —
-- 함수 본문만 CREATE OR REPLACE로 교체한다.
create or replace function public.poll_votes_guard_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.choice is distinct from old.choice or new.voted_at is distinct from old.voted_at then
    raise exception 'poll_votes.choice와 voted_at은 변경할 수 없습니다(NFR-032 소급 변경 금지)';
  end if;
  return new;
end;
$$;

comment on function public.poll_votes_guard_immutability() is 'NFR-032 — 투표 기록 불변성. invalidated만 갱신 허용. search_path 고정(14일차 교차검증 정리, function_search_path_mutable WARN 해소).';
