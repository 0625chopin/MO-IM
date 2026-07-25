-- Task 042A 후속(같은 회차) — reports_guard_self_update_reason_only는 트리거 전용 함수인데
-- SECURITY DEFINER라 anon/authenticated가 /rest/v1/rpc/...로 직접 호출 가능했다(advisor WARN
-- 2건, 029A §3과 같은 패턴 — "트리거 전용 함수는 client EXECUTE를 회수한다").
revoke all on function public.reports_guard_self_update_reason_only() from public, anon, authenticated;
