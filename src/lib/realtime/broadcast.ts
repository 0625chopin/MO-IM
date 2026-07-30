/**
 * Supabase Realtime Broadcast 구현 — Task 008 스텁 → Task 033 실연결 (D-023, R-011).
 *
 * D-023이 Postgres Changes가 아니라 Broadcast를 택한 이유(단일 스레드 인가
 * 검사 병목 없음, 25만 동시 사용자/초당 80만 메시지 벤치마크)는
 * `docs/prioritization-and-risks.md` D-023 참고. 구독은 방(room)별이 아니라
 * **사용자당 1연결로 다중화**한다(연결당 채널 100 한도, D-023) — 아래 `getClient()`가
 * 모듈 스코프 싱글턴 하나만 만들고, 여러 `subscribeToRoom` 호출은 그 위에 채널만 새로
 * 여는 것으로 이 제약을 지킨다.
 *
 * **31일차(CORE) — 같은 topic에 대한 채널을 참조 카운트로 공유한다(I-145).** `@supabase/
 * realtime-js`(`node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js`
 * `channel()`)는 같은 topic 문자열로 `channel()`을 두 번 부르면 **새로 만들지 않고 기존
 * 인스턴스를 그대로 반환**한다 — 알림처럼 `NotificationBellContainer`·`ToastHostContainer`·
 * `NotificationCenterListContainer` 세 컨테이너가 같은 topic(`user:{id}:notifications`)을
 * 독립적으로 구독하면 셋이 **같은 채널 객체**를 공유하게 된다. 그런데 벤더 `removeChannel`은
 * 참조 카운트가 없어 `channel.unsubscribe()` → `channel.teardown()`을 그대로 실행하고,
 * 벤더 Phoenix `Channel.teardown()`(`node_modules/@supabase/phoenix/assets/js/phoenix/
 * channel.js`)은 `this.bindings = []`로 **그 채널의 모든 이벤트 바인딩을 통째로 비운다** —
 * 셋 중 하나만 언마운트해도(예: `/notifications`를 열었다 나가면) 나머지 둘이 여전히
 * 마운트돼 있는데도 공유 채널이 죽어 실시간 알림이 조용히 끊긴다. 아래 `rooms` 맵이 topic당
 * 리스너 집합과 참조 카운트를 들고 있다가 **마지막 구독자가 나갈 때만** `removeChannel`을
 * 부르는 것으로 해소한다. `subscribeToRoom(id, onEvent): Unsubscribe` 계약(D-030 ②)은
 * 바뀌지 않는다 — 다중화는 이 파일 안에서만 일어난다. 조사 경위·벤더 소스 재현 로그는
 * `docs/decisions/realtime-shared-channel-teardown-145.md` 참고.
 *
 * **토픽 = roomId다.** 이 파일은 전송 계층이라 "crew:{id}:chat" 같은 토픽 문자열을 만들지
 * 않는다(029B §6.1의 명명 규칙) — 호출자(컨테이너)가 `roomId` 인자에 이미 올바른 토픽
 * 문자열을 넣어서 호출해야 `realtime.messages`의 Authorization 정책(RLS)이 매치된다.
 * `MessageRoomContainer`·`notification-channel.ts`·`PollLiveContainer`가 각자 토픽
 * 빌더(`getCrewChatTopic`류)로 이 문자열을 만든다.
 *
 * **httpOnly 세션과의 충돌, 그리고 해소(Task 033 실측으로 드러난 gap)**: 이 앱의 세션은
 * httpOnly 쿠키에 있어(NFR-010, Task 030) 브라우저 Supabase 클라이언트가 `document.cookie`로
 * 읽을 수 없다 — `auth.getSession()`이 항상 빈 세션을 반환한다. Realtime Authorization은
 * 클라이언트가 JWT를 직접 쥐고 `setAuth()`를 불러야 하므로, 서버(쿠키를 읽을 수 있는 쪽)가
 * `getRealtimeAuthTokenAction()`(Server Action, `./get-realtime-auth-token.ts`)으로 토큰만
 * 최소 범위로 건네준다. 자세한 판단 근거는 그 파일 docstring과
 * `docs/decisions/realtime-broadcast-033.md` §3(D-045).
 */

import { createSupabaseBrowserClient } from "@/lib/data/supabase/client";
import { getRealtimeAuthTokenAction } from "@/lib/realtime/get-realtime-auth-token";

import type { RealtimeErrorHandler, RealtimeEventHandler, SubscribeToRoom, Unsubscribe } from "./types";

type BroadcastClient = ReturnType<typeof createSupabaseBrowserClient>;

let client: BroadcastClient | null = null;
let authReady: Promise<void> | null = null;

/** 세션 만료(대시보드 기본값 1시간으로 추정 — 이 프로젝트가 커스텀했는지는 미확인, 아래 참고)에
 *  대비해 주기적으로 Realtime auth 토큰을 갱신한다(NFR-008 재연결 전제 — 만료된 토큰으로는
 *  재구독이 전부 거부된다). 브라우저 탭이 오래 열려 있는 채팅·알림 세션을 고려한 값이다. */
const AUTH_REFRESH_INTERVAL_MS = 20 * 60 * 1000;

/** `refreshAuth`가 실패(네트워크 오류 등)했을 때의 재시도 간격 — 19일차 CORE 교차검증 후속.
 *  20분 주기 하나에만 기대면 **연속 2회(약 40분+) 실패 시 토큰이 실제로 만료돼 구독이 조용히
 *  죽는다**(§8-후속② 참고, `docs/decisions/realtime-broadcast-033.md`). 5초·30초·2분 세 번
 *  짧게 재시도해 이 창을 좁힌다 — 새 의존성 없이 몇 줄로 되는 저비용 방어라 넣었다. 세 번 다
 *  실패하면 다음 정기 주기(`AUTH_REFRESH_INTERVAL_MS`)까지 기다린다(무한 재시도로 서버에
 *  부담을 주지 않는다). "세션이 아예 없다"(비로그인)는 재시도 대상이 아니다 — 아래
 *  `refreshAuth`가 `token === null`이면 즉시 반환하고 재시도하지 않는다. */
const AUTH_REFRESH_RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshAuth(supabase: BroadcastClient): Promise<void> {
  for (let attempt = 0; attempt <= AUTH_REFRESH_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const token = await getRealtimeAuthTokenAction();
      if (token) await supabase.realtime.setAuth(token);
      return; // 성공(토큰 있음) 또는 세션 없음(token===null, 재시도 무의미) 둘 다 여기서 끝난다.
    } catch (err) {
      const isLastAttempt = attempt === AUTH_REFRESH_RETRY_DELAYS_MS.length;
      if (isLastAttempt) {
        console.error(
          "[realtime] auth 토큰 갱신 재시도 소진 — 다음 정기 주기까지 구독이 만료된 토큰으로 남을 수 있다",
          err instanceof Error ? err.message : String(err),
        );
        return;
      }
      await wait(AUTH_REFRESH_RETRY_DELAYS_MS[attempt]);
    }
  }
}

function getClient(): BroadcastClient {
  if (client) return client;
  client = createSupabaseBrowserClient();
  const activeClient = client;

  // 첫 채널을 구독하기 전에 setAuth가 반드시 끝나 있어야 한다 — 19일차 실측(E2E 스크립트)에서
  // setAuth 완료 전에 구독하면 CHANNEL_ERROR가 나는 경쟁을 직접 재현해 확인했다. 아래
  // `subscribeToRoomViaBroadcast`는 채널을 열기 전에 이 promise를 기다린다.
  authReady = refreshAuth(activeClient);
  setInterval(() => void refreshAuth(activeClient), AUTH_REFRESH_INTERVAL_MS);

  return client;
}

/**
 * `onError`로 올려보낼 상태. **`CLOSED`는 여기 없다 — 오류가 아니라 정상 종료 신호다.**
 *
 * 원래는 셋 다 들어 있었는데, 그 때문에 **로그아웃할 때마다 콘솔에 구독 실패가 찍혔다**(21일차
 * 실측). 흐름은 이렇다: `logoutAction`이 서버 세션을 폐기하면 그 JWT로 인가받은 채널이 닫히고,
 * 리다이렉트로 알림 벨이 언마운트되며 `unsubscribe()`가 `removeChannel`을 부른다 — 양쪽 모두
 * `CLOSED`를 발화하는데 그게 "인가 거부(RLS)이거나 네트워크 문제"라는 문구로 보고돼, 정상적인
 * 정리 과정이 장애처럼 보였다(Next.js dev 오버레이에도 이슈 배지가 떴다). 로그아웃 UI가 실제로
 * 노출된 적이 없어(그 버튼은 `HeaderNav`의 `md:` 계정 내비 안에만 있었고 430px 프레임에서는
 * 켜지지 않았다) 지금까지 드러나지 않았던 경로다.
 *
 * Supabase 공식 문서도 `subscribe()` 콜백에서 **`CHANNEL_ERROR`·`TIMED_OUT` 둘만** 오류로
 * 다루는 예제를 싣고 있고, 채널 상태 설명에서 `CLOSED`를 "Channel is closed"로만 정의한다
 * (`CHANNEL_ERROR`는 클라이언트가 자동 재시도한다). 인가 거부는 `CLOSED`가 아니라
 * `CHANNEL_ERROR`로 오므로 이 변경으로 놓치는 실패는 없다 — `/sample`의 Realtime 인가 거부
 * 데모(`RealtimeAuthErrorDemoContainer`)가 그 경로를 계속 보여준다.
 */
const TERMINAL_STATUSES = new Set(["CHANNEL_ERROR", "TIMED_OUT"]);

interface RoomListener {
  onEvent: RealtimeEventHandler;
  onError?: RealtimeErrorHandler;
}

interface RoomEntry {
  channel: ReturnType<BroadcastClient["channel"]>;
  listeners: Set<RoomListener>;
}

/** topic(roomId) → 공유 채널 항목. 같은 topic을 구독하는 소비자가 여럿이면(예: 알림의
 *  벨·토스트·목록 3곳) 벤더 `supabase.channel()`이 어차피 같은 채널 인스턴스를 반환하므로
 *  (I-145 상단 docstring 참고), 여기서도 하나만 만들고 리스너만 늘린다 — `removeChannel`은
 *  이 맵의 리스너가 0개가 될 때만 부른다(참조 카운트). */
const rooms = new Map<string, RoomEntry>();

/** `SubscribeToRoom` 계약의 실데이터 구현. `index.ts`가 이 값을 `subscribeToRoom`으로 노출한다.
 *  전송 계층이라 payload 내용을 해석하지 않는다(`types.ts` 참고) — `occurredAt`은 이 클라이언트가
 *  이벤트를 수신한 시각이다(도메인 생성 시각이 필요하면 payload 안의 필드를 소비자가 읽는다).
 *
 *  **I-145 해소 — topic당 채널·바인딩을 한 번만 만들고 리스너 집합으로 팬아웃한다.** 벤더
 *  `RealtimeChannel.subscribe()`는 채널이 이미 열려 있으면(`closed`가 아니면) 본문 전체를
 *  건너뛴다 — 즉 두 번째 소비자가 `.subscribe(callback)`을 불러도 그 `callback`(상태 콜백,
 *  여기서는 `onError` 발화용)은 **등록조차 되지 않는다**(재현: `RealtimeChannel.js`의
 *  `if (this.channelAdapter.isClosed()) { ... }` 가드, 문서 참고). 그래서 벤더의 `.subscribe()`·
 *  `.on()`은 topic당 **정확히 한 번만** 부르고, 그 안에서 수신한 이벤트·오류를 이 맵의
 *  `listeners` 전원에게 우리가 직접 팬아웃한다 — 개별 소비자가 각자 `.on()`을 부르지 않으므로
 *  벤더가 공개하지 않는 `channel.off(event, ref)`(내부 전용, `RealtimeChannel`이 노출하지
 *  않는다)에 의존할 필요도 없어진다. */
export const subscribeToRoomViaBroadcast: SubscribeToRoom = (roomId, onEvent, onError) => {
  const supabase = getClient();
  let closed = false;
  const listener: RoomListener = { onEvent, onError };

  void (async () => {
    if (authReady) await authReady;
    if (closed) return;

    let entry = rooms.get(roomId);
    if (!entry) {
      const channel = supabase.channel(roomId, { config: { private: true } });
      entry = { channel, listeners: new Set() };
      rooms.set(roomId, entry);

      channel.on("broadcast", { event: "*" }, (message) => {
        const current = rooms.get(roomId);
        if (!current) return;
        const event = {
          type: message.event,
          roomId,
          payload: message.payload,
          occurredAt: new Date().toISOString(),
        };
        for (const l of current.listeners) l.onEvent(event);
      });
      channel.subscribe((status, err) => {
        if (!TERMINAL_STATUSES.has(status)) return;
        const current = rooms.get(roomId);
        if (!current) return;
        const error = {
          roomId,
          message: `Realtime 구독 실패(${status}) — 인가 거부(RLS)이거나 네트워크 문제일 수 있다.`,
          cause: err,
        };
        for (const l of current.listeners) l.onError?.(error);
      });
    }

    entry.listeners.add(listener);
  })();

  const unsubscribe: Unsubscribe = () => {
    if (closed) return;
    closed = true;
    const entry = rooms.get(roomId);
    if (!entry) return;
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      rooms.delete(roomId);
      void supabase.removeChannel(entry.channel);
    }
  };
  return unsubscribe;
};
