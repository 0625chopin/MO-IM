# I-063 처분안 — `postLinkCard`가 브로드캐스트 페이로드를 채우지 않는다 (36일차)

**작성**: BOARD · **회차**: 36일차(2026-07-31) · **범위**: 랭킹 10위 열린 이슈 I-063 처분안
작성. **코드·마이그레이션은 수정하지 않았다** — 이 문서는 처분 권고까지이고 적용은 팀장
승인 사항이다.

관련: `docs/ISSUES.md` I-063 · `docs/decisions/realtime-broadcast-033.md` §4 (둘 다 이번
회차에 정정 내용을 추가했다 — 원 서술은 지우지 않고 "36일차 정정"으로 덧붙였다, 이 프로젝트
관례).

---

## 1. "현재 영향 0" 재확인 — 유지 (**36일차 팀장 실측으로 정정 — §7 참고**)

> **정정(36일차, 팀장 지적 + BOARD 독립 재현)**: 아래 §1의 결론은 **앱이 자체적으로
> 만드는 경로 기준으로는** 여전히 참이다. 하지만 **쓰기 접근 자체가 앱 경로로 게이트돼
> 있지 않다** — `chat_messages` INSERT RLS가 `type` 컬럼값을 전혀 제한하지 않아, 활성
> 크루원이면 앱 코드 없이 raw REST로 `post_link` 메시지를 오늘 당장 만들 수 있다.
> "v0.2 지뢰"가 아니라 **오늘 도달 가능한 경로**다. 전문·재현 절차는 §7.

### (원 서술, 보존)

31일차 근거("`sendChatMessageAction`이 `type: 'text'`만 하드코딩한다")가 32~35일차
(Task 034·036·037·041·042A·042B·043A·043B, 커밋 `030506a`~`caaabf5`) 사이에 깨졌는지
전수 확인했다.

- **`type: "post_link"` 리터럴 grep 전수** — `src/` 전체에서 이 문자열이 나오는 자리는
  렌더 분기(`MessageBubble.tsx`)·타입 판별(`ChatMessageType`, `chat.types.ts`)·조인 로직
  (`resolve-message-view-model.ts`, `resolve-post-link-card.ts`, `PostLinkCard.tsx`)·**Mock
  데이터 계층의 검증**(`src/lib/data/mock/chat.ts:88-89`, `src/lib/data/supabase/chat.ts:124-125` —
  둘 다 "입력이 `post_link`면 `refPostId` 필수"라는 방어 검증일 뿐 실사용 생성 경로가 아니다)·
  **Mock 시드**(`fixtures.ts`, `seed/generate-chat.ts`)· `/sample` 쇼케이스 픽스처
  (`sample/sections/chat.tsx:133`, 정적 프리뷰용)뿐이다. **실 쓰기 Server Action에서
  `type: "post_link"`를 만드는 자리는 0건.**
- **`sendChatMessageAction`(`src/lib/actions/send-chat-message.ts:80-86`)** — 지금도
  `sendMessage({ ..., type: "text", ... })`로 리터럴 고정이다. FR-051 실 쓰기 경로는 이
  함수 하나뿐이고(다른 액션이 `sendMessage`를 호출하지 않음, `sendMessage(` grep으로 확인),
  다른 타입을 만들 방법이 없다.
- **"게시글을 채팅에 공유"(FR-052 쓰기 쪽) UI 자체가 없다** — `공유` 텍스트를 포함한
  컴포넌트 전수(문자열 모듈 `ko.ts` 1건만 매치, 게시글 공유 버튼 아님) 확인, 게시판 상세
  컴포넌트 어디에도 `refPostId`·`ChatMessageType`을 참조하는 코드가 없다.
- **Task 041(FR-033·054·065, 21일차)이 이 경로를 건드리지 않았다** — 댓글·채팅 메시지
  삭제·Meetup 취소/변경이며 셋 다 post_link 생성과 무관하다. `docs/ROADMAP/team/04.BOARD.md`
  본인 Task 목록에도 FR-052 쓰기 쪽을 배정받은 Task가 없다(I-063 자체 서술과 동일 — "이
  로드맵에 명시적으로 배정되지 않음"은 36일차에도 그대로다).

**결론**: (B) 유지. 32~35일차 사이 전제를 깨는 변화 없음.

---

## 2. 수신부 실제 동작 — 인용으로 확정, 문서 서술 정정

### 2.1 DB 트리거(실측, `mcp__supabase__execute_sql`로 직접 조회 — 문서를 믿지 않았다)

`pg_get_functiondef`로 `public.chat_messages_broadcast()`의 실제 정의를 꺼냈다. 발췌:

```sql
perform realtime.send(
  jsonb_build_object(
    'id', new.id,
    'roomId', new.room_id,
    ...
    'refPostId', new.ref_post_id,
    'postLinkCard', null,   -- 리터럴 고정
    ...
  ),
  v_event_type,
  'crew:' || v_crew_id::text || ':chat',
  true
);
```

문서(`realtime-broadcast-033.md` §4)가 서술한 그대로 — `postLinkCard`는 SQL 리터럴로
`null` 고정이다. 이 부분은 문서와 실측이 일치한다.

### 2.2 클라이언트 수신 — 원본 페이로드를 그대로 append

`MessageRoomContainer.tsx:234-237`:

```ts
if (event.type !== "chat_message_created") return;
if (seenIds.current.has(payload.id)) return;
seenIds.current.add(payload.id);
setMessages((prev) => [...prev, payload]);
```

`payload`는 `isMessageViewModel`(구조적 타입가드, `id`/`roomId`/`senderId` 존재만 확인 —
`postLinkCard`는 검사하지 않는다)을 통과한 브로드캐스트 원본이다. **재조회
(`toMessageViewModel`)를 거치지 않고 그대로 `messages`에 append된다** — `resyncChatMessagesAction`
(§4에서 다룬다)은 `"reconnecting"` 상태 전이에서만 호출되고, 정상 수신 경로에서는 호출되지
않는다.

### 2.3 렌더 — "빈 말풍선"이 아니라 "삭제된 게시글입니다" 카드

`MessageBubble.tsx:203-207`:

```tsx
if (message.type === "post_link") {
  // postLinkCard가 null인 경우(방어적 분기 — 정상 경로에서는 sendMessage가 refPostId를
  // 강제하고 toMessageViewModel이 항상 조인한다)는 "삭제됨"과 같은 안전한 기본값으로 그린다.
  return <PostLinkCard state={message.postLinkCard ?? { kind: "deleted" }} />;
}
```

`PostLinkCard.tsx:32-39`(`kind: "deleted"` 분기):

```tsx
if (state.kind === "deleted") {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-dashed ...">
      <Trash2Icon aria-hidden="true" className="size-4 shrink-0" />
      {strings.chat.postCard.deletedPost}
    </div>
  );
}
```

`strings.chat.postCard.deletedPost` → `common.post.deleted` → **"삭제된 게시글입니다"**
(`src/lib/strings/ko.ts:79,1226`).

**정정**: I-063과 `realtime-broadcast-033.md` §4가 예상한 "카드 없이(본문도 `null`이라
사실상 빈 말풍선)"는 실제 코드와 다르다. `MessageBubble`의 `?? { kind: "deleted" }` 방어적
기본값 때문에 **레이아웃이 깨지는 빈 영역이 아니라, 휴지통 아이콘 + "삭제된 게시글입니다"
문구가 있는 완결된 카드가 그려진다.** 다만 이건 **사실과 다른 상태 표시**다 — 그 게시글은
실제로 삭제되지 않았고, 단지 서버가 카드 정보를 조인해 보내지 않았을 뿐이다. 심각도가
낮아지는 정정이 아니다: "빈 말풍선"은 사용자가 "뭔가 로딩이 덜 됐나" 정도로 넘길 수 있지만,
"삭제된 게시글입니다"는 **없는 사실을 단정적으로 알리는 오정보**이고 클릭도 막혀 있어(D-030
③, `PostLinkCard.tsx` 모듈 docstring — "삭제됨·다른 크루는 `Link`로 감싸지 않는다") 사용자가
직접 확인해 오류를 알아챌 경로도 없다.

---

## 3. 세 안 비교

### (a) DB 트리거를 확장해 카드를 채운다 — 기각 (**근거 과장 — §8 참고, 결론은 유지**)

> **정정(36일차, 팀장·CREW 지적 + BOARD 독립 재확인)**: 아래 "NFR-036을 어기는 선택"이라는
> 판정은 **`resolvePostLinkCard`의 로직 전체를 뭉뚱그려 본 과장**이다. 실제로는 존재·
> 소프트삭제·크루 일치(forbidden)·제목/작성자 조인은 **트리거가 이미 하는 것과 같은 종류의
> 단순 조인·동치 비교**이고, **`getPollRemainingMs`/`isPollAwaitingClosure`(poll 시간
> 판정)만** NFR-036이 보호하려는 "지정된 단일 소스" 순수 함수다 — `poll-timezone.ts`
> 자체 docstring이 이 함수들을 재사용 대상으로 명시한다. 부분 확장(poll 필드만 비움)이라는
> 제3의 안이 있었는데 이 절이 검토·기각한 흔적 없이 넘어갔다 — **결론(지금 당장은 만들지
> 않는다)은 바뀌지 않지만 근거는 §8에서 다시 세운다.**

`resolvePostLinkCard`(`resolve-post-link-card.ts`)가 하는 일: 게시글 조회 → 소프트 삭제
판정 → **board.crewId와 대조해 "다른 크루" 판정**(forbidden) → 제안글이면 poll 조회 →
`getPollRemainingMs`/`isPollAwaitingClosure`(`lib/rules/poll-timezone.ts`, 순수 함수)로
남은 시간·마감 임박 판정. 이걸 SQL 트리거(`SECURITY DEFINER` 함수)로 옮기려면 **같은
판정을 PL/pgSQL로 다시 쓰거나, 트리거가 TS 함수를 호출할 방법이 없어 SQL 시간 연산으로
새로 구현**해야 한다 — Task 034가 `poll_vote_tally`/`decideAndClosePoll`에서 이미 겪은
"판정 재사용 불가, SQL 미러 불가피"(I-071) 사례와 똑같은 구조인데, 그때는 `auth.uid()`
의존이라는 물리적 제약이 있었지만 여기는 그런 제약도 없다 — **순수하게 게으름/속도를 위해
NFR-036("판정을 두 곳에 두지 않는다")·R-015를 어기는 선택**이 된다. 게다가 트리거는 이
프로젝트에서 **판정이 아니라 발신**만 맡아 왔다(§2 "가벼운 핑만 보낸다" 참고, `polls_broadcast`도
집계값을 트리거가 계산하지 않고 클라이언트가 `router.refresh()`로 재조회한다 — 같은 원칙).
**기각.**

### (b) 클라이언트가 `post_link` 수신 시 개별 재조회

**재사용 가능한 기존 코드가 이미 있다**:

- `resyncChatMessagesAction`(`src/lib/actions/resync-chat-messages.ts`) — `afterMessageId`
  이후 메시지를 `toMessageViewModel`로 다시 조인해 반환한다(이미 `postLinkCard`를 올바르게
  채운다). 다만 이건 "재연결 후 누락분 배치 보충" 용도로 설계돼 매 `post_link` 수신마다
  쓰기엔 과하고(방 전체 재조회 의미론), `MessageRoomContainer`가 지금 그 상태(`connectionStatus
  === "reconnecting"`)에서만 부른다.
- **더 맞는 재사용 단위**: `getMessageById`(`src/lib/data/mock/chat.ts:24`,
  `src/lib/data/supabase/chat.ts:31` — 이미 `delete-chat-message.ts:45`가 "조회→판정→삭제"
  순서로 쓰고 있다) + `toMessageViewModel`(`resolve-message-view-model.ts` — 이미 3곳이
  공유하는 조인 로직, 이 함수를 또 쓰는 게 네 번째 호출부가 될 뿐 새 판정 로직이 아니다).
  이 둘을 엮은 얇은 Server Action(`resolvePostLinkMessageAction(messageId)` 같은 것) 하나면
  된다 — 판정 로직을 새로 쓰지 않고 기존 조각 두 개를 조립만 하므로 NFR-036과 충돌하지
  않는다.
- `MessageRoomContainer.tsx:234-237`의 수신 핸들러에서 `payload.type === "post_link" &&
  payload.postLinkCard === null`일 때만 이 액션을 호출해 해당 메시지를 교체(`setMessages`의
  `[...prev, payload]`를 `[...prev, resolved]`로) — `text` 타입 메시지는 지금처럼 원본을
  그대로 쓰므로 다수 경로(대부분의 메시지)에 지연을 추가하지 않는다.

**비용은 작다**(기존 조각 재사용 + 신규 액션 하나 + 수신 핸들러 분기 하나, 대략 반나절
미만으로 추정) — 하지만 **지금 만들 이유가 없다.** 이 코드가 실제로 실행되는 유일한 경로
(`post_link` 메시지 생성)가 앱에 없으므로, 지금 구현해도 `/sample`이나 실 사용자 흐름
어디서도 검증할 방법이 없다 — 검증 안 된 코드를 미리 심어 두는 것 자체가 새로운 리스크다
(다음에 FR-052 쓰기 쪽이 실제로 구현될 때 그 Task가 이 코드의 존재를 모르고 다시 짜거나,
알고 있어도 그사이 `MessageViewModel` 타입이나 `resolve-message-view-model.ts`가 바뀌어
있으면 그때 다시 검증해야 하는 건 마찬가지다). **지금 적용은 보류, 레시피만 기록**(아래
권고안).

### (c) 현행 유지 + 회귀 방어

현재 상태를 뜯어보면 **회귀 방어가 이미 부분적으로 존재한다**:

1. **구조적 방어**: `type: "post_link"`를 만드는 유일한 진입점은 없다 —
   `sendChatMessageAction`이 리터럴로 `"text"`를 박고 있어서, 누군가 "게시글을 채팅에
   공유" 기능을 추가하려면 **반드시 이 파일의 이 줄을 고쳐야 한다.** 즉 회귀가 발생하는
   유일한 방법 자체가 이미 좁게 정해져 있다.
   > **정정(36일차, 팀장 지적 + BOARD 독립 재현)**: **이 문단은 거짓이다.** "유일한
   > 진입점"은 앱 서버 코드 기준일 뿐이고, DB RLS(`chat_messages_insert_members`)가
   > `type` 컬럼값을 전혀 제한하지 않아 `sendChatMessageAction`을 완전히 우회하는
   > 진입점이 이미 열려 있다 — §7 참고. 아래 §4의 "초크포인트 주석" 권고는 이 경로에
   > 대해 아무 방어도 아니다.
2. **런타임 방어**: `MessageBubble`의 `?? { kind: "deleted" }` 폴백 덕에, 그 시점이 와도
   즉시 크래시하거나 레이아웃이 깨지지는 않는다(§2.3) — "지뢰"의 폭발 반경이 문서가
   서술한 것보다 좁다.
3. **약점**: 위 두 방어는 모두 **침묵한다.** ①을 어기는 사람이 I-063을 몰라도 컴파일·빌드·
   린트·타입체크 전부 통과한다(타입 시스템은 `"post_link"`가 `ChatMessageType`의 유효한
   값이라고만 알 뿐, "실시간 페이로드에서는 그 조인이 비어 있다"는 사실은 모른다). ②는
   문제를 숨겨서 더 늦게 발견되게 만든다(§2.3의 "오정보" 문제 — QA가 "빈 화면"은 바로
   눈치채지만 "그럴듯한 삭제됨 카드"는 실제 게시글 상태와 대조해야 알아챈다).

---

## 4. 권고 — 제3안: (c)를 좁혀서 보강, (b)는 레시피만 준비 (**폐기 — §7로 대체됨**)

> **정정(36일차, 팀장 지적 + BOARD 독립 재현)**: 아래 §4 전체는 **DB 쓰기 경로가 실제로
> 열려 있다는 사실을 몰랐던 상태에서 쓴 권고다 — 지금은 폐기하고 §7의 권고로 대체한다.**
> 초크포인트 주석은 앱 서버 코드 경로만 덮으므로 raw REST 우회를 전혀 막지 못한다(§1·
> §3-(c)-① 정정 참고). 원문은 지우지 않고 아래 그대로 둔다.

**"고친다/안 고친다" 이분법 대신**, 비용 0에 가까운 조치로 "침묵하는 회귀"를 "눈에 띄는
회귀"로 바꾸는 것을 권고한다. **이번 회차에 적용하지 않았다** — 아래는 팀장 승인을 받으면
바로 넣을 수 있는 구체안이다.

1. **초크포인트 주석 — 비용은 주석 한 줄, 리스크 0.** `send-chat-message.ts:83`의
   `type: "text"` 리터럴 바로 위에, "이 값을 동적으로 바꾸기 전에 I-063을 먼저 봐라"는
   주석을 단다. 이 줄을 고치는 것이 회귀가 발생하는 유일한 방법(§3-(c)-①)이므로, 경고를
   문서(`ISSUES.md`)가 아니라 **그 줄 자체**에 붙이면 다음 구현자가 놓칠 수 없다. 같은
   이유로 `MessageBubble.tsx:203-206`의 폴백 주석에도 "이 폴백이 실제로 트리거되면 I-063이
   아직 안 고쳐진 것"이라는 한 줄을 보탠다. **로직 변경 없음** — 이번 회차 "코드 수정 금지"
   지침과 무관하게 다음 회차에 팀장 판단으로 즉시 적용 가능한 최소 단위다.
2. **(b)의 구현 레시피를 이 문서(§3-(b))에 이미 기록해 뒀다** — `getMessageById` +
   `toMessageViewModel` 조립. FR-052 쓰기 쪽(게시글을 채팅에 공유)이 실제로 Task로 배정되는
   순간, 그 Task 담당자가 이 문서를 참고하면 "무엇을 재사용할 수 있는가"를 다시 조사할
   필요가 없다 — 재현·디버깅 비용을 미리 낮춰 두는 것으로 색인의 배정 근거("지금 고치는
   비용이 나중보다 싸다")를 코드가 아니라 **문서로** 만족시킨다.
3. **(a)는 채택하지 않는다** — NFR-036 위반이 명백하고, 대안 (b)가 판정을 다시 쓰지 않고도
   동일한 결과를 내므로 트레이드오프 자체가 성립하지 않는다.
4. **(b)를 지금 구현하지 않는다** — 실행할 소비자가 없는 코드를 미리 심는 것은 이 문서가
   찾던 "비용 0" 원칙에 어긋난다(검증 불가능한 코드는 그 자체로 부채). FR-052 쓰기 쪽 Task가
   생기는 시점에 §3-(b) 레시피로 구현한다.

**요약**: 이번 회차의 처분은 **문서 정정(완료) + 초크포인트 주석 2건(권고, 미적용) +
구현 레시피 사전 기록(완료)**이다. I-063은 계속 열림·(B) 유지 — "고치지 않는다"가 아니라
"고칠 조건(FR-052 쓰기 Task)이 아직 성립하지 않았고, 성립하는 순간 드는 비용을 지금
낮춰 뒀다"는 뜻이다.

---

## 5. 만든/수정한 파일

- **신규**: `docs/design/post-link-card-disposition-36/README.md`(이 문서)
- **수정**(기존 번호 블록 내부 — 원 서술 보존, 정정만 추가):
  - `docs/ISSUES.md` — I-063 블록에 "36일차(BOARD) 재확인" 절 추가
  - `docs/decisions/realtime-broadcast-033.md` — §4에 "36일차(BOARD) 정정" 문단 추가
- **draft 파일 없음** — 이번 회차는 새 이슈·결정 번호가 필요한 발견이 없었다(기존 I-063
  블록의 사실관계 정정뿐).
- **코드·마이그레이션 변경 없음** — `git status`로 확인 가능.

> **정정(36일차 §7)**: 위 목록은 팀장 실측·재처분 **이전** 상태다. §7 작업으로 추가된 것:
> - **신규**: `docs/ISSUES.draft.BOARD.md`(번호 없음) — §7.1·§7.2 결함(INSERT RLS `type`
>   미제한)을 기록.
> - **수정**: 이 문서 §1·§3-(c)-①·§4에 정정 블록 인라인 추가, §6에 정정 블록 1개 추가,
>   §7(신규) 통째로 추가.
> - **DB 변경 없음**: §7.2의 INSERT 재현은 전부 `begin...rollback`으로 감쌌고 종료 후
>   잔여 0건을 재확인했다 — 마이그레이션·정책 변경은 제안(§7.3 (d))만 하고 적용하지 않았다.

---

## 6. 미검증 잔여

- **초크포인트 주석(§4-1)은 권고만 하고 적용하지 않았다** — 팀장 승인 후 다음 회차(또는
  이번 회차 팀장 직접 적용)로 넘긴다.
- **(b) 레시피는 설계만 했고 실제로 짜서 타입체크·빌드까지 돌려보지는 않았다** — 소비자가
  없어 `/sample`에도 걸 자리가 없다(정적 프리뷰 픽스처(`sample/sections/chat.tsx:133`)는
  이미 있지만 이건 실시간 수신 경로가 아니라 최초 조회 프리뷰라 이 결함 경로를 재현하지
  않는다). 실제 구현 시점에 타입 정합성(`MessageViewModel` 변경 여부)을 다시 확인해야 한다.
- **"오정보 카드"의 실제 사용자 인지도(브라우저 실측)는 하지 않았다** — 코드 경로 분석
  (정적)이며, 소비자가 없어 브라우저로 재현할 방법 자체가 없다(만들려면 mock 시드처럼
  강제로 `post_link` 메시지를 DB에 직접 INSERT해야 하는데, 이번 회차 지침(읽기 SQL만 허용)
  범위 밖이라 하지 않았다).
  > **정정(36일차)**: `post_link` 메시지를 DB에 직접 INSERT하는 것 자체는 이후 §7에서
  > `begin...rollback`으로 감싸 실제로 했다(SQL 레벨 재현, 흔적 없음). 다만 **브라우저로
  > 그 카드가 실제로 렌더되는지**는 여전히 하지 않았다 — `npm run dev` 세션 금지 지침은
  > 그대로이므로 이 갭 자체는 남아 있다.
- **FR-052 쓰기 쪽이 실제로 로드맵에 언제 들어올지는 이 문서의 범위 밖이다** — 배정은
  팀장·일정 문서(`docs/ROADMAP.md`, `SCHEDULE.md`) 소관.

---

## 7. 36일차(팀장 실측 + BOARD 독립 재현) — 두 전제 붕괴와 재처분

**팀장이 실측으로 지적한 두 전제**를 BOARD가 **다른 구체값(다른 post id·room id)으로
독립 재현**했다 — 팀장 결과를 그대로 옮기지 않았다.

### 7.1 붕괴한 전제 ① — "회귀의 유일한 경로는 `type: "text"` 리터럴"은 거짓이다

`pg_policies`로 `chat_messages_insert_members`의 `WITH CHECK`를 직접 조회:

```
(sender_id = auth.uid())
AND (room_id IN (
  SELECT cr.id FROM chat_rooms cr JOIN crew_memberships cm ON cm.crew_id = cr.crew_id
  WHERE cm.profile_id = auth.uid() AND cm.status = 'active' AND private.is_crew_active(cr.crew_id)
))
```

`type` 컬럼은 어디에도 없다. 테이블 CHECK 제약도 막지 않는다: `chat_messages_type_check`는
`type IN ('text','post_link')`로 **`post_link`를 명시 허용**하고, `chat_messages_check`는
`type='text' OR ref_post_id IS NOT NULL`만 요구한다. `pg_trigger` 전수 조회 결과 INSERT
시점에 개입하는 트리거는 0개(`AFTER INSERT` 브로드캐스트 트리거뿐, BEFORE INSERT 없음).
FK(`ref_post_id → posts(id)`)도 존재만 요구하고 **크루 일치를 검사하지 않는다.**

### 7.2 붕괴한 전제 ② — "현재 영향 0"은 raw REST 기준으로는 거짓이다

**직접 실증**(`begin...rollback`, 일반 멤버 세션 흉내):

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<chopin0625 profile id>","role":"authenticated"}';

insert into public.chat_messages (room_id, sender_id, type, body, ref_post_id, client_key)
values (
  '<chopin0625이 활성 멤버인 방(크루 A)>',
  '<chopin0625 profile id>',
  'post_link', null,
  '<크루 B(방과 다른 크루) 게시글 id>',
  'i063-exploit-test-1'
) returning id, type, ref_post_id, room_id;

rollback;
```

**성공했다** — RLS·CHECK·FK 어느 것도 막지 않았고, `ref_post_id`가 room의 크루(A)가 아닌
**다른 크루(B) 게시글**임에도 통과했다(FK가 크루 범위를 안 본다는 것까지 직접 확인). 롤백
후 잔여 0건 재확인. 즉 **일반 크루원 한 명이 다른 크루원들의 실시간 채팅 화면에 "삭제된
게시글입니다" 오정보 카드를 오늘 당장 띄울 수 있다**(§2.3의 렌더 판정과 결합) — 새로고침하면
`resolvePostLinkCard`가 `forbidden`으로 재판정해 카드 문구가 바뀐다(나타났다 사라지는 형태,
정보 유출은 없다 — `forbidden` 분기는 제목조차 반환하지 않는다).

**부가 확인**: `public.chat_messages`에는 **이미 정상적인 `post_link` 시드 행 12건**이
있다(크루당 1건, `client_key='postlink-{crewId}'`, `created_at` 전부 동일 — 벌크 시드).
전수 조회 결과 **12건 전부 room의 크루와 게시글의 크루가 정확히 일치**한다 — 즉 기존
시드는 이 결함의 증거가 아니라 오히려 "정상적으로 만들어진 데이터는 항상 크루가 일치한다"는
대조군이다. 이 정책은 `roles={authenticated}`로만 걸려 있어 `service_role`/`postgres`로
넣는 시드 스크립트는 이번 조사와 무관하게 항상 RLS를 우회한다(영향 없음).

### 7.3 재처분 — 좁은 WITH CHECK 이중화(35일차 CREW 선례와 같은 모양)

세 안을 다시 비교한다. §3의 (a)·(b) 판단은 그대로 유효하다(트리거 판정 재구현 기각, 클라이언트
개별 재조회는 레시피만 준비) — 다만 **DB 쓰기 경로가 열려 있다는 새 사실 앞에서는 "앱 경로만
막는" 어떤 안도 불충분**하다. 새 선택지를 추가한다.

**(d) `chat_messages_insert_members`의 `WITH CHECK`에 `AND type = 'text'`를 추가한다.**

- **오늘의 정상 기능에 영향 0을 실측으로 확인했다** — 이 정책은 `authenticated` 역할에만
  걸린다(`pg_policies.roles = {authenticated}`). 기존 시드 12건은 `service_role`/`postgres`로
  삽입돼 RLS 자체가 적용되지 않았으므로 무관하고, 유일한 실 쓰기 경로
  `sendChatMessageAction`도 항상 `type: "text"`만 보낸다(§1) — **오늘 이 제약을 넣어도
  깨지는 정상 흐름이 하나도 없다.** 35일차 CREW의 "WITH CHECK 전용 좁은 이중화"와 정확히
  같은 모양이다 — `resolvePostLinkCard`의 크루 일치·poll 상태 판정(TS)을 다시 쓰는 게
  아니라, "지금은 `text`만 허용한다"는 **정책 게이트 하나**만 추가하므로 NFR-036이 금지하는
  "판정 로직 두 곳"이 아니다(정족수 공식처럼 재계산되는 값이 아니라 단순 리터럴 비교다).
- **효과**: raw REST 우회를 포함해 오늘 이 경로로 `post_link`를 만드는 모든 방법을
  완전히 닫는다 — 앱 코드 리터럴에만 의존하던 §3-(c)-①의 "구조적 방어"를 실제로 구조적으로
  만든다.
- **비용**: 마이그레이션 1건(`ALTER POLICY ... WITH CHECK (... AND type = 'text')` 또는
  정책 재생성). **이번 회차 지침(DDL 적용 금지)에 따라 적용하지 않았다** — 제안까지만.
- **다음에 반드시 같이 볼 것**: FR-052 쓰기 경로(게시글을 채팅에 공유)가 실제로 Task로
  배정되는 시점에 이 제약을 다시 열어야 한다. 이때 단순히 `type` 제약만 없애면 §7.1의
  구멍이 되돌아오므로, **크루 일치까지 검사하는 조건으로 교체**하거나(예:
  `type='text' OR (type='post_link' AND ref_post_id IN (같은 크루 게시글 서브쿼리))`)
  전용 SECURITY DEFINER RPC로 쓰기 경로 자체를 옮기는 것을 그때 함께 검토해야 한다 — 이
  제약을 "당분간의 임시 잠금"으로만 다루고 잊으면 이 결함이 그대로 되돌아온다.
- **초크포인트 주석(§4)은 폐기하지 않고 (d)와 함께 쓴다** — (d)가 DB 경로를 막지만,
  `send-chat-message.ts:83`에 주석을 남겨 두는 것 자체는 여전히 비용 0이고 앱 레이어
  개발자에게도 신호를 준다. 다만 **(d) 없이 주석만으로는 §7.1의 구멍을 전혀 막지 못한다는
  점을 분명히 한다** — §4 원문의 "회귀 방어" 프레이밍은 이제 (d)가 있어야 성립한다.

**수정된 권고**: **(d)를 최우선 제안으로 올리고, 기존 §4의 초크포인트 주석을 (d)의 보조
수단으로 격하한다.** (a) 기각·(b) 보류+레시피 유지는 변화 없다. (d)는 DDL이라 이번 회차엔
적용하지 않고 제안만 남긴다 — 팀장 승인 시 다음 마이그레이션으로 넣을 수 있다.

### 7.4 별도 축 판정 — `ref_post_id` 크루 범위 미검사는 I-063과 다른 결함이다

§7.1의 "FK가 크루 범위를 안 본다"는 사실은 I-063(postLinkCard가 안 채워짐)과 **원인이
다른 별개 결함**이다 — I-063은 "채워야 할 값을 안 채운다"는 조인 누락이고, 이건 "애초에
막아야 할 쓰기를 안 막는다"는 RLS 설계 갭이다. `docs/ISSUES.md` I-091이 정식화한 패턴
("self-service RLS 분기의 컬럼값 미제한")에는 **해당하지 않는다고 판정한다** — I-091은
스스로 범위를 **"self-service(행 소유권 = auth.uid()) UPDATE 분기의 상태 컬럼"**으로
좁혀 정의했다(`docs/ISSUES.md` I-091 본문 "정식화한 범주" 절). 이번 결함은 UPDATE가
아니라 **INSERT**이고, 전이시킬 기존 행 소유권도 없다(새 행 생성) — I-091의 정의 범위 밖의
**형제 패턴**("INSERT WITH CHECK가 여러 값을 허용하는 CHECK 제약 컬럼을 제한하지
않는다")으로 본다. `docs/ISSUES.draft.CREW.md`에 CREW가 **같은 발견을 독립적으로**
기록해 뒀다(팀장이 배정한 이 조사와 별개로, CREW가 BOARD의 I-063 처분안을 교차검증하며
찾음) — 내용은 이 문서의 §7.1과 사실관계가 일치한다(다른 room/post id로 각자 재현). 두
독립 재현이 수렴하므로 신뢰도가 높다. `docs/ISSUES.draft.BOARD.md`에 번호 없이 기록했다
(CREW 항목과 중복 등재하지 않고 상호 참조만 남긴다).

### 7.5 검증 방법·잔여

- DDL(정책 변경)은 적용하지 않았다 — (d)는 제안까지다.
- (d)를 넣은 뒤 실제로 정상 흐름(1:1 채팅 텍스트 전송)이 깨지지 않는지는 **제안 적용 후
  재검증이 필요하다**(이번엔 begin/rollback 합성 테스트로만 확인, 실제 마이그레이션 적용
  후 `sendChatMessageAction` 경로의 회귀 테스트는 미실행).
- 브라우저에서 이 오정보 카드가 실제로 어떻게 보이는지는 여전히 미검증(§6 정정 참고).
- `ref_post_id` 크루 범위 미검사가 채팅 외 다른 `ref_*` 컬럼에도 같은 패턴으로 있는지는
  이번 조사 범위 밖(전수 점검 안 함).

---

## 8. 36일차(팀장 추가 지적, CREW 관측 반영) — §3-(a)의 NFR-036 근거를 다시 세운다

**팀장 지적**: "(a) 트리거 확장은 불가피하게 NFR-036 위반"은 과장이다. `title`·`postType`·
`author*`(순수 조인)와 `crewId` 동치 비교는 판정이 아니고, `chat_messages_broadcast` 자신이
이미 crew·profile 조인을 한다. poll 시간 판정만 SQL 재구현이 필요하다는 것이 CREW의 관측.
**결론을 바꾸지 않아도 되지만 근거는 정정하라는 지시** — 아래는 BOARD가 직접 코드를 다시
읽어 독립적으로 재확인한 결과다(CREW의 판정을 그대로 옮기지 않았다).

### 8.1 `resolvePostLinkCard`를 필드별로 분해한다

`resolve-post-link-card.ts`를 다시 읽고 각 단계가 실제로 무엇을 하는지 확인했다:

| 단계 | 실제 동작(코드 확인) | SQL 트리거로 옮길 때의 성격 |
| --- | --- | --- |
| `kind: "deleted"` 판정 | `getPostById`가 `.eq("id", refPostId).is("deleted_at", null)`로 조회(`board.ts:88-98`) — **존재 + 소프트삭제 여부만** 본다 | `EXISTS(SELECT 1 FROM posts WHERE id=... AND deleted_at IS NULL)` — 단순 조인, 판정 아님 |
| `kind: "forbidden"` 판정 | `board.crewId !== viewerCrewId` 동치 비교 | 트리거가 이미 `chat_rooms → crew_id`를 조인해 알고 있는 값과 `posts → boards → crew_id`를 비교하는 **단순 동치식** — `WITH CHECK`에 쓸 (d)안과 원리가 같다 |
| `title`·`postType`·`authorDisplayName`·`authorAvatarUrl` | `posts`·`profiles` 조회 결과를 그대로 옮겨 담는다 | 순수 조인 — 트리거가 발신자 프로필을 위해 이미 하는 `profiles` 조인과 **같은 종류**(대상만 sender→post author로 바뀔 뿐) |
| `poll` 필드(status·closesAt·remainingMs·isAwaitingClosure) | `getPollByPostId` 조회 + `getPollRemainingMs`/`isPollAwaitingClosure`(`lib/rules/poll-timezone.ts`) 호출 | **이 두 함수만** 자기 docstring에서 "판정 로직 재사용 원칙(NFR-036, R-015)에 따라 UI·서버 양쪽에서 같은 함수를 호출한다"고 명시한 **지정된 단일 소스** 순수 함수다. 다시 읽어보면 산술 자체는 `max(0, closesAt-now)` ms·`status='open' AND now>=closesAt`로 **SQL로도 한 줄씩**이라 계산 난이도가 문제가 아니다 — **"이 프로젝트가 명시적으로 지정한 단일 소스를 굳이 두 번째로 만든다"는 정책 위반**이 문제다 |

**독립 재확인 결론**: 원 §3-(a)의 "판정을 PL/pgSQL로 다시 쓰거나, 시간 연산으로 새로
구현해야 한다"는 서술은 **네 갈래를 하나로 뭉뚱그렸다.** `deleted`·`forbidden`·기본 필드
3갈래는 이미 이 프로젝트가 RLS·트리거 양쪽에서 반복해 온 "2차 방어선 조인·동치 비교"
패턴(`resolve-post-link-card.ts` 자신의 모듈 docstring이 "RLS가 2차 방어선으로 거부할 수
있다"고 설명하는 바로 그 원칙, 이 문서 §7.3의 (d)안도 같은 원리)과 다르지 않다. **poll
갈래만** NFR-036이 명명해 보호하는 대상이다.

### 8.2 (e) 부분 트리거 확장 — 정직하게 비교한다

**정의**: `chat_messages_broadcast()`가 `type='post_link'`일 때 `posts`(존재·삭제 여부·
title·type·board_id)·`boards`(crew_id)·`profiles`(post 작성자)를 조인해 `kind`
(`deleted`/`forbidden`/`post`)와 `title`·`postType`·`authorDisplayName`·`authorAvatarUrl`을
채우고, **`poll` 필드는 항상 `null`로 남긴다**(NFR-036 보호 대상은 건드리지 않는다).

- **효과**: `post_link` 메시지 중 **일반글**(`postType`이 제안 유형이 아닌 것)은 즉시
  정확한 카드로 뜬다 — §2.3의 "삭제된 게시글입니다" 오정보가 사라진다. **제안글**
  (`meetup_proposal`/`meetup_reschedule_proposal`)은 카드는 맞게 뜨지만 투표 상태·남은
  시간(FR-052 AC3)이 빠진 채로 뜬다 — 오정보보다는 낫지만 **AC3 미충족 상태로 남는
  절반의 해결**이다.
- **비용**: 마이그레이션 1건, `posts`/`boards`/두 번째 `profiles` 조인 추가 — (d)보다
  분명히 크다(정확한 인일 추정은 하지 않았다, 실측 대상이 아니라 설계 비교). **여전히
  소비자가 없다** — `post_link` 쓰기 경로가 앱에 0건이므로 (b)와 같은 이유로 **지금
  검증할 방법이 없다**(§3-(b) 문단 재적용).
- **(d)와의 관계**: **배타적이지 않다.** (d)가 오늘의 raw REST 구멍을 막는 **게이트**라면,
  (e)는 FR-052 쓰기 경로가 열렸을 때 카드 품질을 올리는 **콘텐츠 채움**이다. (d)만 있고
  (e)가 없으면 미래에 쓰기 경로가 열려도 여전히 §2.3의 오정보 카드가 재발한다 — (d)는
  "언제" 열지를 통제할 뿐 "열렸을 때 무엇을 보여줄지"는 여전히 (b) 또는 (e) 몫이다.

### 8.3 (e) vs (b) — 최종 판단은 바뀌지 않는다, 이유는 다시 세운다

원 결론(지금 당장 둘 다 만들지 않는다)을 유지하되, **이제는 "NFR-036 위반이라서"가 아니라
"소비자가 없어 검증 불가능해서"가 유일하고 정확한 이유**다:

- (b)(클라이언트 개별 재조회)는 `resolvePostLinkCard`를 **그대로 재사용**해 poll 판정을
  포함한 **완전한 카드**를 얻는다 — 중복 코드가 아예 없다(진짜 단일 소스).
- (e)(부분 트리거 확장)는 poll을 뺀 나머지를 SQL로 **다시 만든다** — NFR-036 위반은
  아니지만(§8.1), 존재·크루비교·조인 로직이 TS·SQL 두 곳에 있게 되는 건 사실이라 유지
  비용(스키마 변경 시 두 곳을 함께 고쳐야 함)이 (b)보다 크다. 게다가 poll이 빠진 절반의
  결과물이라 FR-052 AC3를 그 자체로 만족하지 못한다.
- **둘 다 지금 만들지 않는 이유는 같다** — `post_link` 쓰기 경로가 없어 `/sample`이든
  실 사용자 흐름이든 검증할 자리가 없다(§3-(b) 논리 그대로). **차이는, FR-052가 실제로
  배정되는 시점의 권고 순위다**: 그 시점에는 (e)가 아니라 **(b)를 먼저 검토하라** — 완전한
  카드를 얻으면서 중복도 없다. (e)는 "클라이언트 왕복을 줄이고 싶다"는 성능상 이유가
  분명해질 때만(예: 실측으로 (b)의 지연이 문제로 드러날 때) 재검토 대상이다.

### 8.4 갱신된 권고 요약

- **(a)(전체 트리거 확장)**: 기각 유지 — poll 갈래가 NFR-036 보호 대상이라 전체를
  트리거로 옮기는 안은 여전히 기각. 다만 **근거는 "전체가 판정이라서"가 아니라 "poll
  갈래 하나가 지정된 단일 소스라서"로 좁혀 정정한다.**
- **(e)(부분 트리거 확장, 신규 검토)**: 기술적으로 NFR-036 위반이 아님을 확인했지만,
  소비자 부재로 지금 검증 불가 + (b)보다 유지 비용이 커 **지금 만들지 않는다.** FR-052
  배정 시 (b) 대비 열위 후보로 기록.
- **(d)(WITH CHECK type='text' 제한, §7.3)**: 그대로 최우선 제안 유지 — (e) 논의는 (d)의
  긴급성이나 비용 실측에 영향을 주지 않는다(서로 다른 층위: (d)는 DB 쓰기 게이트, (e)는
  콘텐츠 채움).
- **(b)(클라이언트 개별 재조회, §3-(b))**: 그대로 보류 + 레시피 유지. FR-052 배정 시 (e)보다
  우선 검토 대상으로 이번에 명시했다.

---

## 9. 36일차 — (d) 조건부 승인, 실행 가능한 SQL 전문 + `begin...rollback` 드라이런 실증

**팀장이 (d)를 조건부 승인했다**(비용 0 주장을 `pg_policy.polroles`·`rolbypassrls` 독립
확인으로 재검증). 적용 순서는 **CREW의 PII 파기 수정(더 심각한 (A)급)이 먼저** — 팀장이
"CREW 적용 완료"를 알릴 때까지 `apply_migration`을 호출하지 않는다. 아래는 **실행 가능한
SQL 전문**(형태 서술이 아니다)과, 그 SQL을 `begin...rollback`으로 감싸 실제로 돌려본
드라이런 결과다.

### 9.1 `ALTER POLICY` vs `DROP`+`CREATE POLICY` — `ALTER POLICY`를 택한다

**이유**: 이 정책은 `FOR INSERT`라 `USING` 절이 애초에 없다 — 바꿀 대상은 `WITH CHECK`
하나뿐이다. `ALTER POLICY ... WITH CHECK (...)`는 그 표현식**만** 교체하고 `roles`
(`TO authenticated`)·`cmd`(`FOR INSERT`)·정책 이름은 그대로 둔다 — `DROP`+`CREATE`처럼
전체를 다시 선언하다 다른 속성을 빠뜨릴 위험 자체가 구조적으로 없다(35일차
`crews_update_staff_or_owner` 선례와 같은 이유).

### 9.2 원본 `WITH CHECK` 표현식 — 기억이 아니라 `pg_get_expr`로 꺼낸 원문

```sql
select pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_raw
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
where c.relname = 'chat_messages' and pol.polname = 'chat_messages_insert_members';
```

**실행 결과(원문 그대로, 재타이핑 없음)**:

```
((sender_id = ( SELECT auth.uid() AS uid)) AND (room_id IN ( SELECT cr.id
   FROM (chat_rooms cr
     JOIN crew_memberships cm ON ((cm.crew_id = cr.crew_id)))
  WHERE ((cm.profile_id = ( SELECT auth.uid() AS uid)) AND (cm.status = 'active'::text) AND private.is_crew_active(cr.crew_id)))))
```

### 9.3 실행 가능한 SQL 전문

```sql
alter policy "chat_messages_insert_members" on public.chat_messages
  with check (
    ((sender_id = ( SELECT auth.uid() AS uid)) AND (room_id IN ( SELECT cr.id
       FROM (chat_rooms cr
         JOIN crew_memberships cm ON ((cm.crew_id = cr.crew_id)))
      WHERE ((cm.profile_id = ( SELECT auth.uid() AS uid)) AND (cm.status = 'active'::text) AND private.is_crew_active(cr.crew_id)))))
    AND type = 'text'
  );

comment on policy "chat_messages_insert_members" on public.chat_messages is
  'I-063(36일차) 조건부 처분: WITH CHECK에 type=''text'' 게이트를 추가해 post_link 메시지의
   INSERT 자체를 막는다 — 원래 정책은 type 컬럼을 전혀 제한하지 않아, 활성 크루원이 raw
   REST로 크루 일치 없는 post_link 메시지를 삽입해 다른 크루원 화면에 오정보 카드를 띄울
   수 있었다(docs/design/post-link-card-disposition-36 §7). FR-052(게시글을 채팅에 공유)
   쓰기 경로가 실제로 생기면 이 리터럴 게이트를 단순 삭제하지 말고 크루 일치 검사로
   교체한다 — 삭제만 하면 이 구멍이 되돌아온다.';
```

`9.2`의 원문 뒤에 `AND type = 'text'`만 덧붙였다 — 괄호 구조·서브셀렉트·`private.is_crew_active`
호출 어느 것도 고치지 않았다. 원본 파일: `docs/design/post-link-card-disposition-36/pending_migration_chat_messages_type_gate.sql`
(아직 `supabase/migrations/`에 없다 — I-051 팀 표준대로 적용 후 실제 원격 `version`을
확인해 그 값을 접두어로 옮긴다).

### 9.4 회귀 검증 SQL 3종 (전부 `begin...rollback`)

```sql
-- ① text 메시지 전송이 여전히 성공하는가
insert into public.chat_messages (room_id, sender_id, type, body, client_key)
values ('<room>', '<sender>', 'text', '...', '<client_key>');

-- ② post_link 직접 INSERT가 거부되는가(42501)
insert into public.chat_messages (room_id, sender_id, type, body, ref_post_id, client_key)
values ('<room>', '<sender>', 'post_link', null, '<다른 크루 post id>', '<client_key>');

-- ③ 기존 post_link 12건이 여전히 조회되는가(SELECT 정책 무변경)
select id, type, ref_post_id, room_id
from public.chat_messages
where type = 'post_link' and room_id = '<room>';
```

전문(파라미터 채운 완성형, 3블록 각각 독립 `begin...rollback`)은
`docs/design/post-link-card-disposition-36/regression_check_chat_messages_type_gate.sql`에
있다.

### 9.5 `begin...rollback` 드라이런 실증 — SQL 전문을 실제로 한 번 실행했다

**요청대로 §9.3의 DDL을 실제로 실행**했다(팀장 지적: "DDL도 트랜잭션 안에서 롤백된다").
한 트랜잭션 안에서 ① `ALTER POLICY` + `COMMENT ON POLICY` 적용 → ② `set local role
authenticated` + `request.jwt.claims`로 chopin0625 세션을 흉내 내 §9.4의 세 검증을
`DO`+예외 처리로 순서대로 실행(하나가 실패해도 다음 검증이 이어지도록) → ③ 결과를
임시 테이블에 적재해 조회 → ④ `rollback`으로 DDL·데이터 전부 원복.

**결과**:

| 검증 | 결과 | 상세 |
| --- | --- | --- |
| ① `text` INSERT | **SUCCESS** | — |
| ② `post_link`(다른 크루 게시글) INSERT | **REJECTED** | `42501: new row violates row-level security policy for table "chat_messages"` |
| ③ 기존 `post_link` SELECT | **SUCCESS** | `1 rows visible` |

**정확히 기대한 대로다** — ①·③은 무변화, ②만 원 §7.2가 실증했던 "성공(결함)"에서
"42501 거부"로 뒤집혔다. 롤백 후 재확인:

```sql
select pg_get_expr(pol.polwithcheck, pol.polrelid), obj_description(pol.oid, 'pg_policy')
from pg_policy pol join pg_class c on c.oid = pol.polrelid
where c.relname = 'chat_messages' and pol.polname = 'chat_messages_insert_members';
-- → with_check가 9.2의 원문 그대로 복원됨, comment는 null(미적용 상태로 복귀)
```

`chat_messages`에 `client_key like 'i063-ddltest%'` 잔여 0건도 재확인했다 — DB에 흔적 없음.

**남은 것**: 팀장의 "CREW 적용 완료" 신호 대기 → `apply_migration`으로 §9.3의 SQL(§9.1의
이유로 `ALTER POLICY` 그대로) 적용 → `list_migrations`로 실제 version 확인 → §9.3 파일을
`supabase/migrations/<version>_chat_messages_insert_type_gate_i063.sql`로 이동 →
§9.4 회귀 검증을 실 DB에 재실행(이번엔 롤백 없이 관찰만, 또는 여전히 `begin...rollback`으로
안전하게) → 결과를 이 문서에 다시 append.
