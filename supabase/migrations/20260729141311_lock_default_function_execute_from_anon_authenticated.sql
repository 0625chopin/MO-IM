-- 팀장 결정(25일차) — 함수 기본 EXECUTE 권한을 anon/authenticated에서 잠근다.
-- 근거(permission-baseline.md 관찰에 대한 팀장 판단):
--  1) I-111(24일차)에서 이미 테이블 기본 권한에 이 조치를 했다(ALTER DEFAULT PRIVILEGES로
--     TRUNCATE를 anon/authenticated 기본에서 제외) — 함수만 열어 두면 일관성이 없다.
--  2) 실패 방향이 옳다 — 잠그면 신규 RPC에 GRANT를 빠뜨렸을 때 앱이 42501로 즉시, 시끄럽게
--     깨진다(개발 중 바로 발견). 안 잠그면 REVOKE를 빠뜨렸을 때 조용히 권한이 열린다 —
--     24일차에 실제로 그 조용한 실패(I-114 헬퍼 EXECUTE 회귀)가 났다.
--  3) 기존 함수엔 영향이 없다 — ALTER DEFAULT PRIVILEGES는 이 시점 이후 새로 생성되는
--     객체에만 적용된다. 오늘 시점 public 49개·private 20개 함수는 전부 이미 `postgres`가
--     소유하고 있고(실측 확인, current_user=postgres), 이 문(GRANT)은 그 함수들의 기존
--     ACL을 바꾸지 않는다.
--
-- 대상 롤 확인: 이 마이그레이션은 `postgres`로 실행된다(current_user=postgres, 실측
-- 확인) — 지금까지 모든 함수 생성 마이그레이션도 postgres 소유로 생성돼 왔으므로
-- `FOR ROLE` 절 없이(= 실행 롤 기준) 걸어도 앞으로의 마이그레이션과 정확히 맞물린다.
--
-- 범위: public·private 둘 다. private는 PostgREST에 노출되지 않지만(RPC 대상 스키마가
-- public 하나뿐) 2단 래퍼 패턴(SECURITY DEFINER private 헬퍼 + INVOKER public 래퍼)의
-- private 함수도 이제부터 "만들 때 명시 GRANT"가 필요해져 같은 규율로 통일된다 — 이
-- 프로젝트가 이미 그렇게 해 왔던 것(예: has_valid_pending_invitation 전용 GRANT
-- 마이그레이션)과 방향이 같다.
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

alter default privileges in schema private
  revoke execute on functions from anon, authenticated;
