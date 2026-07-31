-- 32일차(CREW, archived 쓰기 표면 감사 축 ② — 간접 방어 명시화) — 문서 갭 수정, 로직 무변경.
--
-- 31일차 감사(docs/design/archived-crew-write-surface-audit-31/README.md)가 "간접 방어"로
-- 분류한 3건(#19 채팅 메시지 삭제, #22 일정 취소/응답, #24 투표 참여/조기종료/철회)은 직접
-- crew.status 가드가 없고, 이 함수(private.disband_crew)의 부수 효과에 암묵적으로 결합돼
-- "실제로 도달하는 입력이 없다"는 방식으로만 방어된다 — 그 결합은 지금까지 코드 어디에도
-- 명시되지 않았다(감사 문서에만 서술).
--
-- 32일차 begin…rollback 실측(스크래치 크루, 픽스처 2건 불변 확인)으로 세 결합을 전부
-- 재확인했다: poll open→cancelled(1건) · meetup confirmed→cancelled(1건, 미래 날짜) ·
-- chat_messages 1건→0건(대상 메시지 자체가 사라짐). 결과는 이 마이그레이션이 아래에 추가한
-- 세 주석과 정확히 대응한다.
--
-- 결합을 명시화할 수단으로 **코드 주석**을 택했다(테스트·DB 제약 대신). 근거: ① 이 결합의
-- 소비자(cast-vote.ts·close-poll.ts·withdraw-poll.ts·cancel-meetup.ts·
-- respond-meetup-attendance.ts·delete-chat-message.ts)는 전부 BOARD 도메인이라 이 회차에서
-- 직접 수정하지 않는다(다른 팀원 소유 파일 — 「기존 습관」 경계 준수) — 반대로 이 함수(생산자
-- 쪽)는 CREW 소유라 직접 갱신할 수 있다. ② `npm test`(vitest)의 자동 테스트 범위는
-- `docs/CONVENTIONS.md`가 아니라 CLAUDE.md가 명시한 대로 `quorum.ts`·`poll-decision.ts`·
-- `poll-eligibility.ts` 3개 순수 함수 모듈뿐이다 — Server Action·데이터 계층에 대한 자동
-- 테스트가 없는 상태에서 이 결합만을 위해 테스트 범위를 넓히는 것은 이번 UX 감사 배정을 넘어서는
-- 별도 결정이다. ③ CHECK 제약은 "다른 테이블·다른 함수의 조건이 이 UPDATE의 조건과 일치해야
-- 한다"는 교차 함수 결합을 표현할 수 있는 도구가 아니다(정적 값 제약이지 동작 간 합치 제약이
-- 아님). 배포본(pg_get_functiondef)을 그대로 복사하고 주석 3줄만 추가했다 — 그 외 한 글자도
-- 바꾸지 않았다.
-- 근거: docs/design/archived-crew-write-surface-audit-31/README.md("결합 지점 명시화(32일차)"
-- 절, 32일차 추가).
create or replace function private.disband_crew(p_crew_id uuid, p_confirm_name text)
returns table(ok boolean, reason text, cancelled_polls integer, cancelled_meetups integer, purged_messages integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_owner_id uuid;
  v_status text;
  v_name text;
  v_cancelled_polls integer;
  v_cancelled_meetups integer;
  v_purged_messages integer;
begin
  if v_actor is null then
    return query select false, 'forbidden'::text, 0, 0, 0;
    return;
  end if;

  select owner_id, status, name into v_owner_id, v_status, v_name
  from public.crews
  where id = p_crew_id
  for update;

  if not found then
    return query select false, 'not_found'::text, 0, 0, 0;
    return;
  end if;

  if v_owner_id <> v_actor then
    -- FR-013 사전조건 "오너 본인" — RLS(crews_update_staff_or_owner)는 임원까지 통과시키므로
    -- 이 함수가 오너 단독 권한을 다시 확인해야 한다(매트릭스 crew:disband, 오너 전용).
    return query select false, 'forbidden'::text, 0, 0, 0;
    return;
  end if;

  if v_status <> 'active' then
    return query select false, 'already_disbanded'::text, 0, 0, 0;
    return;
  end if;

  if v_name <> p_confirm_name then
    -- FR-013 예외 흐름 E1 "크루명 오입력 → 진행 차단". UX 확인이 아니라 실수로 인한 돌이킬 수
    -- 없는 삭제(채팅 즉시 파기 포함)를 막는 안전장치라 여기서도 재확인한다.
    return query select false, 'name_mismatch'::text, 0, 0, 0;
    return;
  end if;

  update public.crews set status = 'archived' where id = p_crew_id;

  -- FR-013 AC1 "진행 중 투표 2건 → 해산 시 둘 다 cancelled".
  -- 간접 방어 결합(32일차, archived 감사 #24) — 이 UPDATE의 `p.status = 'open'` 조건이
  -- cast-vote.ts·close-poll.ts·withdraw-poll.ts(BOARD 도메인, poll.status!=='open' 가드)를
  -- 우회 없이 만족시킨다. 이 조건을 좁히거나(예: 특정 crew_id만) 없애면 그 가드들이 조용히
  -- 뚫린다 — 상세: docs/design/archived-crew-write-surface-audit-31/README.md.
  update public.polls p
  set status = 'cancelled'
  from public.posts po, public.boards b
  where p.post_id = po.id
    and po.board_id = b.id
    and b.crew_id = p_crew_id
    and p.status = 'open';
  get diagnostics v_cancelled_polls = row_count;

  -- FR-013 AC2 "미래 Meetup 바가 사라지고 과거 항목은 열람 전용으로 남는다" — 지난 Meetup은
  -- confirmed로 남긴다.
  -- 간접 방어 결합(32일차, archived 감사 #22) — 이 UPDATE의 `status = 'confirmed' and
  -- date >= current_date` 조건은 `isMeetupAttendanceOpen`(src/lib/rules/
  -- meetup-attendance-eligibility.ts, `status === 'confirmed' && date >= todayIso`)이 요구하는
  -- "열려 있음" 조건과 정확히 대칭이다 — 이 조건이 바뀌면 cancel-meetup.ts·
  -- respond-meetup-attendance.ts(BOARD 도메인)의 가드가 조용히 뚫린다.
  update public.meetups
  set status = 'cancelled'
  where crew_id = p_crew_id
    and status = 'confirmed'
    and date >= current_date;
  get diagnostics v_cancelled_meetups = row_count;

  -- D-009 후반 "크루 해산 시에도 채팅 로그를 함께 파기한다" — Task 035가 이월한 항목.
  -- 간접 방어 결합(32일차, archived 감사 #19) — 이 DELETE가 크루 채팅방의 메시지를 전량
  -- 즉시 삭제하므로 delete-chat-message.ts(BOARD 도메인)의 `!message` 분기(대상 없음)가
  -- archived 크루에서 자연히 성립한다. 이 함수가 삭제를 소프트 삭제(deleted_at)로 바꾸거나
  -- 스코프를 좁히면 그 가드가 조용히 뚫린다.
  delete from public.chat_messages
  where room_id in (select id from public.chat_rooms where crew_id = p_crew_id);
  get diagnostics v_purged_messages = row_count;

  return query select true, null::text, v_cancelled_polls, v_cancelled_meetups, v_purged_messages;
end;
$$;

comment on function private.disband_crew(uuid, text) is
  'Task 040 후속 — FR-013 크루 해산 실제 구현(029B 2단 구조의 private DEFINER 쪽). 인가는 이 함수 안에서 재구현(auth.uid()·owner_id·status·크루명 확인) — SECURITY DEFINER가 RLS를 우회하므로. 32일차: 세 부수 효과 블록에 간접 방어 결합 주석 추가(로직 무변경).';
