-- I-111 (CRITICAL) — DELETE/TRUNCATE 축 전수조사(24일차, CREW)
-- RLS는 SELECT/INSERT/UPDATE/DELETE만 필터링하고 TRUNCATE는 전혀 필터링하지 않는다.
-- Supabase 프로젝트 기본 GRANT(GRANT ALL ON ALL TABLES ... TO anon, authenticated)가
-- public 스키마의 사실상 전 테이블에 TRUNCATE를 anon·authenticated에 부여한 채로 남아 있었다
-- (audit_logs·poll_votes·poll_eligible_voters·crew_memberships·reports·notifications·
-- product_events 등 "증거" 테이블 포함). 실측: authenticated 롤로 전환해
-- `TRUNCATE public.audit_logs`를 실행하면 성공한다(트랜잭션 롤백으로 실피해 없이 확인).
-- audit_logs·poll_votes처럼 자신을 참조하는 자식 테이블이 없는 leaf 테이블은 CASCADE 없이도
-- 단독 TRUNCATE 한 번으로 전체 행이 즉시 사라진다.
revoke truncate on all tables in schema public from anon, authenticated;

-- 재발 방지: 향후 마이그레이션이 새 테이블을 만들 때도 같은 기본 GRANT가 자동으로 다시
-- 적용된다(pg_default_acl 확인 결과 postgres 롤의 public 스키마 기본 ACL이 anon·authenticated
-- 에게 TRUNCATE를 포함한 arwdDxtm 전체를 이미 부여하고 있었다) — 새 테이블 생성 시점마다
-- 매번 수동으로 REVOKE하는 것에 의존하지 않도록 기본 권한 자체를 좁힌다.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;
