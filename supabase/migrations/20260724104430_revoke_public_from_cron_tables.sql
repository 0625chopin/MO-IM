-- Task 027 후속(13일차 교차검증, BOARD): pg_cron 설치 스크립트가 cron.job/cron.job_run_details에
-- 남기는 PUBLIC 기본 grant(SELECT, job_run_details엔 DELETE도)를 defense-in-depth로 회수한다.
--
-- 실측 결과: 이 프로젝트의 postgres role로는 반영되지 않는다(no-op) — cron.job/cron.job_run_details의
-- 소유자가 postgres가 아니라 supabase_admin이고, postgres는 그 멤버가 아니다(Supabase 관리형 인스턴스는
-- 최종 사용자에게 진짜 슈퍼유저 권한을 주지 않는다). 실효 방어는 cron 스키마 USAGE가
-- anon/authenticated/PUBLIC 어디에도 없다는 것에 의존한다. 상세: docs/decisions/cron-foundation.md 5절.
revoke all on cron.job from public;
revoke all on cron.job_run_details from public;
