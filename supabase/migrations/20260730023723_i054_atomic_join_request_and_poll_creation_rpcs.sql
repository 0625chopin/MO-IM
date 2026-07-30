-- I-054 (CORE, 28일차) — createJoinRequest·createPoll을 각각 여러 PostgREST 호출(=여러 개의
-- 독립 트랜잭션)로 쪼개 실행하던 것을 respond_meetup_attendance와 같은 패턴(029B 2단 구조:
-- private.* SECURITY DEFINER 실구현 + public.* SECURITY INVOKER 얇은 래퍼)의 단일 RPC로
-- 옮긴다. 두 번째 이후 INSERT가 실패해도 첫 INSERT만 커밋되는 부분 커밋을 없앤다(I-054,
-- docs/ISSUES.md). 실패는 예외가 아니라 반환값(ok, reason_code)으로 알린다 — 27일차
-- 팀장이 예외 기반 자기반증에서 전부 "NO ERROR"로 오판했던 전례(admin_grant_revoke_
-- rpcs_075) 때문에 이 관례를 이 함수들에도 명시적으로 적용한다.
--
-- RLS는 이 두 함수 내부에서 완전히 우회된다(SECURITY DEFINER, postgres 소유) — 지금까지
-- join_requests_insert_self_public_crew·polls_insert_proposal_author RLS와
-- crew_memberships_guard_self_insert_request·poll_eligible_voters_guard_insert_scope BEFORE
-- INSERT 트리거가 나눠 강제하던 불변식(크루 공개·활성 여부, 제안글 작성자, 대상자 스코프)
-- 중 RLS가 맡던 부분을 이 함수들이 명시적으로 재검사한다 — 트리거는 여전히 그대로 걸리므로
-- (BEFORE INSERT는 RLS 우회와 무관하게 항상 실행된다) 이중 방어가 유지된다.
--
-- D-065(I-102·I-103)는 "정당한 생성 경로가 클라이언트 직접 INSERT일 때는 REVOKE 대신
-- BEFORE 트리거를 쓴다"였다 — 이 마이그레이션은 그 전제 자체를 바꾼다: 이제부터 정당한
-- 생성 경로는 이 RPC뿐이므로, join_requests/crew_memberships(INSERT만)/polls/
-- poll_eligible_voters의 client INSERT GRANT를 D-064(meetups) 패턴대로 회수한다. 기존
-- BEFORE INSERT 트리거(I-102·I-103·I-120)는 남겨 둔다 — RPC 자신의 INSERT도 그 트리거를
-- 통과해야 하므로 방어 종심으로 그대로 유효하다.

-- ============================================================================
-- 1. create_join_request — FR-022 가입 신청 + 정상 흐름③ crew_memberships 프로비저닝
-- ============================================================================

create or replace function private.create_join_request(p_crew_id uuid, p_message text default null)
returns table(
  ok boolean,
  reason_code text,
  id uuid,
  crew_id uuid,
  requester_id uuid,
  message text,
  status text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requester uuid := (select auth.uid());
  v_visibility text;
  v_crew_status text;
  v_membership_status text;
  v_row public.join_requests%rowtype;
begin
  if v_requester is null then
    return query select false, 'forbidden'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  select visibility, status into v_visibility, v_crew_status
  from public.crews
  where id = p_crew_id;

  if v_visibility is null then
    return query select false, 'not_found'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_visibility <> 'public' or v_crew_status <> 'active' then
    -- join_requests_insert_self_public_crew RLS가 지금까지 강제하던 불변식(D-007 E1,
    -- FR-022 사전조건) — RLS가 우회되는 이 함수 안에서 명시적으로 재확인한다.
    return query select false, 'forbidden'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  select status into v_membership_status
  from public.crew_memberships
  where crew_id = p_crew_id and profile_id = v_requester
  for update;

  if v_membership_status = 'removed' then
    -- FR-022 E3/FR-027 AC2 — 강퇴 이력은 재신청을 막는다(해제는 오너 전용, FR-027 E3).
    -- crew_memberships_guard_self_transition도 removed->requested 자기 전이를 막지만
    -- (교차검증 MAJOR #6), 여기서 먼저 걸러 트리거 예외 대신 이 함수의 정상 반환값으로
    -- 실패를 알린다.
    return query select false, 'forbidden'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  if exists (
    select 1 from public.join_requests
    where crew_id = p_crew_id and requester_id = v_requester and status = 'pending'
  ) then
    return query select false, 'conflict'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  begin
    insert into public.join_requests (crew_id, requester_id, message)
    values (p_crew_id, v_requester, p_message)
    returning * into v_row;
  exception when unique_violation then
    -- uq_join_requests_pending_crew_requester — 위 exists 검사는 check-then-act이라
    -- 동시 요청 경합이 남는다. 유니크 제약이 그 레이스의 마지막 방어선이다.
    return query select false, 'conflict'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end;

  if v_membership_status is null then
    insert into public.crew_memberships (crew_id, profile_id, role, status)
    values (p_crew_id, v_requester, 'member', 'requested');
  elsif v_membership_status in ('declined', 'rejected', 'left') then
    update public.crew_memberships
    set role = 'member', status = 'requested', removed_reason = null
    where crew_id = p_crew_id and profile_id = v_requester;
  end if;
  -- else(active/invited/requested): 호출자(evaluateJoinRequestEligibility)가 먼저 걸렀어야
  -- 하는 상태다. join_requests 행은 이미 만들었으니 조용히 건너뛴다(기존 join-request.ts
  -- docstring과 동일 원칙).

  return query select true, null::text,
    v_row.id, v_row.crew_id, v_row.requester_id, v_row.message, v_row.status,
    v_row.decided_by, v_row.decided_at, v_row.created_at;
end;
$function$;

comment on function private.create_join_request(uuid, text) is
  'I-054 — FR-022 가입 신청 + 정상 흐름③(crew_memberships requested 프로비저닝)을 단일 트랜잭션으로 묶는다. 실패는 reason_code(forbidden·not_found·conflict)로 반환, 예외를 던지지 않는다.';

revoke all on function private.create_join_request(uuid, text) from public, anon, authenticated;
grant execute on function private.create_join_request(uuid, text) to authenticated;

create or replace function public.create_join_request(p_crew_id uuid, p_message text default null)
returns table(
  ok boolean,
  reason_code text,
  id uuid,
  crew_id uuid,
  requester_id uuid,
  message text,
  status text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_join_request(p_crew_id, p_message)
$$;

comment on function public.create_join_request(uuid, text) is
  'I-054 — 029B 2단 구조의 public INVOKER 얇은 래퍼. 실제 로직은 private.create_join_request.';

revoke all on function public.create_join_request(uuid, text) from public, anon, authenticated;
grant execute on function public.create_join_request(uuid, text) to authenticated;

-- ============================================================================
-- 2. create_poll — FR-040 찬반 투표 생성 + D-025 대상자 스냅샷을 단일 트랜잭션으로
-- ============================================================================

create or replace function private.create_poll(
  p_post_id uuid,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_eligible_voter_ids jsonb default '[]'::jsonb
)
returns table(
  ok boolean,
  reason_code text,
  id uuid,
  post_id uuid,
  opens_at timestamptz,
  closes_at timestamptz,
  status text,
  closed_by uuid,
  result text,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller uuid := (select auth.uid());
  v_author_id uuid;
  v_post_type text;
  v_row public.polls%rowtype;
begin
  if v_caller is null then
    return query select false, 'forbidden'::text,
      null::uuid, null::uuid, null::timestamptz, null::timestamptz, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select author_id, type into v_author_id, v_post_type
  from public.posts
  where id = p_post_id;

  if v_author_id is null then
    return query select false, 'not_found'::text,
      null::uuid, null::uuid, null::timestamptz, null::timestamptz, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if v_author_id <> v_caller or v_post_type not in ('meetup_proposal', 'meetup_reschedule_proposal') then
    -- polls_insert_proposal_author RLS가 지금까지 강제하던 불변식(FR-034 정상 흐름④,
    -- I-079/FR-065 AC2 확장) — RLS가 우회되는 이 함수 안에서 명시적으로 재확인한다.
    return query select false, 'forbidden'::text,
      null::uuid, null::uuid, null::timestamptz, null::timestamptz, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  begin
    insert into public.polls (post_id, opens_at, closes_at)
    values (p_post_id, p_opens_at, p_closes_at)
    returning * into v_row;
  exception when unique_violation then
    -- polls.post_id UNIQUE(Post 1:1) — 같은 글에 투표가 이미 있다.
    return query select false, 'conflict'::text,
      null::uuid, null::uuid, null::timestamptz, null::timestamptz, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end;

  insert into public.poll_eligible_voters (poll_id, profile_id)
  select v_row.id, elem::uuid
  from jsonb_array_elements_text(coalesce(p_eligible_voter_ids, '[]'::jsonb)) as elem;
  -- poll_eligible_voters_guard_insert_scope(BEFORE INSERT, I-103)가 각 profile_id에 대해
  -- "이 poll이 속한 크루의 활성 멤버인지"·"poll이 아직 open인지"를 여전히 재검증한다 — RLS
  -- 우회와 무관하게 트리거는 항상 실행되므로 그 방어선은 이 RPC로 옮긴 뒤에도 유효하다.
  -- 대상자 중 하나라도 그 조건을 어기면 예외가 이 함수 전체를 롤백한다 — 이전(client 직접
  -- 다단 INSERT)에는 없던 원자성 개선이다(그때는 polls 행만 커밋된 채 남을 수 있었다).

  return query select true, null::text,
    v_row.id, v_row.post_id, v_row.opens_at, v_row.closes_at, v_row.status,
    v_row.closed_by, v_row.result, v_row.decided_at;
end;
$function$;

comment on function private.create_poll(uuid, timestamptz, timestamptz, jsonb) is
  'I-054 — FR-040 투표 생성 + D-025 대상자 스냅샷(poll_eligible_voters)을 단일 트랜잭션으로 묶는다. 실패는 reason_code(forbidden·not_found·conflict)로 반환, 예외를 던지지 않는다. p_eligible_voter_ids는 uuid 문자열의 jsonb 배열(PostgREST RPC 배열 파라미터 대신 jsonb로 받아 jsonb_array_elements_text로 unnest — 이 프로젝트에 uuid[] RPC 파라미터 선례가 없어 검증된 jsonb 관례를 그대로 쓴다).';

revoke all on function private.create_poll(uuid, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function private.create_poll(uuid, timestamptz, timestamptz, jsonb) to authenticated;

create or replace function public.create_poll(
  p_post_id uuid,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_eligible_voter_ids jsonb default '[]'::jsonb
)
returns table(
  ok boolean,
  reason_code text,
  id uuid,
  post_id uuid,
  opens_at timestamptz,
  closes_at timestamptz,
  status text,
  closed_by uuid,
  result text,
  decided_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_poll(p_post_id, p_opens_at, p_closes_at, p_eligible_voter_ids)
$$;

comment on function public.create_poll(uuid, timestamptz, timestamptz, jsonb) is
  'I-054 — 029B 2단 구조의 public INVOKER 얇은 래퍼. 실제 로직은 private.create_poll.';

revoke all on function public.create_poll(uuid, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.create_poll(uuid, timestamptz, timestamptz, jsonb) to authenticated;

-- ============================================================================
-- 3. 이제 정당한 생성 경로가 위 RPC뿐이다(D-065 전제 변경) — client 직접 INSERT GRANT를
--    회수하고 그 경로만 노렸던 RLS INSERT 정책을 지운다(D-064 meetups 패턴, I-090과 동일
--    이유: 살아 있는 정책처럼 보이는 죽은 방어는 오독을 부른다).
-- ============================================================================

revoke insert on public.join_requests from anon, authenticated;
drop policy if exists "join_requests_insert_self_public_crew" on public.join_requests;

revoke insert on public.crew_memberships from anon, authenticated;
drop policy if exists "crew_memberships_insert_self_request" on public.crew_memberships;

revoke insert on public.polls from anon, authenticated;
drop policy if exists "polls_insert_proposal_author" on public.polls;

revoke insert on public.poll_eligible_voters from anon, authenticated;
drop policy if exists "poll_eligible_voters_insert_proposal_author_or_staff" on public.poll_eligible_voters;

comment on table public.join_requests is
  'PRD §7 JoinRequest. I-054(28일차) 수정 — INSERT 권한을 anon·authenticated에서 회수했다. 가입 신청(FR-022)은 create_join_request(SECURITY DEFINER) RPC로만 가능하다 — 그 RPC가 join_requests INSERT + crew_memberships 프로비저닝을 단일 트랜잭션으로 묶는다. UPDATE(승인·반려·철회)는 그대로 열려 있다(decideJoinRequest·withdrawJoinRequest 무변경).';

comment on table public.polls is
  'PRD §7 Poll. quorumRatio 컬럼 없음(D-032 — 1/3 고정, ceil(대상/3)은 lib/rules 순수 함수 몫). I-054(28일차) 수정 — INSERT 권한을 anon·authenticated에서 회수했다. 투표 생성(FR-040)은 create_poll(SECURITY DEFINER) RPC로만 가능하다 — 그 RPC가 polls INSERT + poll_eligible_voters 스냅샷을 단일 트랜잭션으로 묶는다. UPDATE(조기 종료·철회)는 그대로 열려 있다.';

comment on table public.crew_memberships is
  'PRD §7 CrewMembership. 자연 복합키(crewId, profileId) — 도메인 타입에 id 없음. I-054(28일차) 수정 — self-service INSERT(가입 신청 프로비저닝) 권한을 anon·authenticated에서 회수했다. 이제 create_join_request RPC만 이 테이블에 INSERT한다(크루 개설·초대 프로비저닝은 여전히 postgres 소유 트리거를 통해 REVOKE와 무관하게 동작). UPDATE(임원 임명·강퇴·탈퇴 등)는 그대로 열려 있다.';

comment on table public.poll_eligible_voters is
  'PRD §7 PollEligibleVoter(D-025). 스냅샷 고정 — 생성 후 행 삭제/추가 없음(정족수 분모 불변). I-054(28일차) 수정 — INSERT 권한을 anon·authenticated에서 회수했다. 스냅샷 생성은 create_poll RPC로만 가능하다.';
