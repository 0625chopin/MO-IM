-- 되돌림: 앞선 두 마이그레이션(lock_default_function_execute_from_anon_authenticated,
-- fix_private_schema_default_execute_revoke_from_public)이 의도한 효과(신규 함수 생성 시
-- anon/authenticated 기본 EXECUTE 차단)를 실제로 내지 못한다는 것을 자기반증(실측)으로
-- 확인했다 — 새 테스트 함수를 만들어 확인한 결과 `ALTER DEFAULT PRIVILEGES ... REVOKE
-- EXECUTE ON FUNCTIONS FROM PUBLIC/anon/authenticated`를 어떤 조합·구문으로 걸어도(Supabase
-- 공식 문서가 제시하는 정확한 구문 포함) 새로 만든 함수는 여전히 PUBLIC(=X, 전체 롤 포함)
-- EXECUTE를 갖는다 — `information_schema.role_routine_grants`·`pg_proc.proacl` 양쪽으로
-- 직접 확인. 원인은 특정하지 못했다(`public` 스키마 소유자가 PG15+의 `pg_database_owner`
-- 유사역할인 점, `postgres`가 실제로는 non-superuser인 점 등 후보는 있으나 미확정).
--
-- 효과가 없는데 "잠갔다"는 흔적(named-role만 비운 default ACL 행)을 남겨 두면 나중에
-- `permission-baseline.md`류 점검에서 "잠긴 것으로 보이지만 실제로는 안 잠긴" 거짓 안도감을
-- 준다 — 그래서 원상 복구한다. **기존 함수 45개는 이번 마이그레이션들로 전혀 영향받지
-- 않았다**(default privileges는 애초에 미래 객체에만 적용되고, 이번 두 마이그레이션도
-- 그 미래-객체 효과 자체가 안 났으므로 기존 객체는 처음부터 끝까지 무관하다).
--
-- 결론: 이 프로젝트가 지금까지 써 온 "함수 생성 마이그레이션마다 명시적으로 REVOKE"
-- 관행(I-092/I-101~103/I-114/I-120)이 이 환경에서 사실상 유일하게 검증된 차단 수단이다.
alter default privileges in schema public
  grant execute on functions to anon, authenticated;

alter default privileges in schema private
  revoke execute on functions from service_role;
