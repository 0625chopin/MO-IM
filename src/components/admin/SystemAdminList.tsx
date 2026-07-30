"use client";

import { CheckCircle2Icon, Loader2Icon, UserPlusIcon } from "lucide-react";
import { useActionState } from "react";

import { UserSearchField } from "@/components/profile/UserSearchField";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
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
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { grantSystemAdminAction, type GrantSystemAdminFormState } from "@/lib/actions/grant-system-admin";
import { revokeSystemAdminAction, type RevokeSystemAdminFormState } from "@/lib/actions/revoke-system-admin";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

import type { SystemAdminRowViewModel } from "./system-admin-view-models";

const INITIAL_GRANT_STATE: GrantSystemAdminFormState = {};
const INITIAL_REVOKE_STATE: RevokeSystemAdminFormState = {};

export interface SystemAdminListProps {
  admins: SystemAdminRowViewModel[];
}

/**
 * I-075(D-076·D-078, 27일차) 관리자 지정/회수 목록(D-030 ① 표현 컴포넌트) —
 * `SystemAdminsContainer`가 `admin_list_system_admins` RPC 결과 + 사전 검증(§4)을 이미 끝낸
 * 값을 props로 내려준다. `MemberList`(`components/crews/`)의 카드 목록 + 행별 확인 다이얼로그
 * 패턴을 그대로 따른다.
 *
 * **회수 버튼은 `canRevoke===false`면 아예 다이얼로그를 열지 않고 비활성 버튼 + 이유
 * 문구로 대체한다** — `admin-grant-revoke-rpcs-075.md` §4 "정상 흐름의 1차 UX는 버튼이
 * 아예 없음/비활성이어야 한다"를 그대로 따른다.
 *
 * **관리자 지정은 `UserSearchField`(`InviteMemberDialog`와 같은 재사용)를 쓴다** — 핸들 검색
 * 결과에는 id가 없으므로(NFR-013), `renderResultFooter` 슬롯에 꽂은 `GrantSystemAdminButton`이
 * 핸들 문자열만 다시 제출한다(`grant-system-admin.ts` docstring 참고).
 */
export function SystemAdminList({ admins }: SystemAdminListProps) {
  return (
    <div className="flex flex-col gap-4">
      <GrantSystemAdminDialog />

      {admins.length === 0 ? (
        <Empty>
          <EmptyTitle>{strings.admin.systemAdmins.list.empty.title}</EmptyTitle>
          <EmptyDescription>{strings.admin.systemAdmins.list.empty.description}</EmptyDescription>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {admins.map((admin) => (
            <li key={admin.profileId}>
              <SystemAdminRow admin={admin} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SystemAdminRow({ admin }: { admin: SystemAdminRowViewModel }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <Avatar size="sm">
          {admin.avatarUrl && <AvatarImage src={admin.avatarUrl} alt="" />}
          <AvatarFallback>{admin.displayName.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">
            {admin.displayName}
            {admin.isSelf && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                ({strings.admin.systemAdmins.selfBadge})
              </span>
            )}
          </span>
          <span className="truncate text-sm text-muted-foreground">@{admin.handle}</span>
        </div>
        {admin.status !== "active" && (
          <Badge variant="secondary" className="ml-1 shrink-0">
            {admin.status}
          </Badge>
        )}
        <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
          {admin.canRevoke ? (
            <RevokeSystemAdminDialog profileId={admin.profileId} displayName={admin.displayName} />
          ) : (
            <>
              <Button type="button" size="sm" variant="outline" disabled>
                {strings.admin.systemAdmins.revoke.button}
              </Button>
              {admin.revokeBlockedReason && (
                <p className="max-w-40 text-right text-xs text-muted-foreground">
                  {admin.revokeBlockedReason}
                </p>
              )}
            </>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}

function GrantSystemAdminDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button />}>
        <UserPlusIcon aria-hidden="true" />
        {strings.admin.systemAdmins.grant.trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.admin.systemAdmins.grant.dialogTitle}</DialogTitle>
          <DialogDescription>{strings.admin.systemAdmins.grant.dialogDescription}</DialogDescription>
        </DialogHeader>
        <UserSearchField
          renderResultFooter={(result) => <GrantSystemAdminButton handle={result.handle} />}
        />
      </DialogContent>
    </Dialog>
  );
}

function GrantSystemAdminButton({ handle }: { handle: string }) {
  const [state, formAction, isPending] = useActionState(grantSystemAdminAction, INITIAL_GRANT_STATE);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="handle" value={handle} />
      <Button type="submit" size="sm" disabled={isPending || state.success}>
        {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {state.success && <CheckCircle2Icon aria-hidden="true" className="size-3.5" />}
        {isPending
          ? strings.admin.systemAdmins.grant.submitPending
          : state.success
            ? strings.admin.systemAdmins.grant.grantedNotice
            : strings.admin.systemAdmins.grant.grantButton}
      </Button>
      {state.formError && (
        <p role="alert" className="text-xs text-destructive">
          {state.formError}
        </p>
      )}
    </form>
  );
}

/** D-076·D-078 — 되돌리기 어려운 권한 변경이라(회수 후 다시 지정하려면 별도 조작이 필요)
 *  `RemoveMemberDialog`와 같은 이유로 확인 다이얼로그를 거친다. */
function RevokeSystemAdminDialog({ profileId, displayName }: { profileId: Id; displayName: string }) {
  const [state, formAction, isPending] = useActionState(revokeSystemAdminAction, INITIAL_REVOKE_STATE);

  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
        {strings.admin.systemAdmins.revoke.button}
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{strings.admin.systemAdmins.revoke.dialogTitle}</DialogTitle>
            <DialogDescription>
              {displayName} — {strings.admin.systemAdmins.revoke.dialogDescription}
            </DialogDescription>
          </DialogHeader>

          <input type="hidden" name="profileId" value={profileId} />

          {state.formError && (
            <p role="alert" className="text-sm text-destructive">
              {state.formError}
            </p>
          )}
          {state.success && (
            <p role="status" className="text-sm text-muted-foreground">
              {strings.admin.systemAdmins.revoke.revokedNotice}
            </p>
          )}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {strings.admin.systemAdmins.revoke.cancel}
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              {isPending ? strings.admin.systemAdmins.revoke.submitPending : strings.admin.systemAdmins.revoke.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
