-- 이전 시도(execute_sql로 실행한 "revoke ... from anon, authenticated")가 실제로는
-- 효과가 없었다(실측 확인 — 새 테스트 함수가 여전히 PUBLIC,postgres를 그랜티로 가짐).
-- private 스키마는 Supabase가 만들어 둔 명시적 기본 ACL이 없어 PostgreSQL 내장 기본값
-- ("함수는 PUBLIC 키워드로 EXECUTE")만 적용되는 상태였다 — anon/authenticated라는
-- "개별 이름"으로 회수해 봤자 PUBLIC 키워드로 부여된 권한은 그대로 남는다. PUBLIC
-- 자체에서 회수해야 한다. apply_migration(DDL 전용 도구)으로 다시 적용해 지속성도
-- 함께 확인한다.
alter default privileges in schema private
  revoke execute on functions from public;
