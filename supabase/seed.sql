-- Task 031(17일차, DESIGN) 시드 데이터.
--
-- 목적: 21개 도메인 테이블이 전부 0행이라 읽기 경로(src/lib/data/supabase/*)를 검증할 수
-- 없었다. NFR-005("소속 크루 12개 · 월 Meetup 60건" 기준선, R-017)를 만족하는 규모로
-- 최소한의 관계형 데이터를 채운다. 실행 순서는 FK 의존 순서를 그대로 따른다:
-- auth.users → profiles → crews → boards/chat_rooms → crew_memberships →
-- posts → polls → meetups → poll_eligible_voters/poll_votes → meetup_attendances →
-- chat_messages → notifications → join_requests/invitations.
--
-- **중요(설계 문서 §3 참고)**: `public.profiles.id`는 `auth.users(id)` FK를 실제로 갖는다
-- (17일차 발견 — `schema-migration-028.md`가 이미 문서화해 둔 사실을 내가 처음에 놓쳤을 뿐,
-- 문서 자체는 옳았다. 팀장 확인·정정 경위는 `docs/decisions/read-path-realdata-031.md` §3).
-- 그래서 시드 전용 `auth.users` 행을 먼저 만들어야 `profiles`에 행을 넣을 수 있다.
--
-- **팀장 조건(17일차 블로커 승인 회신) 반영**:
-- 1. 이메일은 RFC 2606 예약 TLD `seed-N@mo-im.invalid`를 쓴다 — 어떤 경로로도 실제 메일이
--    나가지 않음이 보장된다.
-- 2. `encrypted_password = ''`로 비워 인증이 구조적으로 성립할 수 없게 한다(로그인 불가).
-- 3. 로그인 가능한 실제 테스트 계정 2개(`chopin0625`·`chopin_0625`)는 CREW(Task 030)가 이미
--    만들었으므로 그 값을 그대로 조회해 쓴다 — 이 파일이 그 두 계정을 만들거나 고치지 않는다.
-- 4. 철거(역순 삭제) 스크립트는 `supabase/seed-teardown.sql`(별도 파일 — 실수로 함께 실행되지
--    않도록 분리)에 있다.
--
-- 이 파일은 **기록용 겸 재현용**이다 — 실제 실행은 `mcp__supabase__execute_sql`로 원격
-- MO-IM 프로젝트(damruradpliktkrlkakl)에 여러 차례 나눠 적용했다(설계 문서 §9 실행 로그
-- 참고). `supabase db reset` 같은 로컬 재현 환경에서 그대로 실행해 본 적은 없다(로컬 스택을
-- 이번 회차에 쓰지 않았다, 정직하게 표기).
--
-- **⚠️ 이 파일은 idempotent하지 않다 — 정정(17일차, CREW 교차검증이 발견, 팀장이 반영 지시).**
-- 최초 판은 "재실행해도 중복 삽입되지 않는다"고 적었으나 **실측하지 않고 쓴 서술이었다.**
-- 신원·소속 섹션(1~5: auth.users·profiles·crews·boards/chat_rooms·crew_memberships)만
-- `on conflict`/`where not exists`가 자연키(이메일·핸들·크루명·crew_id) 기준이라 실제로
-- idempotent하다. **섹션 6·8·12·13(콘텐츠: posts/polls/meetups·진행중 투표·notifications·
-- join_requests/invitations)은 idempotent하지 않다** — `id`가 매번 `gen_random_uuid()`라
-- `on conflict`가 절대 걸리지 않거나(섹션 6·8·12는 가드 자체가 없다), 걸려도 상위 poll_id/
-- meetup_id가 매번 새로 생겨 연쇄로 무력화된다(섹션 7·10). **재실행 시 콘텐츠가 그대로
-- 중복 생성된다**(실측, 17일차: posts(meetup_proposal) 62→122, polls 62→122, meetups
-- 60→120 — `begin...rollback`으로 원본 데이터 훼손 없이 확인, 설계 문서 §9.2 참고).
--
-- **재적용 절차**: 이 파일을 다시 실행하기 전에 반드시 `supabase/seed-teardown.sql`을 먼저
-- 실행해 콘텐츠를 지워라. 신원·소속 섹션만 재실행하고 싶다면(예: 새 시드 프로필 추가) 섹션
-- 1~5만 골라 실행해도 안전하다.
--
-- **왜 결정론적 id로 다시 쓰지 않았는가(판단, 팀장 승인)**: 60여 건의 CTE 체인(posts→polls→
-- meetups, 여러 단계 조인)을 자연키 기반 `on conflict`로 전부 바꾸려면 각 단계마다 안정적인
-- 자연키(예: "크루+회차 번호")를 설계하고 그 키로 `on conflict`를 다시 태워야 한다 — 이
-- 시점에 그 비용을 들이는 것보다, **"idempotent하지 않다"는 사실을 정확히 문서화하고 철거
-- 후 재적용 절차를 강제하는 쪽**이 더 저렴하고 안전하다고 판단했다(팀장도 정당한 선택으로
-- 확인). 재현 스크립트로서의 가치(§9 실행 로그·구조 기록)는 그대로 유지된다.

-- =========================================================================
-- 1) 시드 전용 auth.users (로그인 불가 — encrypted_password 빈 문자열, 이메일 .invalid TLD)
-- =========================================================================
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, confirmation_token, recovery_token,
  email_change, email_change_token_new, is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated', 'authenticated',
  v.email,
  '',
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, '', '', '', '', false, false
from (values
  ('seed-1@mo-im.invalid'), ('seed-2@mo-im.invalid'), ('seed-3@mo-im.invalid'),
  ('seed-4@mo-im.invalid'), ('seed-5@mo-im.invalid'), ('seed-6@mo-im.invalid'),
  ('seed-7@mo-im.invalid'), ('seed-8@mo-im.invalid'), ('seed-9@mo-im.invalid'),
  ('seed-10@mo-im.invalid'), ('seed-11@mo-im.invalid'), ('seed-12@mo-im.invalid'),
  ('seed-13@mo-im.invalid'), ('seed-14@mo-im.invalid'), ('seed-15@mo-im.invalid'),
  ('seed-16@mo-im.invalid'), ('seed-17@mo-im.invalid'), ('seed-18@mo-im.invalid'),
  ('seed-19@mo-im.invalid')
) as v(email)
where not exists (select 1 from auth.users u where u.email = v.email);

-- =========================================================================
-- 2) profiles — 시드 전용 19명 + chopin0625/chopin_0625(CREW Task 030, 이미 존재하는 행을
--    조회만 한다 — 이 파일이 그 두 행을 만들거나 수정하지 않는다)
-- =========================================================================
insert into public.profiles (id, handle, display_name, avatar_url, bio, status, search_opt_out)
select u.id, v.handle, v.display_name, null, v.bio, 'active', v.search_opt_out
from (values
  ('seed-1@mo-im.invalid', 'seed_owner02', '박도윤', null, false),
  ('seed-2@mo-im.invalid', 'seed_owner03', '최하은', null, false),
  ('seed-3@mo-im.invalid', 'seed_owner04', '정우진', null, false),
  ('seed-4@mo-im.invalid', 'seed_owner05', '김서아', null, false),
  ('seed-5@mo-im.invalid', 'seed_owner06', '이준호', null, false),
  ('seed-6@mo-im.invalid', 'seed_owner07', '한지민', null, false),
  ('seed-7@mo-im.invalid', 'seed_owner08', '오세훈', null, false),
  ('seed-8@mo-im.invalid', 'seed_owner09', '장미소', null, false),
  ('seed-9@mo-im.invalid', 'seed_owner10', '윤태양', null, false),
  ('seed-10@mo-im.invalid', 'seed_owner11', '배수지', null, false),
  ('seed-11@mo-im.invalid', 'seed_owner12', '문경수', null, false),
  ('seed-12@mo-im.invalid', 'seed_member01', '강나은', null, false),
  ('seed-13@mo-im.invalid', 'seed_member02', '조현우', null, false),
  ('seed-14@mo-im.invalid', 'seed_member03', '임수빈', null, false),
  ('seed-15@mo-im.invalid', 'seed_member04', '유지호', null, false),
  ('seed-16@mo-im.invalid', 'seed_member05', '신아름', null, false),
  ('seed-17@mo-im.invalid', 'seed_member06', '권민재', null, false),
  ('seed-18@mo-im.invalid', 'seed_outsider01', '백승기', '아직 어느 크루에도 속하지 않음(가입 신청·초대 테스트용).', false),
  ('seed-19@mo-im.invalid', 'seed_outsider02', '남소율', null, true)
) as v(email, handle, display_name, bio, search_opt_out)
join auth.users u on u.email = v.email
on conflict (handle) do nothing;

-- =========================================================================
-- 3) crews(12) — chopin0625를 "12개 크루 소속" NFR-005 기준선의 시점 인물(visor)로 삼는다.
-- =========================================================================
with owner_ids as (
  select handle, id from public.profiles where handle in
    ('chopin0625','seed_owner02','seed_owner03','seed_owner04','seed_owner05','seed_owner06',
     'seed_owner07','seed_owner08','seed_owner09','seed_owner10','seed_owner11','seed_owner12')
)
insert into public.crews (id, name, description, category, visibility, color_key, owner_id, status)
select gen_random_uuid(), v.name, v.description, v.category, v.visibility, v.color_key, o.id, 'active'
from (values
  ('주말 러닝 클럽', '매주 토요일 아침 한강에서 함께 뜁니다.', '운동', 'public', 0, 'chopin0625'),
  ('심야 독서 모임', '격주로 모여 책 얘기를 나눕니다.', '취미', 'private', 1, 'seed_owner02'),
  ('알고리즘 스터디', '매주 화요일 온라인으로 문제를 함께 풉니다.', '스터디', 'public', 2, 'seed_owner03'),
  ('전시 투어 소셜', '주말마다 서울 시내 전시를 함께 관람합니다.', '문화', 'public', 3, 'seed_owner04'),
  ('홈쿠킹 클럽', '매달 한 번 모여 요리를 나눕니다.', '음식', 'private', 4, 'seed_owner05'),
  ('국내 여행 메이트', '분기별 국내 소도시 여행을 함께 갑니다.', '여행', 'public', 5, 'seed_owner06'),
  ('보드게임 나이트', '금요일 저녁 보드게임 카페에서 모입니다.', '게임', 'public', 6, 'seed_owner07'),
  ('주말 봉사단', '매달 둘째 주 토요일 지역 봉사에 나갑니다.', '봉사', 'private', 7, 'seed_owner08'),
  ('육아 정보 나눔', '육아 정보와 고민을 나누는 모임입니다.', '육아', 'public', 8, 'seed_owner09'),
  ('강아지 산책 모임', '주말 오전 반려견과 함께 산책합니다.', '반려동물', 'public', 9, 'seed_owner10'),
  ('재테크 스터디', '매주 재테크·투자 정보를 스터디합니다.', '재테크', 'private', 10, 'seed_owner11'),
  ('출사 모임', '매달 출사 장소를 정해 함께 촬영합니다.', '사진', 'public', 11, 'seed_owner12')
) as v(name, description, category, visibility, color_key, owner_handle)
join owner_ids o on o.handle = v.owner_handle
where not exists (select 1 from public.crews c where c.name = v.name);

-- =========================================================================
-- 4) boards·chat_rooms — 크루당 1개씩(1:1 unique crew_id).
-- =========================================================================
insert into public.boards (id, crew_id)
select gen_random_uuid(), c.id from public.crews c
where not exists (select 1 from public.boards b where b.crew_id = c.id);

insert into public.chat_rooms (id, crew_id)
select gen_random_uuid(), c.id from public.crews c
where not exists (select 1 from public.chat_rooms r where r.crew_id = c.id);

-- =========================================================================
-- 5) crew_memberships — 오너 12 + visor(chopin0625) 11(나머지 크루) + 멤버 20.
-- =========================================================================
insert into public.crew_memberships (crew_id, profile_id, role, status, joined_at, removed_reason)
select c.id, c.owner_id, 'owner', 'active', now() - interval '60 days', null
from public.crews c
on conflict (crew_id, profile_id) do nothing;

with visor as (select id from public.profiles where handle = 'chopin0625'),
     target_crews as (
       select id, row_number() over (order by name) as rn from public.crews
       where name <> '주말 러닝 클럽'
     )
insert into public.crew_memberships (crew_id, profile_id, role, status, joined_at, removed_reason)
select tc.id, v.id, case when tc.rn <= 6 then 'staff' else 'member' end, 'active', now() - interval '45 days', null
from target_crews tc cross join visor v
on conflict (crew_id, profile_id) do nothing;

insert into public.crew_memberships (crew_id, profile_id, role, status, joined_at, removed_reason)
select c.id, p.id, 'member', 'active', now() - interval '30 days', null
from (values
  ('seed_member01', '심야 독서 모임'), ('seed_member01', '알고리즘 스터디'), ('seed_member01', '전시 투어 소셜'),
  ('seed_member02', '홈쿠킹 클럽'), ('seed_member02', '국내 여행 메이트'), ('seed_member02', '보드게임 나이트'),
  ('seed_member03', '주말 봉사단'), ('seed_member03', '육아 정보 나눔'), ('seed_member03', '강아지 산책 모임'),
  ('seed_member04', '재테크 스터디'), ('seed_member04', '출사 모임'), ('seed_member04', '심야 독서 모임'),
  ('seed_member05', '알고리즘 스터디'), ('seed_member05', '홈쿠킹 클럽'), ('seed_member05', '보드게임 나이트'),
  ('seed_member06', '전시 투어 소셜'), ('seed_member06', '재테크 스터디'), ('seed_member06', '국내 여행 메이트'),
  ('chopin_0625', '주말 러닝 클럽'), ('chopin_0625', '알고리즘 스터디')
) as v(handle, crew_name)
join public.profiles p on p.handle = v.handle
join public.crews c on c.name = v.crew_name
on conflict (crew_id, profile_id) do nothing;

-- =========================================================================
-- 6) posts(meetup_proposal 60) → polls(closed_passed 60) → meetups(60)
--    12크루 × 5회 = 60건, 2026-08-01~08-31에 분산 (NFR-005 "월 Meetup 60건" 기준선).
--    ⚠️ idempotent 아님 — 가드 없음. 재실행 시 60+60+60건이 추가로 생긴다(상단 경고 참고).
-- =========================================================================
with crew_base as (
  select c.id as crew_id, c.name as crew_name, c.owner_id, b.id as board_id,
         row_number() over (order by c.name) as crew_rn
  from public.crews c
  join public.boards b on b.crew_id = c.id
),
series as (
  select cb.*, gs as meetup_idx,
         (date '2026-08-01' + (((cb.crew_rn-1)*5 + gs - 1) % 30) * interval '1 day')::date as meetup_date
  from crew_base cb cross join generate_series(1,5) as gs
),
new_posts as (
  insert into public.posts (id, board_id, author_id, type, title, body, meetup_date, start_time, place, capacity, created_at)
  select gen_random_uuid(), s.board_id, s.owner_id, 'meetup_proposal',
         s.crew_name || ' ' || s.meetup_idx || '회차 모임',
         s.crew_name || ' 정기 모임입니다. 편하게 참여해주세요.',
         s.meetup_date, '10:00', '크루 활동 장소',
         case when s.meetup_idx % 3 = 0 then 8 else null end,
         (s.meetup_date::timestamp - interval '20 days')
  from series s
  returning id as post_id, board_id, title, meetup_date, start_time, place, capacity, created_at
),
new_polls as (
  insert into public.polls (id, post_id, opens_at, closes_at, status, closed_by, result, decided_at)
  select gen_random_uuid(), np.post_id, np.created_at, np.created_at + interval '3 days',
         'closed_passed', null, 'passed', np.created_at + interval '3 days'
  from new_posts np
  returning id as poll_id, post_id, decided_at
)
insert into public.meetups (id, crew_id, poll_id, title, description, date, start_time, place, capacity, attending_count, status, created_at)
select gen_random_uuid(), b.crew_id, pl.poll_id, np.title,
       np.title || ' — 자세한 내용은 게시글을 확인하세요.',
       np.meetup_date, np.start_time, np.place, np.capacity, 0, 'confirmed', pl.decided_at
from new_polls pl
join new_posts np on np.post_id = pl.post_id
join public.boards b on b.id = np.board_id;

-- =========================================================================
-- 7) poll_eligible_voters + poll_votes(closed_passed 60건분) — 크루 활성 멤버 스냅샷,
--    90%가 투표(대부분 찬성) → 미투표자도 일부 남긴다.
-- =========================================================================
insert into public.poll_eligible_voters (poll_id, profile_id, notified_at, notify_attempts)
select p.id, cm.profile_id, p.decided_at, 1
from public.polls p
join public.posts po on po.id = p.post_id
join public.boards b on b.id = po.board_id
join public.crew_memberships cm on cm.crew_id = b.crew_id and cm.status = 'active'
where p.status = 'closed_passed'
on conflict do nothing;

insert into public.poll_votes (poll_id, voter_id, choice, voted_at, invalidated)
select v.poll_id, v.profile_id,
  case (('x' || substr(md5(v.profile_id::text || v.poll_id::text), 1, 8))::bit(32)::int % 10)
    when 8 then 'against' when 9 then 'abstain' else 'for'
  end,
  v.notified_at - interval '1 day', false
from public.poll_eligible_voters v
join public.polls p on p.id = v.poll_id and p.status = 'closed_passed'
where (('x' || substr(md5(v.profile_id::text || v.poll_id::text || 'cast'), 1, 8))::bit(32)::int % 10) < 9
on conflict do nothing;

-- =========================================================================
-- 8) 진행 중(open) 투표 2건 — D-031 집계 숨김(대상자 5명 미만) 대 공개(5명 이상) 각 1건.
--    "알고리즘 스터디"(5명, 공개) / "주말 러닝 클럽"(2명, 숨김) — 실측 검증은 설계 문서 §6.
--    ⚠️ idempotent 아님 — posts/polls 가드 없음. eligible_voters/votes는 on conflict가
--    있지만 상위 poll_id가 매번 새로 생겨 연쇄로 무력화된다.
-- =========================================================================
with target as (
  select c.id as crew_id, c.name as crew_name, c.owner_id, b.id as board_id
  from public.crews c join public.boards b on b.crew_id = c.id
  where c.name in ('알고리즘 스터디', '주말 러닝 클럽')
),
new_post as (
  insert into public.posts (id, board_id, author_id, type, title, body, meetup_date, start_time, place, capacity, created_at)
  select gen_random_uuid(), t.board_id, t.owner_id, 'meetup_proposal',
         t.crew_name || ' 추가 모임 제안(투표 진행중)',
         '다음 모임 일정을 투표로 정합니다.',
         (now() + interval '10 days')::date, '19:00', '크루 활동 장소', null,
         now() - interval '1 day'
  from target t
  returning id as post_id, board_id, created_at
)
insert into public.polls (id, post_id, opens_at, closes_at, status, closed_by, result, decided_at)
select gen_random_uuid(), np.post_id, np.created_at, np.created_at + interval '3 days', 'open', null, null, null
from new_post np;

insert into public.poll_eligible_voters (poll_id, profile_id, notified_at, notify_attempts)
select p.id, cm.profile_id, null, 0
from public.polls p
join public.posts po on po.id = p.post_id
join public.boards b on b.id = po.board_id
join public.crew_memberships cm on cm.crew_id = b.crew_id and cm.status = 'active'
where p.status = 'open'
on conflict do nothing;

insert into public.poll_votes (poll_id, voter_id, choice, voted_at, invalidated)
select v.poll_id, v.profile_id, 'for', now() - interval '2 hours', false
from public.poll_eligible_voters v
join public.polls p on p.id = v.poll_id and p.status = 'open'
where (('x' || substr(md5(v.profile_id::text || v.poll_id::text || 'openvote'), 1, 8))::bit(32)::int % 2) = 0
on conflict do nothing;

-- =========================================================================
-- 9) posts(general 36) — 크루당 3건, 게시판 목록/페이지네이션 검증용.
-- =========================================================================
insert into public.posts (id, board_id, author_id, type, title, body, created_at)
select gen_random_uuid(), b.id, c.owner_id, 'general',
       c.name || ' 자유게시판 ' || gs || '번째 글',
       '크루원 여러분 안녕하세요! 이번 주 근황을 나눠요.',
       now() - (gs || ' days')::interval
from public.crews c
join public.boards b on b.crew_id = c.id
cross join generate_series(1,3) as gs
where not exists (select 1 from public.posts p2 where p2.board_id = b.id and p2.type = 'general');

-- =========================================================================
-- 10) meetup_attendances(60) — 60개 Meetup 중 20건에 attending 2명 + absent 1명,
--     attending_count를 실제 행 수와 동기화한다.
-- =========================================================================
with target_meetups as (
  select id, crew_id from public.meetups order by created_at limit 20
),
candidate as (
  select tm.id as meetup_id, cm.profile_id,
         row_number() over (partition by tm.id order by cm.profile_id) as rn
  from target_meetups tm
  join public.crew_memberships cm on cm.crew_id = tm.crew_id and cm.status = 'active'
),
picked as (
  select meetup_id, profile_id,
         case when rn <= 2 then 'attending' else 'absent' end as status
  from candidate where rn <= 3
)
insert into public.meetup_attendances (meetup_id, profile_id, status, responded_at)
select meetup_id, profile_id, status, now() - interval '5 days'
from picked
on conflict do nothing;

update public.meetups m
set attending_count = sub.cnt
from (
  select meetup_id, count(*) as cnt from public.meetup_attendances
  where status = 'attending' group by meetup_id
) sub
where m.id = sub.meetup_id;

-- =========================================================================
-- 11) chat_messages(text 120 + post_link 12) — 채팅방당 텍스트 10건 + 링크 1건.
-- =========================================================================
with room_members as (
  select r.id as room_id, cm.profile_id,
         row_number() over (partition by r.id order by cm.profile_id) as member_rn,
         count(*) over (partition by r.id) as member_count
  from public.chat_rooms r
  join public.crews c on c.id = r.crew_id
  join public.crew_memberships cm on cm.crew_id = c.id and cm.status = 'active'
),
series as (
  select id as room_id, gs as msg_idx from public.chat_rooms cross join generate_series(1,10) as gs
),
picked_sender as (
  select s.room_id, s.msg_idx, rm.profile_id as sender_id
  from series s
  join room_members rm on rm.room_id = s.room_id
    and rm.member_rn = ((s.msg_idx - 1) % rm.member_count) + 1
)
insert into public.chat_messages (id, room_id, sender_id, type, body, ref_post_id, client_key, created_at)
select gen_random_uuid(), room_id, sender_id, 'text',
       (array['좋은 아침입니다!','이번 주 일정 확인해주세요~','다들 준비물 챙겨오세요','재밌었어요 다음에 또 봐요','사진 찍은 거 공유할게요','질문 있으신 분?','다음 모임 기대되네요','오늘 참석하신 분들 감사해요','장소 변경 있나요?','완료했습니다!'])[msg_idx],
       null, room_id::text || '-' || msg_idx,
       now() - ((11 - msg_idx) || ' days')::interval
from picked_sender
on conflict do nothing;

with a_general_post as (
  select distinct on (b.crew_id) po.id as post_id, b.crew_id
  from public.posts po join public.boards b on b.id = po.board_id
  where po.type = 'general'
  order by b.crew_id, po.created_at
)
insert into public.chat_messages (id, room_id, sender_id, type, body, ref_post_id, client_key, created_at)
select gen_random_uuid(), r.id, c.owner_id, 'post_link', null, g.post_id,
       'postlink-' || g.crew_id::text, now() - interval '3 days'
from a_general_post g
join public.crews c on c.id = g.crew_id
join public.chat_rooms r on r.crew_id = g.crew_id
on conflict do nothing;

-- =========================================================================
-- 12) notifications(32) — 실 로그인 계정 2개 + 시드 멤버 2명 × 8개 유형.
--     ⚠️ idempotent 아님 — 가드 없음. 재실행마다 32건씩 추가된다.
-- =========================================================================
with recipients as (
  select id, handle from public.profiles where handle in ('chopin0625','chopin_0625','seed_member01','seed_member02')
)
insert into public.notifications (id, recipient_id, type, channel, payload, read_at, created_at)
select gen_random_uuid(), r.id, t.type, 'in_app', t.payload::jsonb,
       case when t.idx % 3 = 0 then now() - interval '1 day' else null end,
       now() - (t.idx || ' hours')::interval
from recipients r
cross join lateral (
  values
    (1, 'poll_closed', '{"pollId":"seed"}'), (2, 'join_request_received', '{"crewId":"seed"}'),
    (3, 'invitation_received', '{"crewId":"seed"}'), (4, 'meetup_created', '{"meetupId":"seed"}'),
    (5, 'staff_appointed', '{"crewId":"seed"}'), (6, 'member_removed', '{"crewId":"seed"}'),
    (7, 'meetup_cancelled', '{"meetupId":"seed"}'), (8, 'join_request_approved', '{"crewId":"seed"}')
) as t(idx, type, payload);

-- =========================================================================
-- 13) join_requests(8) + invitations(8) — 미가입 시드 계정 2명(outsider) 대상.
--     ⚠️ idempotent 아님 — `id`가 매번 gen_random_uuid()라 `on conflict do nothing`이
--     실효가 없다. 재실행 시 중복 생성된다(CREW 실측: join_requests +4 — 부분 중복인
--     이유는 미확인, DB에 아직 알려지지 않은 부분 유니크 제약이 있을 가능성이 있으나
--     이번 회차에서 원인을 규명하지는 않았다).
-- =========================================================================
with outsiders as (select id, handle from public.profiles where handle in ('seed_outsider01','seed_outsider02')),
target_crews as (
  select c.id as crew_id, c.name, c.owner_id, row_number() over (order by c.name) as rn
  from public.crews c where c.visibility = 'public'
)
insert into public.join_requests (id, crew_id, requester_id, message, status, decided_by)
select gen_random_uuid(), tc.crew_id, o.id, '함께 하고 싶어요!',
       case (tc.rn + row_number() over (partition by o.id order by tc.rn)) % 4
         when 0 then 'pending' when 1 then 'approved' when 2 then 'rejected' else 'withdrawn' end,
       case (tc.rn + row_number() over (partition by o.id order by tc.rn)) % 4
         when 1 then tc.owner_id when 2 then tc.owner_id else null end
from outsiders o
cross join lateral (select crew_id, name, owner_id, rn from target_crews order by rn limit 4) tc
on conflict do nothing;

with outsiders as (select id, handle from public.profiles where handle in ('seed_outsider01','seed_outsider02')),
target_crews as (
  select c.id as crew_id, c.owner_id, row_number() over (order by c.name) as rn
  from public.crews c where c.visibility = 'public'
)
insert into public.invitations (id, crew_id, invitee_id, inviter_id, status, expires_at)
select gen_random_uuid(), tc.crew_id, o.id, tc.owner_id,
       case (tc.rn + row_number() over (partition by o.id order by tc.rn)) % 4
         when 0 then 'pending' when 1 then 'accepted' when 2 then 'declined' else 'expired' end,
       now() + interval '14 days'
from outsiders o
cross join lateral (select crew_id, owner_id, rn from target_crews order by rn offset 4 limit 4) tc
on conflict do nothing;
