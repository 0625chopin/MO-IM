-- I-141 (CORE, 29일차) — withdrawJoinRequest(FR-022 E4, 자진 철회)가 join_requests UPDATE와
-- crew_memberships UPDATE를 별도 PostgREST 호출(=별도 트랜잭션) 두 개로 실행해, 두 번째 쓰기가
-- 실패하면 join_requests='withdrawn' / crew_memberships='requested'로 어긋난 상태가 영구
-- 고아로 남았다(I-054와 같은 클래스, docs/ISSUES.md I-141). I-054와 동일한 029B 2단 구조
-- (private.* SECURITY DEFINER 실구현 + public.* SECURITY INVOKER 얇은 래퍼)로 단일 RPC를
-- 신설해 두 UPDATE를 한 트랜잭션에 묶는다. I-054 자기반증에서 발견된 42702(OUT 파라미터-
-- 컬럼명 충돌)를 재발시키지 않도록 함수 본문의 모든 바닥 컬럼 참조를 테이블 별칭으로 처음부터
-- 명시 한정한다.

create or replace function private.withdraw_join_request(p_id uuid)
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
  v_row public.join_requests%rowtype;
begin
  if v_requester is null then
    return query select false, 'forbidden'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  update public.join_requests jr
  set status = 'withdrawn'
  where jr.id = p_id
    and jr.requester_id = v_requester
    and jr.status = 'pending'
  returning jr.* into v_row;

  if v_row.id is null then
    return query select false, 'not_found'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- join_requests_sync_membership_on_decision(AFTER UPDATE)은 status='approved'/'rejected'만
  -- 처리한다 — 'withdrawn' 전이는 대상이 아니라서 이 함수가 crew_memberships를 직접 되돌린다
  -- (기존 join-request.ts docstring과 동일 이유, requested->rejected로 I-039 근사). 이 UPDATE는
  -- 예외 핸들러로 감싸지 않는다 — 여기서 실패가 나면 위 join_requests UPDATE까지 통째로
  -- 롤백돼야 하는데, plpgsql BEGIN..EXCEPTION은 savepoint를 만들어 핸들러가 잡고 계속
  -- 진행하면 그 앞의 쓰기가 살아남는다(28일차 팀장 검증 논거, i054-atomic-write-rpcs.md).
  -- 핸들러를 아예 두지 않아 예외가 그대로 전파되고 함수 전체(=이 RPC 호출 전체 트랜잭션)가
  -- 롤백되게 한다.
  update public.crew_memberships cm
  set status = 'rejected'
  where cm.crew_id = v_row.crew_id
    and cm.profile_id = v_requester
    and cm.status = 'requested';

  return query select true, null::text,
    v_row.id, v_row.crew_id, v_row.requester_id, v_row.message, v_row.status,
    v_row.decided_by, v_row.decided_at, v_row.created_at;
end;
$function$;

comment on function private.withdraw_join_request(uuid) is
  'I-141 — FR-022 E4 가입 신청 자진 철회 + crew_memberships 되돌리기(requested->rejected)를 단일 트랜잭션으로 묶는다. 실패는 reason_code(forbidden·not_found)로 반환, 예외를 던지지 않는다.';

revoke all on function private.withdraw_join_request(uuid) from public, anon, authenticated;
grant execute on function private.withdraw_join_request(uuid) to authenticated;

create or replace function public.withdraw_join_request(p_id uuid)
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
  select * from private.withdraw_join_request(p_id)
$$;

comment on function public.withdraw_join_request(uuid) is
  'I-141 — 029B 2단 구조의 public INVOKER 얇은 래퍼. 실제 로직은 private.withdraw_join_request.';

revoke all on function public.withdraw_join_request(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_join_request(uuid) to authenticated;

-- ============================================================================
-- join_requests_update_requester_or_staff RLS 정책 narrowing: 신청자 본인의 직접 UPDATE
-- (status='withdrawn') 분기를 완전히 제거한다. I-141 수정 후 정당한 철회 경로는 위 RPC
-- (SECURITY DEFINER, RLS 우회) 하나뿐이다 — 이 분기를 남겨 두면 클라이언트가 여전히
-- PostgREST로 join_requests만 직접 UPDATE(withdrawn)하고 crew_memberships는 건드리지 않는
-- 비원자적 2단 쓰기를 재현할 수 있어, 바로 이 이슈가 고치려는 결함을 클라이언트가 그대로
-- 되살릴 수 있는 잔존 표면이 된다(I-054가 INSERT GRANT를 회수한 것과 같은 근거 — D-064
-- 패턴, 정당 경로가 client 직접 UPDATE에서 서버 RPC 단독으로 바뀌었다). staff/owner의
-- 승인·반려(FR-023, decideJoinRequest) 분기는 그대로 둔다 — 그 경로는 이 이슈와 무관하다.
-- 정책 개수는 1개로 불변(narrowing만, drop 후 같은 이름으로 재생성 — I-085와 같은 관례).
-- ============================================================================

drop policy if exists join_requests_update_requester_or_staff on public.join_requests;

create policy join_requests_update_requester_or_staff
  on public.join_requests
  for update
  to authenticated
  using (
    crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid())
        and cm.status = 'active'
        and cm.role = any (array['staff', 'owner'])
    )
  )
  with check (
    crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid())
        and cm.status = 'active'
        and cm.role = any (array['staff', 'owner'])
    )
  );

comment on policy join_requests_update_requester_or_staff on public.join_requests is
  'I-141(29일차) 수정 — self-service(requester_id=self) 분기를 완전히 제거했다. FR-022 E4 자진 철회의 정당 경로가 withdraw_join_request RPC(SECURITY DEFINER, RLS 우회) 단독으로 바뀌어(D-064/I-054와 동일 근거), 신청자 본인의 직접 UPDATE(status=''withdrawn'')를 허용하던 I-085의 WITH CHECK 분기가 이제 위험한 잔존 표면이 됐다 — 남겨 두면 클라이언트가 join_requests만 직접 UPDATE하고 crew_memberships는 건드리지 않는 비원자적 2단 쓰기를 재현할 수 있었다. approved/rejected(FR-023, decideJoinRequest)는 staff/owner 분기로 그대로 가능하다.';
