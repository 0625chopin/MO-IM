-- Task 029A: crew_memberships_guard_self_transition 재수정
--
-- auth.uid() = new.profile_id 로 "본인 self-service"를 판별했더니, 오너 이양
-- (crews_sync_membership_on_owner_transfer) 부수효과로 "기존 오너 자신의 행을
-- owner->staff로 강등"할 때도 이 조건이 참이 되어(행위자=기존 오너, 대상 행도
-- 기존 오너 소유) role 변경이 막히는 버그를 실측(트랜잭션 롤백 검증)에서 발견했다.
--
-- pg_trigger_depth()로 대체한다 — 이 UPDATE가 클라이언트가 crew_memberships를
-- 직접 친 것(depth<=1)인지, crews/invitations/join_requests의 신뢰된 부수효과
-- 트리거 안에서 중첩 호출된 것(depth>1)인지를 구조적으로 구분한다. 후자는 이미
-- 상위 테이블의 RLS가 인가를 마쳤으므로 self-service 제약을 적용하지 않는다.
-- 이 판별은 auth.uid()와 달리 클라이언트가 조작할 수 없다(실제 호출 스택 깊이이지
-- 세션 설정값이 아니다).
create or replace function public.crew_memberships_guard_self_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_trigger_depth() <= 1 then
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
  'Task 029A(재수정) — pg_trigger_depth()<=1(클라이언트 직접 UPDATE)일 때만 self-service 전이 규칙을 강제. depth>1(신뢰된 부수효과 트리거 경유)은 통과.';
