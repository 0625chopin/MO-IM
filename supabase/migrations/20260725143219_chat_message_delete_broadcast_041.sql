-- Task 041 (BOARD, 21일차, FR-054) — chat_messages_broadcast_trigger가 AFTER INSERT에만
-- 걸려 있어 소프트 삭제(UPDATE deleted_at)는 크루 채팅 토픽으로 브로드캐스트되지 않았다.
-- FR-054 AC1 "삭제되고 모든 접속자 화면에 실시간 반영된다"를 만족하려면 UPDATE도 쏴야 한다.
-- Task 033(19일차, BOARD)이 만든 트리거·함수를 이어서 손본다(같은 도메인, 같은 담당자).
--
-- chat_messages_broadcast()를 AFTER INSERT OR UPDATE로 확장하되, UPDATE는 "본문 자체는
-- 절대 안 바뀐다"(trg_chat_messages_guard_delete_only 트리거가 deleted_at 외 컬럼 변경을
-- 이미 막는다)는 전제 위에서 이벤트 타입만 'chat_message_deleted'로 바꿔 같은 payload
-- 모양을 재사용한다 — 클라이언트가 이벤트 타입만 보고 append/replace를 가른다.
create or replace function public.chat_messages_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crew_id uuid;
  v_sender_display_name text;
  v_sender_avatar_url text;
  v_event_type text;
begin
  -- UPDATE인데 deleted_at이 새로 채워진 게 아니면(이론상 다른 컬럼 변경 — 트리거가 막지만
  -- 방어적으로) 브로드캐스트하지 않는다.
  if tg_op = 'UPDATE' and old.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.deleted_at is null then
    return new;
  end if;

  v_event_type := case when tg_op = 'INSERT' then 'chat_message_created' else 'chat_message_deleted' end;

  select cr.crew_id into v_crew_id
  from public.chat_rooms cr
  where cr.id = new.room_id;

  if v_crew_id is null then
    return new;
  end if;

  select p.display_name, p.avatar_url
  into v_sender_display_name, v_sender_avatar_url
  from public.profiles p
  where p.id = new.sender_id;

  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'roomId', new.room_id,
      'senderId', new.sender_id,
      'senderDisplayName', coalesce(v_sender_display_name, ''),
      'senderAvatarUrl', v_sender_avatar_url,
      'type', new.type,
      'body', new.body,
      'refPostId', new.ref_post_id,
      'postLinkCard', null,
      'clientKey', new.client_key,
      'createdAt', new.created_at,
      'deletedAt', new.deleted_at
    ),
    v_event_type,
    'crew:' || v_crew_id::text || ':chat',
    true
  );
  return new;
end;
$$;

drop trigger if exists chat_messages_broadcast_trigger on public.chat_messages;
create trigger chat_messages_broadcast_trigger
  after insert or update on public.chat_messages
  for each row execute function public.chat_messages_broadcast();
