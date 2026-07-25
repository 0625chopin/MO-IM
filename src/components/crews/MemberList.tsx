"use client";

import { Loader2Icon } from "lucide-react";
import { useActionState } from "react";

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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { leaveCrewAction, type LeaveCrewFormState } from "@/lib/actions/leave-crew";
import { removeCrewMemberAction, type RemoveCrewMemberFormState } from "@/lib/actions/remove-crew-member";
import {
  setCrewMemberRoleAction,
  type SetCrewMemberRoleFormState,
} from "@/lib/actions/set-crew-member-role";
import {
  transferCrewOwnershipAction,
  type TransferCrewOwnershipFormState,
} from "@/lib/actions/transfer-crew-ownership";
import { strings } from "@/lib/strings";
import type { CrewMembershipRole, Id } from "@/lib/types";

import type { MemberRowViewModel } from "./crew-member-view-models";

const INITIAL_APPOINT_STATE: SetCrewMemberRoleFormState = {};
const INITIAL_LEAVE_STATE: LeaveCrewFormState = {};
const INITIAL_TRANSFER_STATE: TransferCrewOwnershipFormState = {};
const INITIAL_REMOVE_STATE: RemoveCrewMemberFormState = {};

const ROLE_BADGE_VARIANT: Record<CrewMembershipRole, "default" | "secondary" | "outline"> = {
  owner: "default",
  staff: "secondary",
  member: "outline",
};

export interface MemberListProps {
  crewId: Id;
  /** FR-025 오너 이양·FR-013 해산과 같은 크루명 재입력 확인에 쓴다(Task 040). */
  crewName: string;
  members: MemberRowViewModel[];
}

/**
 * FR-015 역할 정렬 목록(Task 017A, D-030 ①) — 오너 > 임원 > 일반 순으로 이미 정렬된
 * `members`를 그대로 그린다. 정렬·권한 판정은 `CrewMembersContainer`가 끝낸 값을 props로만
 * 받는다(R-015). `JoinRequestButton`과 같은 이유로 이 표현 컴포넌트도 "use client"다 — 행별
 * 임명·탈퇴·이양·강퇴 버튼이 `useActionState`를 쓴다.
 *
 * **오너 이양(FR-025)·강퇴(FR-027)는 Task 040이 추가했다** — 둘 다 되돌리기 어렵거나(이양)
 * 대상에게 직접적인 영향을 주는(강퇴) 조작이라 다이얼로그로 한 번 더 확인한다.
 */
export function MemberList({ crewId, crewName, members }: MemberListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => (
        <li key={member.profileId}>
          <Card>
            <CardHeader className="flex-row items-center gap-3">
              <Avatar size="sm">
                {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
                <AvatarFallback>{member.displayName.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">
                  {member.displayName}
                  {member.isSelf && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      ({strings.crew.members.selfBadge})
                    </span>
                  )}
                </span>
                <span className="truncate text-sm text-muted-foreground">@{member.handle}</span>
              </div>
              <Badge variant={ROLE_BADGE_VARIANT[member.role]} className="ml-1 shrink-0">
                {strings.crew.members.roleLabels[member.role]}
              </Badge>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {member.canAppoint && (
                  <AppointRoleForm crewId={crewId} profileId={member.profileId} currentRole={member.role} />
                )}
                {member.canTransferOwnership && (
                  <TransferOwnershipDialog
                    crewId={crewId}
                    crewName={crewName}
                    profileId={member.profileId}
                    displayName={member.displayName}
                  />
                )}
                {member.canRemove && (
                  <RemoveMemberDialog
                    crewId={crewId}
                    profileId={member.profileId}
                    displayName={member.displayName}
                  />
                )}
                {member.isSelf &&
                  (member.canLeave ? (
                    <LeaveForm crewId={crewId} />
                  ) : (
                    member.leaveBlockedReason && (
                      <p className="max-w-40 text-xs text-muted-foreground">{member.leaveBlockedReason}</p>
                    )
                  ))}
              </div>
            </CardHeader>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function AppointRoleForm({
  crewId,
  profileId,
  currentRole,
}: {
  crewId: Id;
  profileId: Id;
  currentRole: CrewMembershipRole;
}) {
  const [state, formAction, isPending] = useActionState(setCrewMemberRoleAction, INITIAL_APPOINT_STATE);
  const nextRole: Extract<CrewMembershipRole, "staff" | "member"> = currentRole === "staff" ? "member" : "staff";

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="crewId" value={crewId} />
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="role" value={nextRole} />
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {isPending
          ? strings.crew.members.appoint.submitPending
          : currentRole === "staff"
            ? strings.crew.members.appoint.dismissButton
            : strings.crew.members.appoint.appointButton}
      </Button>
      {state.formError && (
        <p role="alert" className="text-xs text-destructive">
          {state.formError}
        </p>
      )}
    </form>
  );
}

function LeaveForm({ crewId }: { crewId: Id }) {
  const [state, formAction, isPending] = useActionState(leaveCrewAction, INITIAL_LEAVE_STATE);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="crewId" value={crewId} />
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {isPending ? strings.crew.members.leave.submitPending : strings.crew.members.leave.button}
      </Button>
      {state.formError && (
        <p role="alert" className="text-xs text-destructive">
          {state.formError}
        </p>
      )}
    </form>
  );
}

/** FR-025 오너 이양(D-002, Task 040) — 크루명 재입력 확인 다이얼로그. 오너 행에만 노출된다. */
function TransferOwnershipDialog({
  crewId,
  crewName,
  profileId,
  displayName,
}: {
  crewId: Id;
  crewName: string;
  profileId: Id;
  displayName: string;
}) {
  const [state, formAction, isPending] = useActionState(transferCrewOwnershipAction, INITIAL_TRANSFER_STATE);

  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
        {strings.crew.settings.transferOwnership.trigger}
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{strings.crew.settings.transferOwnership.dialogTitle}</DialogTitle>
            <DialogDescription>
              {displayName} — {strings.crew.settings.transferOwnership.dialogDescription}
            </DialogDescription>
          </DialogHeader>

          <input type="hidden" name="crewId" value={crewId} />
          <input type="hidden" name="profileId" value={profileId} />

          {state.formError && (
            <p role="alert" className="text-sm text-destructive">
              {state.formError}
            </p>
          )}

          <Field>
            <FieldLabel htmlFor={`transfer-ownership-confirm-${profileId}`}>
              {strings.crew.settings.transferOwnership.confirmLabel}
            </FieldLabel>
            <Input
              id={`transfer-ownership-confirm-${profileId}`}
              name="confirmName"
              placeholder={crewName || strings.crew.settings.transferOwnership.confirmPlaceholder}
              autoComplete="off"
              required
            />
          </Field>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {strings.crew.settings.transferOwnership.cancel}
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              {isPending
                ? strings.crew.settings.transferOwnership.submitPending
                : strings.crew.settings.transferOwnership.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** FR-027 크루원 강퇴(D-003, Task 040) — 사유는 선택 입력. */
function RemoveMemberDialog({
  crewId,
  profileId,
  displayName,
}: {
  crewId: Id;
  profileId: Id;
  displayName: string;
}) {
  const [state, formAction, isPending] = useActionState(removeCrewMemberAction, INITIAL_REMOVE_STATE);

  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
        {strings.crew.members.remove.button}
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{strings.crew.members.remove.dialogTitle}</DialogTitle>
            <DialogDescription>
              {displayName} — {strings.crew.members.remove.dialogDescription}
            </DialogDescription>
          </DialogHeader>

          <input type="hidden" name="crewId" value={crewId} />
          <input type="hidden" name="profileId" value={profileId} />

          {state.formError && (
            <p role="alert" className="text-sm text-destructive">
              {state.formError}
            </p>
          )}

          <Field>
            <FieldLabel htmlFor={`remove-member-reason-${profileId}`}>
              {strings.crew.members.remove.reasonLabel}
            </FieldLabel>
            <Input
              id={`remove-member-reason-${profileId}`}
              name="reason"
              placeholder={strings.crew.members.remove.reasonPlaceholder}
              autoComplete="off"
            />
          </Field>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {strings.crew.members.remove.cancel}
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              {isPending ? strings.crew.members.remove.submitPending : strings.crew.members.remove.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
