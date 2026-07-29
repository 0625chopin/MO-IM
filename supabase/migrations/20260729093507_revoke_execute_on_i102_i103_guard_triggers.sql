-- get_advisors(security)가 신규 WARN 2건을 잡았다: 이번에 만든 두 BEFORE INSERT 트리거
-- 함수(crew_memberships_guard_self_insert_request·poll_eligible_voters_guard_insert_scope)가
-- SECURITY DEFINER인데 public 스키마에 있어 anon·authenticated가 RPC로 직접 호출할 수
-- 있었다(/rest/v1/rpc/...) — Task 040 disband_crew·20260725005356 마이그레이션과 동일한
-- 패턴. 트리거 실행 자체는 EXECUTE 권한 검사 대상이 아니므로(실행기가 내부적으로
-- 호출) EXECUTE만 회수해도 트리거 동작에는 영향이 없다.
revoke execute on function public.crew_memberships_guard_self_insert_request() from public, anon, authenticated;
revoke execute on function public.poll_eligible_voters_guard_insert_scope() from public, anon, authenticated;
