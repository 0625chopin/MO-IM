"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { getBoardListHref } from "@/components/board/board-links";
import { ReportDialog } from "@/components/moderation/ReportDialog";
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
import { ErrorState } from "@/components/ui/error-state";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deletePostAction } from "@/lib/actions/delete-post";
import { updatePostAction } from "@/lib/actions/update-post";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

export interface PostActionsProps {
  crewId: Id;
  postId: Id;
  initialTitle: string;
  initialBody: string;
  canEdit: boolean;
  canDelete: boolean;
  /** `report:create` 판정 결과 AND 본인 글이 아님(I-117 해소, 25일차) — `PostDetailContainer`가
   *  미리 계산해 내려준다(D-030 ①, `canEditTitleBody`·`canDelete`와 같은 자리). 본인 글에는
   *  신고 버튼을 보여주지 않는다(`MemberList`의 `canReportOrBlock: !isSelf`와 같은 원칙 —
   *  `create_report` RPC 자체는 프로필 대상만 자기신고를 막고 게시글은 막지 않지만, 이 판정은
   *  DB 최종 방어선이 아니라 렌더 여부만 결정하는 UI 판정이다). */
  canReport: boolean;
}

/**
 * `lib/data/contracts.ts`의 `DataErrorCode`와 값이 같은 로컬 유니온이다 — 이 파일은 표현
 * 컴포넌트(zone 4)라 `@/lib/data/*`를 직접 import할 수 없다(D-030 ①). Server Action의 반환값
 * (`DataResult<Post>`)이 구조적으로 같은 문자열 리터럴이라 타입을 다시 선언해도 대입이
 * 그대로 성립한다 — `RouteErrorBoundary`가 `route-error-kind.ts`로 같은 문제를 푼 것과 동일한
 * 패턴이다.
 */
type ActionErrorCode = "not_found" | "forbidden" | "conflict" | "validation_failed";

/** `ActionErrorCode` → 표시 문구. 기존 전역 오류 어휘(`strings.error.*`)를 그대로 재사용한다
 *  (Task 014와 같은 어휘 — 새 오류 분류 체계를 만들지 않는다). */
const ERROR_CONTENT: Record<ActionErrorCode, { title: string; description: string }> = {
  not_found: strings.error.notFound,
  forbidden: strings.error.forbidden,
  conflict: strings.error.conflict,
  validation_failed: strings.error.validationFailed,
};

/**
 * 게시글 수정·삭제 액션(FR-032). 유일한 클라이언트 경계 — 인라인 편집 폼 상태와 삭제 확인
 * Dialog를 소유한다. 권한 판정(`canEdit`·`canDelete`)은 컨테이너가 `lib/rules/permission.ts`로
 * 이미 계산해 props로 내려준 값을 그대로 쓴다 — 여기서 role·context를 다시 판정하지 않는다.
 *
 * Server Action(`updatePostAction`/`deletePostAction`)이 요청 자체를 다시 권한 검증하므로
 * (Server Function은 UI를 거치지 않고 직접 POST될 수 있다), 이 컴포넌트가 보여주는 버튼은
 * "겉보기 허용"일 뿐이고 최종 판정은 그쪽이다 — 그래서 실패 응답(`DataResult.error`)을 항상
 * 화면에 그린다.
 */
export function PostActions({
  crewId,
  postId,
  initialTitle,
  initialBody,
  canEdit,
  canDelete,
  canReport,
}: PostActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [errorCode, setErrorCode] = useState<ActionErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit && !canDelete && !canReport) {
    return null;
  }

  function handleSave() {
    setErrorCode(null);
    startTransition(async () => {
      const result = await updatePostAction({ crewId, postId, title, body });
      if (!result.ok) {
        setErrorCode(result.error.code);
        return;
      }
      setEditing(false);
    });
  }

  function handleCancelEdit() {
    setTitle(initialTitle);
    setBody(initialBody);
    setErrorCode(null);
    setEditing(false);
  }

  function handleDelete() {
    setErrorCode(null);
    startTransition(async () => {
      const result = await deletePostAction({ crewId, postId });
      if (!result.ok) {
        setErrorCode(result.error.code);
        return;
      }
      router.push(getBoardListHref(crewId));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {errorCode && (
        <ErrorState
          title={ERROR_CONTENT[errorCode].title}
          description={ERROR_CONTENT[errorCode].description}
        />
      )}

      {editing ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <Field>
            <FieldLabel htmlFor={`post-edit-title-${postId}`}>
              {strings.board.write.fields.title}
            </FieldLabel>
            <Input
              id={`post-edit-title-${postId}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={pending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`post-edit-body-${postId}`}>
              {strings.board.write.fields.description}
            </FieldLabel>
            <Textarea
              id={`post-edit-body-${postId}`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={pending}
              rows={6}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={pending}>
              {strings.common.actions.cancel}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={pending}>
              {strings.common.actions.save}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              {strings.common.actions.edit}
            </Button>
          )}
          {canDelete && (
            <Dialog>
              <DialogTrigger render={<Button variant="destructive" size="sm" />}>
                {strings.common.actions.delete}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{strings.board.detail.deleteConfirmTitle}</DialogTitle>
                  <DialogDescription>{strings.board.detail.deleteConfirmDescription}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    {strings.common.actions.cancel}
                  </DialogClose>
                  <Button variant="destructive" onClick={handleDelete} disabled={pending}>
                    {strings.common.actions.delete}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {canReport && <ReportDialog targetType="post" targetId={postId} />}
        </div>
      )}
    </div>
  );
}
