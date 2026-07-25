# Realtime Broadcast 연결 — 트리거·클라이언트·httpOnly 충돌 해소 (Task 033)

- **일자**: 2026-07-25(19일차)
- **담당**: BOARD(B팀) · 리뷰 CREW(A팀)
- **참조**: D-023, NFR-003·007·008·009, R-011·R-019, CON-08, `docs/decisions/rls-policies-029b.md`(§6, 선행 문서, 이하 "029B 문서")
- **범위**: Task 008이 만든 구독 인터페이스(`subscribeToRoom(roomId, onEvent, onError?): Unsubscribe`)의 실데이터 구현(`src/lib/realtime/broadcast.ts`)을 실제로 연결한다. 029B가 만들어 둔 `realtime.messages` Authorization 정책 2건을 인계받아 검증하고, 메시지·투표·알림 INSERT/UPDATE 시 브로드캐스트를 발행하는 DB 트리거를 추가한다. **I-017·I-018(요금제·팬아웃 계수 미확정)이 걸려 있어 구현은 진행하되 용량 계획·요금제 전제는 확정하지 않는다** — 이 문서 어디에도 동시 접속 상한·요금제 결정은 없다.

## 1. 토픽 명명 규칙과 실제 발견된 불일치

029B §6.1이 이미 정한 규칙:

| 토픽 | 용도 | FR |
| --- | --- | --- |
| `crew:{crewId}:chat` | 채팅 메시지 브로드캐스트 | FR-051 |
| `crew:{crewId}:polls` | 투표 상태·집계 변경 브로드캐스트 | FR-042 |
| `user:{profileId}:notifications` | 개인 알림 브로드캐스트 | FR-070 |

**Task 008(Mock 단계)의 실제 코드는 이 규칙을 따르지 않았다** — 실측(코드 읽기)으로 확인한 두 불일치:

1. `MessageRoomContainer`가 `subscribeToRoom(roomId, ...)`을 호출할 때 `roomId`는 `chat_rooms.id`(방 UUID)였다. Realtime Authorization 정책은 `crewId` 기준(`private.is_active_crew_member(crewId)`)이라 방 UUID를 그대로 토픽에 쓰면 정규식(`^crew:[0-9a-fA-F-]{36}:(chat|polls)$`)에 매치돼도 뒤의 `is_active_crew_member` 인자가 크루 id가 아니라 방 id가 되어 항상 실패한다.
2. `notification-channel.ts`의 `getNotificationRoomId`가 `notification:{profileId}`를 반환했다 — 029B 정책이 매치하는 `^user:[0-9a-fA-F-]{36}:notifications$`와 접두어 자체가 다르다.

Mock 단계에서는 방 id가 그냥 임의의 Map 키였을 뿐이라 이 불일치가 드러나지 않았다 — Broadcast로 바꾸는 순간 두 채널 모두 항상 거부되는 잠복 결함이었다. 이번에 고쳤다:

- `src/components/chat/chat-topic.ts`(신규) — `getCrewChatTopic(crewId)` = `crew:{crewId}:chat`.
- `src/components/poll/poll-topic.ts`(신규) — `getCrewPollsTopic(crewId)` = `crew:{crewId}:polls`.
- `notification-channel.ts`의 `getNotificationRoomId`를 `user:{profileId}:notifications`로 수정.

토픽 빌더를 `lib/realtime` 안에 두지 않고 각 도메인 컨테이너 옆에 콜로케이션한 이유: 전송 계층(`lib/realtime`)은 payload도 토픽 이름 규칙도 해석하지 않는다는 기존 설계(README "이 모듈은 전송 계층이라 payload 내용을 해석하지 않는다")를 그대로 지키기 위해서다 — `notification-channel.ts`가 이미 이 패턴이었다.

## 2. 발신 트리거 — `realtime.send()`를 택했다 (`realtime.broadcast_changes()` 아님)

029B §6.2가 남긴 예시는 `realtime.broadcast_changes()`(8인자, NEW/OLD 원본 컬럼을 그대로 직렬화)였다. 실측(`pg_proc`)으로 시그니처를 다시 확인했다:

```
send(payload jsonb, event text, topic text, private boolean) -> void
broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) -> void
```

**`broadcast_changes`를 쓰지 않은 이유**: 채팅 소비자(`MessageRoomContainer`)는 `MessageViewModel`(발신자 표시 이름·아바타까지 조인된 모양)을 기대하는데, `broadcast_changes`는 `chat_messages` 원본 컬럼(`sender_id`만 있고 `profiles` 조인 없음)만 실어 보낸다. `realtime.send()`로 payload를 직접 구성하면 트리거 안에서 `profiles` JOIN을 넣을 수 있다 — 그래서 세 트리거(`chat_messages_broadcast`·`notifications_broadcast`·`poll_votes_broadcast`/`polls_broadcast`) 전부 `send()`로 통일했다.

### 2.1 chat_messages → `crew:{crewId}:chat`

`chat_rooms.crew_id`로 크루를 찾고 `profiles`에서 발신자 `display_name`·`avatar_url`을 조인해 `MessageViewModel`과 같은 모양의 JSON을 만든다. **`postLinkCard`는 항상 `null`로 보낸다** — `resolvePostLinkCard`(FR-052 "삭제됨/다른 크루" 판정)는 TS 전용 도메인 로직(NFR-036, `lib/rules` 재사용 원칙)이라 SQL로 옮기지 않았다. §4에 이 gap의 실제 영향을 남긴다.

### 2.2 notifications → `user:{profileId}:notifications`

`notifications` 원본 컬럼을 camelCase JSON으로 그대로 옮긴다(조인 불필요, `Notification` 타입과 1:1). `notifications`는 client INSERT 정책이 아예 없어(029A/029B) 생성이 전부 서버 경로(Server Action → `createNotification`, service-role)를 거치므로 이 트리거가 그 모든 생성 경로를 공통으로 커버한다.

### 2.3 poll_votes/polls → `crew:{crewId}:polls` — 가벼운 핑만 보낸다

집계값(찬성/반대/기권 수, 정족수, D-031 5명 미만 은닉)은 트리거가 계산하지 않는다 — `poll_vote_tally` RPC·`lib/rules` 순수 함수(NFR-036)가 이미 그 판정을 갖고 있고, 트리거에서 다시 계산하면 판정 로직이 두 곳으로 갈라진다(R-015가 금지하는 정확히 그 패턴, `docs/team/04.BOARD.md` 배정 근거이기도 하다). 그래서 payload는 `{pollId}` 하나뿐이고, 클라이언트(`PollLiveContainer`)는 이를 받으면 `router.refresh()`로 `PollPanelContainer`(서버 컴포넌트)를 다시 실행해 서버에서 집계를 다시 계산한다 — CLAUDE.md가 쓰기 경로용으로 이미 정한 "Server Action + `refresh()`" 패턴을 실시간 갱신에도 그대로 적용한 것이다. `poll_votes`(INSERT/UPDATE, D-003 "종료 전까지 무제한 변경 가능")와 `polls`(UPDATE, status/result 변경 시에만 — 같은 값이면 스킵)에 각각 트리거를 붙였다.

크루 id는 `poll_votes.poll_id → polls.post_id → posts.board_id → boards.crew_id` 체인으로 조회한다(`posts`에는 `crew_id` 컬럼이 없다 — 실측 확인).

### 2.4 마이그레이션

`supabase/migrations/20260725085443_realtime_broadcast_triggers_033.sql` — `mcp__supabase__apply_migration`으로 원격에 적용 후(I-051) 로컬에 커밋했다. 함수는 전부 `security definer language plpgsql set search_path = ''`(029B와 같은 관례) + `revoke all ... from public, anon, authenticated`(트리거 전용, 직접 호출 불가).

**절차 교훈(19일차, 팀장 지적)**: 로컬 파일명의 타임스탬프를 `apply_migration` 호출 시점에 임의로(적용 완료 시각 근사치로) 지어 붙였더니 원격이 실제로 부여한 version(`list_migrations`로 조회한 `20260725085443`)과 어긋났다 — 어긋난 채로 두면 `supabase db push`나 로컬 리셋에서 같은 마이그레이션이 새 것으로 취급돼 두 번 적용될 위험이 있다(트리거 `CREATE OR REPLACE`는 멱등이라 재적용 자체는 안전하지만 `DROP TRIGGER IF EXISTS`+`CREATE TRIGGER` 조합은 아니므로 일반화하면 안전하지 않을 수 있다). **`apply_migration` 직후에는 반드시 `list_migrations`로 실제 부여된 version을 확인하고, 그 값을 그대로 로컬 파일명에 쓴다** — CREW 파일 3건에도 같은 어긋남이 있었다고 팀장이 통보했다. 이번에 `20260725085900` → `20260725085443`으로 rename해 맞췄다.

`get_advisors(security)` 적용 직후: WARN 1건(`auth_leaked_password_protection`, 기존과 동일, 038 문서 이후 계속 열려 있는 항목) 외 **신규 0건**.

## 3. 클라이언트 — httpOnly 세션과 Realtime Authorization의 충돌 (신규 발견, 이번에 해소)

**발견 경위**: `broadcast.ts`를 처음 구현할 때 `createSupabaseBrowserClient().auth.getSession()`으로 현재 세션을 읽어 `realtime.setAuth()`에 넘기려 했다. 그런데 이 앱의 세션 쿠키는 `httpOnly: true`다(NFR-010, Task 030 `auth-integration-030.md` §4 실측 수정) — **httpOnly 쿠키는 정의상 어떤 JS도 읽을 수 없다.** 브라우저 Supabase 클라이언트(`createSupabaseBrowserClient`)의 기본 쿠키 어댑터는 `document.cookie`를 읽는데, 그 쿠키가 애초에 보이지 않으므로 `auth.getSession()`은 **항상 빈 세션**을 반환한다. `createSupabaseBrowserClient`는 이번 회차 전까지 실제 소비자가 하나도 없었다(`grep` 확인 — client.ts·server.ts 자기 자신과 README 언급뿐) — 즉 아무도 이 충돌을 겪어 본 적이 없었다.

**왜 구조적으로 피할 수 없는가**: Supabase Realtime Authorization(사설 채널)은 클라이언트가 JWT 문자열을 직접 쥐고 `channel.subscribe()` 전에 `realtime.setAuth(token)`을 호출해야만 성립한다(029B §1이 인용한 공식 문서) — 서버가 대신 인가해 줄 방법이 없다. httpOnly와 "클라이언트가 JWT를 알아야 한다"는 요구가 정면으로 부딪힌다.

**해소**: 쿠키를 읽을 수 있는 쪽(서버)이 `getRealtimeAuthTokenAction()`(`src/lib/realtime/get-realtime-auth-token.ts`, Server Action)으로 현재 세션의 `access_token`만 최소 범위로 넘긴다. `broadcast.ts`는 채널을 열기 전에 이 값으로 `realtime.setAuth()`를 호출하고, 세션 만료에 대비해 20분마다 재호출한다. 브라우저는 이 토큰을 어떤 저장소(localStorage·non-httpOnly 쿠키 등)에도 쓰지 않는다 — JS 힙에만 잠깐 머물다 `setAuth()` 호출 한 번에 소비된다.

**NFR-010과의 관계 판단**: NFR-010이 막으려던 것은 "주입된 스크립트가 `document.cookie`를 읽어 세션을 통째로 훔쳐 영속시키는 것"이다. 이 경로는 이미 인증된 바로 그 브라우저에게(다른 Server Action이 이미 하는 것과 동일한 신뢰 경계 안에서) 실시간 채널을 열 목적으로만 토큰을 건네는 것이라 노출면이 다르다고 판단했다 — 새 저장소를 만들지 않았고, 이 토큰을 얻을 수 있는 경로도 "이미 로그인된 자기 자신의 세션" 하나뿐이다(다른 사용자의 토큰을 얻을 방법이 없다). **이 판단을 `prioritization-and-risks.md` D-045로 등재했다** — 대안(예: 서버가 매 구독 요청마다 초단기 토큰을 새로 발급하는 방식)은 검토하지 않았고, 팀장 재검토 대상으로 남긴다.

## 4. 알려진 gap — postLinkCard가 실시간 페이로드에 없다

§2.1에서 남긴 대로 `chat_messages_broadcast` 트리거는 `postLinkCard`를 항상 `null`로 보낸다. **실제 영향은 현재 0이다** — `sendChatMessageAction`(FR-051 쓰기 경로)은 `type: "text"`만 만든다(코드 확인, `type: "post_link"`를 만드는 실사용 경로가 없다 — mock 시드(`fixtures.ts`)에만 존재). `type: "post_link"` 메시지를 실제로 보낼 수 있는 기능(게시글을 채팅에 공유, FR-052 쓰기 쪽)이 나중에 생기면, 그 메시지가 실시간으로 도착한 다른 크루원 화면에는 카드 없이(본문도 `null`이라 사실상 빈 말풍선) 나타난다 — 그 시점에 반드시 다시 봐야 한다. `docs/ISSUES.md` I-063으로 등재했다.

## 5. E2E 실측 — Node 스크립트로 실제 소켓·DB 트래픽 재현

029B §6.3이 "완전한 end-to-end는 Task 033이 트리거를 붙이고 첫 실제 트래픽이 흐를 때 반드시 재검증해야 한다"고 남긴 것을 이번에 실행했다. `@supabase/supabase-js`(이미 의존성)로 두 실 계정(`chopin0625@gmail.com`·`0625chopin@gmail.com`, CLAUDE.md 테스트계정)에 직접 로그인해 실제 소켓을 열고 실제 DB에 INSERT했다 — Mock이나 트랜잭션 롤백이 아니라 실 트래픽이다. 스크립트는 검증 후 삭제했다(`.tmp-e2e/`, 저장소에 남기지 않음). 테스트 데이터(채팅 메시지 2건·알림 2건)는 확인 직후 전부 DELETE로 정리했고, 정리 후 잔여 0건을 재확인했다.

### 5.1 구독 인가(Authorization) — 6개 시나리오

| 시나리오 | 계정 | 토픽 | 기대 | 실측 |
| --- | --- | --- | --- | --- |
| 소속 크루 채팅 | 0625chopin(A) | `crew:21fb8c31...:chat`(A가 멤버인 "주말 러닝 클럽") | 허용 | **SUBSCRIBED** ✅ |
| 비소속 크루 채팅 | A | `crew:32aca4a8...:chat`("심야 독서 모임", A는 비멤버) | 거부 | **CHANNEL_ERROR** ✅ |
| 존재하지 않는 크루 | A | `crew:00000000-...-000000000000:chat` | 거부 | **CHANNEL_ERROR** ✅ |
| 본인 알림 | A | `user:{A}:notifications` | 허용 | **SUBSCRIBED** ✅ |
| 타인 알림 | A | `user:{chopin0625 profile id}:notifications` | 거부 | **CHANNEL_ERROR** ✅ |
| 소속 크루 투표 | A | `crew:21fb8c31...:polls` | 허용 | **SUBSCRIBED** ✅ |

6건 전부 기대와 일치. **첫 시도(가장 처음 짠 스크립트)에서는 chatAuthorized까지 CHANNEL_ERROR로 잘못 나왔다** — 원인은 RLS가 아니라 클라이언트 쪽 경쟁 상태였다: `setAuth()` 완료 전에 첫 채널을 구독하면 소켓이 아직 토큰을 반영하지 못한 채 구독을 시도해 거부당했다(§3의 `authReady` await로 해소 — 이 경쟁을 실측으로 재현한 것 자체가 `broadcast.ts`의 현재 구현을 정당화하는 근거가 됐다). SQL 레벨에서는 `set local role authenticated` + `request.jwt.claims`로 같은 조건을 직접 재현해 `is_active_crew_member`·정규식·`auth.uid()` 전부 기대대로 동작함을 별도로 재확인했다(029B가 이미 검증했던 것의 재확인).

### 5.2 실전달(delivery) — 실제 INSERT → 실제 브로드캐스트 수신

- **채팅**: A가 자기 크루 채팅방에 실제 메시지를 INSERT(RLS `chat_messages_insert_members` 통과) → 이미 열려 있던 `crew:21fb8c31...:chat` 구독이 **188ms 후** `chat_message_created` 이벤트 수신. 페이로드에 `senderDisplayName: "테스트계정2"`(프로필 조인 확인), `roomId`·`clientKey`·`createdAt` 등 `MessageViewModel` 필드가 정확히 채워져 있음을 확인. **NFR-003(p95 ≤ 1초)을 이 1건에서는 크게 만족** — 표본 1건이므로 p95 통계로 일반화하지 않는다(용량·부하 확정은 I-017/I-018이 해소된 뒤 Task 037 몫).
- **알림**: `notifications`는 client INSERT가 막혀 있어(§2.2) MCP `execute_sql`(service/postgres 권한)로 대신 INSERT — 실제 서비스에서 Server Action이 만드는 것과 같은 신뢰 경로다. 이미 열려 있던 `user:{A}:notifications` 구독이 `notification_created` 이벤트를 실제로 수신, 페이로드가 `Notification` 타입(`id`·`recipientId`·`type`·`payload`·`readAt`·`createdAt`)과 정확히 일치함을 확인. 클라이언트 시각과 DB `created_at` 사이에 초 단위 clock skew가 있어(로컬 머신 vs Supabase 서버) 정밀한 지연시간(ms)은 측정하지 않았다 — "실제로 도착했다"만 확정하고 숫자는 **미측정**으로 남긴다.

### 5.3 정리

테스트로 만든 chat_messages 2건(`client_key like 'e2e-test-%'`)과 notifications 2건(`payload->>'e2eTest' = 'true'`)을 DELETE로 제거하고 재조회로 0건을 확인했다.

## 6. `/sample` 반영

- `src/components/sample/sections/RealtimeAuthErrorDemoContainer.tsx`(신규) — 존재하지 않는 크루 토픽(`crew:00000000-...:chat`)을 **실제로** `subscribeToRoom`하고 `onError`가 돌려주는 메시지를 그대로 렌더한다. 정적 문구가 아니라 브라우저가 실시간으로 겪는 거부를 그대로 보여준다(D-030 ③). "채팅" 섹션의 새 항목 "Realtime 구독 인가 (Broadcast Authorization)"의 `error` 패널에 배치했다.
- `NotificationSimulatorPreviewContainer.tsx` — **버그 수정**: `SAMPLE_RECIPIENT_ID`/`SAMPLE_PROFILE_ID`가 Mock 시드 문자열 `"profile-1"`이었는데, `createNotification`은 Task 032부터 이미 실 Supabase(`notifications.recipient_id`, uuid 컬럼)에 쓰고 있어 이 버튼을 누르면 **`22P02 invalid input syntax for type uuid` 예외가 항상 났다**(19일차 실측 확인 — `execute_sql`로 같은 값을 넣어 재현). 실 프로필 UUID(`chopin0625@gmail.com`)로 고쳤다. 그래도 Realtime Authorization이 `auth.uid() = recipientId`를 요구하므로, 이 미리보기의 벨·토스트가 실시간으로 갱신되는 것을 보려면 그 계정으로 로그인한 세션에서 `/sample`을 열어야 한다 — 컴포넌트에 그 조건을 명시한 `Alert`를 추가했다. `docs/ISSUES.md` I-064로 등재(발견+수정).
- 채팅·알림 섹션 설명 문구에 "Task 008 인터페이스 → Task 033 실 Broadcast" 갱신을 반영했다.

## 7. `PollLiveContainer` — 실시간 집계 갱신 컨테이너 (신규)

FR-042 AC2("다른 사용자가 투표하면 3초 이내 집계가 갱신된다")를 만족시킬 소비자가 이번 회차 전까지 없었다 — `PollPanelContainer`는 서버 컴포넌트 1회 조회뿐이었다. `src/components/poll/PollLiveContainer.tsx`(신규, 클라이언트 컨테이너)를 만들어 `PollPanelContainer`가 `poll.status === "open"`일 때만 `PollPanel`을 이 컨테이너로 감싼다(종료된 투표는 더 바뀔 것이 없어 채널을 열지 않는다 — R-019 채널 수 절약). `crew:{crewId}:polls` 이벤트를 받으면 300ms 디바운스 후 `router.refresh()`. 시각적 컴포넌트가 아니라(children을 그대로 반환) 별도 `/sample` 등록은 하지 않았다 — 감싸는 `PollPanel`·`PollTally`는 이미 `poll.tsx` 섹션에 등록돼 있다.

## 8. 남은 리스크·미검증·다음 회차 인계

1. **I-017·I-018은 그대로 열려 있다** — 이 회차는 "구현은 진행하되 용량 계획은 확정하지 않는다"는 로드맵 단서를 지켰다. 이 문서 어디에도 동시 접속 상한·초당 메시지 처리량·요금제 결론이 없다. Task 037이 실측 후 확정한다.
2. **§3의 httpOnly 토큰 노출 판단(D-045)은 CORE 교차검증을 거쳤다** — 대안(초단기 토큰 발급 등)은 §8-후속③에서 검토 후 미채택으로 정리했다. 원 서술("검토하지 않았다")은 아래에 갱신 내용을 추가하는 방식으로 남긴다(지우지 않는다, 이 프로젝트 관례).
3. **postLinkCard gap(§4)** — 현재 도달 불가(쓰기 경로 없음)지만 잠복 상태다. `post_link` 쓰기 경로가 생기는 시점(Task 041 또는 그 이후)에 반드시 재확인해야 한다.
4. **부하 상태에서의 재확인 없음** — §5의 지연시간(188ms)은 표본 1건, 동시 사용자 1명 기준이다. 여러 명이 동시에 같은 방에 있을 때의 팬아웃 지연은 측정하지 않았다(Task 037 몫, I-018).
5. **알림 전달 지연(ms)은 미측정**으로 남긴다(§5.2) — clock skew 때문에 이번 방법으로는 신뢰할 수 있는 숫자를 얻지 못했다. 다음에 측정하려면 로컬 스크립트가 아니라 DB 서버 시각 기준(`now()` 호출 직후 타임스탬프)으로 재설계해야 한다.
6. **재연결(NFR-008) 시나리오는 실측하지 않았다** — 소켓이 실제로 끊겼다가 복구되는 상황(예: 네트워크 차단 30초)까지는 이번 회차에서 재현하지 않았다. `MessageRoomContainer`의 `resyncChatMessagesAction` 경로 자체는 Task 020B가 이미 만들어 뒀고 이번에 코드를 바꾸지 않았지만, **실 Broadcast 재연결과 조합된 end-to-end는 미검증**이다. **구체적인 "조용히 죽는" 경로 하나를 §8-후속②에서 특정했다** — 뭉뚱그린 "미검증"이 아니라 재현 가능한 원인 후보다.
7. **`realtime.messages` 파티션 자동 생성은 확인했지만(오늘·내일 포함 5일치 존재) 그 스케줄의 신뢰성(항상 며칠 앞서 만들어지는지)은 검증하지 않았다** — Supabase 관리 인프라 영역이라 이 프로젝트가 통제할 수 없는 부분이다.
8. **로컬 마이그레이션 파일명 절차 교훈(19일차, 팀장 지적)** — `apply_migration` 적용 직후 실제 version을 확인하지 않고 임의 타임스탬프(`20260725085900`)로 로컬 파일을 만들었다가, 원격이 실제로 부여한 version(`list_migrations` 조회 결과 `20260725085443`)과 어긋난 채 커밋할 뻔했다 — 발견 즉시 rename으로 맞췄다(§2.4). **앞으로는 `apply_migration` 직후 반드시 `list_migrations`로 실제 version을 확인하고 그 값으로 로컬 파일명을 짓는다.** CREW의 마이그레이션 3건에도 같은 어긋남이 있었다고 팀장이 통보했다 — 이번 회차에 발견된 절차 결함이 이 사람 하나만의 문제가 아니었다는 뜻이다.

### 8-후속 · CORE 교차검증 후속 조치 (19일차, Task 033 완료 확정 이후)

CORE가 Task 033을 전건 PASS로 판정하며 짚은 3건 — 새 이슈로 등재하지 않고 여기 반영한다(팀장 판단).

**① `console.error`의 `cause` 노출 폭을 좁혔다.** `MessageRoomContainer.tsx`·`PollLiveContainer.tsx`가 `console.error(..., error)`로 `RealtimeConnectionError` 객체 전체(그 안의 `cause` = supabase-js 원본 소켓 에러)를 그대로 콘솔에 찍고 있었다. `cause`에 실제로 `access_token` 원문이 담기는지는 CORE도 확인하지 않았고(라이브러리 소스까지 파야 한다), 그래서 "샌다"고 단정하지 않되 **불필요한 노출 폭을 넓히지 않는다**는 원칙으로 `src/lib/realtime/types.ts`에 `describeRealtimeError(error)` 헬퍼를 추가해 `message`(+ `cause`가 있으면 그 `message`만)만 문자열로 뽑아 찍도록 바꿨다. 디버깅에 필요한 최소 정보(오류 메시지)는 그대로 남는다. 같은 패턴을 쓰던 `use-notification-feed.ts`·`ToastHostContainer.tsx`(Task 023, 내 소유)도 지적받지 않았지만 동일한 노출 경로라 함께 고쳤다.

**② `refreshAuth()` 실패 시 재시도를 추가하고, JWT 만료를 실측했다.** 기존에는 실패(네트워크 오류 등)를 catch도 재시도도 하지 않아 **연속 2회(약 40분+) 실패하면 토큰이 실제로 만료돼 구독이 아무 신호 없이 죽는** 경로가 있었다(§8-6이 "재연결 미검증"으로 뭉뚱그렸던 것의 구체적 원인 후보 하나). `broadcast.ts`에 5초·30초·2분 세 번 짧은 재시도를 추가했다 — 새 의존성 없이 몇 줄이라 저비용으로 판단해 적용했다. 세 번 다 실패하면 다음 정기 주기(20분)까지 기다린다(무한 재시도로 서버 부담을 만들지 않는다). **사용자에게 알리는 경로(예: `ConnectionBanner`에 실시간 연결 끊김 표시)는 추가하지 않았다** — 이건 `broadcast.ts`(전송 계층, 여러 방을 공유하는 모듈 스코프 싱글턴) 하나가 채팅·투표·알림 세 소비처 각각의 UI 상태 모델에 새 신호를 배선해야 하는 더 큰 변경이라, 이번 저비용 방어(재시도)로 실패 확률 자체를 낮추는 선에서 멈췄다 — 다음에 이 gap을 또 만나면(재시도 3회+정기 20분까지 전부 실패하는, 꽤 드문 경우) 여전히 조용히 죽는다는 뜻이다.

**JWT 만료 실측(대시보드 접근 없이, 실제 토큰 디코드로 확인)**: 테스트 계정으로 로그인해 발급받은 access_token을 디코드해 `exp - iat`를 직접 계산했다 — **정확히 3600초(60분)**. 가정("기본값 1시간으로 추정")이 아니라 이 프로젝트의 실제 설정값으로 확인했다. 20분 주기 + 최대 2분 30초(5+30+120초) 재시도 창을 더해도 최악의 경우(정기 갱신이 두 번 연속 실패)의 총 공백은 약 42분 30초로, 60분 만료 전에 세 번째 정기 시도(T+60)가 오기 전 재시도 창 안에서 대부분 복구된다 — 여전히 이론상 완전히 막히지는 않지만(정기 주기+재시도 전부가 60분 넘게 실패하는 극단적 경우) 원래의 "40분+ 공백"보다 훨씬 좁혔다.

**③ 초단기 토큰 발급 대안 — 검토 후 미채택.** CORE 검토: 구독마다 짧은 수명의 커스텀 토큰을 서버가 서명해 내려주는 방식은 기술적으로 가능하나(JWT 시크릿으로 커스텀 클레임 서명), 그러려면 **새로운 시크릿 관리 표면**이 생긴다 — 지금 방식("이미 로그인된 자기 세션의 access_token을 그대로, 저장 없이, 즉시 소비")보다 더 안전해진다고 보기 어렵다. D-045는 이 판단대로 **유지**한다(팀장 동의).

## 부록 · E2E 재현 절차 (검증 후 스크립트는 삭제, 명령으로 재현 방법을 남긴다)

§5의 검증에 쓴 두 Node 스크립트(`@supabase/supabase-js`, 이미 프로젝트 의존성)는 확인 후 삭제했다 — 저장소 루트에 임시 파일을 남기지 않는다(19일차 팀장 지적). 다음 사람이 재현하려면:

**공통 준비** — 프로젝트 루트에서 실행해야 `node_modules/@supabase/supabase-js`를 resolve한다(다른 디렉터리에서 실행하면 `ERR_MODULE_NOT_FOUND` — 19일차에 직접 겪은 실수).

```js
// scripts/realtime-auth-test.mjs (예시 — 실행 후 필요 없으면 다시 삭제할 것)
import { createClient } from "@supabase/supabase-js";

const URL = "https://damruradpliktkrlkakl.supabase.co";
const PUBLISHABLE_KEY = "<NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, .env.local 참고>";
const EMAIL = "0625chopin@gmail.com"; // CLAUDE.md 테스트계정, 비밀번호 qwer1234
const PASSWORD = "qwer1234";

// 매 토픽마다 독립 클라이언트로 새로 로그인한다 — 하나의 클라이언트에 채널을 계속 누적하면
// 소켓 워밍업 경쟁(§5.1 "첫 시도" 각주)이 재현돼 인가된 토픽도 CHANNEL_ERROR로 잘못 나온다.
async function testTopic(topic, { timeoutMs = 8000 } = {}) {
  const client = createClient(URL, PUBLISHABLE_KEY);
  const { data } = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  await client.realtime.setAuth(data.session.access_token);
  await new Promise((r) => setTimeout(r, 1200)); // setAuth가 소켓에 반영될 시간을 준다
  return new Promise((resolve) => {
    const channel = client.channel(topic, { config: { private: true } });
    const timer = setTimeout(() => resolve("TIMEOUT_NO_CALLBACK"), timeoutMs);
    channel.subscribe((status) => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        clearTimeout(timer);
        resolve(status);
      }
    });
  });
}

console.log("authorized (내가 속한 크루):", await testTopic("crew:<내가 속한 crewId>:chat"));
console.log("unauthorized (내가 안 속한 크루):", await testTopic("crew:<내가 안 속한 crewId>:chat"));
console.log("bogus (존재하지 않는 크루):", await testTopic("crew:00000000-0000-0000-0000-000000000000:chat"));
process.exit(0);
```

실행: `node scripts/realtime-auth-test.mjs`(또는 파일을 만들고 곧바로 지울 임시 위치라면 `.tmp-e2e/`처럼 `.gitignore` 대상이 되는 이름을 쓰고 검증 후 `rm -rf`한다).

**전달(delivery) 재현** — 위 패턴으로 채널을 구독한 채로 유지하고, 같은 계정으로 `chat_messages`에 실제 INSERT(`sender_id`가 로그인 계정 id와 같고 그 계정이 속한 크루의 `room_id`면 RLS 통과)를 실행하면 브로드캐스트가 돌아온다. **알림은 client INSERT가 막혀 있으므로**(§2.2) `mcp__supabase__execute_sql`로 대신 INSERT해야 한다 — 실제 서비스에서 Server Action(service-role)이 만드는 것과 같은 신뢰 경로다.

**정리** — 테스트로 만든 행은 반드시 지운다:
```sql
delete from public.chat_messages where client_key like 'e2e-test-%';
delete from public.notifications where payload->>'e2eTest' = 'true';
```

## 9. 산출물

- `supabase/migrations/20260725085443_realtime_broadcast_triggers_033.sql`(신규, 원격 적용 완료 — I-051에 따라 로컬 파일 직접 커밋, 파일명은 `list_migrations`가 부여한 version과 맞춤).
- `src/lib/realtime/broadcast.ts` — 실연결 구현으로 교체.
- `src/lib/realtime/get-realtime-auth-token.ts`(신규) — httpOnly 세션 → Realtime 토큰 브리지 Server Action.
- `src/lib/realtime/index.ts` — 배럴이 `subscribeToRoomViaBroadcast`를 조립하도록 교체.
- `src/components/chat/chat-topic.ts`(신규), `src/components/poll/poll-topic.ts`(신규).
- `src/components/chat/MessageRoomContainer.tsx` — 토픽 빌더 사용, `publishMockEvent` 제거(자기 메시지 직접 반영으로 대체).
- `src/components/notifications/notification-channel.ts` — 토픽 문자열 수정.
- `src/components/poll/PollLiveContainer.tsx`(신규), `src/components/poll/PollPanelContainer.tsx` — 실시간 갱신 연결.
- `src/components/sample/sections/RealtimeAuthErrorDemoContainer.tsx`(신규), `chat.tsx`(항목 추가).
- `src/components/sample/sections/NotificationSimulatorPreviewContainer.tsx`, `src/lib/actions/simulate-notification-event.ts` — recipient id 버그 수정.
- 본 문서, `docs/ISSUES.md`(I-063·I-064), `docs/ROADMAP/team/04.BOARD.md`(Task 033 완료 마커).
