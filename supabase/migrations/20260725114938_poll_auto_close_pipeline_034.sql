-- Task 034 (BOARD): 투표 자동 종료·판정·Meetup 생성·알림 파이프라인
-- 참조: FR-043·044·045·060, D-003·D-015·D-022·D-024·D-027, NFR-029·032·036
--
-- 왜 순수 SQL(pg_cron 잡)인가 — Edge Function/HTTP 왕복을 쓰지 않는다:
--   docs/prd/PRD-validation.md("pg_cron이 Vercel Cron보다 우월") — "투표 종료·판정·Meetup
--   생성·알림 적재는 전부 SQL로 표현 가능하므로 Edge Function을 경유할 이유가 없다"는 이미
--   PRD 검증 단계에서 확정된 방향이다. pg_cron은 순수 SQL만 실행하고(다른 두 pg_cron 잡
--   문서 — anonymize_expired_deactivated_profiles의 I-056 각주 — 이 이미 같은 제약을 겪었다)
--   TS 런타임을 호출할 방법이 없어, 이 파일의 판정 로직은 SQL로 다시 표현할 수밖에 없다.
--
-- "판정 로직을 다시 쓰지 마라"는 배정 지시를 정확히 어디까지 지켰는지(정직하게 기록):
--   - **재사용한 것**: D-003(정족수 1/3, 강퇴자만 분모 제외)·D-032(ceil, floor 아님)·D-022
--     (트리거③ 미투표자 = 스냅샷 ∩ 현재 active)의 **공식과 상수**는 src/lib/rules/quorum.ts·
--     poll-decision.ts·poll-eligibility.ts와 완전히 동일하게 맞췄다 — 새 규칙을 만들지 않았다.
--   - **다시 쓸 수밖에 없었던 것**: 그 공식을 SQL로 표현하는 코드 자체(카운트 집계 +
--     ceil/비교). TS 순수 함수는 이 트랜잭션에서 호출 불가능하다 — "재사용"의 물리적 한계다.
--     **이 SQL과 TS 3개 파일이 앞으로 갈라지지 않으려면 둘 중 하나가 바뀔 때 반드시 함께
--     본다** — 이 리스크는 결정 문서(docs/decisions/poll-pipeline-034.md)에도 남긴다.
--   - **전혀 다시 쓰지 않은 것**: `private.poll_vote_tally_for_decision`(029B/17일차 핫픽스)은
--     건드리지 않았다 — 그 함수는 `auth.uid()`(is_active_crew_member) 의존이라 pg_cron
--     컨텍스트(호출자가 postgres, JWT 없음)에서 쓸 수 없어 애초에 재사용 대상이 아니었다.
--     `decideAndClosePoll`(TS, cast-vote.ts 트리거③·close-poll.ts 트리거②)도 이번에 한 줄도
--     고치지 않았다 — 이 마이그레이션은 순수 추가(additive)다.
--   - **Meetup 생성(FR-060)·알림 적재(FR-045)는 TS에 원래 구현 자체가 없었다**(모듈 전체를
--     grep해 확인 — 17~19일차까지 아무도 만들지 않았다). 그래서 이 부분은 "다시 쓰는" 것이
--     아니라 **최초 구현**이고, DB 트리거 하나로 만들어 트리거①②③ 세 경로가 전부 공유하므로
--     이 로직만큼은 지금부터도 "한 벌"이다(R-015 그대로 지킨다).
--
-- 구조 (3개 함수 + 트리거 1개 + pg_cron 잡 1개):
--   1. public.finalize_closed_poll(poll_id)      — Meetup 생성 + 알림 적재(D-015), 멱등.
--   2. public.trg_finalize_closed_poll()         — polls AFTER UPDATE 트리거. open→closed_*
--      전이마다 ①을 호출한다. **트리거②③(TS, closePoll UPDATE)도 이 트리거를 그대로 탄다**
--      — 새 코드가 아니라 기존 UPDATE 문에 이미 걸려 있던 트리거 슬롯을 채우는 것뿐이다.
--   3. public.run_poll_auto_close_job(...)        — pg_cron 잡 본체. **트리거①**(마감 도래)을
--      찾아 판정+종료하고, **트리거③ 백스톱**(D-022 미투표자 0명)도 같은 루프에서 함께
--      잡는다 — write-path-realdata-032.md §8이 남긴 인계("트리거③이 RLS로 막혀 트리거①까지
--      기다리는 지연이 생길 수 있다")를 이 자리에서 해소한다. **트리거②는 다루지 않는다**
--      — 사람이 버튼으로 즉시 발화하고 실패하면 Server Action이 바로 오류를 돌려주므로
--      "조용히 막히는" 트리거③과 성격이 다르다.
--
-- I-054 회피(단일 RPC 원칙): "여러 PostgREST 호출로 나눠 쓰면 진짜 트랜잭션이 아니다"의
-- 교훈을 이렇게 지켰다 — ①에서 폴 상태를 바꾸는 UPDATE 한 번이면, 그 트랜잭션 안에서
-- AFTER 트리거가 Meetup INSERT·알림 INSERT까지 전부 처리한다(추가 왕복 없음, 전부 원자적).
-- 트리거②③(TS)도 마찬가지다 — `closePoll()`의 UPDATE 한 번이 끝나면 부속 작업까지 같은
-- DB 트랜잭션 안에서 끝난다(TS 코드가 별도로 Meetup·알림을 호출하지 않는다).

-- ────────────────────────────────────────────────────────────────────────
-- 1) public.finalize_closed_poll — Meetup 생성(FR-060) + 알림 적재(FR-045, D-015)
-- ────────────────────────────────────────────────────────────────────────
create or replace function public.finalize_closed_poll(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_result text;
  v_post_id uuid;
  v_crew_id uuid;
  v_post_title text;
  v_post_body text;
  v_meetup_date date;
  v_start_time text;
  v_place text;
  v_capacity integer;
begin
  select po.status, po.result, po.post_id, b.crew_id,
         p.title, p.body, p.meetup_date, p.start_time, p.place, p.capacity
    into v_status, v_result, v_post_id, v_crew_id,
         v_post_title, v_post_body, v_meetup_date, v_start_time, v_place, v_capacity
  from public.polls po
  join public.posts p on p.id = po.post_id
  join public.boards b on b.id = p.board_id
  where po.id = p_poll_id;

  if v_status is null or v_status not in ('closed_passed', 'closed_rejected', 'closed_invalid') then
    -- poll이 없거나 아직 종료되지 않았다 — 이 함수는 트리거·재시도 스윕에서만 호출되므로
    -- 정상 흐름에서는 도달하지 않지만, 방어적으로 조용히 반환한다(예외로 호출부를 막지 않음).
    return;
  end if;

  -- FR-060 AC1·AC2·AC3 — 가결일 때만, meetups.poll_id UNIQUE로 재실행에도 중복 생성되지
  -- 않는다(멱등). Meetup 생성 실패가 알림 적재를 막지 않도록 별도 블록으로 격리한다.
  if v_result = 'passed' then
    begin
      insert into public.meetups (crew_id, poll_id, title, description, date, start_time, place, capacity)
      values (v_crew_id, p_poll_id, v_post_title, v_post_body, v_meetup_date, v_start_time, v_place, v_capacity)
      on conflict (poll_id) do nothing;
    exception when others then
      raise warning 'poll % Meetup 생성 실패(FR-060): %', p_poll_id, sqlerrm;
    end;
  end if;

  -- FR-045 — 시도 횟수를 먼저 올린다. 성공했을 때만 올리면 계속 실패하는 행이 무한
  -- 재시도되어 NFR-029("실패 시 로그 + 재시도 3회")의 상한이 의미가 없어진다 — 아래
  -- run_poll_auto_close_job의 재시도 스윕이 notify_attempts < 3인 행만 다시 시도한다.
  update public.poll_eligible_voters
  set notify_attempts = notify_attempts + 1
  where poll_id = p_poll_id and notified_at is null;

  begin
    -- D-015 — 강퇴자(status='removed')는 제외한다. 자진 탈퇴자(left)는 그대로 포함된다
    -- (FR-045 AC1 "미투표자는 포함, 강퇴자는 제외").
    insert into public.notifications (recipient_id, type, channel, payload)
    select
      ev.profile_id,
      'poll_closed',
      'in_app',
      jsonb_build_object(
        'pollId', p_poll_id,
        'postId', v_post_id,
        'outcome', v_result,
        'crewId', v_crew_id
      )
    from public.poll_eligible_voters ev
    join public.crew_memberships cm
      on cm.crew_id = v_crew_id and cm.profile_id = ev.profile_id
    where ev.poll_id = p_poll_id
      and ev.notified_at is null
      and cm.status <> 'removed';

    -- 이 poll에 대해 아직 notified_at이 없던 행 전부를 여기서 확정한다 — 방금 알림을 받은
    -- 사람(위 INSERT 대상)과 D-015로 제외된 강퇴자(위 INSERT 대상이 아니었던 사람) 모두
    -- 포함한다. 강퇴자도 "다시 재시도할 대상이 아님"으로 확정해야 재시도 스윕이 그들을
    -- 계속 붙잡지 않는다.
    update public.poll_eligible_voters
    set notified_at = now()
    where poll_id = p_poll_id and notified_at is null;
  exception when others then
    raise warning 'poll % 알림 적재 실패(FR-045, 시도 횟수는 기록됨): %', p_poll_id, sqlerrm;
  end;
end;
$$;

comment on function public.finalize_closed_poll(uuid) is
  'Task 034 — FR-060(가결 시 Meetup 생성, 멱등)·FR-045(종료 알림 적재, D-015 강퇴자 제외). '
  'polls AFTER UPDATE 트리거(trg_finalize_closed_poll)와 run_poll_auto_close_job의 재시도 '
  '스윕이 호출한다. 여러 번 호출해도 안전(멱등) — ON CONFLICT + notified_at IS NULL 가드.';

revoke execute on function public.finalize_closed_poll(uuid) from public, anon, authenticated;
grant execute on function public.finalize_closed_poll(uuid) to postgres, service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 2) polls AFTER UPDATE 트리거 — open→closed_* 전이마다 finalize를 부른다
--    (트리거①②③ 전부 이 슬롯을 공유한다 — R-015: Meetup·알림 로직은 한 벌뿐)
-- ────────────────────────────────────────────────────────────────────────
create or replace function public.trg_finalize_closed_poll()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- finalize_closed_poll의 실패가 이 UPDATE(=poll 종료 그 자체)를 되돌리면 안 된다 —
  -- I-049와 같은 원칙("이미 성공한 주 행위는 부속 작업 실패로 뒤집지 않는다"). 예외는
  -- 여기서 흡수하고 WARNING으로만 남긴다(get_logs로 조회 가능, NFR-029 "실패 감지").
  begin
    perform public.finalize_closed_poll(new.id);
  exception when others then
    raise warning 'poll % 종료 후속 처리 트리거 실패: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

comment on function public.trg_finalize_closed_poll() is
  'Task 034 — polls.status가 open에서 closed_*로 바뀔 때마다 발동. closePoll()(TS, 트리거②③)과 '
  'run_poll_auto_close_job(트리거①) 양쪽의 UPDATE가 전부 이 트리거를 탄다 — Meetup·알림 로직이 '
  '한 곳(finalize_closed_poll)에만 있게 하는 지점(R-015). 실패해도 poll 종료 자체는 되돌리지 않는다.';

drop trigger if exists trg_polls_finalize_closed_poll on public.polls;
create trigger trg_polls_finalize_closed_poll
  after update on public.polls
  for each row
  when (old.status = 'open' and new.status in ('closed_passed', 'closed_rejected', 'closed_invalid'))
  execute function public.trg_finalize_closed_poll();

revoke execute on function public.trg_finalize_closed_poll() from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 3) public.run_poll_auto_close_job — pg_cron 잡 본체(트리거①, 트리거③ 백스톱)
-- ────────────────────────────────────────────────────────────────────────
create or replace function public.run_poll_auto_close_job(
  batch_size integer default 200,
  max_duration interval default interval '4 minutes'
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  started_at timestamptz := clock_timestamp();
  v_poll record;
  v_eligible_count integer;
  v_participant_count integer;
  v_for_count integer;
  v_against_count integer;
  v_required integer;
  v_outcome text;
  v_status text;
  v_closed_count bigint := 0;
begin
  -- CON-10 방어선: 잡당 10분 이내(D-027). 5분 주기(cron.schedule 표현식)로 도니 여유 있게
  -- 4분으로 잡는다 — chat purge(9min)·anonymize(1min) 잡보다 짧게, 그 두 잡과 마찬가지로
  -- 이중 방어(루프 자체 예산 + statement_timeout)를 둔다.
  set local statement_timeout = '4min';

  -- ── D-003 트리거① (기한 도래) + 트리거③ 백스톱 (D-022, write-path-realdata-032.md §8) ──
  -- 트리거③은 원래 cast-vote.ts(TS)가 투표 직후 동기 체크로 처리하지만, 마지막 투표자가
  -- 임원이 아니면 closePoll의 RLS(polls_update_proposal_author_or_staff)가 조용히 0행을
  -- 반환해 poll이 open으로 남는 known gap이 있다(I-049 문맥, write-path-realdata-032.md §8
  -- "Task 034가 service-role 기반 종료 경로를 만들 때 함께 재검토할 것을 권한다"). 이 잡이
  -- 그 인계를 해소한다 — SECURITY INVOKER로 postgres 권한(rolbypassrls)으로 실행되므로 그
  -- RLS 제약에 걸리지 않는다.
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
      -- 정족수 분모(D-003) — 강퇴자만 제외, 자진 탈퇴자는 포함
      -- (src/lib/rules/poll-eligibility.ts의 countQuorumEligibleVoters와 동일 필터).
      select count(*) into v_eligible_count
      from public.poll_eligible_voters ev
      join public.crew_memberships cm
        on cm.crew_id = v_poll.crew_id and cm.profile_id = ev.profile_id
      where ev.poll_id = v_poll.id and cm.status <> 'removed';

      -- 집계(무효화 표 제외) — src/lib/rules/quorum.ts의 countVotedForQuorum과 동일하게
      -- 기권도 참여자 수에 포함한다.
      select
        count(*),
        count(*) filter (where choice = 'for'),
        count(*) filter (where choice = 'against')
        into v_participant_count, v_for_count, v_against_count
      from public.poll_votes
      where poll_id = v_poll.id and not invalidated;

      -- D-032: ceil, floor 아님.
      v_required := ceil(v_eligible_count / 3.0);

      -- D-003: 정족수 미달→invalid, 동수→rejected, 찬성>반대→passed, 그 외→rejected
      -- (src/lib/rules/poll-decision.ts의 decidePollOutcome과 동일 분기).
      if v_participant_count < v_required then
        v_outcome := 'invalid';
      elsif v_for_count = v_against_count then
        v_outcome := 'rejected';
      elsif v_for_count > v_against_count then
        v_outcome := 'passed';
      else
        v_outcome := 'rejected';
      end if;

      v_status := case v_outcome
        when 'passed' then 'closed_passed'
        when 'rejected' then 'closed_rejected'
        else 'closed_invalid'
      end;

      -- closed_by는 null(D-035 — 자동 종료엔 human actor가 없다, decideAndClosePoll의
      -- 트리거①③ 호출부와 동일 규약). 이 UPDATE가 trg_finalize_closed_poll을 같은
      -- 트랜잭션 안에서 발동시킨다(I-054 회피 — 추가 왕복 없음).
      update public.polls
      set status = v_status, result = v_outcome, decided_at = now(), closed_by = null
      where id = v_poll.id and status = 'open';

      if found then
        v_closed_count := v_closed_count + 1;
      end if;
    exception when others then
      raise warning 'poll % 자동 종료 실패(트리거①/③): %', v_poll.id, sqlerrm;
    end;

    exit when clock_timestamp() - started_at > max_duration;
  end loop;

  -- ── 재시도 스윕 (NFR-029 "실패 시 로그 + 재시도 3회") ───────────────────────────
  -- 이미 닫혔지만(트리거①②③ 무엇으로든) finalize가 처음에 실패해 Meetup·알림이 아직
  -- 미완인 poll을 다시 시도한다. notify_attempts는 finalize_closed_poll이 시도할 때마다
  -- (성공/실패 무관) 올라가므로 3회를 넘기면 더 시도하지 않고 WARNING만 남긴다.
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

  -- 3회를 넘기고도 여전히 안 된 것은 눈에 띄게 남긴다(정직한 "포기 기록" — NFR-029 "실패
  -- 감지"). 이 이상의 자동 복구는 이번 회차 범위 밖 — 운영자가 get_logs로 확인해야 한다.
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
  'Task 034 — FR-043 트리거①(마감 도래) 자동 종료 + 트리거③ 백스톱(D-022, write-path-realdata-032.md §8 인계) + finalize_closed_poll 재시도 스윕(NFR-029). '
  'D-003·D-032 판정 공식은 src/lib/rules/quorum.ts·poll-decision.ts와 동일해야 한다(SQL 미러 — pg_cron은 TS를 호출할 수 없다, PRD-validation.md). '
  'CON-10 — 배치 루프(4min) + statement_timeout(4min) 이중 방어. search_path 고정.';

revoke execute on function public.run_poll_auto_close_job(integer, interval) from public, anon, authenticated;
grant execute on function public.run_poll_auto_close_job(integer, interval) to postgres, service_role;

-- 5분마다 실행 — FR-043 AC4가 "자동 종료 작업 5분 지연"을 정상 시나리오로 규정하는 것과
-- 정확히 일치하는 주기다. 기존 3개 잡(18:00·18:30·19:00 UTC 1일 1회)과 스케줄 형태가 달라
-- 같은 "시각"에 겹칠 걱정은 없다 — 동시 등록 잡 수는 이제 5개(기존 4개 + 이 잡)로 D-027의
-- "동시 잡 8개 이내" 안에 있다.
select cron.unschedule('poll_auto_close_and_finalize')
where exists (select 1 from cron.job where jobname = 'poll_auto_close_and_finalize');

select cron.schedule(
  'poll_auto_close_and_finalize',
  '*/5 * * * *',
  $$select public.run_poll_auto_close_job();$$
);
