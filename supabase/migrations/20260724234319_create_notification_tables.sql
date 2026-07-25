-- Task 028: Notification · NotificationPreference (PRD §7)
-- 참조: NFR-038(채널 추상화), D-004(v0.1은 in_app만 발송, Push는 차기),
--       CON-07(알림 도메인 모델은 지금 설계), R-003(notification.types.ts와 대조)

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete restrict,
  type text not null check (type in (
    'poll_closed', 'join_request_received', 'join_request_approved', 'join_request_rejected',
    'invitation_received', 'staff_appointed', 'member_removed', 'meetup_created',
    'meetup_cancelled', 'post_commented'
  )),
  -- NFR-038: 채널 추가 시 알림 생성 지점 무수정 — channel은 데이터일 뿐 분기 로직이 아니다.
  channel text not null check (channel in ('in_app', 'web_push', 'native_push')),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'PRD §7 Notification. 생성은 서버 로직 전용(NFR-011/029A에서 client insert 거부 예정).';

-- 인앱 알림 센터의 미읽음 배지·최신순 목록 조회 경로
create index idx_notifications_recipient_created
  on public.notifications (recipient_id, created_at desc);
create index idx_notifications_recipient_unread
  on public.notifications (recipient_id) where read_at is null;

create table public.notification_preferences (
  -- crew_id가 nullable(전역 설정)이라 자연 복합키를 PK로 못 쓰므로 대리키를 둔다.
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete restrict,
  type text not null check (type in (
    'poll_closed', 'join_request_received', 'join_request_approved', 'join_request_rejected',
    'invitation_received', 'staff_appointed', 'member_removed', 'meetup_created',
    'meetup_cancelled', 'post_commented'
  )),
  -- null이면 전역 설정(모든 크루), 값이 있으면 해당 크루에서만 끈다.
  crew_id uuid references public.crews (id) on delete restrict,
  enabled boolean not null default true
);

comment on table public.notification_preferences is 'PRD §7 NotificationPreference(FR-072, v1.0). crew_id nullable이라 부분 유니크 2종으로 유일성을 나눠 표현.';

create unique index uq_notification_prefs_global
  on public.notification_preferences (profile_id, type) where crew_id is null;
create unique index uq_notification_prefs_per_crew
  on public.notification_preferences (profile_id, type, crew_id) where crew_id is not null;

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

-- DevicePushToken(FR-073, 차기 v1.0+)은 D-004 결정에 따라 이번 회차에는 테이블을
-- 만들지 않는다 — src/lib/types/notification.types.ts의 타입 자리만 유지한다.
