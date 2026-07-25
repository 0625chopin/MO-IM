-- Task 031(17일차, DESIGN) 시드 철거 스크립트 — 참고용, 자동 실행되지 않는다.
--
-- `supabase/seed.sql`이 넣은 데이터를 지우는 역순 스크립트다. 팀장 조건 4(17일차) —
-- `docs/decisions/read-path-realdata-031.md` §3·§9가 인용한 `schema-migration-028.md`의
-- 경고대로, 콘텐츠 테이블(`crews.owner_id`·`posts.author_id`·`poll_votes.voter_id` 등)이
-- 전부 `profiles(id)`를 **`ON DELETE RESTRICT`**로 참조한다 — 콘텐츠를 먼저 지우지 않으면
-- `profiles`·`auth.users` 삭제가 그대로 거부된다(FK 위반). 그래서 반드시 이 순서(자식 →
-- 부모)를 지킨다.
--
-- **주의**: 이 파일은 `supabase/seed.sql`과 별도로 둔다 — `supabase db reset`은
-- `seed.sql`만 자동 실행하므로, 이 파일이 같은 곳에 있으면 로컬 재현 시 실수로 함께
-- 실행될 위험이 있다. 실행 전 아래 두 필터 조건을 반드시 확인할 것:
-- 1. `크루명 in (...)` — 이번 시드가 만든 12개 크루 이름 리스트(seed.sql §3과 동일).
-- 2. `이메일 like '%@mo-im.invalid'` — 로그인 불가능한 시드 전용 auth.users(팀장 조건 1).
--
-- CREW의 실 로그인 계정(`chopin0625`·`0625chopin`, 이메일 `*@gmail.com`)의 `profiles`·
-- `auth.users` 행 자체는 이 스크립트가 절대 지우지 않는다 — 그 두 계정이 시드 크루에 가입한
-- `crew_memberships` 행만(11단계) 시드 크루 정리의 부수효과로 함께 지워진다(계정 자체는 남는다).

begin;

create temp table seed_crew_ids on commit drop as
select id from public.crews where name in (
  '주말 러닝 클럽','심야 독서 모임','알고리즘 스터디','전시 투어 소셜','홈쿠킹 클럽',
  '국내 여행 메이트','보드게임 나이트','주말 봉사단','육아 정보 나눔','강아지 산책 모임',
  '재테크 스터디','출사 모임'
);

create temp table seed_board_ids on commit drop as
select id from public.boards where crew_id in (select id from seed_crew_ids);

create temp table seed_post_ids on commit drop as
select id from public.posts where board_id in (select id from seed_board_ids);

create temp table seed_poll_ids on commit drop as
select id from public.polls where post_id in (select id from seed_post_ids);

create temp table seed_meetup_ids on commit drop as
select id from public.meetups where crew_id in (select id from seed_crew_ids);

create temp table seed_room_ids on commit drop as
select id from public.chat_rooms where crew_id in (select id from seed_crew_ids);

-- 1) 리프 테이블
delete from public.chat_messages where room_id in (select id from seed_room_ids);
delete from public.meetup_attendances where meetup_id in (select id from seed_meetup_ids);
delete from public.poll_votes where poll_id in (select id from seed_poll_ids);
delete from public.poll_eligible_voters where poll_id in (select id from seed_poll_ids);

-- 2) meetups → polls → posts
delete from public.meetups where id in (select id from seed_meetup_ids);
delete from public.polls where id in (select id from seed_poll_ids);
delete from public.posts where id in (select id from seed_post_ids);

-- 3) 크루 스코프가 아닌 것(알림·시드 프로필 대상만 — CREW 실계정 알림은 건드리지 않는다)
delete from public.notifications
where recipient_id in (select id from public.profiles where handle like 'seed_%');

-- 4) join_requests·invitations (크루 스코프)
delete from public.join_requests where crew_id in (select id from seed_crew_ids);
delete from public.invitations where crew_id in (select id from seed_crew_ids);

-- 5) crew_memberships(크루 스코프 — chopin0625/chopin_0625의 시드 크루 가입 행도 함께 지워짐,
--    두 계정 자체(profiles/auth.users)는 지우지 않는다)
delete from public.crew_memberships where crew_id in (select id from seed_crew_ids);

-- 6) boards·chat_rooms·crews
delete from public.boards where id in (select id from seed_board_ids);
delete from public.chat_rooms where id in (select id from seed_room_ids);
delete from public.crews where id in (select id from seed_crew_ids);

-- 7) 시드 전용 profiles·auth.users(핸들/이메일 패턴으로만 식별 — CREW 실계정과 절대 겹치지 않음)
delete from public.profiles where handle like 'seed_%';
delete from auth.users where email like '%@mo-im.invalid';

-- 8) 잔여 확인(0이어야 정상)
select
  (select count(*) from public.profiles where handle like 'seed_%') as remaining_seed_profiles,
  (select count(*) from auth.users where email like '%@mo-im.invalid') as remaining_seed_auth_users,
  (select count(*) from public.crews where name in (
    '주말 러닝 클럽','심야 독서 모임','알고리즘 스터디','전시 투어 소셜','홈쿠킹 클럽',
    '국내 여행 메이트','보드게임 나이트','주말 봉사단','육아 정보 나눔','강아지 산책 모임',
    '재테크 스터디','출사 모임'
  )) as remaining_seed_crews;

commit;
-- 실사용 전 `rollback;`으로 바꿔 먼저 드라이런하는 것을 권장한다.
