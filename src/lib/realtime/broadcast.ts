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

import type { SubscribeToRoom, Unsubscribe } from "./types";

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

const TERMINAL_STATUSES = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);

/** `SubscribeToRoom` 계약의 실데이터 구현. `index.ts`가 이 값을 `subscribeToRoom`으로 노출한다.
 *  전송 계층이라 payload 내용을 해석하지 않는다(`types.ts` 참고) — `occurredAt`은 이 클라이언트가
 *  이벤트를 수신한 시각이다(도메인 생성 시각이 필요하면 payload 안의 필드를 소비자가 읽는다). */
export const subscribeToRoomViaBroadcast: SubscribeToRoom = (roomId, onEvent, onError) => {
  const supabase = getClient();
  let closed = false;
  let channel: ReturnType<BroadcastClient["channel"]> | null = null;

  void (async () => {
    if (authReady) await authReady;
    if (closed) return;

    channel = supabase.channel(roomId, { config: { private: true } });
    channel.on("broadcast", { event: "*" }, (message) => {
      if (closed) return;
      onEvent({
        type: message.event,
        roomId,
        payload: message.payload,
        occurredAt: new Date().toISOString(),
      });
    });
    channel.subscribe((status, err) => {
      if (closed) return;
      if (TERMINAL_STATUSES.has(status)) {
        onError?.({
          roomId,
          message: `Realtime 구독 실패(${status}) — 인가 거부(RLS)이거나 네트워크 문제일 수 있다.`,
          cause: err,
        });
      }
    });
  })();

  const unsubscribe: Unsubscribe = () => {
    if (closed) return;
    closed = true;
    if (channel) void supabase.removeChannel(channel);
  };
  return unsubscribe;
};
