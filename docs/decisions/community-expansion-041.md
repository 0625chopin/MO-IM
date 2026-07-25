# Task 041 · 커뮤니티 확장 (FR-033 · FR-054 · FR-065) — 결정·근거

> 21일차(2026-07-25), BOARD. 참조: `docs/requirements/requirements.md` FR-033·FR-054·FR-065,
> `docs/prioritization-and-risks.md` D-003·D-034, `docs/ISSUES.md` I-072·I-079·I-080.

## 0. AC 목록 (착수 전 정리)

**FR-033 · 댓글 작성·수정·삭제**
- AC1 게시글 상세에서 댓글 등록 → 목록 하단에 즉시 추가 + 작성자에게 알림
- AC2 댓글 0건 → 빈 상태 문구
- AC3 삭제된 댓글에 달린 답글 → 부모는 "삭제된 댓글"로 남고 답글은 유지
- 범위 판단: 대댓글 depth 1단계(답글까지) 제한

**FR-054 · 메시지 삭제**
- AC1 자기 메시지 삭제 → "삭제된 메시지"로 대체 + 모든 접속자 화면에 실시간 반영
- AC2 타인 메시지를 일반 크루원이 삭제 시도 → 403

**FR-065 · Meetup 취소·일정 변경**
- AC1 미래 Meetup 취소 → 캘린더 취소 표시 + 크루원 알림
- AC2 날짜 변경 → 캘린더 바가 새 날짜로 이동 + 변경 이력
- AC3 과거 Meetup 취소·변경 시도 → 거부
- 확정(D-003): 가결된 Meetup의 날짜 변경은 재투표를 요구하며, 취소는 임원·오너·제안자가 할 수 있다.

## 1. 사전 확인 — 스키마·RLS는 대부분 이미 있었다

`list_tables`로 확인한 결과 `comments` 테이블(Task 006·028 선반영, 0행)과 그 RLS 3종
(`comments_select_members`·`comments_insert_members`·`comments_update_author_or_staff_
delete`)이 이미 존재했다. `chat_messages.deleted_at`·`meetups.status` CHECK(`confirmed`/
`cancelled`)·`meetups` UPDATE를 임원·오너·제안자로 좁히는 트리거
(`trg_meetups_guard_attendee_scope`, Task 032가 만듦)도 이미 있었다 — 이번 회차는 스키마를
새로 설계하지 않고 그 위에 앱 레이어(순수 함수 → 데이터 접근 → Server Action → 컨테이너/표현
컴포넌트)만 얹었다. 유일하게 추가한 마이그레이션은 §4의 채팅 삭제 브로드캐스트 확장 하나다.

## 2. FR-033 · 댓글

- **데이터**: `lib/data/{mock,supabase}/comment.ts` — `listCommentsByPost`(삭제된 댓글도
  포함해 반환, AC3 전제)·`createComment`·`updateComment`·`deleteComment`(소프트 삭제).
- **권한**: `permission.ts`에 `comment:update_own`·`comment:delete_own`·`comment:delete_any`
  3행을 추가했다(원래 `comment:create` 1행만 있었다) — `post:*` 3분할과 대칭. 실제 액션 수는
  34개에서 37개가 됐다.
- **depth 1 제한**: `lib/rules/comment-depth.ts`의 `canReplyToComment`(순수 함수) —
  부모 댓글의 `parentId`가 이미 non-null(= 그 자신이 답글)이면 답글을 거부한다.
  **DB는 이 제약을 강제하지 않는다** — RLS `with_check`가 depth를 보지 않는다(실측 확인).
  알려진 gap으로 `docs/ISSUES.md` I-080에 등재했다.
- **컨테이너/표현 분리**: `CommentListContainer`(서버, 권한·차단 목록·트리 구성) →
  `CommentList`(표현, 빈 상태 AC2) → `CommentItem`(클라이언트 리프, 수정/삭제/답글 —
  `PostActions.tsx`와 같은 패턴) → `CommentForm`/`CommentComposer`(입력 폼).
  `PollPanelContainer`와 같은 자리로 `CrewBoardPostPage`에 세 번째 `Suspense` 블록으로
  붙였다(게시글 본문·투표·댓글이 각자 조회한다 — 약간의 중복 조회를 표현/컨테이너 분리의
  대가로 받아들인다, 기존 관례).
- **알림(AC1)**: `createCommentAction`이 성공하면 게시글 작성자에게 `post_commented` 알림을
  보낸다(자기 글에 자기가 댓글을 달면 보내지 않는다 — 다른 알림 발송부의 관례를 따른 임의
  판단). `notification-routing.ts`의 `post_commented` 매핑은 이미 있었다(Task 023이
  "Comment 의존이라 발생하지 않지만 매핑은 지금 정의해 둔다"고 남겨 둔 것을 이번에 처음
  실제로 발생시켰다).
- **"즉시 추가"(AC1)**: 낙관적 클라이언트 상태를 새로 만들지 않고 기존 "Server Action +
  `refresh()`" 패턴(D-030, `respond-meetup-attendance.ts`·`cast-vote.ts`와 동일)을 그대로
  썼다 — 액션이 `next/cache`의 `refresh()`를 부르면 컨테이너가 다시 렌더되어 새 댓글이
  목록에 나타난다. 별도 낙관적 렌더(채팅처럼)는 만들지 않았다 — 댓글은 채팅과 달리 다른
  사용자의 실시간 도착을 보여줄 요구사항이 없다(FR-033에 실시간 언급 없음).
- **차단 콘텐츠 접힘(FR-081 AC1, I-072 해소)**: `isContentFromBlockedAuthor` +
  `BlockedContentNotice`를 댓글에도 배선했다 — 본문만 감싸고 작성자 이름은 그대로 둔다
  (`PostDetail`·`MessageBubble`과 같은 원칙). 삭제된 댓글에는 적용하지 않는다(본문 자체가
  이미 안 보인다). I-072가 "댓글은 화면 자체가 없어 남은 범위"로 남겨 뒀던 서술을 닫았다.

## 3. FR-054 · 메시지 삭제

- **데이터 계층은 이미 있었다** — `deleteMessage`(mock·supabase 둘 다, Task 031·032가
  구현)를 부르는 곳이 이번 회차 전까지 **아무 데도 없었다**(grep 확인). Server Action
  (`delete-chat-message.ts`)과 UI(`MessageBubble`의 삭제 버튼)를 이번에 처음 만들었다.
- **판정 순서 버그를 만들었다가 자체 발견해 고쳤다**: 처음에는 "일단 `deleteMessage`를
  부르고 반환된 `senderId`로 사후에 권한을 확인한다" 순서로 짰다 — 그런데 Mock 구현에는 실
  DB의 `chat_messages_update_self_or_staff_delete` RLS가 없어서, 권한이 없는 사용자의
  요청도 부수효과(소프트 삭제)가 먼저 일어나 버리는 결함이 있었다(판정 실패 후 `forbidden`을
  반환해도 메시지는 이미 지워진 채). `getMessageById`(mock·supabase 둘 다 신규 추가)로
  먼저 `senderId`를 읽고 판정한 뒤에만 삭제를 실행하도록 고쳤다 — `deletePostAction`·
  `deleteCommentAction`이 원래도 "조회 → 판정 → 삭제" 순서였던 것과 같은 순서로 맞춘 것이다.
- **실시간 반영(AC1 "모든 접속자 화면에")**: `chat_messages_broadcast_trigger`가 `AFTER
  INSERT`에만 걸려 있어 소프트 삭제(UPDATE)는 브로드캐스트되지 않았다 — 마이그레이션
  `chat_message_delete_broadcast_041`로 `AFTER INSERT OR UPDATE`로 확장하고, UPDATE에서는
  이벤트 타입을 `chat_message_deleted`로 바꿔 같은 payload 모양을 재사용한다.
  `MessageRoomContainer`의 구독 핸들러가 이 이벤트 타입을 받아 로컬 `messages` 상태에서
  해당 메시지의 `deletedAt`만 갱신한다(append가 아니라 replace).
  Task 033(Realtime Broadcast 연결)이 내 담당이라 이 확장도 같은 사람이 이어서 했다.
- **AC2(403)**: `chat:delete_own_message`/`chat:delete_any_message` 권한 매트릭스 행은
  이미 있었다(Task 009B) — Server Action이 그대로 재사용만 한다.
- **UI**: `MessageBubble`에 확인 Dialog(`PostActions.tsx`·`CommentItem.tsx`와 같은 패턴)를
  단 삭제 아이콘 버튼을 추가했다. `deliveryStatus !== "sent"`(전송 중·실패)인 메시지에는
  삭제 버튼을 그리지 않는다 — 서버에 아직 확정되지 않은 메시지는 지울 대상이 없다.

## 4. FR-065 · Meetup 취소·일정 변경

- **취소(AC1)**: `cancelMeetup`(mock·supabase 신규) + `cancelMeetupAction` — 권한은
  `meetup:cancel_or_update`(이미 있던 매트릭스 행, 각주⁵ "제안 작성자 본인" 조건부)를
  그대로 판정만 한다. 성공하면 감사 로그(`meetup.cancelled`, 본인 취소도 항상 기록 — 이미
  캘린더에 확정 노출된 일정을 뒤집는 행위라 흔한 CRUD로 보지 않았다)와 크루원 전원 알림
  (`meetup_cancelled`, 취소한 본인 제외)을 남긴다.
- **과거 Meetup 거부(AC3)**: 새 판정을 만들지 않고 `isMeetupAttendanceOpen`
  (`lib/rules/meetup-attendance-eligibility.ts`, 원래 FR-066 사전조건을 위해 만든 함수)을
  재사용했다 — "확정 상태 + 예정일 미경과"라는 조건 문구가 FR-065 AC3와 문자 그대로 같다
  (NFR-036, 같은 판정을 두 번 쓰지 않는다).
- **일정 변경(AC2) — 미충족, 정정됨(2026-07-26)**: **D-051**(`prioritization-and-risks.md`)
  참고 — 1차 판(21일차)은 "AC2를 문자 그대로 구현하면 D-003과 충돌한다"고 서술했으나 이는
  **틀린 프레임**이었다(팀장 반론으로 정정). AC2(결과: 바 이동·이력)와 D-003(승인 경로:
  재투표 요구)은 "재투표 승인 → 기존 Meetup UPDATE + 이력 기록" 설계로 **동시에 만족
  가능**하다 — 이번 회차는 그 설계를 **못 만들었다**(CREW의 042B 독립 검증에서 확인된 구체적
  근거: `polls.post_id`·`meetups.poll_id` 둘 다 UNIQUE라 "기존 Meetup을 겨냥하는 새 투표"를
  표현할 자리가 지금 스키마에 없다 — 마이그레이션 없이는 시도 자체가 불가능. 상세 견적은
  D-051 참고 — `finalize_closed_poll` 트리거 수정 + 새 스키마 + "날짜 변경 시 기존 참석
  응답을 어떻게 할지"라는 미결 제품 질문 포함). 실제로 구현한 것은 `cancelMeetupAction`을 재사용한
  "취소 + 크루 글쓰기 화면(`getBoardWriteHref`) 안내" — 새 제안이 기존 파이프라인
  (FR-034·FR-040·Task 034)으로 재투표를 거쳐 가결되면 완전히 **새로운** Meetup이 생긴다.
  이 경로는 D-003(재투표 요구)은 만족하지만 **AC2(바 이동·이력)는 만족하지 못하는 임시
  조치**다 — "AC2를 구현했다"로 기록하지 않는다. 남은 gap과 다음 회차 설계 방향은
  `docs/ISSUES.md` I-079(정정됨) 참고.
- **UI**: `MeetupLifecycleActions`(신규, 취소·일정 변경 두 Dialog) — `MeetupAttendanceActions`
  와 나란히 `MeetupDetail`의 `CardFooter`에 붙는다. `canCancelOrUpdate`(컨테이너가 판정,
  AC3까지 포함)가 `false`면 버튼 자체를 숨긴다.

## 5. 실측 (전부 `begin`…`검증`…`rollback`, 단일 호출)

crew-1(주말 러닝 크루)의 실제 시드 데이터로 anon·비소속·일반 크루원·임원·오너 대조군을
`set_config('request.jwt.claims', ...)` + `set local role`로 구성해 검증했다. 모든 트랜잭션을
`rollback`했다 — 실 데이터는 변경되지 않았다(테스트 후 `comments`·취소된 `meetups` 행 수를
재확인해 0임을 확인).

**댓글 RLS**(7개 시나리오, 전부 기대 일치):
- 소속 크루원 최상위 댓글 작성 → 성공
- 비소속자 댓글 작성 시도 → 차단(`42501 insufficient_privilege`)
- 비소속자 댓글 조회 → 0행
- `anon` 댓글 조회 → 0행
- 작성자 본인 수정 → 성공
- 오너(작성자 아님, staff 이상)가 타인 댓글 소프트 삭제 → 성공(1행)
- 소프트 삭제된 댓글도 SELECT에서 계속 보임(`deleted_at` non-null인 채로 1행) — AC3의 DB
  쪽 전제(앱이 필터링·표시만 다르게 한다) 확인.

**채팅 삭제 RLS**(4개 시나리오, 전부 기대 일치):
- 본인 메시지 삭제 → 성공(1행)
- 비소속자가 남의 메시지 삭제 시도 → 0행
- 소속 일반 크루원이 오너 메시지 삭제 시도 → 0행(같은 크루라도 권한 부족)
- staff가 오너 메시지 삭제 → 성공(1행) — `chat:delete_any_message`
- (브로드캐스트 트리거가 UPDATE 중 예외 없이 실행됨을 확인 — **실제 소켓 수신은 미확인**,
  `npm run dev`가 팀장 전용 운영 규칙이라 이전 회차들과 같은 한계.)

**Meetup 취소 RLS·트리거**(4개 시나리오, 전부 기대 일치):
- 일반 크루원(제안자·staff·owner 아님)이 취소 시도 → `trg_meetups_guard_attendee_scope`
  예외로 차단(`P0001`)
- 비소속자가 취소 시도 → RLS로 0행
- staff가 취소 → 성공(1행)
- 이미 취소된 Meetup을 조건부 UPDATE(`status='confirmed'` WHERE)로 재취소 시도 → 0행
  (`cancelMeetup`의 멱등 가드와 동일한 조건을 SQL로 재현해 확인)

**미검증**: "일반 크루원이 자기 제안 Meetup을 취소"(각주⁵ 조건부 허용의 positive 경로)는
시드 데이터에 해당 조합(제안 작성자가 `member` role인 확정 Meetup)이 없어 실측하지 못했다 —
`meetups_guard_attendee_scope` 트리거 소스를 직접 읽어 `poll→post.author_id = auth.uid()`
조건이 role과 무관하게 들어 있음을 코드 검토로 확인했다(미확인으로 정직하게 남긴다).

`get_advisors(security)` — 새 WARN 0건(기존 `auth_leaked_password_protection` 1건만, 무관).

## 6. 남은 리스크·다음 회차 인계

- I-079 — **FR-065 AC2 미충족**(2026-07-26 정정 — 원래 "DB 연결 없음"으로만 좁게 적었으나
  실제로는 AC2 자체가 안 채워진 것이 근본 문제다). "취소+새 제안글" 임시 경로는 D-003만
  만족하고 AC2(바 이동·이력)는 만족하지 못한다 — 다음 회차 후보(D-051 참고).
- I-080 — 댓글 depth 1 제한이 앱 레이어 전용, RLS는 depth 2+ 삽입을 막지 않는다.
- 채팅 삭제 실시간 브로드캐스트는 구조 확인만 했고 실제 소켓 전달은 미확인.
- `MeetupLifecycleActions`·`CommentList` 등은 `/sample`에 기본·로딩·빈·오류(도메인 오류 포함)
  4상태로 등록했다(등록 목록은 각 컴포넌트가 있는 `src/components/sample/sections/{board,
  meetup,chat}.tsx` 참고) — 댓글은 차단 콘텐츠 데모도 별도 항목으로 추가했다.
