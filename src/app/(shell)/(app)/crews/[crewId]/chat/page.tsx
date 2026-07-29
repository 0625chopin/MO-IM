import { Suspense } from "react";

import { MessageListContainer } from "@/components/chat/MessageListContainer";
import { MessageListSkeleton } from "@/components/chat/MessageListSkeleton";
import { strings } from "@/lib/strings";

/**
 * 채팅방 페이지(SC-13, FR-050·051, Task 020A). `page.tsx`는 얇은 껍데기다(`docs/CONVENTIONS.md`
 * "src/app은 라우팅과 조립만 한다") — 실제 조회·판정·실시간 구독은 `MessageListContainer`
 * (D-030 ①②)가 한다. Next.js 16에서 `params`는 비동기다.
 */
export default async function CrewChatPage({
  params,
}: {
  params: Promise<{ crewId: string }>;
}) {
  const { crewId } = await params;

  return (
    <main className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col">
      <h1 className="border-b border-border px-4 py-3 font-heading text-lg font-medium text-foreground">
        {strings.chat.room.title}
      </h1>
      <Suspense fallback={<MessageListSkeleton />}>
        <MessageListContainer crewId={crewId} />
      </Suspense>
    </main>
  );
}
