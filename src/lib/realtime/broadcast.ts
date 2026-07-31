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
 *  부담을 주지 않는다). **주기적** 갱신(아래 `setInterval`)에서 `refreshAuth`가 `token ===
 *  null`이면 즉시 반환하고 재시도하지 않는다 — 다만 이 판단은 "세션이 아예 없다(비로그인)라서
 *  재시도가 무의미하다"는 **가정**이지 확인된 사실은 아니다. `getRealtimeAuthTokenAction`
 *  (`get-realtime-auth-token.ts`)이 `if (error || !data.session) return null;`로 "세션 없음"과
 *  "세션 조회 자체의 일시적 에러"를 구분 없이 같은 `null`로 합치기 때문에, `refreshAuth`는 이
 *  둘을 가를 방법이 없다 — 후자라면 이 즉시-반환이 오판일 수 있다(33일차 CORE 발견, 별도 이슈
 *  등재 예정 — `docs/ISSUES.draft.CORE.md`, 이번 I-082 수정보다 범위가 넓어 이 회차에서는
 *  손대지 않는다). **다만 최초 초기화(`getClient()`가 처음 이 모듈을 세우는 시점)는 다르다** — I-082
 *  (33일차 BOARD 강제 재현, `docs/ISSUES.md` 참고): 로그인 리다이렉트 직후 이 모듈이 그 세션
 *  최초로 초기화되는 순간에는 세션 쿠키가 브라우저에 아직 완전히 전파되지 않아 `getSession()`이
 *  일시적으로 `null`을 돌려주는 경합이 있을 수 있다(같은 값이 진짜 "비로그인"인지 "쿠키
 *  전파 중"인지 이 시점만으로는 구분할 수 없다) — 그런데 `getClient()`를 부르는 컨테이너는
 *  서버가 이미 인증을 확인한 뒤에만 렌더되므로, **이 최초 호출에서의 `null`은 거의 항상 후자
 *  (경합)다. 아래 `refreshAuth`의 `retryOnNull` 옵션이 이 최초 호출에서만 참이 된다.
 *
 *  **33일차 팀장 교차검증 — 이 재시도 스케줄을 그대로 재사용했다가 회귀였다, 되돌렸다.**
 *  최초 시도에서 `retryOnNull`이 이 5초·30초·2분 스케줄을 그대로 썼더니, 토큰이 계속
 *  `null`이면(진짜 비로그인은 아니지만 예를 들어 세션이 하이드레이션 사이에 만료되는 등) 최악
 *  **155초** 동안 `authReady`(아래 `getClient()`가 채널을 열기 전에 기다리는 promise)가
 *  resolve되지 않아 벨·토스트·채팅·투표 등 이 모듈을 쓰는 실시간 구독 전체가 막혔다 — 이
 *  스케줄의 시간 축(분 단위, 네트워크 장애 복구용)과 쿠키 전파 경합의 시간 축(ms~수백 ms)이
 *  다른데도 그대로 재사용한 것이 원인이었다. 그래서 `retryOnNull` 전용의 **짧은** 스케줄
 *  (`INITIAL_NULL_RETRY_DELAYS_MS`)을 따로 둔다 — 재사용 원칙보다 시간 축 정합성이 우선이라고
 *  판단했다. 주기적 갱신 쪽은 **`token === null`인 경우에 한해** 기존 동작(이 스케줄, 재시도
 *  없이 즉시 반환) 그대로다 — **`setAuth` 자체가 던지는 경우는 이 분기와 무관하게(기존부터,
 *  `retryOnNull` 값과 상관없이) 아래 `catch`를 거쳐 재시도된다**(33일차 CORE 정적 리뷰 발견,
 *  BOARD 신설 경로 아님). 즉 "주기적 갱신은 재시도가 아예 없다"가 아니라 "`token===null`일
 *  때만 재시도가 없다"가 정확한 서술이다. */
const AUTH_REFRESH_RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

/** `retryOnNull` 전용 재시도 간격 — 위 `AUTH_REFRESH_RETRY_DELAYS_MS`와 성격이 다르다(로그인
 *  직후 세션 쿠키 전파 경합, I-082는 ms~수백 ms 규모지 분 단위가 아니다). 합계 1.35초로
 *  `authReady`를 기다리는 구독의 최악 블로킹 시간에 상한을 둔다 — 정상 경로(경합 없음)는
 *  첫 시도에서 즉시 성공하므로 지연이 늘지 않는다.
 *
 *  **이 값(150·400·800ms) 자체는 임의값이다 — 실제 쿠키 전파 시간을 측정해서 정한 것이
 *  아니다.** 33일차 강제 재현(`docs/ISSUES.md` I-082)이 확인한 것은 "이 스케줄로 재시도하면
 *  강제 null 조건에서 ~1.5초 만에 정상 경로로 복귀한다"는 인위적 조건의 결과일 뿐, 자연
 *  발생하는 쿠키 전파 지연이 실제로 몇 ms인지는 여전히 간접 검증이다(같은 이슈의 "남은
 *  리스크" 절 참고). **다만 이 임의성이 위험하지 않은 이유는 상한이 1.35초로 낮기 때문이다**
 *  — 값을 더 정확히 맞추지 못해도(실제 경합이 이 스케줄보다 오래 걸려 재시도가 전부
 *  소진되더라도) 손실은 "그 세션에서 실시간 인가가 늦게 걸린다" 정도이지 155초 회귀 같은
 *  큰 대가가 아니다. 실제 자연 경합의 시간 규모를 알게 되면 이 값을 조정할 여지가 있다.
 *
 *  **34일차(I-161 후속) — 겨냥한 시간 규모를 한 줄로 확정한다.** 이 값들은 "로그인 직후 세션
 *  쿠키 전파 경합" 하나만을 겨냥하며 그 규모는 ms~수백 ms다(분 단위인
 *  `AUTH_REFRESH_RETRY_DELAYS_MS`와 시간 축이 다른 이유가 바로 이것이다). 근거는 위 강제
 *  재현의 2차 수정 재시도 실측 간격 188ms·453ms·838ms(총 ~1.5초, `docs/ISSUES.md` I-082
 *  33일차 "팀장 교차검증" 절)다 — **이 1.5초는 이 스케줄 자체가 소진되는 시간이지 자연
 *  쿠키 전파 지연의 실측값이 아니다**, 위 문단이 이미 말한 그대로다. 이 구분을 `docs/ISSUES.md`
 *  I-161 "남은 것"과 지금부터 같은 사실·같은 어조로 유지한다(CORE가 지적한 어조 불일치는
 *  이 갱신으로 해소했다고 34일차에 다시 확인했다). */
const INITIAL_NULL_RETRY_DELAYS_MS = [150, 400, 800];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshAuth(supabase: BroadcastClient, options: { retryOnNull?: boolean } = {}): Promise<void> {
  const { retryOnNull = false } = options;
  const delays = retryOnNull ? INITIAL_NULL_RETRY_DELAYS_MS : AUTH_REFRESH_RETRY_DELAYS_MS;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const isLastAttempt = attempt === delays.length;
    try {
      const token = await getRealtimeAuthTokenAction();
      if (token) {
        await supabase.realtime.setAuth(token);
        return; // 성공.
      }
      if (!retryOnNull) return; // 주기적 갱신: 세션 없음, 재시도 무의미(기존 동작 유지).
      // 최초 초기화의 null — I-082 경합 후보. 마지막 시도가 아니면 짧은 스케줄로 재시도한다.
      if (isLastAttempt) {
        console.error(
          "[realtime] 로그인 직후 세션 토큰이 재시도 끝까지 확보되지 않았다(I-082) — 구독이 인가 없이 진행될 수 있다",
        );
        return;
      }
    } catch (err) {
      if (isLastAttempt) {
        console.error(
          "[realtime] auth 토큰 갱신 재시도 소진 — 다음 정기 주기까지 구독이 만료된 토큰으로 남을 수 있다",
          err instanceof Error ? err.message : String(err),
        );
        return;
      }
    }
    await wait(delays[attempt]);
  }
}

function getClient(): BroadcastClient {
  if (client) return client;
  client = createSupabaseBrowserClient();
  const activeClient = client;

  // 첫 채널을 구독하기 전에 setAuth가 반드시 끝나 있어야 한다 — 19일차 실측(E2E 스크립트)에서
  // setAuth 완료 전에 구독하면 CHANNEL_ERROR가 나는 경쟁을 직접 재현해 확인했다. 아래
  // `subscribeToRoomViaBroadcast`는 채널을 열기 전에 이 promise를 기다린다. `retryOnNull: true`는
  // I-082 대응(위 `AUTH_REFRESH_RETRY_DELAYS_MS` docstring 참고) — 이 최초 호출에서만 켠다.
  // **이 재시도 보호는 모듈이 세션당 처음 초기화되는 이 한 번에만 적용된다** — `client`가 이미
  // 있으면(즉 이 함수가 다시 호출돼도) 아래 `if (client) return client;`로 여기까지 오지 않으므로
  // 이후 새로 마운트되는 소비자는 이미 resolve된 `authReady`를 그냥 통과한다(33일차 CORE 정적
  // 리뷰 발견 — 기존 구조이며 이번 수정이 만든 것은 아니지만, `retryOnNull`이 최초 호출을
  // "보호받는 특별 경로"로 만들면서 이 비대칭이 이전보다 눈에 띈다).
  authReady = refreshAuth(activeClient, { retryOnNull: true });
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
