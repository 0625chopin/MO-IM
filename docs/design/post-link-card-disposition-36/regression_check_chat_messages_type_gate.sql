-- I-063 (d)안 적용 후 회귀 검증 스크립트 (36일차, BOARD).
-- 전부 begin...rollback으로 감싼다 — 실행해도 DB에 흔적이 남지 않는다.
-- 적용 전 베이스라인은 36일차에 이미 실측해 뒀다(아래 각 블록의 "적용 전 실측" 참고).
-- 팀장이 apply_migration을 마쳤다고 알린 뒤, 세 블록을 각각 실행해 "적용 후 기대"와
-- 일치하는지 확인한다.

-- ============================================================
-- ① 일반 text 메시지 전송이 여전히 성공하는가
-- 적용 전 실측(36일차): 성공(INSERT 반환 1행) — 애초에 이 정책이 항상 허용해 온 경로다.
-- 적용 후 기대: 변화 없음(성공) — type='text'는 새 게이트를 그대로 통과한다.
-- ============================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a","role":"authenticated"}';

insert into public.chat_messages (room_id, sender_id, type, body, client_key)
values (
  'b89069ce-e293-42ce-922a-4c4c7dc45ba3', -- chopin0625이 활성 멤버(owner)인 방 — 크루 21fb8c31
  '30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a',
  'text',
  'i063 회귀검증 ① 일반 text 메시지',
  'i063-regcheck-1-text'
)
returning 'check1_text_still_succeeds' as check_name, id, type, body;

rollback;

-- ============================================================
-- ② type='post_link' 직접 INSERT가 이제 거부되는가(42501)
-- 적용 전 실측(36일차, §7.2 실증): 성공했다(RLS·CHECK·FK 전부 통과) — 이것이 원 결함이다.
-- 적용 후 기대: 42501(new row violates row-level security policy)로 즉시 거부.
-- 아래는 그대로 실행하면 지금은 "성공"이 나온다 — 적용 전에는 실패해야 정상인 게 아니라
-- 오히려 "지금은 성공한다"가 원 결함의 재확인이다. 적용 후 이 블록을 다시 돌려 결과가
-- 예외(42501)로 바뀌었는지 확인한다.
-- ============================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a","role":"authenticated"}';

insert into public.chat_messages (room_id, sender_id, type, body, ref_post_id, client_key)
values (
  'b89069ce-e293-42ce-922a-4c4c7dc45ba3',
  '30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a',
  'post_link', null,
  'f3430577-8929-4a9a-97b2-3ff26c6fc5a6', -- 다른 크루(32aca4a8) 게시글 — 크루 불일치까지 재현
  'i063-regcheck-2-postlink'
)
returning 'check2_postlink_should_now_be_rejected' as check_name, id, type, ref_post_id;

rollback;

-- ============================================================
-- ③ 기존 post_link 12건이 여전히 조회되는가(SELECT 정책 무변경 확인)
-- 적용 전 실측(36일차): 크루원 세션으로 자기 크루 방의 post_link 메시지가 정상 조회된다.
-- 적용 후 기대: 변화 없음 — chat_messages_select_members는 이번 변경 대상이 아니다.
-- ============================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a","role":"authenticated"}';

select 'check3_existing_postlink_still_selectable' as check_name, id, type, ref_post_id, room_id
from public.chat_messages
where type = 'post_link' and room_id = 'b89069ce-e293-42ce-922a-4c4c7dc45ba3';

rollback;
