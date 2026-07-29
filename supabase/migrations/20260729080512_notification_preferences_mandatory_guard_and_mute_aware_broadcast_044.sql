-- Task 044 (CORE) — FR-072(알림 환경설정) AC1·AC2·AC3.
--
-- I-091이 "notification_preferences는 self-service 컬럼값 제한이 전무하지만 비즈니스 불변식이
-- 아니라 위험 낮음"이라고 판정한 대조군이었다 — 그 판정은 FR-072 AC3("투표 종료·강퇴 알림은
-- 끌 수 없다")가 아직 스코프에 없던 시점의 것이다. AC3이 생기면서 이 두 타입만은 "개인 알림
-- 설정"이 아니라 "권리·의무에 영향을 주는 필수 알림"이 되어 I-091의 전제가 깨진다 — 실측
-- (begin…rollback)으로 `insert into notification_preferences (type='poll_closed', enabled=false)`
-- 가 오늘 그대로 성공함을 먼저 확인했다.
create or replace function public.notification_preferences_guard_mandatory_types()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.enabled = false and new.type in ('poll_closed', 'member_removed') then
    raise exception 'notification type % cannot be disabled (FR-072 AC3)', new.type;
  end if;
  return new;
end;
$$;

comment on function public.notification_preferences_guard_mandatory_types() is
  'Task 044 — FR-072 AC3. poll_closed(투표 종료)·member_removed(강퇴)는 self-service로 끌 수
   없다. DELETE는 막지 않는다 — 행이 없으면 기본값(enabled)으로 취급되므로 삭제는 무해하다.';

create trigger trg_notification_preferences_guard_mandatory_types
  before insert or update on public.notification_preferences
  for each row
  execute function public.notification_preferences_guard_mandatory_types();

-- AC1(유형별 끄기)·AC2(크루별 끄기) — 토스트 표시 경로(`notifications_broadcast`, Task 033)에서
-- 한 번만 판정한다. `notifications` INSERT(행 자체, FR-071 알림 센터용)는 그대로 두고 실시간
-- 브로드캐스트만 음소거한다 — "꺼도 센터에는 남는다"는 요구가 없지만(FR-072 AC 원문에 그런
-- 요구는 없다) 끄는 것은 "토스트를 안 띄운다"이지 "기록을 지운다"가 아니라는 게 자연스러운
-- 해석이고, FR-071 AC1(헤더 배지)이 이 INSERT에 의존하므로 건드리면 다른 FR을 깬다.
-- 우선순위: 크루별 설정(있으면) > 전역 설정(있으면) > 기본값 켬(행 없음). 필수 타입은 이 검사
-- 자체를 생략한다(가드 트리거가 이미 enabled=false 행을 만들 수 없게 막지만, 이중 방어로 남긴다).
create or replace function public.notifications_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew_id uuid;
  v_muted boolean;
begin
  if new.type not in ('poll_closed', 'member_removed') then
    v_crew_id := nullif(new.payload->>'crewId', '')::uuid;

    select coalesce(
      (select not enabled from public.notification_preferences
        where profile_id = new.recipient_id and type = new.type and crew_id = v_crew_id),
      (select not enabled from public.notification_preferences
        where profile_id = new.recipient_id and type = new.type and crew_id is null),
      false
    ) into v_muted;

    if v_muted then
      return new;
    end if;
  end if;

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

comment on function public.notifications_broadcast() is
  'Task 033 실시간 알림 브로드캐스트 + Task 044(FR-072) 음소거 인지. notifications INSERT
   자체는 항상 일어난다(FR-071 알림 센터 보존) — 이 함수는 realtime.send만 조건부로 건너뛴다.
   우선순위: 크루별 설정 > 전역 설정 > 기본값(켬). poll_closed·member_removed는 검사 없이
   항상 보낸다(AC3, 가드 트리거의 이중 방어).';
