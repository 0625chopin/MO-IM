-- I-089 후속(같은 회차) — get_advisors(security)가 새 WARN 2건을 냈다:
-- polls_guard_decision_integrity()가 public 스키마 SECURITY DEFINER 함수라 기본적으로
-- anon/authenticated에게 /rest/v1/rpc/polls_guard_decision_integrity로 직접 호출 가능한
-- 상태였다(042A가 이미 겪은 "Supabase 기본 권한은 public 스키마 신규 함수에 자동으로
-- 붙는다" 패턴 재발). 이 함수는 트리거 전용(old/new 컨텍스트가 트리거 호출에서만 채워진다)
-- 이라 클라이언트가 RPC로 직접 부를 이유가 없다 — 명시적으로 막는다.
revoke all on function public.polls_guard_decision_integrity() from public, anon, authenticated;
