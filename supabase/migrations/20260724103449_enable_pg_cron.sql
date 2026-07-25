-- Task 027: pg_cron 확장 활성화 (Supabase Cron, D-027)
-- 공식 설치 절차: https://supabase.com/docs/guides/cron/install
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- 실패 감지 경로 기반: 서버(service_role)가 cron.job / cron.job_run_details를
-- 직접 조회할 수 있도록 최소 권한(select)만 부여한다.
-- insert/update/delete 권한은 postgres에만 남긴다 (cron.job_run_details 정리는 운영 작업).
grant usage on schema cron to service_role;
grant select on cron.job, cron.job_run_details to service_role;
