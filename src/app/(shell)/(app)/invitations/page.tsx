import { Suspense } from "react";

import { InvitationInboxContainer } from "@/components/invitations/InvitationInboxContainer";
import { InvitationListSkeleton } from "@/components/invitations/InvitationListSkeleton";
import { strings } from "@/lib/strings";

/**
 * 받은 초대함 페이지 (SC-20, PRD §6 "받은 초대함 페이지", F010, Task 017B). 수락 시 즉시
 * 크루원(active) 전환 + 크루 홈 이동, 거절해도 재초대 가능(영구 차단 아님)은
 * `InvitationInboxContainer`(D-030 ①)가 조립한다. `page.tsx`는 얇은 껍데기다
 * (`docs/CONVENTIONS.md`).
 */
export default function InvitationsPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
      <h1 className="font-heading text-xl font-semibold text-foreground">
        {strings.invitation.inbox.title}
      </h1>
      <Suspense fallback={<InvitationListSkeleton />}>
        <InvitationInboxContainer />
      </Suspense>
    </main>
  );
}
