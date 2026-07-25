-- Task 039 후속(같은 회차) — 등재 직전 재확인 규칙(`docs/ISSUES.md`)을 지키지 않고 이 함수의
-- 코멘트에 I-055를 미리 못박아 뒀는데, 실제 등재 시점에는 BOARD가 이미 I-055(오류 추적)를
-- 먼저 등재해 번호가 어긋났다. 실제 번호(I-056)로 정정한다 — 기능 변경 없음, 코멘트만.
comment on function public.anonymize_expired_deactivated_profiles(integer, interval) is
  'Task 039 — NFR-031/D-010: deactivated_at 기준 30일 경과 profiles를 익명화하고 status=withdrawn·anonymized_at을 기록한다. auth.users.email/banned_until도 함께 파기해 재로그인을 막는다(공식 Admin API 미사용 — pg_cron은 순수 SQL만 호출 가능, I-056). CON-10 — 배치 루프(기본 7min) + statement_timeout(1min) 이중 방어. search_path 고정.';
