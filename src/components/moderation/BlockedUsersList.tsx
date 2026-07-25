"use client";

import { Loader2Icon } from "lucide-react";
import { useActionState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { removeBlockAction, type RemoveBlockFormState } from "@/lib/actions/remove-block";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

export interface BlockedUserRowViewModel {
  id: Id;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface BlockedUsersListProps {
  blockedUsers: BlockedUserRowViewModel[];
}

/**
 * FR-081 차단 관리 목록(Task 042A, D-030 ① 표현 컴포넌트). 계정 설정 "차단한 사용자"
 * 섹션(`BlockedUsersListContainer`)이 조립한다. 빈 상태는 shadcn `Empty`(다른 목록 화면과
 * 같은 컴포넌트, `docs/CONVENTIONS.md` "직접 만들기 전에 레지스트리에서 먼저 찾는다"를
 * 따른다).
 */
export function BlockedUsersList({ blockedUsers }: BlockedUsersListProps) {
  if (blockedUsers.length === 0) {
    return (
      <Empty>
        <EmptyTitle>{strings.block.manage.empty}</EmptyTitle>
        <EmptyDescription>{strings.block.manage.description}</EmptyDescription>
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {blockedUsers.map((user) => (
        <li key={user.id}>
          <Card>
            <CardHeader className="flex-row items-center gap-3">
              <Avatar size="sm">
                {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
                <AvatarFallback>{user.displayName.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">{user.displayName}</span>
                <span className="truncate text-sm text-muted-foreground">@{user.handle}</span>
              </div>
              <div className="ml-auto shrink-0">
                <UnblockForm blockedId={user.id} />
              </div>
            </CardHeader>
          </Card>
        </li>
      ))}
    </ul>
  );
}

const INITIAL_STATE: RemoveBlockFormState = {};

function UnblockForm({ blockedId }: { blockedId: Id }) {
  const [state, formAction, isPending] = useActionState(removeBlockAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="blockedId" value={blockedId} />
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {isPending ? strings.block.manage.unblockPending : strings.block.manage.unblockButton}
      </Button>
      {state.formError && (
        <p role="alert" className="text-xs text-destructive">
          {state.formError}
        </p>
      )}
    </form>
  );
}
