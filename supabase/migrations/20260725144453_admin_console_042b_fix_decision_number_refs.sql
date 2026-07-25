-- Task 042B 후속(같은 회차) — D-048은 이미 CORE가 오늘(21일차) Meetup 403 결정에 썼다
-- (docs/prioritization-and-risks.md). 이 프로젝트에서 코멘트로 남긴 D-048 참조 2건을
-- 실제로 등재하는 결정 번호 D-049(system_admin 식별)로 정정한다. 로직은 무변경 — 코멘트만.
comment on column public.profiles.is_system_admin is
  'FR-082 시스템 관리자 식별(D-049, Task 042B). self-service 변경 불가 — profiles_guard_self_status_transition 트리거가 auth.uid()=old.id 컨텍스트에서 이 컬럼 변경을 차단한다(RLS profiles_update_self는 행 단위만 제한하므로 컬럼 단위 방어는 트리거 몫). service_role 또는 이 마이그레이션 같은 직접 SQL로만 변경한다 — 자가 승격을 막는 것이 목적이라 셀프서비스 RPC/UI를 두지 않는다.';

comment on function public.profiles_guard_self_status_transition() is
  'Task 042B 확장 — is_system_admin 자가 변경 차단(D-049) + 본인 상태 전이는 active<->deactivated(30일 유예)로 제한(Task 039). 관리자 제재(status->suspended)·관리자 승격은 auth.uid()<>old.id(서비스 경로) 조건 밖이라 이 트리거의 대상이 아니다.';
