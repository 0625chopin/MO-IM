"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { getCrewChatTopic } from "@/components/chat/chat-topic";
import { Composer } from "@/components/chat/Composer";
import { ConnectionBanner } from "@/components/chat/ConnectionBanner";
import {
  createOptimisticTimelineItem,
  type ChatTimelineItem,
  type MessageViewModel,
} from "@/components/chat/message-view-models";
import { MessageList } from "@/components/chat/MessageList";
import { deleteChatMessageAction } from "@/lib/actions/delete-chat-message";
import { loadEarlierMessagesAction } from "@/lib/actions/load-earlier-messages";
import { resyncChatMessagesAction } from "@/lib/actions/resync-chat-messages";
import type { SendChatMessageState } from "@/lib/actions/send-chat-message";
import { sendChatMessageAction } from "@/lib/actions/send-chat-message";
import { describeRealtimeError, subscribeToRoom } from "@/lib/realtime";
import {
  nextChatConnectionStatus,
  type ChatConnectionStatus,
} from "@/lib/rules/chat-connection-state";
import type { Id } from "@/lib/types";

export interface MessageRoomContainerProps {
  crewId: Id;
  roomId: Id;
  viewerProfileId: Id;
  initialMessages: MessageViewModel[];
  initialCursor: Id | null;
  /** `chat:send_message` 판정 결과 — `Composer`에 그대로 내려준다. */
  canSend: boolean;
  /** FR-054(Task 041) — `chat:delete_any_message` 판정 결과(임원·오너·관리자). 본인 메시지
   *  삭제 가능 여부는 별도 플래그 없이 `MessageList`가 항목별 `isOwn`으로 판정한다. */
  canDeleteAnyMessage: boolean;
  /** FR-081 AC1(Task 042A) — 뷰어의 차단 목록(배열, 서버→클라이언트 직렬화 가능한 형태).
   *  `MessageList`에 `Set`으로 변환해 내려준다(모듈 docstring 참고). */
  blockedProfileIds: Id[];
}

function isMessageViewModel(payload: unknown): payload is MessageViewModel {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "id" in payload &&
    "roomId" in payload &&
    "senderId" in payload
  );
}

/**
 * 브라우저 온/오프라인 구독(9일차 런타임 blocker 수정) — `hooks/use-media-query.ts`와 같은
 * 이유로 `useState` + `useEffect` 대신 `useSyncExternalStore`를 쓴다. Node 20+가 `navigator`
 * 전역을 제공하지만(WHATWG fetch 호환용) `navigator.onLine`은 없다(`undefined`) — 예전에
 * `typeof navigator !== "undefined" && !navigator.onLine`을 `useState`의 lazy initializer로
 * 렌더 중 바로 계산했더니, 서버(Node)에서는 `!undefined` → `true`로 "disconnected"를, 브라우저
 * 에서는 보통 `navigator.onLine === true`라 "connected"를 렌더해 하이드레이션이 갈렸다
 * (`ConnectionBanner`가 있다/없다는 DOM 구조 차이 — React #418). `getServerSnapshot`이 항상
 * `true`를 반환해 SSR·최초 하이드레이션은 "온라인"으로 통일하고, 실제 값은 마운트 후
 * `online`/`offline` 리스너가 갱신한다.
 */
function subscribeToBrowserOnlineStatus(onStoreChange: () => void): () => void {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getBrowserOnlineSnapshot(): boolean {
  return navigator.onLine;
}

function getServerOnlineSnapshot(): boolean {
  return true;
}

/** 구독할 이벤트가 없다 — `getServerSnapshot`(false)과 `getSnapshot`(true)의 불일치를
 *  React가 하이드레이션 직후 자동으로 감지해 한 번 재렌더한다(별도 `setState` 불필요, 그래서
 *  `useEffect(() => setMounted(true), [])`와 달리 react-hooks/set-state-in-effect에 걸리지
 *  않는다). `hooks/use-media-query.ts`와 같은 `useSyncExternalStore` 관용구. */
function subscribeNever(): () => void {
  return () => {};
}

function getMountedTrue(): boolean {
  return true;
}

function getMountedFalseOnServer(): boolean {
  return false;
}

/**
 * 채팅방 컨테이너(D-030 ①②) — Task 020A에서 `subscribeToRoom`(Task 008)을 처음 실제로
 * 소비하는 자리였고, Task 020B가 낙관적 렌더·재전송·연결 상태를 더했다. `useEffect` 안에서
 * 구독하고 정리(unsubscribe)하는 책임을 진다(mock.ts docstring이 요구하는 그대로).
 * `MessageListContainer`(서버 컴포넌트)가 최초 페이지를 조회해 props로 내려주고, 이 컨테이너는
 * 그 이후의 실시간 갱신·"위로 이어 로드"·전송(낙관적 렌더 포함)·연결 상태만 담당한다 — 최초
 * 조회까지 클라이언트에서 다시 하지 않는다(서버 조회 1회 + 실시간 구독으로 충분하다).
 *
 * **전송 소유권이 여기 있는 이유(DESIGN 020A 교차검증 BLOCKER 1의 연장)**: Task 020A 때 이미
 * `Composer`가 아니라 이 컨테이너가 `publishMockEvent`를 부르도록 고쳐졌다 — Server Action은
 * Node.js 서버 프로세스, `subscribeToRoom`은 브라우저(`useEffect`)에서만 실행되는데
 * `lib/realtime/mock.ts`의 `rooms` Map은 모듈 스코프 싱글턴이라 서버·클라이언트 번들에서 각자
 * 별개 인스턴스가 되기 때문이다(I-042). Task 020B는 여기서 한 걸음 더 나간다 — 재전송(FR-051
 * E1)이 입력창이 아니라 실패한 말풍선(`MessageBubble`)에서 트리거되므로, `sendChatMessageAction`
 * 호출 자체를 `submitMessage`로 옮겨 최초 전송과 재전송이 완전히 같은 코드 경로를 타게 했다.
 * `Composer`는 이제 검증을 통과한 본문만 `onSubmit`으로 올려보낸다.
 *
 * **낙관적 렌더(FR-051 정상 흐름 ③, Task 020B)**: `submitMessage`가 Server Action을 부르기
 * *전에* `pending` 맵에 로컬 항목을 먼저 넣는다(`createOptimisticTimelineItem`) — 사용자는
 * 서버 왕복을 기다리지 않고 자기 메시지를 바로 본다. 성공하면 `pending`에서 지우고 확정
 * 메시지를 `publishMockEvent`로 발행해(위 문단과 같은 이유로 컨테이너 자신이 브라우저 쪽에서
 * 발행) 자기 구독으로 되받아 `messages`에 append한다 — 다른 사용자의 메시지가 도착하는 것과
 * 정확히 같은 경로다. 실패(서버 `formError` 또는 네트워크 예외)하면 해당 `pending` 항목을
 * `"failed"`로 바꾼다. `clientKey`는 최초 전송 때 한 번만 만들고(`crypto.randomUUID()`)
 * 재전송에서도 그대로 재사용한다 — `sendMessage`(Mock 데이터 레이어)가 같은 `clientKey`를
 * 이미 저장된 메시지로 멱등 처리하므로(FR-051 AC4), "사실은 서버에 저장됐는데 응답만 유실된"
 * 재전송이 중복 메시지를 만들지 않는다.
 *
 * **연결 상태(FR-051 E2·NFR-009, Task 020B)**: `lib/rules/chat-connection-state.ts`의 상태
 * 기계를 브라우저 `online`/`offline` 이벤트(실제 신호 — Mock을 흉내 내지 않는다)와
 * `subscribeToRoom`의 `onError`(D-030 ③ 도메인 오류) 두 입력으로 굴린다. `"reconnecting"`에
 * 들어서면 `resyncChatMessagesAction`으로 마지막 수신 메시지 이후의 누락분을 보충 조회한다
 * (FR-051 E3·AC2) — Mock 단계에서는 탭 간 전송 계층이 없어(I-042) 대개 빈 배열이 돌아오지만,
 * 이 경로는 Task 033(Broadcast 연결) 이후 그대로 값을 채워 돌려주게 된다(D-030 ② "구독
 * 인터페이스만 바꿔 끼운다"). Mock 구독 자체는 소켓이 아니라 메모리 Map 등록이라 끊어질
 * 개념이 없으므로 이 회차에서는 "재구독"을 실제로 해제·재등록하는 의식(儀式) 코드를 만들지
 * 않았다 — `subscribeToRoom` 호출은 `roomId`가 바뀌지 않는 한 계속 유효하다.
 *
 * **Task 033(19일차) 업데이트 — 실데이터 전환 완료**: `subscribeToRoom`은 이제 Supabase Realtime
 * Broadcast를 쓴다(D-023). 방 id 인자는 더 이상 `chat_rooms.id`가 아니라
 * `getCrewChatTopic(crewId)`(= `crew:{crewId}:chat`) — Realtime Authorization 정책(029B)이
 * 크루 단위로 인가하기 때문이다. **`publishMockEvent`로 자기 자신에게 되쏘던 I-042 우회가
 * 더 이상 필요 없다** — DB 트리거(`chat_messages_broadcast`)가 INSERT 시 크루 채팅 토픽에
 * 자동으로 브로드캐스트하므로, 발신자 자신도 다른 크루원과 똑같은 실시간 이벤트로 자기
 * 메시지를 받는다. 다만 그 왕복(실측 p50 ~200ms)을 기다리면 "즉시 반영"(FR-051 정상 흐름 ③)
 * 체감이 흐려지므로, `submitMessage` 성공 시 Server Action이 돌려준 확정 메시지를 **직접**
 * `messages`에 append하고 `seenIds`에 등록한다 — 뒤이어 도착하는 자기 자신의 브로드캐스트
 * 에코는 `seenIds` 중복 검사에 걸려 조용히 무시된다(중복 렌더 없음). 다른 크루원의 메시지는
 * 여전히 브로드캐스트 수신 경로 하나로만 들어온다.
 *
 * **20일차(Task 042A, FR-081 AC1) — 차단 접힘이 Realtime 경로에도 구조적으로 적용된다.**
 * `blockedProfileIds`(배열)를 `Set`으로 한 번 바꿔 `MessageList`에 그대로 내려준다. 이
 * `Set`은 `messages` 상태와 무관하게 고정 props이고, `MessageList`는 `messages` 배열(초기
 * 메시지 + 이 컴포넌트의 `setMessages`로 append된 실시간 메시지 전부)을 **매 렌더마다 통째로
 * map**하며 항목별로 `blockedProfileIds.has(senderId)`를 판정한다 — "초기 메시지냐 실시간
 * 메시지냐"로 갈리는 별도 코드 경로가 없으므로, 실시간으로 도착한 메시지도 구조적으로 같은
 * 판정을 받는다. **다만 실제 브라우저로 소켓을 열어 확인하지는 못했다** — 이번 회차도
 * `npm run dev`는 팀장 전용 운영 규칙이라, 이 결론은 코드 경로 분석(정적)이지 실측이 아니다.
 * 정직하게 남긴다.
 */
export function MessageRoomContainer({
  crewId,
  roomId,
  viewerProfileId,
  initialMessages,
  initialCursor,
  canSend,
  canDeleteAnyMessage,
  blockedProfileIds,
}: MessageRoomContainerProps) {
  const blockedProfileIdSet = new Set(blockedProfileIds);
  const [messages, setMessages] = useState(initialMessages);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, setPending] = useState<Map<string, ChatTimelineItem>>(new Map());
  const [isLoadingMore, startLoadMoreTransition] = useTransition();

  const isBrowserOnline = useSyncExternalStore(
    subscribeToBrowserOnlineStatus,
    getBrowserOnlineSnapshot,
    getServerOnlineSnapshot,
  );
  // 초기값은 항상 "connected"로 고정한다 — SSR·최초 하이드레이션이 항상 이 값이므로 일치한다.
  const [connectionStatus, setConnectionStatus] = useState<ChatConnectionStatus>("connected");
  // `isBrowserOnline`의 실제 전이(마운트 시점에 이미 오프라인이었던 경우 포함)를
  // `connectionStatus` 상태 기계에 반영한다. `useEffect`에서 setState하면
  // react-hooks/set-state-in-effect가 걸리므로, React가 공식으로 허용하는 "렌더 중 상태 조정"
  // 패턴을 쓴다(참고: react.dev "Adjusting some state when a prop changes") — 이전 렌더의
  // `isBrowserOnline`을 별도 state로 들고 있다가 값이 바뀌면 같은 렌더 패스 안에서 두 state를
  // 함께 갱신한다. `useEffect` 한 틱을 더 쓰지 않아 깜빡임도 없다.
  const [prevIsBrowserOnline, setPrevIsBrowserOnline] = useState(isBrowserOnline);
  if (isBrowserOnline !== prevIsBrowserOnline) {
    setPrevIsBrowserOnline(isBrowserOnline);
    setConnectionStatus((s) =>
      nextChatConnectionStatus(s, isBrowserOnline ? "connection_restored" : "connection_lost"),
    );
  }

  // 마운트 게이트(9일차 blocker 재발 수정) — `ConnectionBanner`는 SSR·최초 하이드레이션에서
  // 항상 렌더하지 않는다(아래 return문). 위 `useSyncExternalStore` 기반 수정만으로 SSR HTML에서
  // 배너가 사라짐을 직접 curl로 확인했지만(0건), 팀장 환경에서는 여전히 재현됐다는 보고가 있어
  // — 원인을 완전히 못 좁힌 상태에서도 항상 안전한 이중 방어로 이 게이트를 더한다.
  // `ConnectionBanner`는 원래 "끊겼다 복구될 때만 잠깐 나타나는" UX라 최초 렌더에 없어도 기능
  // 손실이 아니다. `useEffect(() => setMounted(true), [])`로 하면 똑같이
  // react-hooks/set-state-in-effect가 걸려서(직접 확인함) 위 `isBrowserOnline`과 같은 이유로
  // `useSyncExternalStore`를 쓴다 — `getServerSnapshot`은 `false`, `getSnapshot`은 `true`를
  // 고정 반환해 하이드레이션 직후 React가 자동으로 한 번 재렌더한다(구독할 이벤트가 없어
  // `subscribeNever`는 아무것도 하지 않는다).
  const mounted = useSyncExternalStore(subscribeNever, getMountedTrue, getMountedFalseOnServer);

  const seenIds = useRef(new Set(initialMessages.map((m) => m.id)));
  // 재연결 보충 조회(아래 effect)가 최신 `messages`를 읽되, 그 effect를 매 메시지 변경마다
  // 다시 돌리지 않기 위한 ref(D-029 — `MessageList`의 `onLoadMoreRef`와 같은 패턴).
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  });

  useEffect(() => {
    const topic = getCrewChatTopic(crewId);
    const unsubscribe = subscribeToRoom(
      topic,
      (event) => {
        if (event.roomId !== topic) return;
        if (!isMessageViewModel(event.payload)) return;
        const payload = event.payload;

        // FR-054(Task 041) — 다른 접속자가 삭제한 메시지를 이 화면에도 반영한다. 삭제 이벤트는
        // "새 메시지"가 아니라 "기존 메시지 갱신"이라 `seenIds` 중복 검사(아래 생성 분기)를
        // 타지 않는다 — 이미 목록에 없는 메시지(예: 이 세션이 아직 로드하지 않은 오래된 메시지)
        // 라면 조용히 무시한다(교체할 대상이 없다).
        if (event.type === "chat_message_deleted") {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.id ? { ...m, deletedAt: payload.deletedAt } : m)),
          );
          return;
        }

        if (event.type !== "chat_message_created") return;
        if (seenIds.current.has(payload.id)) return;
        seenIds.current.add(payload.id);
        setMessages((prev) => [...prev, payload]);
      },
      (error) => {
        // 원본 에러는 개발자용(로그)만 — 화면에는 `ConnectionBanner`가 일반화된 문구를
        // 보여준다(NFR-014와 같은 이유, D-030 ③ 도메인 오류를 사용자에게 안전하게 노출).
        // `error` 객체 통째가 아니라 `describeRealtimeError`로 좁힌 문자열만 찍는다 — `cause`가
        // supabase-js의 원본 소켓 에러라 불필요한 노출 폭을 늘리지 않는다(19일차 CORE 교차검증
        // 후속, `docs/decisions/realtime-broadcast-033.md` §8-후속① 참고).
        console.error("[chat] realtime subscription error", describeRealtimeError(error));
        setConnectionStatus((s) => nextChatConnectionStatus(s, "connection_lost"));
      },
    );
    return unsubscribe;
  }, [crewId]);

  // 브라우저 온/오프라인 — NFR-009가 요구하는 "연결 상태 시각 표시"의 실제 신호다. 별도
  // `useEffect`로 `window` 리스너를 다시 달지 않는다 — 위 `isBrowserOnline`
  // (`useSyncExternalStore`)이 이미 같은 이벤트를 구독하고 있고, 그 전이는 위 렌더 중 상태
  // 조정 블록이 처리한다(리스너 중복 등록 방지).

  // 재연결 시 누락분 보충 조회(FR-051 E3·AC2) — "reconnecting"에 들어설 때 한 번만 실행한다.
  useEffect(() => {
    if (connectionStatus !== "reconnecting") return;
    let cancelled = false;

    (async () => {
      const lastMessage = messagesRef.current[messagesRef.current.length - 1];
      if (lastMessage) {
        const result = await resyncChatMessagesAction({
          crewId,
          roomId,
          afterMessageId: lastMessage.id,
        });
        const fresh = [...result.items].reverse().filter((m) => !seenIds.current.has(m.id));
        fresh.forEach((m) => seenIds.current.add(m.id));
        if (!cancelled && fresh.length > 0) {
          setMessages((prev) => [...prev, ...fresh]);
        }
      }
      if (!cancelled) setConnectionStatus((s) => nextChatConnectionStatus(s, "resynced"));
    })();

    return () => {
      cancelled = true;
    };
  }, [connectionStatus, crewId, roomId]);

  const handleLoadMore = () => {
    if (!cursor) return;
    startLoadMoreTransition(async () => {
      const result = await loadEarlierMessagesAction({ crewId, roomId, beforeMessageId: cursor });
      setMessages((prev) => {
        const fresh = [...result.items].reverse().filter((m) => !seenIds.current.has(m.id));
        fresh.forEach((m) => seenIds.current.add(m.id));
        return [...fresh, ...prev];
      });
      setCursor(result.nextCursor);
    });
  };

  function markPendingFailed(clientKey: string) {
    setPending((prev) => {
      const existing = prev.get(clientKey);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(clientKey, { ...existing, deliveryStatus: "failed" });
      return next;
    });
  }

  /** 최초 전송·재전송이 공유하는 유일한 경로(위 모듈 docstring 참고). */
  function submitMessage(body: string, clientKey: string) {
    const createdAt = new Date().toISOString();
    setPending((prev) =>
      new Map(prev).set(
        clientKey,
        createOptimisticTimelineItem({ clientKey, roomId, senderId: viewerProfileId, body, createdAt }),
      ),
    );

    void (async () => {
      const formData = new FormData();
      formData.set("crewId", crewId);
      formData.set("roomId", roomId);
      formData.set("body", body);
      formData.set("clientKey", clientKey);

      let result: SendChatMessageState;
      try {
        result = await sendChatMessageAction({}, formData);
      } catch (error) {
        console.error("[chat] send failed", error);
        markPendingFailed(clientKey);
        // 전송 자체가 예외로 끊겼다는 것은 네트워크 문제일 가능성이 높다 — 연결 배너에도 반영한다.
        setConnectionStatus((s) => nextChatConnectionStatus(s, "connection_lost"));
        return;
      }

      const confirmedMessage = result.message;
      if (result.formError || !confirmedMessage) {
        markPendingFailed(clientKey);
        return;
      }

      setPending((prev) => {
        const next = new Map(prev);
        next.delete(clientKey);
        return next;
      });
      // Task 033 — 실데이터 전환 후에는 이 컨테이너가 자기 메시지를 직접 반영한다(모듈
      // docstring 참고). 뒤이어 도착하는 자기 자신의 브로드캐스트 에코는 seenIds에 걸려
      // 중복 없이 무시된다.
      if (!seenIds.current.has(confirmedMessage.id)) {
        seenIds.current.add(confirmedMessage.id);
        setMessages((prev) => [...prev, confirmedMessage]);
      }
    })();
  }

  const handleComposerSubmit = (body: string) => {
    submitMessage(body, crypto.randomUUID());
  };

  const handleRetry = (clientKey: string) => {
    const item = pending.get(clientKey);
    if (!item || item.body === null) return;
    submitMessage(item.body, clientKey);
  };

  /**
   * 메시지 삭제(FR-054, Task 041). 자기 확정 메시지를 반영할 때(위 `submitMessage`)와 같은
   * 원칙 — 실패해도 화면 상태가 어긋나지 않도록, 서버가 실제로 성공을 반환했을 때만 로컬
   * `messages`를 갱신한다(낙관적으로 먼저 지우지 않는다 — 삭제는 되돌릴 수 없는 행위라
   * "일단 지운 것처럼 보여주고 실패하면 복구"보다 "성공을 확인하고 지운다"가 더 안전하다).
   * 성공하면 이 세션도 다른 접속자와 똑같이 "삭제된 메시지" 플레이스홀더를 본다 — 뒤이어
   * 도착하는 자기 자신의 `chat_message_deleted` 브로드캐스트 에코는 이미 같은 값이라
   * 중복 갱신이어도 무해하다.
   */
  const handleDeleteMessage = (messageId: string) => {
    void (async () => {
      const result = await deleteChatMessageAction({ crewId, roomId, messageId });
      if (!result.ok) {
        console.error("[chat] delete failed", result.error);
        return;
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, deletedAt: result.data.deletedAt } : m)),
      );
    })();
  };

  const handleManualReconnect = () => {
    // 실제로 오프라인이면 "재연결됨"으로 잘못 넘어가지 않는다 — 사용자가 배너의 버튼을 눌러도
    // 네트워크 자체가 없으면 아무 일도 일어나지 않는다(다시 온라인이 되면 `online` 이벤트가
    // 자동으로 상태를 이어받는다).
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setConnectionStatus((s) => nextChatConnectionStatus(s, "connection_restored"));
  };

  const timeline: ChatTimelineItem[] = [
    ...messages.map((m): ChatTimelineItem => ({ ...m, deliveryStatus: "sent" })),
    ...pending.values(),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {mounted && (
        <ConnectionBanner
          status={connectionStatus}
          onRetry={connectionStatus === "disconnected" ? handleManualReconnect : undefined}
        />
      )}
      <MessageList
        roomId={roomId}
        messages={timeline}
        viewerProfileId={viewerProfileId}
        hasMore={cursor !== null}
        isLoadingMore={isLoadingMore}
        onLoadMore={handleLoadMore}
        onRetry={handleRetry}
        onDelete={handleDeleteMessage}
        canDeleteAnyMessage={canDeleteAnyMessage}
        blockedProfileIds={blockedProfileIdSet}
      />
      <Composer canSend={canSend} onSubmit={handleComposerSubmit} />
    </div>
  );
}
