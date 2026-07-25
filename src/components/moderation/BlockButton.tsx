"use client";

import { Loader2Icon } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { createBlockAction, type CreateBlockFormState } from "@/lib/actions/create-block";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

const INITIAL_STATE: CreateBlockFormState = {};

export interface BlockButtonProps {
  blockedId: Id;
  /** 이미 차단한 대상이면 true — 호출자(컨테이너)가 `listMyBlockedProfileIds`로 미리 안다.
   *  차단은 되돌리기 쉬운 조작(해제 가능, `remove-block.ts`)이라 `MemberList`의 이양·강퇴처럼
   *  확인 다이얼로그를 두지 않고 즉시 제출한다(D-030 ① — 상태는 이 컴포넌트가 아니라
   *  Server Action의 `refresh()` 이후 컨테이너 재조회가 갱신한다). */
  initialBlocked?: boolean;
}

/** FR-081 차단 버튼(Task 042A, D-030 ① 표현 컴포넌트). `RemoveMemberDialog`와 달리 확인
 *  다이얼로그가 없는 단순 폼이다 — `LeaveForm`(`MemberList.tsx`)과 같은 형태. */
export function BlockButton({ blockedId, initialBlocked = false }: BlockButtonProps) {
  const [state, formAction, isPending] = useActionState(createBlockAction, INITIAL_STATE);
  const isBlocked = initialBlocked || state.success === true;

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="blockedId" value={blockedId} />
      <Button type="submit" size="sm" variant="outline" disabled={isPending || isBlocked}>
        {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {isPending
          ? strings.block.submitPending
          : isBlocked
            ? strings.block.blockedNotice
            : strings.block.trigger}
      </Button>
      {state.formError && (
        <p role="alert" className="text-xs text-destructive">
          {state.formError}
        </p>
      )}
    </form>
  );
}
