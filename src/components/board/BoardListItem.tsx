import Link from "next/link";

import { getPostDetailHref } from "@/components/board/board-links";
import { BOARD_LIST_VISIBLE_POLL_STATUSES, type BoardPostSummary } from "@/components/board/board-view-models";
import { formatPostDate } from "@/components/board/format-post-date";
import { PollStatusBadge } from "@/components/board/PollStatusBadge";
import { PostTypeBadge } from "@/components/board/PostTypeBadge";
import { BlockedContentNotice } from "@/components/moderation/BlockedContentNotice";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Id } from "@/lib/types";

/**
 * 게시판 목록의 카드 한 줄. 순수 표현 — `lib/data`를 참조하지 않고 조인된 값만 props로 받는다.
 *
 * **FR-081 AC1(Task 042A, 20일차)** — `post.isAuthorBlocked`면 카드 전체(제목·작성자·날짜)를
 * `BlockedContentNotice`로 감싼다. 카드 전체를 감싸는 이유는 이 카드가 통째로 `<Link>`라서다 —
 * `BlockedContentNotice` 내부의 "펼치기" 버튼(`<button>`)을 `<a>` 안에 중첩하면 상호작용
 * 요소 중첩이 되어 HTML 시맨틱·접근성이 깨진다(NFR-021). 그래서 접혔을 때는 `<Link>` 자체를
 * DOM에서 아예 빼고(`BlockedContentNotice`의 `children`로 통째로 넘겨 조건부 렌더), 펼친
 * 뒤에만 평소와 같은 클릭 가능한 카드가 나타난다.
 */
export function BoardListItem({ crewId, post }: { crewId: Id; post: BoardPostSummary }) {
  const showPollBadge =
    post.pollStatus !== null && BOARD_LIST_VISIBLE_POLL_STATUSES.includes(post.pollStatus);

  const card = (
    <Link
      href={getPostDetailHref(crewId, post.id)}
      className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="transition-colors hover:bg-muted/40">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-1.5">
            <PostTypeBadge type={post.type} />
            {showPollBadge && post.pollStatus && <PollStatusBadge status={post.pollStatus} />}
          </div>
          <CardTitle className="truncate">{post.title}</CardTitle>
        </CardHeader>
        <CardFooter className="justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              {post.authorAvatarUrl && <AvatarImage src={post.authorAvatarUrl} alt="" />}
              <AvatarFallback>{post.authorDisplayName.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <span className="truncate">{post.authorDisplayName}</span>
          </div>
          <time dateTime={post.createdAt} className="tnum shrink-0">
            {formatPostDate(post.createdAt)}
          </time>
        </CardFooter>
      </Card>
    </Link>
  );

  if (post.isAuthorBlocked) {
    return <BlockedContentNotice>{card}</BlockedContentNotice>;
  }
  return card;
}
