-- Task 028: ChatRoom · ChatMessage (PRD §7)
-- 참조: D-009(12개월 후 배치 파기, 크루 해산 시 함께 파기), D-033(파티셔닝 미채택 —
--       pg_partman 대신 배치 DELETE 루프), D-023(Realtime Broadcast — 이 테이블은
--       DB 트리거 + realtime.broadcast_changes() 연결 대상이나 그 배선은 채팅 Task 몫),
--       R-003(chat.types.ts와 대조)

create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null unique references public.crews (id) on delete restrict
);

comment on table public.chat_rooms is 'PRD §7 ChatRoom. Crew와 1:1(unique crew_id).';

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete restrict,
  sender_id uuid not null references public.profiles (id) on delete restrict,
  type text not null check (type in ('text', 'post_link')),
  body text,
  -- 같은 크루 게시글로 제한(요구사항 5.2절) — 애플리케이션이 room의 crew와
  -- ref_post_id가 속한 board.crew_id 일치를 보장한다(교차 FK는 SQL 제약으로
  -- 직접 표현할 수 없어 이번 범위에서는 문서화만 하고, 검증은 데이터 접근 레이어 몫).
  ref_post_id uuid references public.posts (id) on delete restrict,
  -- 재전송 중복 방지 키(D-030 ②, Task 020B) — 전역 유일로 idempotency를 보장한다.
  client_key text not null unique,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (type = 'text' or ref_post_id is not null)
);

comment on table public.chat_messages is
  'PRD §7 ChatMessage. D-033: 파티셔닝 미채택 — 12개월 배치 DELETE 루프 대상 테이블(NFR-033). '
  '삭제 대상을 다른 테이블이 참조하지 않아 배치 DELETE가 FK 제약에 막히지 않는다.';

-- 채팅 메시지 피드 페이지네이션(NFR-003) 핵심 경로
create index idx_chat_messages_room_created on public.chat_messages (room_id, created_at desc);
-- D-033 배치 파기(12개월 경과) 스캔 경로 — Task 035(pg_cron 잡)가 이 인덱스를 쓴다
create index idx_chat_messages_created on public.chat_messages (created_at);

alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
