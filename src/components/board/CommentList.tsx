import { MessageSquareIcon } from "lucide-react";

import type { CommentSectionViewModel } from "@/components/board/comment-view-models";
import { CommentComposer } from "@/components/board/CommentComposer";
import { CommentItem } from "@/components/board/CommentItem";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { strings, t } from "@/lib/strings";

export interface CommentListProps {
  section: CommentSectionViewModel;
}

/**
 * 댓글 섹션(FR-033) — 게시글 상세 페이지가 `PollPanelContainer`와 나란히 붙이는 세 번째
 * 독립 블록(`CrewBoardPostPage`, `PollPanelContainer`와 같은 자리 — 이 컴포넌트 자체는
 * 순수 표현이고, 조회는 `CommentListContainer`가 한다, D-030 ①).
 *
 * AC2 "댓글 0건 → 빈 상태 문구"는 `canComment`와 무관하게 항상 같은 문구를 쓴다 — 작성
 * 가능 여부와 "지금 몇 건 있는가"는 별개 축이다.
 */
export function CommentList({ section }: CommentListProps) {
  const count = countAll(section.comments);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-foreground">
        {count > 0 ? t((s) => s.board.comment.countLabel, { count }) : strings.board.comment.title}
      </h2>

      {section.canComment && <CommentComposer crewId={section.crewId} postId={section.postId} />}

      {section.comments.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{strings.board.comment.empty}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {section.comments.map((comment) => (
            <CommentItem
              key={comment.id}
              crewId={section.crewId}
              postId={section.postId}
              comment={comment}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function countAll(comments: CommentSectionViewModel["comments"]): number {
  return comments.reduce((sum, c) => sum + 1 + c.replies.length, 0);
}
