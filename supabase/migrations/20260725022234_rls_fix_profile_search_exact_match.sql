-- 작성: CORE / 지적: DESIGN (16일차 교차검증)
-- MAJOR 1: profile_search가 `ilike '%..%'` 부분 일치로 구현돼 FR-006이 막으려던 사용자 열거
-- 취약점을 그대로 재도입했다. requirements.md 실측 확인:
--   - FR-006 설명(:430) "핸들 정확 일치로 사용자 1명을 찾는다"
--   - FR-006 AC2(:435) "앞 3글자만 입력 → 0건(부분 일치 불가)"
--   - 3.6절(:321,:324) "검색 키: 핸들 정확 일치만. 부분 일치·접두사 검색 불가" / "결과 개수: 0건 또는 1건"
-- → `p.handle = p_handle` 정확 일치로 좁힌다. 결과가 0~1건으로 확정되므로 p_limit 파라미터
-- 자체가 무의미해져 제거한다(시그니처가 바뀌므로 DROP 후 CREATE — CREATE OR REPLACE는 파라미터
-- 개수를 바꿀 수 없다).
--
-- 대소문자 처리 실측: `information_schema.columns`로 profiles.handle을 확인한 결과
-- data_type=text, collation_name=null(기본 콜레이션 — citext 아님, 대소문자 구분). 회원가입 시
-- 핸들을 별도 정규화(소문자 강제 등)하는 CHECK 제약도 없다(pg_constraint 실측, profiles는
-- profiles_status_check 하나뿐). requirements.md 어디에도 대소문자 무시 요구가 없으므로
-- (3.6절·FR-006 전부 "정확 일치"만 명시) 스키마 그대로 대소문자 구분 `=` 비교를 쓴다 — 필요하면
-- 이후 회차에서 핸들 정규화 규칙(가입 시 lower-case 강제 등)을 먼저 결정한 뒤 함수를 맞춘다.
--
-- MAJOR 2: 반환 필드가 id 포함 4개라 NFR-013("handle·displayName·avatarUrl 3필드만") 위반.
-- profiles_handle_key(UNIQUE) 실측 확인 — handle 자체가 유일 식별자로 충분해 id를 빼도 안전
-- 하다(팀장 판단). 초대 경로(FR-020)는 이 함수가 반환한 handle을 서버가 다시 해석해 profile
-- id를 얻는다 — Task 031/032 인계 사항으로 문서에 별도 기록.
drop function if exists public.profile_search(text, integer);

create or replace function public.profile_search(p_handle text)
returns table (
  handle text,
  display_name text,
  avatar_url text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select p.handle, p.display_name, p.avatar_url
  from public.profiles p
  where p.handle = p_handle
    and p.search_opt_out = false
    and p.status = 'active'
$function$;

revoke all on function public.profile_search(text) from public, anon, authenticated;
grant execute on function public.profile_search(text) to authenticated;
