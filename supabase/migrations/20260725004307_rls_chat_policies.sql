-- Task 029A: RLS 정책 — ChatRoom · ChatMessage
-- 참조: FR-051·054, D-028
--
-- 중요: 이 마이그레이션은 DESIGN의 Task 035(채팅 12개월 자동 파기 pg_cron 배치)와 같은
-- chat_messages 테이블을 공유한다. anon/authenticated를 대상으로 한 정책만 추가하고,
-- `FORCE ROW LEVEL SECURITY`는 켜지 않는다 — 테이블 소유자(postgres)와 service_role은
-- rolbypassrls=true로 실측 확인했다(아래 검증 결과, 문서 §029/035 경계 참고). 파기
-- 배치가 테이블 소유자 또는 service_role로 실행되는 한 이 RLS 정책들은 그 DELETE를
-- 막지 않는다.

create policy "chat_rooms_select_members"
  on public.chat_rooms
  for select
  to authenticated
  using (
    crew_id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

create policy "chat_rooms_insert_owner"
  on public.chat_rooms
  for insert
  to authenticated
  with check (crew_id in (select c.id from public.crews c where c.owner_id = (select auth.uid())));

create policy "chat_messages_select_members"
  on public.chat_messages
  for select
  to authenticated
  using (
    room_id in (
      select cr.id from public.chat_rooms cr
      join public.crew_memberships cm on cm.crew_id = cr.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

-- 메시지 전송(FR-051) — 크루원 이상, 관리자는 매트릭스상 제외.
create policy "chat_messages_insert_members"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and room_id in (
      select cr.id from public.chat_rooms cr
      join public.crew_memberships cm on cm.crew_id = cr.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active'
    )
  );

-- 삭제(FR-054, 소프트 — deleted_at)만 있고 "메시지 수정" 행위는 매트릭스에 아예 없다.
-- 그래서 UPDATE 권한은 "본인 메시지 또는 임원 이상"까지 열되, 아래 트리거가 발신자
-- 포함 누구에게도 deleted_at 외 컬럼 변경을 허용하지 않는다.
create policy "chat_messages_update_self_or_staff_delete"
  on public.chat_messages
  for update
  to authenticated
  using (
    sender_id = (select auth.uid())
    or room_id in (
      select cr.id from public.chat_rooms cr
      join public.crew_memberships cm on cm.crew_id = cr.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  )
  with check (
    sender_id = (select auth.uid())
    or room_id in (
      select cr.id from public.chat_rooms cr
      join public.crew_memberships cm on cm.crew_id = cr.crew_id
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
  );

create function public.chat_messages_guard_delete_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'deleted_at') is distinct from (to_jsonb(old) - 'deleted_at') then
    raise exception 'chat_messages content cannot be edited via UPDATE (no edit FR exists) — only deleted_at may change';
  end if;
  return new;
end;
$$;

comment on function public.chat_messages_guard_delete_only() is
  'Task 029A — 채팅 메시지는 수정 기능이 없다(자기/타인 삭제만 매트릭스에 존재). UPDATE는 소프트 삭제 전용.';

create trigger trg_chat_messages_guard_delete_only
  before update on public.chat_messages
  for each row
  execute function public.chat_messages_guard_delete_only();

create index idx_chat_messages_sender on public.chat_messages (sender_id);
