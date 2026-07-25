"use client";

import { Loader2Icon } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { strings } from "@/lib/strings";

export interface CommentFormProps {
  initialBody?: string;
  placeholder: string;
  submitLabel: string;
  pendingLabel: string;
  /** 성공하면 `true`(폼을 초기화한다), 실패하면 사용자에게 보여줄 오류 문구를 반환한다.
   *  실제 Server Action 호출·`refresh()`는 호출부(`CommentItem`) 책임 — 이 컴포넌트는 폼
   *  입력 상태만 소유한다(D-030 ①과 같은 정신을 클라이언트 서브트리 안에서도 지킨다:
   *  "무엇을 보낼지"와 "어떻게 보낼지"를 분리). */
  onSubmit: (body: string) => Promise<string | null>;
  onCancel?: () => void;
}

/**
 * 댓글 입력 폼(FR-033) — 새 댓글·답글·수정 셋이 공유한다(`PostActions.tsx`의 인라인 편집
 * 폼과 같은 직접 호출 패턴, `useActionState`/`FormData` 대신 `startTransition` + 콜백을 쓴다 —
 * 성공 시 폼을 비우는 것과 답글/수정 취소가 부모 상태(어떤 댓글에 답글 폼이 열려 있는지)와
 * 얽혀 있어 `PostActions`처럼 직접 호출이 자연스럽다).
 */
export function CommentForm({
  initialBody = "",
  placeholder,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
}: CommentFormProps) {
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const failureMessage = await onSubmit(body);
      if (failureMessage) {
        setError(failureMessage);
        return;
      }
      setBody("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        disabled={pending}
        rows={2}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            {strings.board.comment.form.cancel}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={pending || body.trim().length === 0}>
          {pending && <Loader2Icon aria-hidden="true" className="size-3.5 animate-spin" />}
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
