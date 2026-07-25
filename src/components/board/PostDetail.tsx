import { LockIcon } from "lucide-react";

import type { PostDetailViewModel } from "@/components/board/board-view-models";
import { formatPostDate } from "@/components/board/format-post-date";
import { PollStatusBadge } from "@/components/board/PollStatusBadge";
import { PostActions } from "@/components/board/PostActions";
import { PostTypeBadge } from "@/components/board/PostTypeBadge";
import { BlockedContentNotice } from "@/components/moderation/BlockedContentNotice";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

/**
 * 게시글 상세(SC-12, FR-031·032). 순수 표현 컴포넌트 — 권한·잠금 **판정 결과**만 props로 받고
 * (`canEditTitleBody`·`canDelete`·`meetupDateLocked`), 판정 자체는 하지 않는다(D-030 ①,
 * NFR-036). 본문은 `{post.body}`로만 렌더한다 — `dangerouslySetInnerHTML`을 쓰지 않아 React
 * 기본 텍스트 이스케이프가 스크립트 문자열을 문자 그대로 표시한다(NFR-014, FR-030 AC3).
 *
 * **FR-081 AC1(Task 042A, 20일차)** — `post.isAuthorBlocked`면 본문(`CardContent`)만
 * `BlockedContentNotice`로 감싼다. 제목·작성자·날짜(`CardHeader`)는 그대로 둔다 — 목록에서
 * 이미 보고 클릭해 들어온 정보이고, 신고 대상을 특정하려면 누구 글인지 계속 보여야 한다.
 * `Card`가 `<Link>`로 감싸여 있지 않으므로(이 컴포넌트는 상세 페이지 자체다) `BoardListItem`
 * 과 달리 상호작용 요소 중첩 문제가 없다.
 */
export function PostDetail({ crewId, post }: { crewId: Id; post: PostDetailViewModel }) {
  const showPollBadge = post.type === "meetup_proposal" && post.pollStatus !== null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-1.5">
          <PostTypeBadge type={post.type} />
          {showPollBadge && post.pollStatus && <PollStatusBadge status={post.pollStatus} />}
        </div>
        <CardTitle className="text-xl leading-snug">{post.title}</CardTitle>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-sm text-muted-foreground">
          <Avatar size="sm">
            {post.authorAvatarUrl && <AvatarImage src={post.authorAvatarUrl} alt="" />}
            <AvatarFallback>{post.authorDisplayName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <span>{post.authorDisplayName}</span>
          <time dateTime={post.createdAt} className="tnum">
            {formatPostDate(post.createdAt)}
          </time>
          {post.editedAt && <span>{strings.board.detail.edited}</span>}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {post.type === "meetup_proposal" && post.meetupDate && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{strings.board.write.fields.scheduledDate}</span>
            <time dateTime={post.meetupDate} className="tnum">
              {post.meetupDate}
            </time>
            {post.meetupDateLocked && (
              <span className="ml-auto flex items-center gap-1 text-xs">
                <LockIcon aria-hidden="true" className="size-3.5" />
                {strings.board.detail.lockedNotice}
              </span>
            )}
          </div>
        )}

        {/* 본문 — 절대 dangerouslySetInnerHTML을 쓰지 않는다(NFR-014). */}
        {post.isAuthorBlocked ? (
          <BlockedContentNotice>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{post.body}</p>
          </BlockedContentNotice>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{post.body}</p>
        )}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-3 border-t">
        <PostActions
          crewId={crewId}
          postId={post.id}
          initialTitle={post.title}
          initialBody={post.body}
          canEdit={post.canEditTitleBody}
          canDelete={post.canDelete}
        />
      </CardFooter>
    </Card>
  );
}
