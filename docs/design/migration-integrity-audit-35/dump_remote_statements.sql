-- I-167 전수 감사 재실행용 — 원격 supabase_migrations.schema_migrations 전건 덤프.
-- supabase MCP execute_sql(또는 SQL 편집기)로 실행한다. 행이 많아 도구 토큰 한도를
-- 넘기면(35일차 실측: 133건 기준 약 45만자로 넘겼다) 도구가 자동으로 파일에 저장하니
-- 그 파일 경로를 audit_compare.py --raw-tool-output 인자로 넘긴다.
--
-- 이 프로젝트는 모든 마이그레이션이 stmt_count=1이다(문장 단위 분할이 아니라 apply_migration
-- 호출 시 제출한 SQL 원문 전체가 statements 배열의 유일한 원소로 그대로 저장된다 — 35일차
-- 실측으로 확인, README.md "왜 stmt_count가 항상 1인가" 절 참고). 그래서 stmt[1]만 있으면
-- 충분하다 — 다른 버전(문장 단위 분할을 실제로 하는 Supabase 배포)에서는 array_length가
-- 1보다 클 수 있으니 재사용 전에 먼저 아래로 확인할 것:
--
--   select version, array_length(statements, 1) from supabase_migrations.schema_migrations
--   order by version;

select json_agg(
  json_build_object('version', version, 'stmt', statements[1])
  order by version
) as data
from supabase_migrations.schema_migrations;
