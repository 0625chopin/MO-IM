-- I-066 해소(SQL 절반, 19일차 CORE) — 해산된(status='archived') 크루에서 새 게시글·댓글·채팅
-- 메시지·초대·가입신청을 계속 만들 수 있던 결함을 SQL 강제 경계로 막는다.
--
-- 배경: CREW가 등재하고 BOARD가 교차검증(Task 040 리뷰 짝)에서 "API 우회가 필요한 게 아니라
-- 평상시 UI 클릭만으로 항상 재현된다"고 심각도를 올린 결함이다 — 029A/029B의 INSERT WITH
-- CHECK가 crew_memberships.status(멤버십 상태)만 보고 crews.status(크루 자체 상태)는 보지
-- 않았다. 팀장이 이 사실로 이월 판단을 뒤집어 이번 회차에 배정했다.
--
-- 범위 판정(전수 조사 후 CORE 결정):
--   포함 — posts·comments·chat_messages(I-066 원문이 명시한 "게시글 작성·채팅 발신")의
--          INSERT, invitations·join_requests의 INSERT("초대"까지 팀장이 예시로 든 범위).
--   제외 — ① crews·crew_memberships 테이블 자체의 정책(팀장 지시 — CREW가 disband_crew를
--          029B 2단 구조로 재구성 중이라 같은 SQL 영역, 겹치면 먼저 보고하기로 함. "크루 정보
--          수정" 차단은 crews_update_staff_or_owner를 건드려야 해서 이번 범위 밖으로 이월).
--          ② posts/comments/chat_messages의 UPDATE(수정·소프트삭제) — I-066 원문의 핵심
--          증상은 "새로 쓴다"(INSERT)이지 "기존 걸 고친다"가 아니다. 편집·모더레이션 차단까지
--          넣으면 "과잉"(팀장이 경고한 것) 위험이 있어 이번엔 INSERT만 좁힌다.
--          ③ poll_votes INSERT — 이미 우회 없이 커버된다: poll_votes_insert_eligible_self가
--          `poll_id IN (select id from polls where status='open')`를 요구하는데, disband_crew
--          가 진행 중이던 poll을 전부 'cancelled'로 전이시키므로(private.disband_crew 실측
--          확인) 해산 후에는 투표 자체가 이미 불가능하다 — 새 조건이 필요 없다.
--          ④ polls INSERT(새 제안) — meetup_proposal 타입 post가 있어야 성립하는데, 이번
--          수정으로 posts INSERT 자체가 막히므로 사실상 도달 불가(투명 커버). 별도 조건 추가
--          안 함.
--          ⑤ meetup_attendances INSERT — meetup_attendances_insert_self가
--          `m.status='confirmed'`를 요구하고 disband_crew가 미래 Meetup을 전부 'cancelled'로
--          바꾸므로 대부분 커버되나, **과거(date < today) confirmed Meetup에는 응답이 여전히
--          가능하다** — 실사용 가치가 낮은 좁은 잔여 위험으로 판단해 이번엔 넣지 않는다
--          (문서에 남긴다).
--
-- 설계 — 기존 헬퍼(private.is_active_crew_member)를 고치지 않고 새 헬퍼를 추가한 이유:
-- is_active_crew_member는 이 정책들 대부분이 애초에 호출하지 않는다(다들 crew_memberships를
-- 직접 서브쿼리로 인라인한다) — 그 헬퍼를 고쳐도 이 INSERT 정책들에는 아무 효과가 없다.
-- 게다가 is_active_crew_member는 **읽기 경로**에서도 쓰인다
-- (crew_memberships_select_self_or_fellow_member·poll_vote_tally·poll_vote_tally_for_decision·
-- realtime_messages_select_crew_broadcast·respond_meetup_attendance) — 이 함수의 의미를
-- "크루도 active여야 한다"로 바꾸면 해산된 크루의 과거 투표 집계 조회·동료 멤버십 조회·
-- Broadcast 구독까지 전부 막혀 FR-013 AC2("과거 항목은 열람 전용으로 남는다")를 정면으로
-- 위반한다 — 그래서 새 헬퍼 private.is_crew_active(crew_id)를 별도로 둔다. 029A crews↔
-- crew_memberships 상호 재귀(42P17) 걱정도 없다 — SECURITY DEFINER가 crews만 직접 조회하고
-- crew_memberships·다른 정책을 경유하지 않는다.
create or replace function private.is_crew_active(p_crew_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select status = 'active' from public.crews where id = p_crew_id
$$;

revoke all on function private.is_crew_active(uuid) from public, anon, authenticated;
grant execute on function private.is_crew_active(uuid) to authenticated;

comment on function private.is_crew_active(uuid) is
  'I-066(19일차): "크루 자체가 active인가"만 본다. is_active_crew_member(멤버십 상태)와
   합성해 새 콘텐츠 INSERT 정책에서만 쓴다 — 읽기 정책에는 절대 넣지 않는다(FR-013 AC2
   "과거 항목은 열람 전용" 위반 방지).';

-- 1) posts — 게시글 작성(I-066 원문 "게시글 작성")
drop policy if exists "posts_insert_members" on public.posts;
create policy "posts_insert_members"
  on public.posts
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and board_id in (
      select b.id
      from public.boards b
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid())
        and cm.status = 'active'
        and private.is_crew_active(b.crew_id)
    )
  );

-- 2) comments — 댓글 작성(게시판 쓰기의 일부)
drop policy if exists "comments_insert_members" on public.comments;
create policy "comments_insert_members"
  on public.comments
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and post_id in (
      select p.id
      from public.posts p
      join public.boards b on b.id = p.board_id
      join public.crew_memberships cm on cm.crew_id = b.crew_id
      where cm.profile_id = (select auth.uid())
        and cm.status = 'active'
        and private.is_crew_active(b.crew_id)
    )
  );

-- 3) chat_messages — 채팅 발신(I-066 원문 "채팅 발신")
drop policy if exists "chat_messages_insert_members" on public.chat_messages;
create policy "chat_messages_insert_members"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and room_id in (
      select cr.id
      from public.chat_rooms cr
      join public.crew_memberships cm on cm.crew_id = cr.crew_id
      where cm.profile_id = (select auth.uid())
        and cm.status = 'active'
        and private.is_crew_active(cr.crew_id)
    )
  );

-- 4) invitations — 신규 초대 차단(팀장이 예시로 든 "초대 등"). 18일차
--    invitations_block_requested_target_at_rls가 추가한 requested 대상 차단 조건은 그대로
--    보존한다(드롭 후 재생성이라 빠뜨리면 그 결함이 되살아난다).
drop policy if exists "invitations_insert_staff_or_owner" on public.invitations;
create policy "invitations_insert_staff_or_owner"
  on public.invitations
  for insert
  to authenticated
  with check (
    inviter_id = (select auth.uid())
    and private.is_crew_active(crew_id)
    and crew_id in (
      select cm.crew_id
      from public.crew_memberships cm
      where cm.profile_id = (select auth.uid())
        and cm.status = 'active'
        and cm.role = any (array['staff', 'owner'])
    )
    and not exists (
      select 1
      from public.crew_memberships cm2
      where cm2.crew_id = invitations.crew_id
        and cm2.profile_id = invitations.invitee_id
        and cm2.status = 'requested'
    )
  );

-- 5) join_requests — 해산된 크루에는 새로 가입 신청을 할 수 없다. 이 정책은 이미 crews를
--    직접 서브쿼리하므로(visibility 확인) private 헬�퍼 없이 같은 자리에 status 조건만 얹는다.
drop policy if exists "join_requests_insert_self_public_crew" on public.join_requests;
create policy "join_requests_insert_self_public_crew"
  on public.join_requests
  for insert
  to authenticated
  with check (
    requester_id = (select auth.uid())
    and crew_id in (
      select c.id
      from public.crews c
      where c.visibility = 'public'
        and c.status = 'active'
    )
  );
