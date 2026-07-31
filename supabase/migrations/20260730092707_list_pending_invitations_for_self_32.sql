-- 32일차(CREW, 팀장 회귀 지적 수정) — archived 크루 초대 필터링(같은 회차 앞선 수정)이
-- private 크루의 정상 pending 초대까지 지우는 회귀를 만들었다. 원인: `listInvitationsForProfile`
-- 2단계 필터가 초대받은 사람(아직 비소속, `crew_memberships.status='invited'`)의 세션으로
-- `crews` 테이블을 직접 select했는데, `crews_select_authenticated` RLS는
-- `visibility='public' OR owner_id=auth.uid() OR (활성 멤버)`만 허용한다 — 초대 대상자는
-- 셋 다 아니라서 private 크루는 무조건 0행이 되어 정상 초대까지 필터에 걸려 사라졌다.
--
-- `private` 스키마는 PostgREST로 노출되지 않는다(CORE 32일차 실증, db-schemas=public,
-- graphql_public) — 클라이언트에서 `private.is_crew_active`를 직접 부를 수 없다. 그래서
-- 029B가 세운 2단 구조(private DEFINER 실제 로직 + public INVOKER 얇은 래퍼, disband_crew·
-- crew_directory_summary와 동일 패턴)를 그대로 재사용해 "내 pending 초대 중 크루가 active인
-- 것만" 돌려주는 RPC를 새로 둔다. `auth.uid()`로만 스코프하고 매개변수를 받지 않는다 —
-- 클라이언트가 다른 사람의 id를 넣어 조회 범위를 넓힐 방법 자체를 없앤다(다른 결과를
-- "얻지 못하게" 하는 것이 아니라 애초에 "요청할 방법이 없게" 한다).
--
-- `crews_select_authenticated`를 초대받은 사람에게까지 열어 이 문제를 RLS 쪽에서 푸는
-- 방향은 택하지 않았다 — 그건 비소속 사용자에게 private 크루 행 전체(설명·카테고리·오너
-- 등)를 여는 권한 확대이고, 이 프로젝트에서 권한 확대가 반복해서 사고를 낸 축이다(I-102·
-- I-107). "초대받았다"는 사실이 크루 행 전체를 볼 근거가 된다는 요구사항 원문 근거가
-- 없어 이 방향은 열지 않는다.
--
-- `private.is_crew_active(uuid)`(31일차, CREW가 세 마이그레이션에서 이미 재사용한 그 함수)를
-- 그대로 재사용한다 — 새 판정 로직을 만들지 않는다.
create or replace function private.list_pending_invitations_for_self()
returns setof public.invitations
language sql
stable
security definer
set search_path = ''
as $$
  select i.*
  from public.invitations i
  where i.invitee_id = auth.uid()
    and i.status = 'pending'
    and i.expires_at > now()
    and private.is_crew_active(i.crew_id)
$$;

comment on function private.list_pending_invitations_for_self() is
  '32일차(CREW) — 호출자 자신의 pending 초대 중 크루가 active인 것만 반환(D-073 확장, archived 크루 초대 필터링). private.is_crew_active 재사용. 029B 2단 구조의 private DEFINER 쪽.';

create or replace function public.list_pending_invitations_for_self()
returns setof public.invitations
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_pending_invitations_for_self()
$$;

comment on function public.list_pending_invitations_for_self() is
  '32일차(CREW) — 029B 2단 구조의 public INVOKER 얇은 래퍼. 실제 로직은 private.list_pending_invitations_for_self.';

revoke all on function private.list_pending_invitations_for_self() from public, anon, authenticated;
grant execute on function private.list_pending_invitations_for_self() to authenticated;

revoke all on function public.list_pending_invitations_for_self() from public, anon;
grant execute on function public.list_pending_invitations_for_self() to authenticated;
