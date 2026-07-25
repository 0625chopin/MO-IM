-- I-073 · Meetup 상세 비소속자 404→forbidden 폴백 RPC (D-048)
--
-- meetups_select_members RLS(`crew_id IN (내 활성 멤버십 crew_id 목록)`)가 비소속자에게 행
-- 자체를 0건으로 숨겨, getMeetupById(src/lib/data/supabase/meetup.ts)가 "존재하지 않음"과
-- "존재하지만 못 봄"을 구분하지 못했다 — FR-064 AC2(비소속자 403)가 아니라 404로 응답되는
-- 원인. getCrewById(D-007, 17일차 핫픽스)와 동일한 "원본 0행 → private 최소정보 RPC 폴백"
-- 패턴을 그대로 따른다.
--
-- 크루(D-007)와 달리 Meetup에는 독자적인 공개 범위 개념이 없다 — 접근 게이트는 오직
-- "크루원인가"뿐이고 게스트(비로그인) 노출은 애초에 설계돼 있지 않다(meetups RLS 전체가
-- authenticated 크루원 전용). 그래서 이 폴백은 크루 소개처럼 이름·설명을 일부 보여주지
-- 않는다 — 반환값은 "존재 여부 + 소속 crew_id" 두 값뿐이다. 이 crew_id로 호출자
-- (MeetupDetailContainer·respondMeetupAttendanceAction)가 이미 하던 크루원 재판정을 그대로
-- 수행해 정확한 forbidden 분기에 도달하게 하는 것이 유일한 목적이다 — 회의·날짜·장소 등
-- 실제 콘텐츠는 절대 이 경로로 노출되지 않는다.
--
-- anon에게는 노출하지 않는다(crew_directory_summary와의 차이) — meetups는 처음부터 인증
-- 크루원 전용이라 게스트 접근 시나리오 자체가 없다. authenticated에게만 EXECUTE.

create or replace function private.meetup_directory_summary(p_meetup_id uuid)
returns table(id uuid, crew_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.crew_id
  from public.meetups m
  where m.id = p_meetup_id
$$;

revoke all on function private.meetup_directory_summary(uuid) from public, anon, authenticated;
grant execute on function private.meetup_directory_summary(uuid) to authenticated;

create or replace function public.meetup_directory_summary(p_meetup_id uuid)
returns table(id uuid, crew_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.meetup_directory_summary(p_meetup_id)
$$;

revoke all on function public.meetup_directory_summary(uuid) from public, anon, authenticated;
grant execute on function public.meetup_directory_summary(uuid) to authenticated;
