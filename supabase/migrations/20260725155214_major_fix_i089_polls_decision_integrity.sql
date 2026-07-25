-- I-089(CRITICAL, BOARD 21일차 발견·수정) — polls_update_proposal_author_or_staff RLS는
-- 제안자 본인 또는 staff/owner면 polls 행을 UPDATE할 수 있게 하는데 WITH CHECK가 컬럼값을
-- 전혀 제한하지 않았고, polls엔 BEFORE UPDATE 가드 트리거가 아예 없었다(AFTER 2개뿐). 실측:
-- 일반 crew_member가 실제 투표 0표인 채로 UPDATE polls SET status='closed_passed',
-- result='passed' ...를 직접 실행 → 성공 → trg_polls_finalize_closed_poll이 즉시 발동해
-- 진짜 meetups 행을 생성. 정족수·찬반 계산(D-003)이 완전히 우회됐다.
--
-- 고침: ① run_poll_auto_close_job이 인라인하던 정족수·판정 계산식을
-- private.compute_poll_decision(poll_id)로 뽑아내 "한 벌"로 만든다(이 함수 자체를 신규
-- 트리거와 cron 잡이 공유 — 세 번째로 다시 베끼지 않는다, I-071과 같은 이중화를 더 늘리지
-- 않는 방향). ② polls에 BEFORE UPDATE 가드 트리거를 추가한다 — auth.uid()가 NULL이면
-- (pg_cron·postgres 경로) 그대로 통과시키고, 사람 세션이 open→closed_* 전이를 시도하면
-- 클라이언트가 보낸 status/result/decided_at을 신뢰하지 않고 이 함수로 그 자리에서
-- 다시 계산해 덮어쓴다(TS closePoll()이 보낸 값은 참고만 될 뿐 진짜 결정권이 없다) —
-- 정상 경로(TS도 같은 공식으로 이미 올바른 값을 계산해 보낸다)는 재계산 결과와 항상
-- 일치하므로 회귀가 없다. closed_by는 NULL(자동 종료, D-035)이거나 auth.uid() 자기 자신만
-- 허용한다(타인 이름으로 종료했다고 조작 불가). 이미 닫힌 poll의 재조작 시도는 예외로 막는다
-- (poll_votes의 NFR-032 불변 원칙과 같다).

-- 1) 판정 계산을 단일 SQL 함수로 뽑아낸다 — run_poll_auto_close_job의 기존 인라인 계산과
--    완전히 동일한 공식(D-003 정족수 1/3·D-032 ceil·D-022 강퇴자만 분모 제외)이다.
create or replace function private.compute_poll_decision(p_poll_id uuid)
returns table(computed_status text, computed_outcome text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_crew_id uuid;
  v_eligible_count integer;
  v_participant_count integer;
  v_for_count integer;
  v_against_count integer;
  v_required integer;
  v_outcome text;
begin
  select b.crew_id into v_crew_id
  from public.polls p
  join public.posts po on po.id = p.post_id
  join public.boards b on b.id = po.board_id
  where p.id = p_poll_id;

  select count(*) into v_eligible_count
  from public.poll_eligible_voters ev
  join public.crew_memberships cm
    on cm.crew_id = v_crew_id and cm.profile_id = ev.profile_id
  where ev.poll_id = p_poll_id and cm.status <> 'removed';

  select
    count(*),
    count(*) filter (where choice = 'for'),
    count(*) filter (where choice = 'against')
    into v_participant_count, v_for_count, v_against_count
  from public.poll_votes
  where poll_id = p_poll_id and not invalidated;

  v_required := ceil(v_eligible_count / 3.0);

  if v_participant_count < v_required then
    v_outcome := 'invalid';
  elsif v_for_count = v_against_count then
    v_outcome := 'rejected';
  elsif v_for_count > v_against_count then
    v_outcome := 'passed';
  else
    v_outcome := 'rejected';
  end if;

  computed_status := case v_outcome
    when 'passed' then 'closed_passed'
    when 'rejected' then 'closed_rejected'
    else 'closed_invalid'
  end;
  computed_outcome := v_outcome;
  return next;
end;
$$;

comment on function private.compute_poll_decision(uuid) is
  'I-089(21일차) — D-003 정족수·판정 공식의 단일 SQL 소스. run_poll_auto_close_job(트리거①/③ 백스톱)과 polls_guard_decision_integrity(신규 BEFORE UPDATE 가드, 트리거②③ 인간 경로)가 공유한다 — 세 번째로 다시 베끼지 않는다.';

revoke all on function private.compute_poll_decision(uuid) from public, anon, authenticated;

-- 2) run_poll_auto_close_job을 이 공유 함수를 호출하도록 리팩터한다 — 계산 로직 자체는
--    한 글자도 바뀌지 않는다(그대로 뽑아낸 것), 호출 방식만 바뀐다.
create or replace function public.run_poll_auto_close_job(
  batch_size integer default 200,
  max_duration interval default '4 minutes'
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  started_at timestamptz := clock_timestamp();
  v_poll record;
  v_decision record;
  v_closed_count bigint := 0;
begin
  set local statement_timeout = '4min';

  for v_poll in
    select p.id, p.post_id, b.crew_id
    from public.polls p
    join public.posts po on po.id = p.post_id
    join public.boards b on b.id = po.board_id
    where p.status = 'open'
      and (
        p.closes_at <= now()
        or not exists (
          select 1
          from public.poll_eligible_voters ev
          join public.crew_memberships cm
            on cm.crew_id = b.crew_id and cm.profile_id = ev.profile_id
          where ev.poll_id = p.id
            and cm.status = 'active'
            and not exists (
              select 1 from public.poll_votes pv
              where pv.poll_id = ev.poll_id and pv.voter_id = ev.profile_id and not pv.invalidated
            )
        )
      )
    order by p.closes_at
    limit batch_size
  loop
    begin
      select * into v_decision from private.compute_poll_decision(v_poll.id);

      update public.polls
      set status = v_decision.computed_status, result = v_decision.computed_outcome,
          decided_at = now(), closed_by = null
      where id = v_poll.id and status = 'open';

      if found then
        v_closed_count := v_closed_count + 1;
      end if;
    exception when others then
      raise warning 'poll % 자동 종료 실패(트리거①/③): %', v_poll.id, sqlerrm;
    end;

    exit when clock_timestamp() - started_at > max_duration;
  end loop;

  for v_poll in
    select p.id
    from public.polls p
    where p.status in ('closed_passed', 'closed_rejected', 'closed_invalid')
      and (
        exists (
          select 1 from public.poll_eligible_voters ev
          where ev.poll_id = p.id and ev.notified_at is null and ev.notify_attempts < 3
        )
        or (
          p.result = 'passed'
          and not exists (select 1 from public.meetups m where m.poll_id = p.id)
        )
      )
    limit batch_size
  loop
    begin
      perform public.finalize_closed_poll(v_poll.id);
    exception when others then
      raise warning 'poll % 종료 후속 재시도 실패: %', v_poll.id, sqlerrm;
    end;

    exit when clock_timestamp() - started_at > max_duration;
  end loop;

  perform 1
  from public.poll_eligible_voters ev
  where ev.notified_at is null and ev.notify_attempts >= 3
  limit 1;
  if found then
    raise warning 'poll_eligible_voters에 알림 3회 재시도 후에도 실패한 행이 남아 있다 — get_logs·poll_eligible_voters.notify_attempts를 확인할 것';
  end if;

  return v_closed_count;
end;
$$;

comment on function public.run_poll_auto_close_job(integer, interval) is
  'D-003 트리거①(기한 도래)+트리거③ 백스톱(D-022) + NFR-029 재시도 스윕. I-089(21일차) 리팩터 — 정족수·판정 계산은 private.compute_poll_decision으로 뽑아냈다(로직 무변경, 호출 방식만 변경). 5분 주기 pg_cron(poll_auto_close_and_finalize)이 부른다.';

-- 3) 핵심 — polls BEFORE UPDATE 가드. 사람 세션의 open→closed_* 전이에서 결과값을 신뢰하지
--    않고 이 시점의 실제 투표로 재계산해 덮어쓴다. auth.uid()가 NULL(pg_cron)이면 그대로
--    통과 — 그 경로는 이미 위 공유 함수로 스스로 계산한 값을 쓴다.
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
    -- 시스템 경로(run_poll_auto_close_job, postgres 권한) — 이미 공유 함수로 직접 계산한
    -- 값을 쓰므로 그대로 통과시킨다.
    return new;
  end if;

  if old.status <> 'open' then
    -- 이미 종료된 poll의 결과는 불변이다(FR-044, poll_votes의 NFR-032와 같은 원칙) — 사람
    -- 세션이 이 컬럼들을 다시 바꾸려 하면 거부한다. TS closePoll()은 애초에 `.eq("status",
    -- "open")`으로 이 케이스에 도달하지 않으므로(0행) 정상 경로엔 영향이 없다.
    if new.status is distinct from old.status
       or new.result is distinct from old.result
       or new.decided_at is distinct from old.decided_at then
      raise exception 'closed poll result is immutable (FR-044, I-089)';
    end if;
    return new;
  end if;

  if new.status not in ('closed_passed', 'closed_rejected', 'closed_invalid') then
    -- open→closed_* 전이가 아닌 다른 변경 시도 — 이 정책 아래 실제로 존재하는 유일한 정당한
    -- UPDATE 형태가 이 전이뿐이라 방어적으로만 통과시킨다.
    return new;
  end if;

  -- 핵심(I-089): 클라이언트가 보낸 status/result/decided_at을 신뢰하지 않고 지금 이 순간의
  -- 실제 투표로 다시 계산해 덮어쓴다. 정상 경로(closePoll, decideAndClosePoll)는 이미 같은
  -- 공식으로 같은 값을 계산해 보내므로 재계산 결과와 항상 일치한다 — 회귀 없음.
  select * into v_decision from private.compute_poll_decision(old.id);
  new.status := v_decision.computed_status;
  new.result := v_decision.computed_outcome;
  new.decided_at := now();

  -- closed_by는 NULL(자동 종료, D-035 — 트리거①③은 human actor가 없다)이거나 auth.uid()
  -- 자기 자신만 허용한다 — 남의 프로필 id로 "내가 아니라 쟤가 닫았다"고 조작할 수 없다.
  if new.closed_by is not null and new.closed_by is distinct from v_actor then
    new.closed_by := v_actor;
  end if;

  return new;
end;
$$;

comment on function public.polls_guard_decision_integrity() is
  'I-089(21일차, CRITICAL) — polls_update_proposal_author_or_staff RLS가 컬럼값을 제한하지 않던 gap을 막는다. 사람 세션의 open→closed_* 전이는 private.compute_poll_decision으로 재계산한 값으로 덮어쓰고(클라이언트 값은 참고만 함), 이미 닫힌 poll의 재조작은 예외로 막는다. auth.uid() null(pg_cron)은 그대로 통과.';

create trigger trg_polls_guard_decision_integrity
  before update on public.polls
  for each row execute function public.polls_guard_decision_integrity();
