-- Task 042A 후속(같은 회차) — create_report·create_block이 anon에 EXECUTE 권한을 갖고 있었다.
-- 실측(anon role로 두 함수 직접 호출)에서 발견 — 15일차 교훈(rls-policies-029b.md §2.3)이
-- 정확히 경고한 함정: `revoke ... from public`만으로는 Supabase가 `public` 스키마 신규
-- 함수에 붙이는 anon/authenticated 개별 grant(ALTER DEFAULT PRIVILEGES)가 회수되지 않는다.
-- `private.is_blocked`는 같은 문제가 없었다(그 교훈대로 이 기본 권한 규칙은 public 스키마에만
-- 걸려 있다) — `information_schema.routine_privileges` 실측으로 확인.
revoke execute on function public.create_report(text, uuid, text) from anon;
revoke execute on function public.create_block(uuid) from anon;
