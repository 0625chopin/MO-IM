import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { getBoardListHref } from "@/components/board/board-links";
import { CommentListContainer } from "@/components/board/CommentListContainer";
import { CommentListSkeleton } from "@/components/board/CommentListSkeleton";
import { PostDetailContainer } from "@/components/board/PostDetailContainer";
import { PostDetailSkeleton } from "@/components/board/PostDetailSkeleton";
import { PollPanelContainer } from "@/components/poll/PollPanelContainer";
import { PollPanelSkeleton } from "@/components/poll/PollPanelSkeleton";
import { strings } from "@/lib/strings";

/**
 * 게시글 상세 페이지(SC-12, FR-031·032·033·040~045, Task 018A·019·041). 얇은 껍데기 — 실제
 * 조회·권한·잠금 판정은 `PostDetailContainer`가, 투표 UI 조립·판정은 `PollPanelContainer`가,
 * 댓글 조립·판정은 `CommentListContainer`가 한다(D-030 ①). 셋은 독립된 컨테이너라 각자
 * `Suspense` 경계를 갖는다 — 게시글 본문이 먼저 그려지고 투표·댓글 블록은 별도로 스트리밍돼도
 * 무방하다(셋 다 `getPostById`류를 각자 조회하는 약간의 중복 조회가 있지만, 표현/컨테이너
 * 분리 경계를 지키는 대가다).
 *
 * `PollPanelContainer`는 일반 게시글이거나 투표가 없으면 `null`을 반환한다 — 이 페이지는
 * "투표가 있는가"를 여기서 분기하지 않는다(FR-031 AC1 "투표 UI가 본문 아래에 함께 렌더된다").
 * `CommentListContainer`도 같은 원칙으로 게시글이 없으면(삭제됨) `null`을 반환한다.
 *
 * Next.js 16에서 `params`는 비동기다 — await 한다.
 */
export default async function CrewBoardPostPage({
  params,
}: {
  params: Promise<{ crewId: string; postId: string }>;
}) {
  const { crewId, postId } = await params;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 sm:p-6">
      <Link
        href={getBoardListHref(crewId)}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {strings.board.list.title}
      </Link>
      <Suspense fallback={<PostDetailSkeleton />}>
        <PostDetailContainer crewId={crewId} postId={postId} />
      </Suspense>
      <Suspense fallback={<PollPanelSkeleton />}>
        <PollPanelContainer crewId={crewId} postId={postId} />
      </Suspense>
      <Suspense fallback={<CommentListSkeleton />}>
        <CommentListContainer crewId={crewId} postId={postId} />
      </Suspense>
    </main>
  );
}
