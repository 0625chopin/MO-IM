-- Task 033 (BOARD) — Realtime Broadcast 발신 트리거 3종
--
-- 029B(rls-policies-029b.md §6.2)가 "누가 구독(select)할 수 있는가"(realtime.messages
-- Authorization 정책 2건)까지만 만들고 "무엇을 언제 보낼지"는 이 회차로 인계했다. 여기서는
-- INSERT(chat_messages·notifications)와 poll_votes/polls 변경에 realtime.send()를 붙인다.
--
-- realtime.send 시그니처(실측, pg_proc): send(payload jsonb, event text, topic text, private
-- boolean) — 029B 문서가 예시로 든 broadcast_changes(8인자, TG_OP를 event로 씀)가 아니라 더
-- 낮은 수준의 send()를 쓴다. 이유: broadcast_changes는 NEW/OLD 원본 컬럼만 직렬화하는데,
-- 채팅 메시지는 소비자(MessageRoomContainer)가 발신자 표시 이름·아바타까지 필요한
-- MessageViewModel 모양을 기대한다(profiles JOIN 필요) — send()로 직접 JSON을 구성해야
-- 그 조인을 넣을 수 있다. 투표·알림도 같은 이유로 send()로 통일했다.
--
-- 토픽 규칙은 029B §6.1 그대로: crew:{crewId}:chat · crew:{crewId}:polls ·
-- user:{profileId}:notifications.

-- ============================================================
-- 1) chat_messages → crew:{crewId}:chat (FR-051)
-- ============================================================
-- postLinkCard(FR-052 게시글 공유 카드)는 이 트리거에서 채우지 않는다 — resolvePostLinkCard가
-- "삭제됨/다른 크루" 같은 도메인 판정을 하는 TS 전용 로직(lib/rules 재사용 원칙, NFR-036)이라
-- SQL로 옮기지 않았다. 실사용 경로(sendChatMessageAction)는 현재 type: "text"만 만들어
-- 이 gap이 실제로 닿지 않는다 — docs/decisions/realtime-broadcast-033.md §4 참고.
create or replace function public.chat_messages_broadcast()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
declare
  v_crew_id uuid;
  v_sender_display_name text;
  v_sender_avatar_url text;
begin
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
    'chat_message_created',
    'crew:' || v_crew_id::text || ':chat',
    true
  );
  return new;
end;
$$;

revoke all on function public.chat_messages_broadcast() from public, anon, authenticated;

drop trigger if exists chat_messages_broadcast_trigger on public.chat_messages;
create trigger chat_messages_broadcast_trigger
after insert on public.chat_messages
for each row execute function public.chat_messages_broadcast();

-- ============================================================
-- 2) notifications → user:{profileId}:notifications (FR-070)
-- ============================================================
-- notifications는 client INSERT가 애초에 막혀 있다(RLS에 INSERT 정책 없음, 029A/029B) — 생성은
-- 전부 서버(Server Action/RPC, SECURITY DEFINER 등)를 거치므로 이 트리거는 그 모든 경로를
-- 공통으로 커버한다.
create or replace function public.notifications_broadcast()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'recipientId', new.recipient_id,
      'type', new.type,
      'channel', new.channel,
      'payload', new.payload,
      'readAt', new.read_at,
      'createdAt', new.created_at
    ),
    'notification_created',
    'user:' || new.recipient_id::text || ':notifications',
    true
  );
  return new;
end;
$$;

revoke all on function public.notifications_broadcast() from public, anon, authenticated;

drop trigger if exists notifications_broadcast_trigger on public.notifications;
create trigger notifications_broadcast_trigger
after insert on public.notifications
for each row execute function public.notifications_broadcast();

-- ============================================================
-- 3) poll_votes / polls → crew:{crewId}:polls (FR-042 AC2, "3초 이내 집계 갱신")
-- ============================================================
-- 집계값 자체(찬성/반대/기권 수, 정족수, D-031 5명 미만 은닉 등)는 이 트리거가 계산하지
-- 않는다 — poll_vote_tally RPC·lib/rules 순수 함수(NFR-036)가 이미 그 판정을 갖고 있고,
-- 트리거에서 다시 계산하면 판정 로직이 두 곳으로 갈라진다(R-015가 금지하는 바로 그 패턴).
-- 그래서 페이로드는 "이 투표가 바뀌었다"는 가벼운 핑(pollId)만 보내고, 클라이언트
-- (PollLiveContainer)는 이를 받으면 router.refresh()로 서버 컴포넌트(PollPanelContainer)를
-- 다시 렌더해 최신 집계를 서버에서 다시 계산한다 — Server Action + refresh() 패턴(CLAUDE.md
-- D-030)을 실시간 갱신에도 그대로 적용한 것이다.
create or replace function public.poll_votes_broadcast()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
declare
  v_poll_id uuid := coalesce(new.poll_id, old.poll_id);
  v_crew_id uuid;
begin
  select b.crew_id into v_crew_id
  from public.polls pl
  join public.posts po on po.id = pl.post_id
  join public.boards b on b.id = po.board_id
  where pl.id = v_poll_id;

  if v_crew_id is null then
    return coalesce(new, old);
  end if;

  perform realtime.send(
    jsonb_build_object('pollId', v_poll_id),
    'poll_tally_updated',
    'crew:' || v_crew_id::text || ':polls',
    true
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.poll_votes_broadcast() from public, anon, authenticated;

drop trigger if exists poll_votes_broadcast_trigger on public.poll_votes;
create trigger poll_votes_broadcast_trigger
after insert or update on public.poll_votes
for each row execute function public.poll_votes_broadcast();

create or replace function public.polls_broadcast()
returns trigger
security definer
language plpgsql
set search_path = ''
as $$
declare
  v_crew_id uuid;
begin
  if new.status = old.status and new.result is not distinct from old.result then
    return new;
  end if;

  select b.crew_id into v_crew_id
  from public.posts po
  join public.boards b on b.id = po.board_id
  where po.id = new.post_id;

  if v_crew_id is null then
    return new;
  end if;

  perform realtime.send(
    jsonb_build_object('pollId', new.id, 'status', new.status),
    'poll_tally_updated',
    'crew:' || v_crew_id::text || ':polls',
    true
  );
  return new;
end;
$$;

revoke all on function public.polls_broadcast() from public, anon, authenticated;

drop trigger if exists polls_broadcast_trigger on public.polls;
create trigger polls_broadcast_trigger
after update on public.polls
for each row execute function public.polls_broadcast();
