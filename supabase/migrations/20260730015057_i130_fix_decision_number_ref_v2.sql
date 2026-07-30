-- I-130 후속 정정 2차(27일차, BOARD) — 팀장의 최종 번호 배정이 D-080에서 D-079로 다시
-- 바뀌었다(D-077=CREW·D-078=CORE·D-079=BOARD·D-080=CREW 종료 게이트, prioritization-and-
-- risks.md에 이미 이 순서로 등재·확인됨). 직전 정정(i130_fix_decision_number_ref, version
-- 20260730014418)이 `comment on function`에 남긴 "결정: D-080(...)"이 이제 틀렸으므로 그
-- 문구만 D-079로 다시 고친다. 함수 로직·REVOKE는 전혀 바꾸지 않는다 — CREATE OR REPLACE로
-- 본문을 재적용하는 이유는 오직 뒤따르는 comment on function 갱신을 위해서다(본문 자체는
-- 원본과 바이트 단위로 동일).

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
  'I-130(27일차, BOARD)/I-079(26일차, CORE) — 상관 서브쿼리로 같은 target_meetup_id를 겨냥한 open 일정 변경 제안 중복을 막는다. 결정: D-079("트리거로 DB에서 차단하고 UI는 도달 전에 사전 안내한다").';
