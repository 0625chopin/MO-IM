-- Task 044 (CORE) — FR-055(읽지 않은 메시지 표시) AC1·AC2.
--
-- `chat_messages`·`chat_rooms`에는 "마지막으로 읽은 지점"을 담을 자리가 처음부터 없었다
-- (Task 006·028이 20종 엔티티에 이 개념을 선반영하지 않았다 — FR-055는 requirements.md상
-- v1.0/C등급이라 v0.1 스키마 설계 범위 밖이었다). `notifications.read_at` + guard 트리거
-- (`rls_notification_moderation_audit_policies`)와 같은 "본인 행만, 지정 컬럼만" 패턴을
-- 새 테이블에 그대로 옮긴다 — 다만 `chat_room_reads`는 알림처럼 "서버가 만든 행을 본인이
-- read_at만 고친다"가 아니라 **행 자체를 본인이 소유·갱신**하는 구조라(방마다 최대 1행,
-- PK가 자연 복합키) `notifications_guard_read_only_self_update`류 컬럼 제한 트리거가 필요
-- 없다 — RLS의 `profile_id = auth.uid()` 자체가 유일한 불변식이다(제한할 "서버 전용 컬럼"이
-- 없다, `last_read_at`을 얼마로 쓰든 본인 읽음 상태에만 영향을 준다).
create table public.chat_room_reads (
  room_id uuid not null references public.chat_rooms (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  -- null = 이 방을 아직 한 번도 읽지 않았다(가입 이후 전체가 안읽음).
  last_read_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (room_id, profile_id)
);

comment on table public.chat_room_reads is
  'Task 044 — FR-055 읽지 않은 메시지 배지의 읽음 지점. 방(room_id)마다 사용자(profile_id)당
   최대 1행. last_read_at 이후 그 방에 도착한(본인이 보낸 메시지 제외) 메시지 수가 배지 값이다.';

alter table public.chat_room_reads enable row level security;

create policy "chat_room_reads_select_self"
  on public.chat_room_reads
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

-- INSERT·UPDATE 둘 다 "본인 + 그 방이 속한 크루의 활성 크루원"만 허용한다 — `chat_rooms_select_
-- members`·`chat_messages_insert_members`(029A)와 같은 조인 조건을 재사용해, 비소속자가 임의
-- room_id로 읽음 지점 행을 만드는 것을 막는다(정보 유출은 아니지만 다른 자기소유 쓰기 테이블과
-- 일관된 경계를 유지한다).
create policy "chat_room_reads_insert_self_member"
  on public.chat_room_reads
  for insert
  to authenticated
  with check (
    profile_id = (select auth.uid())
    and room_id in (
      select cr.id from public.chat_rooms cr
      join public.crew_memberships cm on cm.crew_id = cr.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

create policy "chat_room_reads_update_self_member"
  on public.chat_room_reads
  for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (
    profile_id = (select auth.uid())
    and room_id in (
      select cr.id from public.chat_rooms cr
      join public.crew_memberships cm on cm.crew_id = cr.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

-- 크루 목록 배지(AC1)가 필요로 하는 조회 패턴: room_id + profile_id 점조회는 PK로 이미 충분하고,
-- profile_id 단독(내 모든 읽음 지점을 한 번에)도 자주 쓰일 수 있어 별도 인덱스를 둔다.
create index idx_chat_room_reads_profile on public.chat_room_reads (profile_id);
