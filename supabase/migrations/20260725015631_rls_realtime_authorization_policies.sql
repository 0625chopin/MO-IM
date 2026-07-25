-- 작성: CORE (Task 029B)
-- D-023 "Realtime은 Broadcast를 쓴다"의 남은 절반 — realtime.messages에 대한 Realtime
-- Authorization RLS(공식 문서 https://supabase.com/docs/guides/realtime/authorization,
-- context7/supabase search_docs로 확인, 이번 회차 근거 문서 §6 참고).
--
-- 토픽 명명 규칙(앱 코드 Task 033 인계 — Supabase 공식 "scope:id:entity" 관례를 따른다):
--   crew:{crewId}:chat          채팅 메시지 브로드캐스트(FR-051)
--   crew:{crewId}:polls         투표 상태·집계 브로드캐스트(FR-042)
--   user:{profileId}:notifications  개인 알림 브로드캐스트(FR-070)
-- "사용자당 1연결로 다중화"(D-023)는 클라이언트가 위 채널들을 전부 같은 Supabase Realtime
-- 클라이언트 인스턴스 하나로 구독하는 것으로 만족한다(연결당 채널 100 한도, R-019).
--
-- 이 마이그레이션은 "누가 어떤 토픽을 구독(select)할 수 있는가"만 정한다. 메시지 발행은
-- 클라이언트의 channel.send()가 아니라 DB 트리거의 realtime.broadcast_changes()가 담당하며
-- (D-023, postgres 소유 SECURITY DEFINER로 실행되어 테이블 소유자 자격으로 RLS를 우회한다 —
-- 029A §3·§6.3와 동일한 패턴), 그 브로드캐스트 트리거 자체(chat_messages/polls/notifications
-- 테이블에 부착)는 029B 범위가 아니라 Task 033이 앱 기능과 함께 구현한다(§7 이월 목록).
-- 그래서 realtime.messages에는 select 정책만 두고 insert 정책은 두지 않는다(클라이언트발
-- 직접 브로드캐스트를 아예 허용하지 않음 — D-023이 서버/DB 발신만 전제).

create policy "realtime_messages_select_crew_broadcast"
on "realtime"."messages"
for select
to authenticated
using (
  extension = 'broadcast'
  and topic ~ '^crew:[0-9a-fA-F-]{36}:(chat|polls)$'
  and private.is_active_crew_member(split_part(topic, ':', 2)::uuid)
);

create policy "realtime_messages_select_own_notifications"
on "realtime"."messages"
for select
to authenticated
using (
  extension = 'broadcast'
  and topic ~ '^user:[0-9a-fA-F-]{36}:notifications$'
  and split_part(topic, ':', 2)::uuid = (select auth.uid())
);
