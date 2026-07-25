-- 작성: CORE (Task 029B)
-- NFR-013(검색 응답 3필드 제한)·R-012(핸들 검색이 사용자 열거·개인정보 노출 경로) 대응.
-- FR-006 "핸들로 사용자 검색"이 소비할 좁은 계약. handle/display_name/avatar_url 외 어떤
-- 필드도 반환하지 않는다. search_opt_out=true·status<>'active'(탈퇴·정지) 프로필은 제외한다.
-- NFR-016(분당 20회 레이트리밋)은 v0.2 범위라 여기 넣지 않는다(029A §8.7·15일차 인계 그대로).
--
-- 잔여 위험(문서에 명시): profiles 테이블 자체는 029A의 profiles_select_authenticated
-- (qual=true, 전 컬럼)가 이미 모든 인증 사용자에게 열려 있어(D-005 "공개 프로필 정보" 결정),
-- 이 함수를 거치지 않고 `.from('profiles').select('*')`로 직접 조회해도 동일한 열거가
-- 이론적으로 가능하다. 029A가 검토·교차검증까지 끝낸 결정을 재작업하지 않기로 했다(58건
-- 정책 최소 변경 원칙) — 완전한 강제(원본 테이블 자체를 막는 것)는 029A의 다른 정당한
-- 소비자(작성자 표시 등)를 깨뜨릴 위험이 있어 범위 밖으로 이월한다(문서 §7 참고).
create or replace function public.profile_search(p_query text, p_limit integer default 20)
returns table (
  id uuid,
  handle text,
  display_name text,
  avatar_url text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select p.id, p.handle, p.display_name, p.avatar_url
  from public.profiles p
  where p.search_opt_out = false
    and p.status = 'active'
    and p.handle ilike '%' || p_query || '%'
  order by p.handle
  limit least(greatest(p_limit, 1), 20)
$function$;

revoke all on function public.profile_search(text, integer) from public, anon, authenticated;
grant execute on function public.profile_search(text, integer) to authenticated;
