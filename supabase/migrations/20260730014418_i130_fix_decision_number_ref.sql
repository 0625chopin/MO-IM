-- I-130 후속 정정(27일차, BOARD) — 원 마이그레이션(i130_posts_guard_reschedule_open_
-- proposal_exclusion, version 20260730012226)의 선행 주석이 "D-078 예정 등재"라고 적었으나
-- 팀장 조정 결과 최종 배정 번호는 D-080이다(D-077=CREW·D-078=CORE·D-079=CREW·D-080=BOARD).
-- 이 마이그레이션은 함수 로직·그랜트를 전혀 바꾸지 않는다 — 선행 주석의 결정 번호만 정정한
-- 상태로 CREATE OR REPLACE를 다시 실행하고(본문·REVOKE는 원본과 바이트 단위로 동일), 이후
-- proacl을 재확인해 D-074가 우려한 실패 모드(REVOKE 유실)가 이 정정으로 발생하지 않았음을
-- 증명한다. admin_grant_revoke_rpcs_075_fix_decision_number_refs(CORE, 27일차)와 같은 패턴.

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

comment on function public.posts_guard_reschedule_target_scope() is
  'I-130(27일차, BOARD)/I-079(26일차, CORE) — 상관 서브쿼리로 같은 target_meetup_id를 겨냥한 open 일정 변경 제안 중복을 막는다. 결정: D-080("트리거로 DB에서 차단하고 UI는 도달 전에 사전 안내한다").';
