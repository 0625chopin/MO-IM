# Task 044 · 잔여 C등급 기능(FR-046 · FR-055 · FR-072) — 결정·실측 근거

**작업자**: CORE · **일자**: 2026-07-29(22일차) · **선행**: Task 036(DESIGN, 21일차 완료)

이 문서가 Task 044의 SSOT다. 세 FR 모두 Mock 단계 없이 처음부터 실 Supabase로 구현했다(요청
지침 — Mock 단계는 이미 끝났다). 팀장 지시대로 "앱을 우회해서 REST/SQL로 직접 때리면 어떻게
되는가"를 매 쓰기 경로마다 `begin…rollback`으로 직접 실측했다 — 아래 각 절에 실측 결과를
남긴다.

---

## 0. 산출물 요약

**마이그레이션(적용 순서대로, 전부 `supabase/migrations/`에 저장 완료)**

1. `20260729075112_poll_withdrawal_guard_fix_and_notification_types_044.sql` — FR-046
2. `20260729075754_create_chat_room_reads_table_044.sql` — FR-055
3. `20260729080512_notification_preferences_mandatory_guard_and_mute_aware_broadcast_044.sql` — FR-072

**주요 코드 변경**

- FR-046: `src/lib/data/supabase/poll.ts`(`withdrawPoll`) · `src/lib/actions/withdraw-poll.ts` ·
  `src/components/poll/PollWithdrawControl.tsx` · `PollPanel.tsx`·`PollPanelContainer.tsx`·
  `poll-view-models.ts` 수정 · `notification.types.ts`(`poll_withdrawn`) · `audit-log.ts`
  (`poll.withdrawn`) · `notification-routing.ts`·`notification-view-models.ts`·`NotificationItem.tsx`·
  `simulate-notification-event.ts` (4곳의 `Record<NotificationType,...>` 갱신)
- FR-055: `src/lib/data/supabase/chat.ts`(`getUnreadMessageCount`·`markRoomRead`) ·
  `src/lib/actions/mark-room-read.ts` · `MessageList.tsx`(하단 sentinel)·`MessageRoomContainer.tsx`
  (읽음 지점 갱신 배선) · `crew-explore-view-models.ts`·`fetch-crew-cards.ts`·`CrewCard.tsx`
  (배지 렌더)
- FR-072: `src/lib/rules/notification-preference-rules.ts`(필수 타입 판정) ·
  `src/lib/data/supabase/notification-preference.ts` ·
  `src/lib/actions/update-notification-preference.ts` ·
  `src/components/notifications/{NotificationPreferencesContainer,NotificationPreferencesPanel,
  notification-preference-view-models}.tsx` · `/settings` 페이지에 조립 ·
  `src/components/ui/switch.tsx`(shadcn 신규 설치)
- 공통: `database.types.ts` 재생성(`generate_typescript_types`, 세 마이그레이션 전부 반영)

**`npx tsc --noEmit`·`npm run lint` 둘 다 통과(0 error)** — 다만 이 저장소는 이번 회차 동안
다른 3명(BOARD·DESIGN·CREW로 추정, `docs/ISSUES.md` I-093~I-095·`prioritization-and-risks.md`
D-056~D-060이 동시에 늘었다)이 같은 워킹트리를 동시에 커밋 전 상태로 바꾸고 있었다 — 이
검증은 **그 시점의 스냅샷** 기준이고, 최종 커밋 전 팀장 통합 시점에 재확인이 필요할 수 있다.

---

## 1. FR-046 · 제안 철회·재투표

### 1.1 AC1(철회)·AC3(재개 거부) — 구현

- 권한 판정은 새 매트릭스 행을 만들지 않고 `poll:close_early`를 재사용했다 — 대상(제안자 본인
  또는 임원 이상)이 FR-046 AC1 "제안자, 임원, 오너"와 정확히 같다(NFR-036).
- 데이터 계층 `withdrawPoll`은 `closePoll`과 같은 조건부 UPDATE(`.eq("status","open")`) 패턴이다.
- 알림은 FR-045(`poll_closed`)와 같은 대상자 정의(`listEligibleVotersWithCurrentStatus`, D-015
  강퇴자 제외)를 재사용해 새 알림 타입 `poll_withdrawn`으로 보낸다.
- 감사 로그에 `poll.withdrawn`을 추가했다 — `meetup.cancelled`와 같은 이유(되돌릴 수 없는 상태
  전이는 본인 여부와 무관하게 항상 기록).

### 1.2 실측으로 발견한 DB 레벨 결함 — `polls_guard_decision_integrity`가 `open→cancelled`를
막고 있었다 (I-089 핫픽스의 부작용, **이번에 함께 수정**)

착수 전 `begin…rollback`으로 "앱을 우회해서 REST가 직접 `update polls set status='cancelled'
where status='open'`을 때리면?"을 먼저 확인했다:

```sql
-- 시나리오: authenticated로 조건부 UPDATE 시도
update polls set status='cancelled' where id=X and status='open' returning status;
-- 결과: status='open' (그대로!) — UPDATE는 "성공"(1행 반환)했지만 실제로는 아무것도 안 바뀌었다.
```

원인: `polls_guard_decision_integrity`(17일차 I-089 핫픽스가 추가한 BEFORE UPDATE 트리거)가
`old.status='open'`이고 `new.status`가 `closed_passed`·`closed_rejected`·`closed_invalid` 중
하나가 아니면 **`new.status`를 조용히 `old.status`로 되돌린다** — 회귀 방지 목적으로 짰지만
`cancelled`라는 합법적 목표 상태를 고려하지 않았다. `withdrawPoll`(내가 만드는 함수)이 그대로
이 트리거에 걸려 "성공한 것처럼 보이지만 아무 일도 안 일어나는" 결함이 될 뻔했다 — 코드를 짜기
전에 실측해서 미리 잡았다.

**더 심각한 파급**: 같은 트리거가 **`disband_crew`(FR-013 AC1, 19일차 CREW가 이미 배포한
기능)의 "해산 시 진행 중 투표 전부 cancelled" 로직도 똑같이 무력화하고 있었다** —
`disband_crew`는 `update polls set status='cancelled' ... where status='open'`을 그대로 실행하고,
그 UPDATE가 `polls_guard_decision_integrity`보다 시간상 **먼저** 배포됐지만 트리거 자체는 나중에
(I-089 핫픽스, 17일차) 추가돼 기존 함수를 건드리지 않고도 그 함수의 동작을 조용히 바꿔 버렸다
(트리거는 함수 코드와 별개로 테이블에 걸리므로).

**수정**: `polls_guard_decision_integrity`에 `new.status='cancelled'` 전용 분기를 추가했다 —
`old.status='open'`이고 `new.result`가 비어 있으면 허용하고 `decided_at`을 항상 `null`로
고정한다. 그 외(이미 종료·취소된 poll을 다시 바꾸려는 시도)는 기존 "종료 결과는 불변" 분기가
그대로 막는다 — 이게 AC3("종료된 투표, 재개 시도 → 거부")의 **DB 레벨 방어선**이기도 하다.

**수정 후 실측(세 시나리오, 전부 `begin…rollback`)**:

| 시나리오 | 기대 | 실측 결과 |
| --- | --- | --- |
| A. `open`인 poll을 `cancelled`로 UPDATE(제안자) | 성공, `result=null` | ✅ 성공 확인 |
| B. `cancelled`인 poll을 다시 `open`으로 되돌리려는 시도 | 예외(AC3) | ✅ `P0001 closed poll result is immutable` |
| C. `disband_crew`와 동일한 UPDATE(`where status='open'`) 재현 | poll이 실제로 `cancelled`로 바뀜 | ✅ 확인(같은 세션에서 A와 동일 경로) |

`get_advisors(security)` 신규 WARN 0건.

**후속(다음 회차 또는 CREW 확인 권장)**: `disband_crew`가 실제로 이 트리거 아래에서 얼마나 오래
"조용히 실패"했는지(첫 배포부터 이번 수정까지)는 **미조사** — 지금 코드가 정상 동작함만
확인했고, 그 사이 실제로 해산된 크루가 있었다면 그 크루의 진행 중 투표가 `open`으로 남아 있을
가능성이 있다(데이터 정합성 문제, 코드 결함과 별개). CREW·팀장이 실 데이터를 조회해 확인해야
한다 — **이 문서는 코드 수정만 다루고 과거 데이터 정합성은 다루지 않는다.**

### 1.3 실측으로 발견한 두 번째 결함 — `notifications.type` CHECK에 `ownership_transferred`·
`crew_disbanded`가 없었다 (**이번에 함께 수정**)

`poll_withdrawn`을 추가하려고 `notifications.type` CHECK를 넓히는 김에, TS `NotificationType`
유니온(12종, Task 040이 두 값을 추가)과 DB CHECK(10종)이 실제로 일치하는지 실측했다:

```sql
insert into notifications (recipient_id, type, channel, payload)
values (..., 'crew_disbanded', 'in_app', '{}');
-- 결과: 23514 check constraint violation
```

`disband-crew.ts`·`transfer-crew-ownership.ts`가 이미 이 두 타입으로 `createNotification`을
호출하고 있고, 둘 다 `.catch(console.error)`로 실패를 삼킨다 — **즉 FR-013("전 크루원에게
알림")·FR-025("양측 알림") AC가 이 CHECK 제약 때문에 매 호출 100% 조용히 실패해 왔다.** 이번
마이그레이션이 CHECK를 두 값 + `poll_withdrawn`까지 함께 넓혀 해소했다(`insert ... type=
'crew_disbanded'`가 이제 성공함을 재실측 확인).

### 1.4 AC2(재제안) — **코드 변경 없음, 기존 파이프라인으로 이미 충족**

FR-046 AC2 원문: "부결된 제안, 같은 내용으로 재제안 → **새 게시글·새 투표**가 생성되고 기존
기록은 그대로 남는다." 이건 리터럴하게 이미 존재하는 파이프라인이다 — 게시판에 새
`meetup_proposal` 타입 post를 작성하면 `createPoll`이 새 `polls` 행(새 `post_id`, UNIQUE라 항상
새 행)을 만든다. 부결된 예전 poll·post는 손대지 않는다. **새로 만들 것이 없었다.**

**팀장 메시지의 지시사항 확인**: "FR-046이 재투표를 정면으로 다루므로 I-079(D-051)의 UNIQUE
제약을 마주친다"는 우려가 있었다 — 실제로 대조해 보니 **마주치지 않는다**. I-079/D-051은
**FR-065 AC2**(가결된 **Meetup**의 일정 변경 — "바가 새 날짜로 이동하고 이력이 남는다", 즉
**같은 Meetup 행을 유지**해야 하는 요구)를 다룬다. FR-046 AC2는 정반대로 **"새 게시글·새 투표"
를 명시적으로 요구**한다 — `polls.post_id`·`meetups.poll_id` UNIQUE 제약과 애초에 충돌할 이유가
없다(새 poll이 새 post를 가리키는 건 제약 위반이 아니라 정상 케이스다). **I-079는 여전히 열려
있고, FR-046 구현으로 해소되지 않는다** — 서로 다른 FR·서로 다른 요구를 다룬다는 게 이번에
대조로 확정됐다.

**미확인**: AC2를 브라우저로 끝까지 눌러 재현하지는 않았다(`npm run dev`는 팀장 전용) — "새
게시글 작성 폼 → 제출 → 새 poll 생성"이 실제 UI 경로에서 끊김 없이 이어지는지는 기존 Task
034·040 검증에 의존한 정적 확인이다.

---

## 2. FR-055 · 읽지 않은 메시지 표시

### 2.1 스키마 설계

`chat_room_reads(room_id, profile_id, last_read_at, updated_at)`, PK가 자연 복합키
`(room_id, profile_id)`다. `notifications.read_at` + guard 트리거 패턴을 검토했지만, 이 테이블은
"서버가 만든 행을 본인이 `read_at`만 고친다"가 아니라 **행 자체를 본인이 소유·생성·갱신**하는
구조라 컬럼 제한 트리거가 필요 없다 — RLS의 `profile_id = auth.uid()` 자체가 유일한 불변식이다.

INSERT·UPDATE 정책 둘 다 "본인 + 그 방이 속한 크루의 활성 크루원"을 요구한다(`chat_messages_
insert_members`와 같은 조인). **실측(`begin…rollback`)**: 크루원 upsert 성공, 비소속자 upsert
→ `42501 RLS policy violation`.

### 2.2 배지가 뜨는 위치 — `/crews`의 `CrewCard`

FR-055 AC1 원문은 "크루 목록 조회"라고만 하고 화면을 특정하지 않는다. 조사 결과 **"소속 크루
전용 목록" 화면이 이 저장소에 아직 없다** — `/crews`(`CrewGrid`/`CrewCard`)는 탐색(전체 공개
크루 + 내 크루 혼합) 화면이고, 홈 대시보드의 "내 크루 카드" 섹션은 명시적으로 범위 밖으로
남겨져 있다(`home/page.tsx` 자체 docstring). **결정**: `/crews`의 `CrewCard`가 이 저장소에서
유일하게 "크루 목록"이라 부를 수 있는 화면이므로 여기 배지를 놓았다 — `isMember`인 카드에만
표시되고(`unreadMessageCount`는 비소속 카드에서 항상 0), 기존 "가입됨" 배지 옆에 이어 붙인다.
홈 대시보드에 전용 "내 크루" 섹션이 생기면(다른 팀 몫) 그때 이 배지 로직을 그대로 옮기면 된다
— 계산 로직(`getUnreadMessageCount`)은 화면과 독립적이다.

### 2.3 AC2 "최신까지 스크롤 → 읽음 지점 갱신·배지 사라짐"

`MessageList`에 최상단 sentinel(기존, "위로 이어 로드")과 대칭인 **하단 sentinel**을 추가했다.
`IntersectionObserver`가 하단 sentinel의 가시성을 감지해 `onReachLatest` 콜백을 부른다 —
최초 진입이 앵커 없이(FR-053 AC2 복원 앵커가 없어 곧장 최하단으로 스크롤되는 경우) 시작하면
마운트 직후 한 번, 위로 읽다가 다시 최하단으로 내려오면 그때마다 호출된다. `MessageRoomContainer`
가 이 콜백에서 `markRoomReadAction`(배경 호출, `refresh()` 없음 — D-030 ② 실시간 경계, 채팅방
화면 자체는 배지를 그리지 않는다)을 부른다.

### 2.4 미확인·한계(정직하게 남긴다)

- **브라우저로 실제 스크롤 이벤트를 재현하지 못했다** — `npm run dev` 금지 규칙 때문에
  `IntersectionObserver` 콜백 발화 자체는 코드 경로 분석(정적)이지 실측이 아니다.
- **크루 목록 화면이 열려 있는 동안 실시간으로 배지가 갱신되지 않는다** — `fetchCrewCardsPage`
  는 페이지 진입 시 1회 조회이고, 같은 세션에서 새 메시지가 도착해도 이 화면을 다시 열기 전엔
  숫자가 그대로다. FR-055 AC 원문에는 "실시간 갱신"이 명시돼 있지 않아 범위 밖으로 판단했지만,
  UX상 아쉬운 지점이라 다음 회차 후보로 남긴다(수단: `chat_message_created` 브로드캐스트를
  홈/탐색 레이아웃 레벨에서 구독).
- **N+1 조회** — `fetchCrewCardsPage`가 소속 크루마다 `getChatRoomByCrewId`+`getUnreadMessageCount`
  를 순차 호출한다. 기존 `memberCount` 계산도 이미 같은 패턴이라 새로 추가한 위험은 아니지만,
  크루 수가 많은 사용자에게는 페이지 로드가 느려질 수 있다 — 배치 RPC로 합치는 건 다음 회차
  후보.

---

## 3. FR-072 · 알림 환경설정

### 3.1 I-091 판정 뒤집기

I-091은 `notification_preferences`를 "self-service 컬럼값 제한 전무이지만 비즈니스 불변식이
아니라 위험 낮음" 대조군으로 기록했다 — **그 판정이 성립하던 시점엔 AC3가 없었다.** FR-072
AC3("투표 종료·강퇴 알림은 끌 수 없다")가 생기면서 이 두 타입만 "개인 설정"에서 "권리·의무에
영향을 주는 필수 알림"으로 바뀐다. **실측으로 오늘 상태를 먼저 확인**:

```sql
insert into notification_preferences (profile_id, type, crew_id, enabled)
values (..., 'poll_closed', null, false);
-- 수정 전: 성공(1행) — I-091이 맞았다, 하지만 이제 AC3를 위반한다.
```

### 3.2 DB 방어(가드 트리거) + 앱 레이어 이중 방어

`notification_preferences_guard_mandatory_types`(BEFORE INSERT OR UPDATE)가 `type in
('poll_closed','member_removed')`이고 `enabled=false`면 예외를 던진다. **실측 4건**:

| 시나리오 | 결과 |
| --- | --- |
| `poll_closed`를 `enabled=false`로 INSERT | ❌ 차단(`P0001`) |
| `meetup_cancelled`(비필수)를 `enabled=false`로 INSERT | ✅ 허용 |
| 기존 `poll_closed enabled=true` 행을 UPDATE로 `false`로 전환 | ❌ 차단(INSERT뿐 아니라 UPDATE도 막힘 확인) |
| 다른 사용자(`fc91323c…`)가 남의 `profile_id`로 쓰기 시도 | ❌ RLS 42501(기존 029A 정책이 이미 방어) |

앱 레이어(`setGlobalNotificationTypePreference`)도 같은 판정(`isNotificationTypeMandatory`)을
선제로 걸어 조기에 `forbidden`을 반환한다 — 사용자 경험용이고, **실제 방어선은 DB 트리거**다.

### 3.3 토스트 억제 지점 — `notifications_broadcast`

세 후보(INSERT 시점·브로드캐스트 시점·클라이언트 표시 시점) 중 **브로드캐스트 시점**을
골랐다: `notifications` INSERT(행 자체)는 항상 일어나야 FR-071(알림 센터)이 안 깨진다.
`notifications_broadcast()`(Task 033의 기존 AFTER INSERT 트리거)를 수정해 `realtime.send`
직전에 음소거 여부를 판정하고, 음소거면 `realtime.send`를 건너뛴다(행 INSERT 자체는 이미
끝난 뒤라 영향 없음).

**우선순위 규칙**: 크루별 설정(있으면) > 전역 설정(있으면) > 기본값 켬(행 없음). 필수 2종은 이
판정 자체를 생략하고 항상 보낸다(가드 트리거가 이미 `enabled=false` 행을 만들 수 없게 막지만,
이중 방어로 남겼다).

**실측(SQL로 트리거와 동일한 SELECT를 재현, `begin…rollback`)**:

| 시나리오 | 기대 `muted` | 실측 |
| --- | --- | --- |
| 전역 음소거만 있음, 크루 오버라이드 없음 | `true` | ✅ |
| 전역 음소거 + 해당 크루만 `enabled=true` 오버라이드 | `false`(오버라이드 우선) | ✅ |
| 두 preference 다 없음(기본값) | `false`(기본 켬) | ✅ |
| 음소거된 타입으로 실제 `notifications` INSERT 실행 | 예외 없이 성공(행은 생성됨) | ✅ |
| 필수 타입(`poll_closed`)으로 INSERT(음소거 설정 무관) | 예외 없이 성공 | ✅ |

**미확인**: 이 판정 로직이 실제로 클라이언트 토스트를 억제하는지는 **SQL 레벨 검증뿐**이다 —
`realtime.send`가 실제로 스킵됐을 때 구독 중인 브라우저가 이벤트를 못 받는지는 살아있는
Supabase Realtime 구독자로 관찰해야 하는데, `npm run dev` 금지 규칙상 이번 회차엔 확인하지
못했다. 코드 경로(조건부 `perform realtime.send`를 아예 스킵)로 보면 이벤트 자체가 발행되지
않으므로 논리적으로는 확실하지만, **"관측했다"고 쓰지 않는다.**

### 3.4 UI 설계 — 유형×크루 매트릭스가 아니라 두 개의 독립 토글 목록

AC1(유형별)·AC2(크루별)를 문자 그대로 만족하는 가장 단순한 형태를 골랐다: (1) 유형별 전역
토글 13개(필수 2개는 항상 켬·비활성), (2) 크루별 "이 크루 알림 끄기" 토글(소속 크루 수만큼) —
크루를 끄면 `MUTABLE_NOTIFICATION_TYPES`(11종) 전부에 그 크루 스코프 `enabled=false` 행을
일괄 생성한다. **유형×크루 전체 매트릭스(13×N칸)는 만들지 않았다** — AC2 원문이 "크루별 알림
끔"만 요구하고 유형별 세분까지 요구하지 않아 과설계로 판단했다. 스키마(`crew_id` nullable
컬럼)는 세분 UI로 확장 가능한 형태를 이미 갖추고 있으니, 다음 회차에 유형×크루 조합이
필요해지면 스키마 변경 없이 UI만 더하면 된다.

### 3.5 실측으로 발견한 구현 함정 — 부분 유니크 인덱스 위에서 `.upsert()`가 동작하지 않는다

`notification_preferences`의 유일성은 **부분 유니크 인덱스** 2종
(`uq_notification_prefs_global WHERE crew_id IS NULL`, `uq_notification_prefs_per_crew WHERE
crew_id IS NOT NULL`, 028의 "crew_id nullable이라 자연 복합키를 못 쓴다" 설계)이지, 일반
UNIQUE 제약이 아니다. 처음 짠 코드는 `.upsert(..., {onConflict: "profile_id,type"})`를
썼는데, **실측으로 즉시 깨졌다**:

```sql
insert into notification_preferences (...) values (...)
on conflict (profile_id, type) do update set enabled = excluded.enabled;
-- 42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

Postgres의 `ON CONFLICT (열 목록)` 추론은 조건절 없는 인덱스만 매치한다 — 부분 인덱스는
`ON CONFLICT (열 목록) WHERE 조건`처럼 같은 조건절을 명시해야 매치되는데, PostgREST의
`upsert(onConflict:)` 파라미터는 그 조건절을 지정할 방법이 없다. **수정**: `.upsert()`를 걷어내고
`sendMessage`(chat.ts)의 23505 복구 관용구와 같은 "UPDATE 먼저 시도 → 없으면 INSERT, 경합 시
23505를 성공으로 취급" 패턴으로 바꿨다 — 실측(`begin…rollback`)으로 두 흐름(전역 토글의
update-miss-then-insert, 크루 음소거의 delete-then-bulk-insert 11행) 모두 RLS 아래에서 정상
동작함을 확인했다.

---

## 4. 새로 등재한 이슈·결정

- `docs/ISSUES.md` **I-096**(`polls_guard_decision_integrity`가 `open→cancelled`를 막아
  `disband_crew`의 FR-013 AC1이 조용히 무력화됐던 결함 — 이번에 수정) · **I-097**
  (`notifications.type` CHECK 누락으로 FR-013·FR-025 알림 생성이 100% 실패했던 결함 — 이번에
  수정)
- `docs/prioritization-and-risks.md` 6.3절 **D-061**(FR-046 설계: 권한 재사용·DB 트리거 수정·
  AC2는 기존 파이프라인으로 충족·I-079와 무관함 확정) · **D-062**(FR-055 설계: `chat_room_reads`
  스키마·배지 위치는 `/crews` CrewCard·하단 sentinel 방식) · **D-063**(FR-072 설계: 브로드캐스트
  시점 음소거·우선순위 규칙·매트릭스 아닌 두 토글 목록·I-091 판정의 조건부 수정)

## 5. 다음 회차로 넘길 사항

1. **I-096 후속**: `disband_crew`가 트리거 버그 아래 있던 기간에 실제로 해산된 크루가 있다면,
   그 크루의 진행 중이던 투표가 여전히 `status='open'`으로 남아 있을 수 있다 — 실 데이터 조회로
   확인 필요(이번 문서는 코드만 고쳤다).
2. FR-055 — 크루 목록 실시간 배지 갱신(현재는 페이지 재방문 시에만 반영), N+1 조회 최적화.
3. FR-072 — 실 브라우저로 토스트 억제를 관측하는 검증(현재는 SQL 레벨 로직 검증까지만).
4. I-079(FR-065 AC2, Meetup 일정 변경)는 이번 회차로 해소되지 않았다 — 여전히 다음 회차 1순위
   후보로 남는다(FR-046과는 무관하다는 게 이번에 확정됐을 뿐).
