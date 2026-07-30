-- I-075 후속(27일차, DESIGN 요청 → 팀장 배정) — `/admin` 관리자 지정 UI는 핸들 검색으로
-- 대상을 고른다(FR-006 크루 초대와 같은 UX 패턴). 그런데 `profile_search`는 NFR-013
-- 3필드 계약상 `id`를 반환하지 않으므로, 검색 결과만으로는 기존 admin_grant_system_admin
-- (uuid)을 호출할 UUID를 얻을 수 없다.
--
-- 앱 레이어에서 "handle 해석(getProfileByHandle) → RPC 호출" 순서로 조립하면 인가(관리자
-- 여부) 검사보다 존재 확인이 먼저 실행돼 R-012를 위반한다 — 비관리자가 forbidden을 받기
-- 전에 "그 핸들의 사용자가 존재하는가"를 알아낼 수 있다. I-074가 이 순서 실수로 두 번
-- 실제로 뚫렸고("문서 규약은 컴파일러가 강제하지 않는다"는 결론), ESLint 허용 목록에 세
-- 번째 예외를 추가하면 규칙의 억지력이 더 약해진다.
--
-- 그래서 handle 해석을 DB 함수 **내부**에 두어 "권한 검사가 handle 조회보다 항상 먼저
-- 실행된다"를 SQL 실행 순서로 구조적으로 보장한다 — 순서를 문서·리뷰로 지키는 게 아니라
-- 애초에 뒤집을 수 없게 만든다. 새 판정 로직을 다시 짜지 않고 handle -> uuid 해석 뒤
-- private.admin_grant_system_admin(uuid)에 위임한다(admin_resolve_report/이 파일 앞선
-- 마이그레이션들과 같은 재사용 원칙).
--
-- reason_code 오라클 방지(팀장 지적): `handle_not_found`는 권한 검사를 통과한 뒤에만
-- 나온다 — 비관리자는 어떤 handle을 넣어도 forbidden만 받고, 그 핸들이 실제로 존재하는지는
-- 알 수 없다(handle 조회 자체가 실행되지 않는다). 관리자에게는 구분해 주는 것이 UX상
-- 맞고, 이미 인가를 통과했으므로 열거 문제가 아니다.

create or replace function private.admin_grant_system_admin_by_handle(p_handle text)
returns table(ok boolean, reason_code text, profile_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_target_id uuid;
begin
  -- 1) 권한 검사가 handle 해석보다 구조적으로 먼저 온다 — 비관리자는 이 지점에서 forbidden만
  --    받고 아래 handle 조회는 아예 실행되지 않는다.
  if v_admin is null or not exists (
    select 1 from public.profiles where id = v_admin and is_system_admin
  ) then
    return query select false, 'forbidden'::text, null::uuid;
    return;
  end if;

  -- 2) 이 지점부터는 호출자가 관리자임이 확정됐다 — handle 정확 일치(D-005와 같은 원칙,
  --    부분/접두사 일치 아님). search_opt_out은 검사하지 않는다 — "검색 결과 노출"이 아니라
  --    이미 알고 있는 handle의 직접 해석이라 profile_search(FR-006 검색)가 아니라
  --    getProfileByHandle(FR-020 초대 경로)와 같은 성격이다.
  select id into v_target_id from public.profiles where handle = p_handle;
  if v_target_id is null then
    return query select false, 'handle_not_found'::text, null::uuid;
    return;
  end if;

  -- 3) 나머지 판정(자기 자신·비활성·이미 관리자 등)은 새로 짜지 않고 uuid 버전에 위임한다.
  --    v_target_id는 이 시점에 이미 실존이 확인됐으므로 성공이든 실패든 그대로 함께
  --    반환한다(호출자는 이미 인가된 관리자이므로 "이 handle이 이 uuid다"를 아는 것 자체는
  --    문제가 아니다).
  return query
    select r.ok, r.reason_code, v_target_id
    from private.admin_grant_system_admin(v_target_id) r;
end;
$$;

comment on function private.admin_grant_system_admin_by_handle(text) is
  'I-075 후속(27일차) — 관리자 지정을 handle로 받는 경로. 권한 검사가 handle 해석보다 먼저 실행되도록 구조화해(R-012, I-074와 같은 실패 모드 차단), 비관리자가 forbidden 이전에 handle 존재 여부를 알아내지 못하게 한다. handle 해석 후에는 private.admin_grant_system_admin(uuid)에 위임 — 로직 중복 없음.';

create or replace function public.admin_grant_system_admin_by_handle(p_handle text)
returns table(ok boolean, reason_code text, profile_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select * from private.admin_grant_system_admin_by_handle(p_handle)
$$;

comment on function public.admin_grant_system_admin_by_handle(text) is
  'I-075 후속 — 029B 2단 구조의 public INVOKER 얇은 래퍼. 실제 로직은 private.admin_grant_system_admin_by_handle.';

-- D-077(신규 함수 예외 없이 명시적 REVOKE)·D-074 요건.
revoke all on function private.admin_grant_system_admin_by_handle(text) from public, anon, authenticated;
grant execute on function private.admin_grant_system_admin_by_handle(text) to authenticated;
revoke all on function public.admin_grant_system_admin_by_handle(text) from public;
grant execute on function public.admin_grant_system_admin_by_handle(text) to authenticated;
revoke execute on function public.admin_grant_system_admin_by_handle(text) from anon;
