"use client";

import type { ChatTimelineItem } from "@/components/chat/message-view-models";
import { MessageBubble } from "@/components/chat/MessageBubble";

export interface MessageBubblePreviewItem {
  message: ChatTimelineItem;
  isOwn: boolean;
  /** FR-081 AC1(Task 042A, 20일차) 데모용. */
  isSenderBlocked?: boolean;
  /** FR-054(Task 041) 데모용 — true면 삭제 버튼 + 확인 다이얼로그가 뜬다(no-op, 아래 참고). */
  canDelete?: boolean;
}

export interface MessageBubblePreviewProps {
  items: MessageBubblePreviewItem[];
}

/**
 * `/sample` 전용 클라이언트 경계 — `MessageBubble`의 `onRetry: () => void`는 선택적 함수 prop인데
 * `sections/chat.tsx`는 서버 컴포넌트라 클로저를 직접 만들어 넘길 수 없다(RSC는 함수를 직렬화하지
 * 않는다). `ChatMessageListPreview.tsx`·`ConnectionBannerPreview.tsx`와 같은 이유·같은 패턴이다
 * (8일차 DESIGN Task 022 교차검증 BLOCKER — `sections/chat.tsx`가 이 전례를 놓치고 서버
 * 컴포넌트에서 `<MessageBubble ... onRetry={() => {}} />`를 직접 넘겼던 것을 이 래퍼로 고쳤다).
 *
 * `deliveryStatus === "failed"`인 항목에만 이 파일 안에서 만든 no-op `onRetry`를 붙인다 — 다른
 * 상태(sent·pending)는 애초에 재전송 버튼이 없으므로 `onRetry`를 넘기지 않는다(`MessageBubble`
 * 이 `undefined`면 버튼 자체를 그리지 않는다). 클릭해도 이 프리뷰 밖으로는 아무 효과가 없다.
 * 같은 이유로 `canDelete`가 `true`인 항목에도 no-op `onDelete`를 붙인다(FR-054, Task 041) —
 * 삭제 확인 다이얼로그를 열고 "삭제"를 눌러도 이 프리뷰 밖으로는 아무 효과가 없다(실제 삭제는
 * `/crews/[crewId]/chat`에서 확인한다).
 */
export function MessageBubblePreview({ items }: MessageBubblePreviewProps) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {items.map(({ message, isOwn, isSenderBlocked, canDelete }) => (
        <MessageBubble
          key={message.id}
          message={message}
          isOwn={isOwn}
          onRetry={message.deliveryStatus === "failed" ? () => {} : undefined}
          isSenderBlocked={isSenderBlocked}
          canDelete={canDelete}
          onDelete={canDelete ? () => {} : undefined}
        />
      ))}
    </div>
  );
}
