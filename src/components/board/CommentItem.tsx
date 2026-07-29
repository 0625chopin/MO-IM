"use client";

import { useState } from "react";

import type { CommentItemView } from "@/components/board/comment-view-models";
import { CommentForm } from "@/components/board/CommentForm";
import { BlockedContentNotice } from "@/components/moderation/BlockedContentNotice";
import { ReportDialog } from "@/components/moderation/ReportDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { createCommentAction } from "@/lib/actions/create-comment";
import { deleteCommentAction } from "@/lib/actions/delete-comment";
import { updateCommentAction } from "@/lib/actions/update-comment";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

/** `lib/data/contracts`의 `DataErrorCode`와 값이 같은 로컬 유니온(zone 4, `CommentComposer.tsx`
 *  와 같은 이유) → 표시 문구. `PostActions.tsx`의 `ERROR_CONTENT`와 같은 자리지만 댓글 전용
 *  어휘(`board.comment.errors`)를 쓴다 — 게시글과 댓글은 같은 개체가 아니다(§4). */
type CommentActionErrorCode = "not_found" | "forbidden" | "conflict" | "validation_failed";

const ERROR_MESSAGE: Record<CommentActionErrorCode, string> = {
  not_found: strings.board.comment.errors.notFound,
  forbidden: strings.board.comment.errors.forbidden,
  conflict: strings.board.comment.errors.submitFailed,
  validation_failed: strings.board.comment.errors.bodyRequired,
};

export interface CommentItemProps {
  crewId: Id;
  postId: Id;
  comment: CommentItemView;
  /** 답글은 이 컴포넌트를 재귀 호출하지 않는다(depth 1) — 답글 자신의 `replies`는 항상
   *  빈 배열이므로 실질적으로 재귀가 한 단계에서 멈춘다. `isReply`는 시각적 들여쓰기만 결정한다. */
  isReply?: boolean;
}

/**
 * 댓글 하나(FR-033) — 본문·작성자·수정/삭제/답글 액션을 갖는 상호작용 단위. `PostActions.tsx`
 * 와 같은 자리(순수 표현이 아니라 "이미 판정된 권한 플래그를 받아 그 범위 안에서 상호작용을
 * 소유하는" 클라이언트 리프) — `CommentList`(부모, 서버 컴포넌트)가 이 컴포넌트를 자식으로
 * 그린다.
 */
export function CommentItem({ crewId, postId, comment, isReply = false }: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleEditSubmit(body: string): Promise<string | null> {
    const result = await updateCommentAction({ crewId, commentId: comment.id, body });
    if (!result.ok) return ERROR_MESSAGE[result.error.code];
    setEditing(false);
    return null;
  }

  async function handleReplySubmit(body: string): Promise<string | null> {
    const result = await createCommentAction({ crewId, postId, parentId: comment.id, body });
    if (!result.ok) return ERROR_MESSAGE[result.error.code];
    setReplying(false);
    return null;
  }

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    const result = await deleteCommentAction({ crewId, commentId: comment.id });
    setDeleting(false);
    if (!result.ok) {
      setError(ERROR_MESSAGE[result.error.code]);
    }
  }

  const body = comment.isDeleted ? (
    <p className="text-sm text-muted-foreground italic">{strings.board.comment.deletedPlaceholder}</p>
  ) : (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{comment.body}</p>
  );

  return (
    <div className={isReply ? "flex flex-col gap-2 border-l border-border pl-4" : "flex flex-col gap-2"}>
      <div className="flex items-start gap-2.5">
        <Avatar size="sm" className="mt-0.5 shrink-0">
          {comment.authorAvatarUrl && <AvatarImage src={comment.authorAvatarUrl} alt="" />}
          <AvatarFallback>{comment.authorDisplayName.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-foreground">{comment.authorDisplayName}</span>

          {editing ? (
            <CommentForm
              initialBody={comment.body}
              placeholder={strings.board.comment.form.placeholder}
              submitLabel={strings.board.comment.actions.save}
              pendingLabel={strings.board.comment.form.submitPending}
              onSubmit={handleEditSubmit}
              onCancel={() => setEditing(false)}
            />
          ) : comment.isAuthorBlocked && !comment.isDeleted ? (
            <BlockedContentNotice>{body}</BlockedContentNotice>
          ) : (
            body
          )}

          {error && (
            <ErrorState
              title={strings.board.comment.errors.submitFailed}
              description={error}
            />
          )}

          {!editing && (
            <div className="flex gap-3 pt-0.5 text-xs">
              {comment.canReply && !comment.isDeleted && (
                <button
                  type="button"
                  onClick={() => setReplying((v) => !v)}
                  className="font-medium text-muted-foreground hover:text-foreground"
                >
                  {strings.board.comment.actions.reply}
                </button>
              )}
              {comment.canEdit && !comment.isDeleted && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="font-medium text-muted-foreground hover:text-foreground"
                >
                  {strings.board.comment.actions.edit}
                </button>
              )}
              {comment.canReport && (
                <ReportDialog targetType="comment" targetId={comment.id} triggerVariant="text" />
              )}
              {comment.canDelete && !comment.isDeleted && (
                <Dialog>
                  <DialogTrigger
                    render={
                      <button
                        type="button"
                        className="font-medium text-destructive hover:text-destructive/80"
                      />
                    }
                  >
                    {strings.board.comment.actions.delete}
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{strings.board.comment.actions.deleteConfirmTitle}</DialogTitle>
                      <DialogDescription>
                        {strings.board.comment.actions.deleteConfirmDescription}
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>
                        {strings.board.comment.form.cancel}
                      </DialogClose>
                      <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                        {strings.board.comment.actions.delete}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          )}

          {replying && (
            <div className="pt-1">
              <CommentForm
                placeholder={strings.board.comment.form.replyPlaceholder}
                submitLabel={strings.board.comment.form.replySubmit}
                pendingLabel={strings.board.comment.form.submitPending}
                onSubmit={handleReplySubmit}
                onCancel={() => setReplying(false)}
              />
            </div>
          )}
        </div>
      </div>

      {comment.replies.length > 0 && (
        <div className="flex flex-col gap-3">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} crewId={crewId} postId={postId} comment={reply} isReply />
          ))}
        </div>
      )}
    </div>
  );
}
