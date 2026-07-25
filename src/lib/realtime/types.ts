/**
 * 구독 인터페이스 타입 — Task 008 (D-030 ②, D-023, NFR-007·008·009).
 *
 * Mock(`mock.ts`)과 실데이터(`broadcast.ts`) 구현이 이 타입들을 똑같이
 * 만족해야, 배럴(`index.ts`)에서 구현체를 바꿔 껴도 소비자(컨테이너 컴포넌트)
 * 코드가 바뀌지 않는다(D-030 ②의 "UI 무수정 교체"가 실시간 경계에서도
 * 성립하게 만드는 지점).
 */

/** 구독 해제 함수. 호출은 멱등이어야 한다 — 두 번 불러도 에러가 나지 않는다. */
export type Unsubscribe = () => void;

/**
 * 방(채팅방·크루별 알림 채널 등)에서 발생한 실시간 이벤트의 공통 봉투.
 * D-023이 Broadcast로 실어 나르기로 한 세 대상(채팅 FR-051·투표 집계
 * FR-042·알림 FR-070)이 각자 다른 payload 모양을 가지므로, `type` 문자열로
 * 구분하고 `payload`는 제네릭으로 열어 둔다 — 구체 판별은 소비자(컨테이너)
 * 몫이다. 이 모듈은 전송 계층이라 payload 내용을 해석하지 않는다.
 */
export interface RealtimeEvent<TPayload = unknown> {
  /** 이벤트 종류 식별자. 예: "chat_message_created", "poll_tally_updated". */
  type: string;
  roomId: string;
  payload: TPayload;
  /** ISO 8601. 저장은 UTC, 표시는 사용자 타임존(NFR-025) — 변환은 소비자 몫. */
  occurredAt: string;
}

export type RealtimeEventHandler = (event: RealtimeEvent) => void;

/**
 * 구독 자체의 실패(네트워크 단절, 인가 거부 등 D-030 ③ "도메인 오류" 포함).
 * `RealtimeEventHandler`와 분리해 둔 이유: "이 방에 이벤트가 없다"와 "구독이
 * 실패했다"를 컨테이너가 같은 콜백에서 구분해야 하는 부담을 없앤다.
 */
export interface RealtimeConnectionError {
  roomId: string;
  message: string;
  /** 원인 에러(있다면) — 로깅용. 사용자 노출 문자열은 `lib/strings`가 담당. */
  cause?: unknown;
}

export type RealtimeErrorHandler = (error: RealtimeConnectionError) => void;

/**
 * `RealtimeConnectionError`를 콘솔 로깅용 안전한 문자열로 좁힌다 — Task 033 CORE 교차검증
 * 후속(19일차). `cause`는 실데이터 단계(`broadcast.ts`)에서 supabase-js realtime-js가 돌려주는
 * 원본 소켓 에러 객체다 — 그 안에 `access_token` 원문이 실제로 담기는지는 라이브러리 소스까지
 * 확인해야 알 수 있어 "샌다"고 단정하지 않지만, **토큰을 다루는 경로에서 불필요하게 로깅
 * 노출 폭을 넓히지 않는다**는 원칙으로 `console.error(..., error)`(객체 통째)가 아니라 이
 * 함수가 뽑아낸 메시지 문자열만 찍는다. 디버깅에 필요한 최소 정보(오류 메시지)는 남긴다 —
 * `cause`가 `Error` 인스턴스면 그 `message`만, 아니면 문자열로 강제 변환해 원본 객체 구조
 * (스택 트레이스·소켓 내부 필드 등)를 로그에 남기지 않는다.
 */
export function describeRealtimeError(error: RealtimeConnectionError): string {
  if (error.cause === undefined) return error.message;
  const causeMessage = error.cause instanceof Error ? error.cause.message : String(error.cause);
  return `${error.message} (cause: ${causeMessage})`;
}

/**
 * 제안된 구독 인터페이스 형태 — `subscribeToRoom(id, onEvent): Unsubscribe`
 * (README·ROADMAP 원문 그대로) + 선택적 세 번째 인자 `onError`로 D-030 ③의
 * 도메인 오류 콜백을 분리했다. Mock(`mock.ts`)·Broadcast(`broadcast.ts`) 둘
 * 다 이 함수 타입을 만족해야 한다.
 */
export type SubscribeToRoom = (
  roomId: string,
  onEvent: RealtimeEventHandler,
  onError?: RealtimeErrorHandler,
) => Unsubscribe;
