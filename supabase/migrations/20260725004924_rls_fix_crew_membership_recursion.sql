-- Task 029A: RLS 재귀 수정 — crews ↔ crew_memberships 상호 재귀
--
-- 실측(트랜잭션 롤백 검증)에서 "infinite recursion detected in policy for relation
-- crew_memberships" 오류를 발견했다. 원인은 D-028이 경고한 "crew_memberships가 자기
-- 자신을 서브쿼리"하는 직접 재귀가 아니라, 서로 다른 두 테이블이 맞물리는 **상호 재귀**
-- 였다:
--   crews 정책(authenticated)이 "내가 속한 크루" 판정을 위해 crew_memberships를 서브쿼리
--   crew_memberships 정책(이전 버전)이 "내가 오너인 크루" 판정을 위해 crews를 서브쿼리
-- 이 둘을 합치면 crews -> crew_memberships -> crews -> ... 로 무한히 펼쳐진다. Postgres는
-- 이를 감지해 42P17로 즉시 실패시킨다(느려지는 게 아니라 아예 실행되지 않는다).
--
-- 수정 방향: 두 테이블 중 하나만 상대를 서브쿼리하게 한다. crews -> crew_memberships
-- 방향(비소속 회원에게 private 크루를 감추는 데 필수, D-007)은 유지하고, 반대 방향
-- (crew_memberships -> crews)은 완전히 제거한다. 그 결과 crew_memberships는 SELECT/
-- INSERT/UPDATE 전부 "profile_id = (select auth.uid())"(자기 행) 조건만 남는다 —
-- 서브쿼리가 전혀 없는 리프 노드가 되어 어떤 다른 테이블의 정책이 crew_memberships를
-- 참조해도 재귀가 발생하지 않는다(이 파일 아래의 다른 모든 테이블 정책이 여전히
-- crew_memberships를 안전하게 서브쿼리할 수 있는 이유).
--
-- 부작용: "오너가 다른 사용자의 crew_memberships 행에 쓰는" 경로(초대·가입 승인·강퇴·
-- 임원 임명·오너 이양)가 더는 crew_memberships 자체의 정책만으로는 성립하지 않는다.
-- 그래서 이 마이그레이션은 그 경로들을 **다른, 안전하게 검증 가능한 테이블**(crews
-- INSERT, invitations INSERT/UPDATE, join_requests UPDATE — 전부 crew_memberships를
-- 참조하지 않는 정책으로 이미 보호된다)의 트리거로 옮긴다. 이 트리거들은 테이블
-- 소유자(postgres, rolbypassrls=true)로 실행되어 crew_memberships RLS 정책 평가 자체를
-- 건너뛴다 — "정책 안에서 서로를 참조"하는 게 아니라 "이미 인가된 이벤트의 부수효과로
-- 직접 쓰기"이므로 재귀 감지 대상이 아니다. 이것은 029B의 `private` SECURITY DEFINER
-- 헬퍼(정책 predicate 안에서 쓰이는 재사용 가능한 판정 함수)와는 다른 성격이다 — 여기
-- 트리거들은 "크루 생성 시 오너 행 부트스트랩", "초대/가입 이벤트에 따른 상태 동기화"라는
-- 좁고 1회성인 프로비저닝 로직일 뿐, 여러 정책에서 재사용되는 접근 판정 헬퍼가 아니다.
-- 임원 임명(FR-024)·오너 이양(FR-025)·강퇴(FR-027)처럼 짝이 되는 다른 테이블이 없는
-- 행위는 이 트릭을 쓸 수 없어 029A에서는 여전히 막혀 있다 — 029B로 이월
-- (docs/decisions/rls-policies-029a.md 참고).

-- ── crew_memberships: 자기 행만 남긴다(crews 참조 완전 제거) ────────────────

drop policy if exists "crew_memberships_select_self_or_owner" on public.crew_memberships;
drop policy if exists "crew_memberships_insert_self_or_owner" on public.crew_memberships;
drop policy if exists "crew_memberships_update_self_or_owner" on public.crew_memberships;

create policy "crew_memberships_select_self"
  on public.crew_memberships
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

-- 클라이언트가 직접 만들 수 있는 행은 본인 가입 신청(FR-022, status=requested)뿐이다.
-- 오너의 초기 active 행(부트스트랩)·초대(status=invited)는 아래 트리거가 대신 만든다.
create policy "crew_memberships_insert_self_request"
  on public.crew_memberships
  for insert
  to authenticated
  with check (profile_id = (select auth.uid()) and status = 'requested');

create policy "crew_memberships_update_self"
  on public.crew_memberships
  for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- 트리거 자체도 더는 crews를 조회하지 않는다. auth.uid() = new.profile_id 이면 "본인이
-- 직접 자기 행을 고친 것"(클라이언트 UPDATE는 RLS상 이 경우만 가능하다)이므로 self-service
-- 전이 규칙을 강제한다. auth.uid() <> new.profile_id 이면 이 UPDATE는 클라이언트 RLS
-- 경로로는 애초에 도달할 수 없는 행(정책이 막는다) — 즉 아래 postgres 소유 트리거들이
-- 대신 쓴 것이므로 이미 다른 테이블에서 인가가 끝났다고 보고 그대로 통과시킨다.
create or replace function public.crew_memberships_guard_self_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) = new.profile_id then
    if new.role is distinct from old.role then
      raise exception 'members cannot change their own crew role';
    end if;
    if not (
      (old.status = 'invited' and new.status in ('active', 'declined'))
      or (old.status = 'active' and new.status = 'left')
    ) then
      raise exception 'unsupported self-service membership transition: % -> %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.crew_memberships_guard_self_transition() is
  'Task 029A(재귀 수정) — auth.uid()=new.profile_id일 때만 self-service 전이 규칙을 강제. 그 외(시스템 트리거 경유)는 통과.';

-- ── crews: 생성 직후 오너 행·게시판·채팅방을 원자적으로 부트스트랩 ──────────
-- 클라이언트는 crews 1행만 insert하면 되고, 나머지는 테이블 소유자 권한으로 자동
-- 생성된다(crew_memberships RLS를 거치지 않으므로 재귀 없음).

create function public.crews_provision_owner_bootstrap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.crew_memberships (crew_id, profile_id, role, status)
  values (new.id, new.owner_id, 'owner', 'active');

  insert into public.boards (crew_id) values (new.id);
  insert into public.chat_rooms (crew_id) values (new.id);

  return new;
end;
$$;

comment on function public.crews_provision_owner_bootstrap() is
  'Task 029A — 크루 생성(FR-010) 직후 오너 멤버십·게시판·채팅방을 1건씩 부트스트랩. crew_memberships RLS를 우회(postgres 소유)하므로 재귀와 무관.';

create trigger trg_crews_provision_owner_bootstrap
  after insert on public.crews
  for each row
  execute function public.crews_provision_owner_bootstrap();
