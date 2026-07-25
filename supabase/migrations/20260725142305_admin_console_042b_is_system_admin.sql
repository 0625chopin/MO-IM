-- Task 042B (FR-082) — 관리자 콘솔 착수. 029A §7.5·029B §8이 "새 결정 필요"로 이월한
-- system_admin 식별 문제를 해소한다. 근거: docs/decisions/admin-console-042b.md (D-049).
--
-- 컬럼 단위 자가 승격을 막아야 한다: profiles_update_self RLS(id = auth.uid())는 행 단위만
-- 제한하고 컬럼을 제한하지 않으므로, is_system_admin을 그냥 컬럼만 추가하면 인증된 사용자가
-- 자기 행에 대해 `update profiles set is_system_admin = true`를 스스로 성공시킬 수 있다.
-- profiles_guard_self_status_transition 트리거(029A, Task 039가 이미 한 번 확장)가 그 방어를
-- 맡는다 — auth.uid() = old.id(본인이 자기 행을 고치는 경우)일 때만 이 컬럼 변경을 거부한다.

alter table public.profiles
  add column is_system_admin boolean not null default false;

comment on column public.profiles.is_system_admin is
  'FR-082 시스템 관리자 식별(D-049, Task 042B). self-service 변경 불가 — profiles_guard_self_status_transition 트리거가 auth.uid()=old.id 컨텍스트에서 이 컬럼 변경을 차단한다(RLS profiles_update_self는 행 단위만 제한하므로 컬럼 단위 방어는 트리거 몫). service_role 또는 이 마이그레이션 같은 직접 SQL로만 변경한다 — 자가 승격을 막는 것이 목적이라 셀프서비스 RPC/UI를 두지 않는다.';

create or replace function public.profiles_guard_self_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() = old.id then
    if new.is_system_admin is distinct from old.is_system_admin then
      raise exception 'self profile updates may not change is_system_admin (FR-082, D-049)';
    end if;
    if new.status is distinct from old.status then
      if old.status = 'active' and new.status = 'deactivated' then
        return new;
      end if;
      if old.status = 'deactivated' and new.status = 'active'
         and old.deactivated_at is not null
         and now() - old.deactivated_at <= interval '30 days' then
        return new;
      end if;
      raise exception 'self profile updates may only transition active<->deactivated within the 30-day grace window (FR-005)';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.profiles_guard_self_status_transition() is
  'Task 042B 확장 — is_system_admin 자가 변경 차단(D-049) + 본인 상태 전이는 active<->deactivated(30일 유예)로 제한(Task 039). 관리자 제재(status->suspended)·관리자 승격은 auth.uid()<>old.id(서비스 경로) 조건 밖이라 이 트리거의 대상이 아니다.';

-- 부트스트랩 — 셀프서비스 경로가 없으므로(위 트리거가 의도적으로 막는다) 최초 관리자 지정은
-- 이 마이그레이션의 직접 UPDATE로 한다. 실 계정 2개 중 세션 사용자 본인 계정
-- (0625chopin@gmail.com, docs/decisions/auth-integration-030.md §6)을 관리자로 지정해
-- 실제 로그인으로 /admin을 검증할 수 있게 한다 — docs/decisions/admin-console-042b.md에 근거를
-- 남긴다.
update public.profiles
set is_system_admin = true
where id = 'fb70ff1c-3736-44ee-a4a3-96993a3c62ed';
