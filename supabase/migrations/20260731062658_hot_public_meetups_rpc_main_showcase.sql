-- 메인(랜딩 `/` + 홈 `/home`) "실시간 핫한 모임 5개" 노출용 RPC.
--
-- **이 마이그레이션은 D-048이 세운 경계를 의도적으로 넓힌다.** `meetup_directory_summary`
-- (20260725141946, I-073/D-048)는 "Meetup에는 독자적인 공개 범위 개념이 없다 / 게스트 노출은
-- 애초에 설계돼 있지 않다 / title·date·place 등 실제 콘텐츠는 절대 이 경로로 노출되지 않는다 /
-- anon에게는 EXECUTE를 주지 않는다"를 명시했다. 메인 화면 노출 요구는 그 전제를 바꾼다 —
-- 근거·대안·잔여 위험은 `docs/decisions/hot-public-meetups-main.md`(D-109) 참고.
--
-- **노출 경계(D-109에서 확정, 이 함수가 유일한 통로다)**
--  - 대상: `crews.visibility='public'` **AND** `crews.status='active'`인 크루의
--    `status='confirmed'`이고 `date >= current_date`인 Meetup만. private 크루는 D-017대로
--    한 건도 나오지 않고, 해산 크루·취소 모임·지난 모임도 제외된다.
--  - 내보내는 것: 모임 제목·날짜·시작 시각·참석 인원·정원, 크루 이름·카테고리·색 키.
--  - **내보내지 않는 것: `meetups.place`와 `meetups.description`.** 장소는 불특정 다수에게
--    오프라인 집결지를 공개하는 것이라 별개 차원의 위험이고, 이 화면의 목적(어떤 모임이
--    활발한지 보여주기)에 필요하지 않다. 상세는 크루에 들어가야 보인다.
--  - `activity_score`는 가중 합성값(3·게시글 + 2·투표 + 1·채팅)이라 개별 카운트로 역산되지
--    않는다 — 원시 활동량을 그대로 노출하지 않기 위한 선택이다.
--
-- **크루당 1건 제한**: 활동 점수가 크루 단위라 제한이 없으면 가장 활발한 크루 하나가 5칸을
-- 전부 차지한다(실측으로 확인 — 첫 시안이 정확히 그랬다). `row_number()`로 크루마다 가장
-- 임박한 모임 1건만 남긴 뒤 크루 점수 순으로 고른다.
--
-- **정렬은 완전 결정적이다**: `activity_score desc, attending_count desc, meetup_date asc,
-- id asc` — 마지막 `id`가 타이브레이커라 같은 입력에 항상 같은 순서를 준다(35일차 판정 기준
-- "ORDER BY 없는 목록은 순서를 보장하지 않는다").
--
-- **`p_limit`은 함수가 직접 상한을 건다**(`least(…, 20)`) — 호출자가 큰 값을 넘겨 공개 크루
-- 전체를 덤프하는 것을 막는다.

create or replace function private.hot_public_meetups(p_limit integer default 5)
returns table (
  id uuid,
  crew_id uuid,
  crew_name text,
  crew_category text,
  crew_color_key smallint,
  title text,
  meetup_date date,
  start_time text,
  attending_count integer,
  capacity integer,
  activity_score integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with since as (select (now() - interval '7 days') as t),
  crew_activity as (
    select c.id as crew_id,
           (3 * coalesce(pc.n, 0) + 2 * coalesce(vc.n, 0) + coalesce(mc.n, 0))::integer as score
    from public.crews c
    left join lateral (
      select count(*)::integer n
      from public.posts p
      join public.boards b on b.id = p.board_id
      where b.crew_id = c.id
        and p.deleted_at is null
        and p.created_at >= (select t from since)
    ) pc on true
    left join lateral (
      select count(*)::integer n
      from public.poll_votes pv
      join public.polls pl on pl.id = pv.poll_id
      join public.posts p2 on p2.id = pl.post_id
      join public.boards b2 on b2.id = p2.board_id
      where b2.crew_id = c.id
        and pv.invalidated = false
        and pv.voted_at >= (select t from since)
    ) vc on true
    left join lateral (
      select count(*)::integer n
      from public.chat_messages cm
      join public.chat_rooms cr on cr.id = cm.room_id
      where cr.crew_id = c.id
        and cm.deleted_at is null
        and cm.created_at >= (select t from since)
    ) mc on true
  ),
  ranked as (
    select m.id,
           c.id as crew_id,
           c.name as crew_name,
           c.category as crew_category,
           c.color_key as crew_color_key,
           m.title,
           m.date as meetup_date,
           m.start_time,
           m.attending_count,
           m.capacity,
           ca.score as activity_score,
           row_number() over (partition by c.id order by m.date asc, m.id asc) as rn_in_crew
    from public.meetups m
    join public.crews c on c.id = m.crew_id
    join crew_activity ca on ca.crew_id = c.id
    where c.visibility = 'public'
      and c.status = 'active'
      and m.status = 'confirmed'
      and m.date >= current_date
  )
  select id, crew_id, crew_name, crew_category, crew_color_key, title, meetup_date,
         start_time, attending_count, capacity, activity_score
  from ranked
  where rn_in_crew = 1
  order by activity_score desc, attending_count desc, meetup_date asc, id asc
  limit greatest(1, least(coalesce(p_limit, 5), 20))
$$;

comment on function private.hot_public_meetups(integer) is
  'D-109 · 메인 화면 "핫한 모임" 목록. 공개·활성 크루의 예정된 확정 모임만, 크루당 1건. place와 description은 의도적으로 반환하지 않는다 — D-048이 세운 "Meetup 콘텐츠 비노출" 경계를 넓히되 오프라인 집결지는 계속 감춘다. 이 제약을 푸는 변경은 D-109를 다시 열어야 한다.';

revoke all on function private.hot_public_meetups(integer) from public, anon, authenticated;
grant execute on function private.hot_public_meetups(integer) to anon, authenticated;

-- public 얇은 래퍼(SECURITY INVOKER) — `rls_move_definer_logic_to_private_wrappers`가 세운
-- 2단 구조를 그대로 따른다.
create or replace function public.hot_public_meetups(p_limit integer default 5)
returns table (
  id uuid,
  crew_id uuid,
  crew_name text,
  crew_category text,
  crew_color_key smallint,
  title text,
  meetup_date date,
  start_time text,
  attending_count integer,
  capacity integer,
  activity_score integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.hot_public_meetups(p_limit)
$$;

comment on function public.hot_public_meetups(integer) is
  'D-109 · private.hot_public_meetups의 SECURITY INVOKER 래퍼. 게스트(anon) 노출이 의도된 유일한 Meetup 경로다 — meetup_directory_summary(D-048)와 달리 anon에게 EXECUTE를 준다.';

revoke all on function public.hot_public_meetups(integer) from public, anon, authenticated;
grant execute on function public.hot_public_meetups(integer) to anon, authenticated;