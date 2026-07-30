-- D-074 후속 검증 — "기존 관행(함수별 명시 REVOKE)이 여전히 유효한 유일한 차단 수단"이라는
-- 결론을 실 REST 호출로 뒷받침한다. 임시 검증용 함수 1개, 검증 후 즉시 DROP.
create function public.crew_verify_manual_revoke_delete_me()
returns text
language sql
security invoker
set search_path = ''
as $$ select 'ok'::text; $$;

revoke execute on function public.crew_verify_manual_revoke_delete_me() from public, anon, authenticated;
grant execute on function public.crew_verify_manual_revoke_delete_me() to authenticated;
