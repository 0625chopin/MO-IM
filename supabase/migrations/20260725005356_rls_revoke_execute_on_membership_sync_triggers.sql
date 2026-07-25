-- Task 029A: get_advisors(security) 재조회에서 새로 나온 WARN 해소
-- (anon_security_definer_function_executable · authenticated_security_definer_function_executable)
--
-- crews_provision_owner_bootstrap · invitations_provision_membership ·
-- invitations_sync_membership_on_response · join_requests_sync_membership_on_decision는
-- 오직 트리거로만 호출되도록 설계했다(PostgREST RPC로 직접 호출될 이유가 없다). 트리거
-- 실행 자체는 EXECUTE 권한 검사 대상이 아니므로(실행기가 내부적으로 호출), anon·
-- authenticated의 EXECUTE만 회수해도 트리거 동작에는 영향이 없다.

revoke execute on function public.crews_provision_owner_bootstrap() from public, anon, authenticated;
revoke execute on function public.invitations_provision_membership() from public, anon, authenticated;
revoke execute on function public.invitations_sync_membership_on_response() from public, anon, authenticated;
revoke execute on function public.join_requests_sync_membership_on_decision() from public, anon, authenticated;
