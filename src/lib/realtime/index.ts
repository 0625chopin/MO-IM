/**
 * 유일한 진입점(배럴) — Task 008 (D-030 ②). 소비자(컨테이너 컴포넌트)는 항상
 * `@/lib/realtime`만 import한다. `./mock`·`./broadcast`의 직접(딥) import는
 * `eslint.config.mjs`의 `noDeepRealtimeImpl`(zone 5·6)이 차단한다.
 *
 * **Task 033(19일차)부터 실데이터(Broadcast)를 조립한다.** Mock 단계 docstring이 예고한
 * 그대로 이 한 줄만 바뀌었다 — 소비자 쪽 import·호출 형태(`subscribeToRoom(roomId, onEvent)`)
 * 는 그대로다(D-030 ②가 지키려는 바로 그 성질). 구현 세부는 `broadcast.ts` 참고.
 */

import { subscribeToRoomViaBroadcast } from "./broadcast";

import type { SubscribeToRoom } from "./types";

export const subscribeToRoom: SubscribeToRoom = subscribeToRoomViaBroadcast;

// Mock 전용 테스트/데모 훅 — 여전히 배럴에서 재노출한다(하위 호환, 아직 이 함수들을 참조하는
// `/sample` 데모 코드가 있다). **Task 033부터 이 세 함수는 더 이상 실제 구독에 영향을
// 주지 않는다** — 위 `subscribeToRoom`이 이제 Broadcast를 쓰므로, Mock의 `rooms` Map에
// 발행해도 아무 구독자에게도 닿지 않는다(죽은 코드 경로, no-op). 남아 있는 `/sample` 참조는
// 실제 백엔드 흐름(Server Action → DB 트리거 → Broadcast)으로 교체했거나, 교체하지 못한
// 항목은 `docs/ISSUES.md`에 등재했다. 자세한 경위는 `mock.ts` 모듈 docstring과 I-042 참고.
export {
  publishMockError,
  publishMockEvent,
  resetMockRealtimeState,
  startMockEventTimer,
} from "./mock";

export { describeRealtimeError } from "./types";

export type {
  RealtimeConnectionError,
  RealtimeErrorHandler,
  RealtimeEvent,
  RealtimeEventHandler,
  SubscribeToRoom,
  Unsubscribe,
} from "./types";
