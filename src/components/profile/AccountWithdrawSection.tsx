"use client";

import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { DeactivateAccountState } from "@/lib/actions/deactivate-account";
import { deactivateAccountAction } from "@/lib/actions/deactivate-account";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

const INITIAL_STATE: DeactivateAccountState = { status: "idle" };

/**
 * FR-005 정상 흐름 ①~③ — 계정 설정 화면의 탈퇴 섹션(Task 039). `ownedActiveCrews`는
 * `AccountSettingsContainer`가 `listCrewsByProfile`로 이미 조회해 내려준 값이다(D-030 ①,
 * 이 컴포넌트는 `lib/data`를 직접 import하지 않는다) — AC1(오너 크루 보유 시 차단)의 최종
 * 판정은 `request_account_deactivation` RPC가 하지만, 목록이 있으면 다이얼로그를 열기 전에
 * 미리 안내해 불필요한 왕복(비밀번호 입력 → 서버가 거부)을 없앤다.
 */
export function AccountWithdrawSection({ ownedActiveCrews }: { ownedActiveCrews: { id: Id; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(deactivateAccountAction, INITIAL_STATE);

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <div>
        <h2 className="text-sm font-medium text-foreground">{strings.account.settings.withdraw.heading}</h2>
        <p className="text-sm text-muted-foreground">{strings.account.settings.withdraw.description}</p>
      </div>

      {ownedActiveCrews.length > 0 ? (
        <Alert>
          <AlertTriangleIcon aria-hidden="true" />
          <AlertDescription className="flex flex-col gap-2">
            <span className="font-medium text-foreground">
              {strings.account.settings.withdraw.blockedByOwnership.title}
            </span>
            <span>{strings.account.settings.withdraw.blockedByOwnership.description}</span>
            <ul className="flex flex-col gap-1">
              {ownedActiveCrews.map((crew) => (
                <li key={crew.id}>
                  <Link
                    href={`/crews/${crew.id}/settings`}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    {crew.name}
                  </Link>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : (
        <Dialog>
          <DialogTrigger render={<Button type="button" variant="destructive" className="w-fit" />}>
            {strings.account.settings.withdraw.confirmDialog.submit}
          </DialogTrigger>
          <DialogContent>
            <form action={formAction} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{strings.account.settings.withdraw.confirmDialog.title}</DialogTitle>
                <DialogDescription>{strings.account.settings.withdraw.confirmDialog.description}</DialogDescription>
              </DialogHeader>

              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                <li>{strings.account.settings.withdraw.notice.personalData}</li>
                <li>{strings.account.settings.withdraw.notice.content}</li>
                <li>{strings.account.settings.withdraw.notice.votes}</li>
              </ul>

              {state.status === "error" && state.errorMessage && (
                <Alert variant="destructive">
                  <AlertTriangleIcon aria-hidden="true" />
                  <AlertDescription>{state.errorMessage}</AlertDescription>
                </Alert>
              )}

              <Field>
                <FieldLabel htmlFor="withdraw-password">
                  {strings.account.settings.withdraw.confirmDialog.passwordLabel}
                </FieldLabel>
                <Input
                  id="withdraw-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>

              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>
                  {strings.account.settings.withdraw.confirmDialog.cancel}
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={isPending}>
                  {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
                  {isPending
                    ? strings.account.settings.withdraw.confirmDialog.submitPending
                    : strings.account.settings.withdraw.confirmDialog.submit}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
