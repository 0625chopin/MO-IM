-- I-092(MAJOR, CREW 21일차 발견 — CORE's I-089 재검증 파생) — poll_votes_guard_immutability가
-- choice/voted_at만 보고 invalidated는 전혀 지키지 않았다. 실측(CREW): staff가 강퇴 없이
-- 남의 표를 직접 무효화(1행 성공, 감사 로그 없음) / 강퇴당한 크루원이 자기 표를 스스로
-- 재유효화(1행 성공). I-089의 compute_poll_decision은 정확히 이 invalidated로 필터링하므로,
-- 이 컬럼이 안 지켜지면 "0표로 가결" 같은 노골적 위조는 막혀도 표를 몇 개 무효화/재유효화해
-- 정족수·과반을 은밀히 흔드는 경로가 남는다.
--
-- CREW의 부수 발견: 강퇴자가 choice를 바꾸는 시도가 막히는 게 의도된 방어가 아니라 우연이었다
-- — 이 함수가 SECURITY INVOKER라 내부 polls 조회가 호출자 RLS(polls_select_members, 활성
-- 크루원 전용)를 타서, 강퇴/탈퇴로 더 이상 활성 멤버가 아닌 투표자는 그 조회가 0행이 되어
-- "poll_still_open is not true"로 우연히 예외가 났다. polls_select_members가 바뀌면 이 우연한
-- 방어도 같이 사라진다.
--
-- 고침:
-- 1) invalidated는 강퇴 트리거(crew_memberships_invalidate_votes_on_removal, AFTER UPDATE ON
--    crew_memberships, SECURITY DEFINER)를 통한 중첩 호출에서만 바뀔 수 있다 —
--    pg_trigger_depth() > 1로 식별한다(crew_memberships_guard_self_transition이 이미 쓰는
--    같은 패턴, 029A §3). 사람이 poll_votes를 직접 UPDATE하는 경로(depth<=1)에서 invalidated
--    변경 시도는 거부한다.
-- 2) 함수를 SECURITY DEFINER로 바꿔 poll 상태 조회가 호출자 RLS 가시성과 무관하게 항상 진실을
--    보게 한다. "우연한 방어"를 아래 두 명시적 검사로 대체한다: ① 이미 invalidated된 표는
--    무엇도 바꿀 수 없다(재유효화 포함) ② 투표자가 poll_eligible_voters 스냅샷 기준으로
--    지금 crew_memberships에서 active가 아니면(강퇴든 자진 탈퇴든) choice/voted_at을 바꿀 수
--    없다 — 기존의 실질적 차단 결과(비활성 투표자는 못 바꿈)를 그대로 유지하되 근거를
--    명시적으로 만들었다.
create or replace function public.poll_votes_guard_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  poll_still_open boolean;
  voter_still_active boolean;
begin
  -- ① invalidated 불변식 — 강퇴 트리거의 중첩 호출(pg_trigger_depth() > 1)에서만 허용.
  if new.invalidated is distinct from old.invalidated then
    if pg_trigger_depth() <= 1 then
      raise exception 'poll_votes.invalidated는 강퇴 처리(crew_memberships 상태 전이)를 통해서만 바뀔 수 있습니다(D-003, I-092)';
    end if;
  end if;

  if new.choice is distinct from old.choice or new.voted_at is distinct from old.voted_at then
    select (p.status = 'open') into poll_still_open
    from public.polls p
    where p.id = old.poll_id;

    if poll_still_open is not true then
      raise exception 'poll_votes.choice/voted_at은 투표가 open 상태일 때만 변경할 수 있습니다(D-003 변경 허용, NFR-032 종료 후 불변)';
    end if;

    -- ② 이미 무효화된 표는 그 무엇도 바꿀 수 없다(명시적 규칙, 우연한 방어 대체).
    if old.invalidated then
      raise exception 'invalidated된 표는 변경할 수 없습니다(I-092)';
    end if;

    -- ③ 투표자가 지금 이 크루의 활성 멤버가 아니면(강퇴·자진 탈퇴 불문) 표를 바꿀 수 없다
    --    — polls_select_members RLS가 우연히 만들던 것과 같은 실질 효과를 명시적으로 재현.
    select exists (
      select 1
      from public.poll_eligible_voters ev
      join public.polls p on p.id = ev.poll_id
      join public.posts po on po.id = p.post_id
      join public.boards b on b.id = po.board_id
      join public.crew_memberships cm
        on cm.crew_id = b.crew_id and cm.profile_id = ev.profile_id
      where ev.poll_id = old.poll_id
        and ev.profile_id = old.voter_id
        and cm.status = 'active'
    ) into voter_still_active;

    if not voter_still_active then
      raise exception '더 이상 이 크루의 활성 멤버가 아닌 투표자는 표를 변경할 수 없습니다(I-092)';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.poll_votes_guard_immutability() is
  'I-092(21일차) 확장 — choice/voted_at(open 상태에서만, D-003)에 더해 invalidated(강퇴 트리거의 중첩 호출에서만, pg_trigger_depth()>1)까지 불변식으로 강제한다. SECURITY DEFINER로 바꿔 poll 상태·투표자 활성 여부 판정이 호출자 RLS 가시성에 우연히 기대지 않고 명시적으로 이뤄진다.';

revoke all on function public.poll_votes_guard_immutability() from public, anon, authenticated;

-- minor(CREW 실측) — polls_guard_decision_integrity가 new.status가 closed_*가 아니면 조기
-- return해서, status는 그대로 두고 closed_by/result/decided_at만 바꾸는 UPDATE는 가드를 아예
-- 안 탔다. open→closed_* 실제 전이가 아니면 이 네 컬럼을 old 값으로 되돌린다(완전성 보강).
create or replace function public.polls_guard_decision_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision record;
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    return new;
  end if;

  if old.status <> 'open' then
    if new.status is distinct from old.status
       or new.result is distinct from old.result
       or new.decided_at is distinct from old.decided_at then
      raise exception 'closed poll result is immutable (FR-044, I-089)';
    end if;
    return new;
  end if;

  if new.status not in ('closed_passed', 'closed_rejected', 'closed_invalid') then
    -- I-092(CREW 실측 minor) — open을 유지하는(또는 무효한) 전이에서는 result/decided_at/
    -- closed_by를 건드릴 수 없다. 실제 종료 전이 없이 이 컬럼만 슬쩍 바꾸는 시도를 무해화한다.
    new.status := old.status;
    new.result := old.result;
    new.decided_at := old.decided_at;
    new.closed_by := old.closed_by;
    return new;
  end if;

  select * into v_decision from private.compute_poll_decision(old.id);
  new.status := v_decision.computed_status;
  new.result := v_decision.computed_outcome;
  new.decided_at := now();

  if new.closed_by is not null and new.closed_by is distinct from v_actor then
    new.closed_by := v_actor;
  end if;

  return new;
end;
$$;

comment on function public.polls_guard_decision_integrity() is
  'I-089(21일차, CRITICAL) + I-092 완전성 보강(21일차) — polls_update_proposal_author_or_staff RLS가 컬럼값을 제한하지 않던 gap을 막는다. 사람 세션의 open→closed_* 전이는 private.compute_poll_decision으로 재계산한 값으로 덮어쓰고, 그 외(open 유지 등)에는 result/decided_at/closed_by를 old 값으로 되돌려 무해화한다. 이미 닫힌 poll의 재조작은 예외로 막는다. auth.uid() null(pg_cron)은 그대로 통과.';
