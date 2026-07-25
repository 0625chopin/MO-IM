"use client";

import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { RestoreAccountState } from "@/lib/actions/restore-account";
import { restoreAccountAction } from "@/lib/actions/restore-account";
import { strings } from "@/lib/strings";

const INITIAL_STATE: RestoreAccountState = { status: "idle" };

/** FR-005 AC3 — `/account/restore`. 유예 종료일 안내는 `AuthLayout.description`(컨테이너가
 *  이미 포맷한 문자열)이 맡으므로 이 컴포넌트는 날짜를 다시 계산하지 않는다. */
export function RestoreAccountForm() {
  const [state, formAction, isPending] = useActionState(restoreAccountAction, INITIAL_STATE);

  if (state.status === "error" && state.errorMessage === strings.account.restore.errors.graceExpired) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircle2Icon aria-hidden="true" className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{state.errorMessage}</p>
        <Link href="/login" className="text-sm font-medium text-foreground underline underline-offset-4">
          {strings.account.restore.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-center gap-6 text-center">
      <AlertTriangleIcon aria-hidden="true" className="size-10 text-destructive" />

      {state.status === "error" && state.errorMessage && (
        <Alert variant="destructive" className="text-left">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertDescription>{state.errorMessage}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {isPending ? strings.account.restore.restorePending : strings.account.restore.restore}
      </Button>
    </form>
  );
}
