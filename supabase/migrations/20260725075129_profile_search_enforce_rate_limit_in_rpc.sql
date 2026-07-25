-- 018일차 교차검증(CORE) 구조적 결함 3건 중 세 번째: D-005·NFR-016(핸들 검색 계정당 분당 20회)
-- 레이트 리밋이 지금까지 src/lib/actions/search-user-by-handle.ts(Server Action)에만 있었다.
-- authenticated는 이미 public.profile_search(text)에 EXECUTE 권한이 있어(029B),
-- publishable key + 세션으로 이 RPC를 앱을 거치지 않고 직접 호출하면 리밋이 전혀 적용되지
-- 않았다(실측 확인, Task 038 교차검증 보고). respond_meetup_attendance의 정원 판정(#1)·
-- crew_memberships 강퇴자 재신청(#6)과 같은 계열의 구조적 문제 — "비즈니스 규칙이 RPC가
-- 아니라 Next.js 앱 레이어에만 있다" — 이번엔 이 RPC를 만든 사람(CORE)이 직접 닫는다.
--
-- private.profile_search(SECURITY DEFINER, 실제 조회+리밋 체크+기록) +
-- public.profile_search(얇은 SECURITY INVOKER 래퍼) 2단 구조로 바꾼다 —
-- private.poll_vote_tally·private.crew_directory_summary와 같은 패턴(029B). 이유: 레이트
-- 리밋 체크가 handle_search_attempts에 써야 하는데 그 테이블은 anon/authenticated 완전 거부
-- RLS(`using(false)`)라 security invoker 컨텍스트에서는 그 INSERT 자체가 거부된다 —
-- SECURITY DEFINER가 필요한 이유가 그것뿐이다(조회 로직 자체는 원래도 RLS 우회가 필요
-- 없었다 — profiles_select_authenticated가 이미 qual=true).
--
-- 역할 분담(팀장 지시대로 명시): **SQL(이 함수)이 강제 경계**다 — RPC를 어떤 경로로 호출하든
-- (Server Action이든 publishable key 직접 호출이든) 20회를 넘기면 예외로 거부된다.
-- **src/lib/rules/rate-limit.ts + search-user-by-handle.ts(앱 레이어)는 UX만 담당**한다 —
-- SQL까지 왕복하지 않고 미리 429 안내·retryAfterSeconds를 보여주기 위한 선제 체크일 뿐,
-- 이게 없어도 SQL이 최종적으로 막는다. 두 곳의 숫자(20회/60초)는 반드시 같은 값을 유지해야
-- 한다 — 앱 레이어가 더 느슨하면 사용자가 UX상 통과했다가 SQL에서 거부당하는 혼란스러운
-- 경험이 생기고, SQL이 더 느슨하면 앱의 "429 안내"가 실제 차단보다 먼저 뜨는 정도의 차이만
-- 있어 안전하지만 그래도 값은 일치시킨다(HANDLE_SEARCH_RATE_LIMIT = {limit:20,
-- windowSeconds:60}, 아래 SQL과 동일).
create or replace function private.profile_search(p_handle text)
returns table(handle text, display_name text, avatar_url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_recent_count integer;
begin
  if v_caller is null then
    raise exception 'not authorized to search (authentication required)';
  end if;

  -- D-005·NFR-016: 계정당 분당 20회. 카운터 키는 auth.uid()(클라이언트가 조작 불가) —
  -- p_handle이나 다른 클라이언트 입력을 키로 쓰지 않는다.
  select count(*) into v_recent_count
  from public.handle_search_attempts
  where identifier = v_caller
    and requested_at > now() - interval '60 seconds';

  if v_recent_count >= 20 then
    raise exception 'rate limit exceeded: handle search allows at most 20 requests per 60 seconds (D-005)';
  end if;

  -- 허용된 시도만 기록한다(rate-limit-store.ts의 recordHandleSearchAttempt와 같은 원칙 —
  -- 거부된 요청은 기록하지 않는다, 어차피 다음 판정도 같은 윈도우를 다시 계산할 뿐이다).
  insert into public.handle_search_attempts (identifier) values (v_caller);

  -- 조회 로직 자체는 원본 public.profile_search(rls_profile_search_function·
  -- rls_fix_profile_search_exact_match)과 완전히 동일 — 정확 일치(부분/접두사 일치 아님),
  -- 대소문자 구분, search_opt_out=false, status='active' 필터. NFR-013 3필드 반환도 그대로.
  return query
  select p.handle, p.display_name, p.avatar_url
  from public.profiles p
  where p.handle = p_handle
    and p.search_opt_out = false
    and p.status = 'active';
end;
$$;

revoke execute on function private.profile_search(text) from public, anon, authenticated;
grant execute on function private.profile_search(text) to authenticated;

-- 원본은 STABLE이었지만(순수 조회), 이제 private.profile_search가 handle_search_attempts에
-- INSERT하는 부수효과가 있어 그 성질이 사라졌다 — STABLE로 잘못 선언하면 옵티마이저가 호출
-- 횟수를 줄여도 된다고 오판해 리밋 기록이 누락될 수 있다. VOLATILE(기본값)로 정직하게 둔다.
create or replace function public.profile_search(p_handle text)
returns table(handle text, display_name text, avatar_url text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.profile_search(p_handle);
$$;

revoke execute on function public.profile_search(text) from public, anon;
grant execute on function public.profile_search(text) to authenticated;
