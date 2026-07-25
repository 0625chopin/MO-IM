-- I-090(MAJOR, BOARD 21일차 발견 — I-085·I-086 재검증 중, 수정 CORE) — `meetup_attendances`에는
-- RLS 정책(self-service INSERT/UPDATE)만 있고 트리거가 0건이다. `respond_meetup_attendance`
-- RPC를 거치지 않고 직접 INSERT/UPDATE로 정원 마감된 Meetup에 'attending' 행을 넣을 수
-- 있었다(실측: capacity=8/attending_count=8인 Meetup에 크루원이 직접 INSERT → 성공) —
-- D-019(정원 원자성)가 세운 "RPC가 조건부 UPDATE로 정원을 보장한다"는 전제를 RPC를 안
-- 거치면 완전히 우회할 수 있었다.
--
-- 판단(전면 금지 vs BEFORE 트리거): 전면 금지를 택한다. BEFORE 트리거로 정원만 재검증하는
-- 방식은 meetups.attending_count 카운터 동기화 문제(직접 쓰기는 이 카운터를 갱신하지 않는다)
-- 를 별도로 다시 풀어야 해 문제가 두 배가 된다 — RPC 하나로 쓰기를 좁히면 원자성·카운터
-- 동기화가 동시에 해결된다. `respond_meetup_attendance`는 지금 SECURITY INVOKER라 이 REVOKE가
-- 그대로 적용되면 RPC 자신의 쓰기까지 막힌다 — 그래서 SECURITY DEFINER로 먼저 전환한다.
--
-- 안전성 확인(부작용 없음, 실측으로 재확인 예정):
-- - 함수 소유자 postgres는 rolbypassrls=true라 REVOKE와 무관하게 RPC 자신의
--   INSERT ... ON CONFLICT DO UPDATE는 계속 성공한다.
-- - meetups.attending_count 갱신에 걸리는 trg_meetups_guard_attendee_scope 트리거는
--   auth.uid()(JWT 클레임) 기반으로 판정하지 SECURITY DEFINER 여부와 무관하다 — "attending_
--   count만 바뀌면 누구나 허용" 분기가 전환 후에도 그대로 작동한다.
-- - private.get_meetup_crew_id·private.is_active_crew_member 헬퍼도 auth.uid() 기반이라
--   동일하게 동작한다.
-- - 운영 데이터 전수 대조(meetups.attending_count vs 실제 'attending' 행수) 결과 불일치
--   0건 — 이 결함이 실제로 악용된 이력은 없었다.

alter function public.respond_meetup_attendance(uuid, text) security definer;

drop policy if exists meetup_attendances_insert_self on public.meetup_attendances;
drop policy if exists meetup_attendances_update_self on public.meetup_attendances;

revoke insert, update on public.meetup_attendances from anon, authenticated;

comment on table public.meetup_attendances is
  'I-090(21일차) 수정 — 직접 INSERT/UPDATE 권한을 anon·authenticated에서 회수했다. 참석/불참 응답은 respond_meetup_attendance(SECURITY DEFINER) RPC로만 가능하다 — 그 RPC가 D-019 정원 원자성(조건부 UPDATE)과 attending_count 동기화를 함께 보장한다. SELECT(FR-068 참석자 목록 조회)는 그대로 열려 있다(meetup_attendances_select_self_or_members 정책 무변경).';
