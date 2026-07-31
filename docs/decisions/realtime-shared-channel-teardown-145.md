# 공유 Realtime 채널이 참조 카운트 없이 통째로 teardown되는 결함 — 조사·재현·수정 (I-145)

- **일자**: 2026-07-30(31일차) / **담당**: CORE(수정) — **발견**: BOARD(I-082 조사 중)
- **관련**: D-030 ②(구독 인터페이스), D-023(Broadcast 채택), I-082(로그인 직후 알림 구독
  1회 실패 — 이 건과 인과 여부는 별도 판단, 아래 "I-082와의 관계" 참고)

---

## 0. 배정 경위

BOARD가 I-082(로그인 직후 알림 구독 1회 오류)를 추적하다 설치된 `@supabase/realtime-js`
소스를 읽고 두 가지를 보고했다 — ① `client.channel(topic)`은 같은 topic이면 기존 채널을
재사용한다, ② 이미 join된 채널에 두 번째 `subscribe()`를 부르면 상태 콜백이 조용히
무시된다. 그 과정에서 **참조 카운트 없는 `removeChannel`이 공유 채널을 통째로 죽일 수 있다**는
구조적 위험을 발견했고, 팀장이 `broadcast.ts:144`의 무조건 `removeChannel` 호출과 알림
토픽의 실제 소비자가 3곳(`NotificationBellContainer`·`ToastHostContainer`·
`NotificationCenterListContainer`)임을 코드로 확인해 CORE(실시간 구독 인터페이스 소유자)에게
넘겼다. **아래는 그 보고를 그대로 받지 않고 벤더 소스·앱 코드 양쪽을 직접 재현한 결과다.**

---

## 1. 벤더 소스 재현 (`node_modules/@supabase/realtime-js` 2.110.8, `node_modules/@supabase/phoenix`)

### 1.1 `channel()` topic 중복 처리 — BOARD 주장 ① 확인

`RealtimeClient.js:329`:

```js
channel(topic, params = { config: {} }) {
    const realtimeTopic = `realtime:${topic}`;
    const exists = this.getChannels().find((c) => c.topic === realtimeTopic);
    if (!exists) { /* 새로 만들고 push */ }
    else { return exists; }  // 같은 topic이면 기존 인스턴스 반환
}
```

공식 JSDoc도 "If a channel with the same topic already exists it will be returned instead of
creating a duplicate connection"이라고 명시한다. **① 확인.**

### 1.2 `subscribe()` 재호출 시 상태 콜백 — BOARD 주장 ②를 더 정밀하게 확인

`RealtimeChannel.js:135` `subscribe(callback, timeout)`의 본문 전체(조인 핸드셰이크 시작 +
`this._onError(...)`·`this._onClose(...)` 등록)가 `if (this.channelAdapter.isClosed()) { ... }`
블록 **안에만** 있다. 채널이 이미 joining/joined 상태(= `closed`가 아님)일 때 `.subscribe()`를
다시 부르면 **이 블록 전체를 건너뛴다** — `callback`(상태 콜백)이 등록조차 안 될 뿐 아니라,
**그 소비자의 `_onError`/`_onClose` 훅도 영구히 등록되지 않는다**(나중에 채널이 죽어도 그
소비자는 알 방법이 없다). BOARD의 "조용히 무시된다"는 정확했다 — 다만 정확히는 "이번 호출의
콜백만 무시"가 아니라 "이 소비자는 그 채널의 생애주기 동안 상태 변화를 영원히 못 받는다"에
가깝다.

### 1.3 `.on()` 바인딩은 누적되는가 — 배정이 갈라 달라던 지점

`RealtimeChannel.js:413` `on(type, filter, callback)`:

```js
on(type, filter, callback) {
    const stateCheck = this.channelAdapter.isJoined() || this.channelAdapter.isJoining();
    const typeCheck = type === PRESENCE || type === POSTGRES_CHANGES;
    if (stateCheck && typeCheck) throw new Error(`cannot add \`${type}\` callbacks ... after \`subscribe()\`.`);
    return this._on(type, filter, callback);
}
```

**`typeCheck`는 `presence`·`postgres_changes`에만 해당한다 — `broadcast`는 이 가드에
걸리지 않는다.** 우리 앱은 전부 `channel.on("broadcast", { event: "*" }, ...)`를 쓰므로
(`broadcast.ts` 원본), 채널이 이미 join된 뒤에도 `.on()`을 부르면 정상적으로
`this.bindings['broadcast']`에 **누적**된다(벤더 Phoenix `Channel._on`/`on`이 배열에 `push`).
**즉 채널이 살아 있는 동안은 3개 소비자 전원이 각자의 이벤트 콜백을 정상 수신한다** — 이 부분은
BOARD의 우려("바인딩이 안 쌓여 애초에 첫 소비자만 받는다")가 **성립하지 않는다.**

### 1.4 진짜 방아쇠 — `teardown()`이 채널의 모든 바인딩을 통째로 비운다

`RealtimeClient.js:256` `removeChannel(channel)`:

```js
async removeChannel(channel) {
    const status = await channel.unsubscribe();
    if (status === 'ok') { channel.teardown(); }
    return status;
}
```

참조 카운트 없이 무조건 실행된다. `node_modules/@supabase/phoenix/assets/js/phoenix/
channel.js`의 벤더 Phoenix `Channel.teardown()`:

```js
teardown(){
    this.pushBuffer.forEach((push) => push.destroy())
    this.pushBuffer = []
    this.rejoinTimer.reset()
    this.joinPush.destroy()
    this.state = CHANNEL_STATES.closed
    this.bindings = []   // ← 이 채널의 모든 이벤트 바인딩을 통째로 비운다
}
```

**`this.bindings = []`가 결정적이다.** 1.3에서 확인한 대로 3개 소비자의 `broadcast` 콜백이
전부 이 하나의 배열에 쌓여 있으므로, **소비자 중 아무나 한 명이 unmount → `removeChannel` →
`teardown()`을 트리거하면 나머지가 계속 마운트돼 있어도 그들의 콜백까지 전부 사라진다.**
게다가 `RealtimeChannel`(공개 API)은 `off(event, ref)`를 노출하지 않는다 — `channelAdapter.off`는
내부 전용이라(`grep`으로 `RealtimeChannel.js`에 공개 `off` 메서드 없음을 확인), 소비자
1명분의 바인딩만 선택적으로 제거하는 것은 벤더 공개 API로는 애초에 불가능하다.

**결론(벤더 동작 3줄 요약)**: ① 같은 topic → 같은 채널 공유. ② 이벤트 바인딩(`broadcast`
타입)은 정상적으로 누적되고 채널이 살아 있는 한 전원이 받는다. ③ 그런데 `removeChannel`은
참조 카운트가 없어 **누구든 한 명이 부르면 채널 전체(=다른 전원의 바인딩까지)가 죽는다.**
이것이 진짜 결함의 위치다 — BOARD가 지목한 "②"는 부수 증상(late subscriber가 상태 변화를
못 받는다는 별개의 작은 gap)이고, 진짜 결정타는 teardown의 무차별 바인딩 초기화다.

---

## 2. 앱 코드 재현 — 어디서 실제로 트리거되는가

### 2.1 알림 토픽 — 확정, 상시 재현 가능

`user:{profileId}:notifications` topic의 실제 `subscribeToRoom` 호출부 3곳을 직접 확인했다:

| 컨테이너 | 경유 | 마운트 위치 |
| --- | --- | --- |
| `NotificationBellContainer` | `use-notification-feed.ts` → `subscribeToNotifications` | `(shell)/layout.tsx` → `AppShell` → `HeaderNav`(상시) |
| `ToastHostContainer` | 직접 `subscribeToNotifications` | `(shell)/layout.tsx`(상시) |
| `NotificationCenterListContainer` | `use-notification-feed.ts` → `subscribeToNotifications` | `/notifications` 페이지(그 라우트에서만) |

벨·토스트는 인증된 사용자가 `(shell)` 아래 **어느 페이지에 있든 항상 함께** 마운트된다 —
**이 둘만으로도 이미 상시 2-소비자 공유 채널**이다. 세 번째(`NotificationCenterListContainer`)는
`/notifications`를 열 때만 추가되고, **그 페이지를 벗어나면 그 컴포넌트만 독립적으로
언마운트된다.** 언마운트 시 `unsubscribe()` → (수정 전 코드) 무조건 `removeChannel` →
`teardown()` → `bindings=[]` — **벨·토스트는 여전히 마운트돼 있는데 실시간 알림 수신이
조용히 끊긴다.** 전체 새로고침 전까지 복구되지 않는다(벨·토스트는 이미 자기 `subscribe()`를
끝냈고 재시도 로직이 없다 — `channel.subscribe()`를 다시 부르는 코드 경로 자체가 없다).

**트리거 조건**: 로그인 상태에서 `/notifications`를 한 번이라도 열었다가 다른 페이지로
이동한다. 일반적인 사용 흐름(벨 클릭 → 알림 센터 열람 → 다른 화면으로 복귀)에서 자연스럽게
발생한다 — 드문 경로가 아니다.

### 2.2 채팅 토픽 — 재현 불가, 시나리오 불성립

`getCrewChatTopic(crewId)`를 `subscribeToRoom`에 넘기는 곳은 `MessageRoomContainer.tsx`
**한 곳뿐**이고, 그 컴포넌트를 실제로 렌더하는 곳도 `MessageListContainer.tsx`
**한 곳뿐**이다(`grep -rln "<MessageRoomContainer"` 결과 1개 파일). 같은 채팅방을 두 컴포넌트가
동시에 구독하는 경로가 앱 코드에 없다 — **이 topic에서는 현재 이 결함이 트리거되지 않는다.**

### 2.3 투표 토픽 — 재현 불가, 시나리오 불성립

`getCrewPollsTopic(crewId)`(크루 단위 topic, poll별이 아니다)는 `PollLiveContainer.tsx`가
구독하고, 그 컴포넌트를 렌더하는 곳은 `PollPanelContainer.tsx` → `board/[postId]/page.tsx`
**한 경로뿐**이다. `MeetupDetailContainer.tsx`도 `PollPanelContainer`를 언급하지만 실제로
렌더하지 않는다(주석 인용만, `grep`으로 확인). 한 페이지에 한 poll만 뜨므로 **같은 크루의
poll topic을 두 컴포넌트가 동시에 구독하는 경로도 없다.**

**요약**: 이번에 확정된 실사용 트리거는 **알림 topic 하나뿐**이다. 다만 수정(§3)은 topic을
가리지 않는 일반 해법이라 채팅·투표에 향후 같은 패턴(예: 같은 채팅방을 미리보기 위젯 + 전체
패널이 동시에 구독)이 생겨도 자동으로 방어된다.

---

## 3. 수정

`src/lib/realtime/broadcast.ts`의 `subscribeToRoomViaBroadcast`를 **topic당 참조 카운트
공유**로 재작성했다:

- `rooms: Map<roomId, { channel, listeners: Set<{onEvent, onError}> }>` 모듈 스코프 맵을 둔다.
- 같은 topic에 대해 벤더 `channel.on()`·`channel.subscribe()`는 **정확히 한 번만** 부른다 —
  이벤트·오류 수신 시 그 topic의 `listeners` 전원에게 이 파일이 직접 팬아웃한다(1.4가 밝힌
  대로 벤더가 개별 소비자의 바인딩만 선택 제거하는 공개 API를 안 주므로, 애초에 벤더 바인딩을
  소비자 수만큼 만들지 않는 쪽을 택했다).
- `unsubscribe()`는 자신의 리스너만 집합에서 빼고, **그 topic의 리스너가 0개가 될 때만**
  `removeChannel`을 부른다 — 이게 참조 카운트다.
- `subscribeToRoom(id, onEvent): Unsubscribe` 계약(D-030 ②)은 **바뀌지 않는다** — 다중화는
  이 파일 안에서만 일어나고 소비자(컨테이너) 코드는 한 줄도 안 고쳤다.

**부수 효과(개선)**: 1.2가 밝힌 "late subscriber가 상태 변화를 못 받는다" gap도 이 리팩터로
함께 해소된다 — 이제 벤더 `.subscribe()`를 topic당 한 번만 부르고 그 콜백이 전체 리스너에게
팬아웃되므로, 몇 번째로 구독했든 상관없이 동일한 오류 통지를 받는다.

**검증**: `npx tsc --noEmit`(0 errors) · `npm run lint`(0 errors, 무관한 사전 경고 1건 —
`decide-join-request.ts`의 미사용 import, 이 수정과 무관) · `npm test`(6 files, 41 tests
pass). 브라우저 실측은 이번 회차 운영 규칙(dev 서버 정지 중, 팀장 전용)상 하지 않았다 —
정적 분석과 벤더 소스 재현으로 여기까지 확인했다.

---

## 4. 남은 리스크 — 정직하게 남긴다

**같은 topic의 "마지막 구독자가 언마운트 → 즉시 재마운트"가 겹치는 좁은 창.** `unsubscribe()`가
리스너 0개가 되는 순간 `rooms.delete(roomId)`를 **동기적으로** 하고 `removeChannel`은 `void`로
비동기 실행한다. 그 사이(벤더의 `leave` 핸드셰이크가 끝나 `_remove()`가 클라이언트의
`channels[]`에서 실제로 빠지기 전) 같은 topic의 새 구독자가 도착하면, 벤더 `channel()`이
아직 목록에 남아 있는 **곧 teardown될 그 채널 인스턴스를 다시 돌려줄 가능성**이 있다 — 새
구독자의 바인딩이 직후 `teardown()`으로 함께 지워질 수 있다. **이건 이번에 만든 회귀가
아니다** — 수정 전 코드에도 이미 있던, 벤더의 topic-재사용과 teardown 타이밍이 만드는 별개의
좁은 레이스다. 이번 배정의 확정 시나리오(알림 3-소비자 공유, §2.1)는 이걸로 발생하지 않는다
— "언마운트 후 즉시 재구독"은 그 시나리오와 다른 조건이라 별도로 남긴다. 다음에 이 파일을
다시 손댈 때(예: `pendingRemoval` 프라미스를 topic별로 추적) 참고하도록 여기 적어 둔다.

## 5. I-082와의 관계

I-082(로그인 직후 알림 구독 1회 실패)가 이 결함과 인과가 닿는지는 **이 문서의 판단 대상이
아니다** — 팀장이 BOARD에게 별도로 배정했다. 다만 참고할 사실 하나: I-082는 "최초 구독"
시점의 실패이고, 이 문서가 고친 것은 "이미 성공한 공유 구독이 다른 소비자의 언마운트로
나중에 끊기는" 경로다 — 시점(최초 vs 이후)이 달라 같은 근본 원인일 가능성은 낮아 보이지만,
BOARD가 직접 판단할 사안이라 단정하지 않는다.
