-- I-130(27일차, BOARD) — 같은 Meetup을 겨냥한 일정 변경 제안의 상호 배제.
-- 사용자 결정(27일차, D-078 예정 등재): "트리거로 DB에서 차단하고, UI는 도달 전에
-- 사전 안내한다." posts_guard_reschedule_target_scope(I-079, CORE 26일차)에 상관
-- 서브쿼리를 추가해 같은 target_meetup_id를 겨냥한 아직 종료되지 않은(polls.status='open')
-- 일정 변경 제안이 이미 있으면 INSERT/UPDATE를 거부한다. closed_passed/closed_rejected/
-- closed_invalid/cancelled 제안은 막지 않는다 — 한 번 부결된 뒤 재제안은 정상 경로다
-- (docs/decisions/meetup-reschedule-079.md §2 대안④가 이월한 범위).
--
-- D-077(27일차, CREW·I-134 판정) 관례를 따른다 — 이 함수는 트리거 전용(RETURNS trigger,
-- security_definer=false)이라 관례 A(EXECUTE 유지)로도 안전하지만, "예외 없이 신규/수정
-- 함수는 명시적 REVOKE"가 확정 관례라 그대로 따른다. 기존 grantee(service_role·postgres)는
-- CREATE OR REPLACE로 서명(이름+인자)이 바뀌지 않아 ACL이 그대로 보존된다 — 아래 REVOKE는
-- public/anon/authenticated 재확인용 명시적 방어선이다(D-074와 같은 이유).

create or replace function public.posts_guard_reschedule_target_scope()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_crew_id uuid;
  v_target_crew_id uuid;
  v_target_status text;
begin
  if new.type <> 'meetup_reschedule_proposal' then
    return new;
  end if;

  select b.crew_id into v_crew_id
  from public.boards b
  where b.id = new.board_id;

  select m.crew_id, m.status into v_target_crew_id, v_target_status
  from public.meetups m
  where m.id = new.target_meetup_id;

  if v_target_crew_id is null or v_target_crew_id is distinct from v_crew_id then
    raise exception '일정 변경 제안은 같은 크루의 Meetup만 대상으로 할 수 있다(FR-065 AC2, target_meetup_id=%)', new.target_meetup_id;
  end if;

  if v_target_status is distinct from 'confirmed' then
    raise exception '취소된 Meetup은 일정 변경 대상이 될 수 없다(FR-065 AC3, target_meetup_id=%)', new.target_meetup_id;
  end if;

  -- I-130 — 같은 Meetup을 겨냥한, 아직 종료되지 않은(open) 일정 변경 제안이 이미 있으면
  -- 이 INSERT/UPDATE를 막는다. new.id는 BEFORE 트리거 시점에 이미 기본값(gen_random_uuid())이
  -- 채워져 있어 UPDATE 재진입(작성자 본인이 type을 사후 변경하는 경로, I-131과 같은 표면) 시
  -- 자기 자신의 행은 이 서브쿼리에서 제외한다.
  if exists (
    select 1
    from public.posts p2
    join public.polls pl on pl.post_id = p2.id
    where p2.target_meetup_id = new.target_meetup_id
      and p2.type = 'meetup_reschedule_proposal'
      and p2.deleted_at is null
      and p2.id is distinct from new.id
      and pl.status = 'open'
  ) then
    raise exception '이 Meetup을 겨냥한 일정 변경 제안이 이미 진행 중이다(I-130, target_meetup_id=%)', new.target_meetup_id;
  end if;

  return new;
end;
$function$;

revoke execute on function public.posts_guard_reschedule_target_scope() from public, anon, authenticated;
