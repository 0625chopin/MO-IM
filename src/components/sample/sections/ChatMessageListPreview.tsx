"use client";

import type { ChatTimelineItem } from "@/components/chat/message-view-models";
import { MessageList } from "@/components/chat/MessageList";

export interface ChatMessageListPreviewProps {
  roomId: string;
  messages: ChatTimelineItem[];
  viewerProfileId: string;
  hasMore?: boolean;
  /** FR-081 AC1(Task 042A, 20일차) — 데모용 차단 목록. 기본값 빈 집합. */
  blockedProfileIds?: ReadonlySet<string>;
}

/**
 * `/sample` 전용 클라이언트 경계 — `MessageList`(`"use client"`)의 `onLoadMore: () => void`는
 * 필수 함수 prop인데 `sections/chat.tsx`는 서버 컴포넌트라 클로저를 직접 만들어 넘길 수 없다
 * (React Server Component는 함수를 직렬화하지 않는다). `BoardErrorStatePreview.tsx`·
 * `RouteErrorBoundaryPreview.tsx`와 같은 이유·같은 패턴이다(DESIGN 020A 교차검증 BLOCKER 2 —
 * `sections/chat.tsx`가 이 전례를 놓치고 서버 컴포넌트에서 `onLoadMore={() => {}}`를 직접
 * 넘겼던 것을 이 래퍼로 고쳤다).
 *
 * 이 데모는 실제 이어 로드·재전송을 흉내 내지 않는다 — `onLoadMore`·`onRetry`는 이 파일 안에서만
 * 만들어지고 쓰이는 no-op이라(서버→클라이언트 경계를 넘지 않는다) 클릭해도 아무 일도
 * 일어나지 않는다. **Task 020B에서 `connectionError` prop을 제거했다** — 그 자리는 이제
 * `ConnectionBanner`가 맡는다(`sections/chat.tsx`의 별도 항목 참고, `MessageList` 모듈
 * docstring과 같은 이유).
 *
 * **`onDelete`·`canDeleteAnyMessage`(Task 041, FR-054)도 같은 이유로 no-op이다** — 21일차
 * Task 036 빌드 검증 중 `MessageList`가 이 두 필수 prop을 새로 요구하는 것을 발견해 추가했다
 * (`npm run build` 타입 오류로 드러남). `onLoadMore`·`onRetry`와 동일하게 서버→클라이언트
 * 경계를 넘지 않는 데모 전용 no-op이며, 삭제 UI 자체(권한 판정·실제 삭제)는 Task 041 소관이라
 * 손대지 않았다.
 */
export function ChatMessageListPreview({
  roomId,
  messages,
  viewerProfileId,
  hasMore = false,
  blockedProfileIds = new Set(),
}: ChatMessageListPreviewProps) {
  return (
    <MessageList
      roomId={roomId}
      messages={messages}
      viewerProfileId={viewerProfileId}
      hasMore={hasMore}
      isLoadingMore={false}
      onLoadMore={() => {}}
      onRetry={() => {}}
      onDelete={() => {}}
      canDeleteAnyMessage={false}
      blockedProfileIds={blockedProfileIds}
    />
  );
}
