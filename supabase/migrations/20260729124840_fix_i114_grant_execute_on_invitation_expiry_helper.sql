-- 직전 마이그레이션(major_fix_i114_...)의 실수 수정. `private.has_valid_pending_invitation`은
-- SECURITY INVOKER인 `crew_memberships_guard_self_transition` 트리거 함수 안에서 호출된다 —
-- 그 트리거는 실행자(anon/authenticated)의 권한으로 돌아가므로, 이 함수를 다른 `private.*`
-- 트리거 전용 헬퍼(`trg_*`에서만 불리는 SECURITY DEFINER 함수)와 같은 "client EXECUTE 회수"
-- 관용구로 처리하면 안 된다 — `private.owns_active_crew`·`private.my_crew_role`처럼 같은
-- 트리거가 호출하는 다른 헬퍼들은 EXECUTE가 열려 있다(스키마 설계 원본,
-- rls_private_schema_and_helpers.sql). 방금 REVOKE ALL로 이 차이를 놓쳐 정당 경로까지
-- "permission denied for function"으로 막았던 것을 실측(만료 O·X 양쪽 다 invited에서 멈춤)으로
-- 발견해 즉시 되돌린다.
grant execute on function private.has_valid_pending_invitation(uuid, uuid) to authenticated, anon;
