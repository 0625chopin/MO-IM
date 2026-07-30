import { notFound } from "next/navigation";

import { getBoardListHref } from "@/components/board/board-links";
import type { BoardPostSummary } from "@/components/board/board-view-models";
import { BoardList } from "@/components/board/BoardList";
import { resolveBoardViewer } from "@/components/board/resolve-board-viewer";
import {
  getBoardByCrewId,
  getCrewById,
  getPollByPostId,
  getProfileById,
  listMyBlockedProfileIds,
  listPostsByPage,
} from "@/lib/data";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

/**
 * 게시판 목록 컨테이너(D-030 ①) — Mock 조회를 소유한다. `BoardList`(표현)는 이 컴포넌트가
 * 조인해 넘기는 `BoardPostSummary[]`만 받는다.
 *
 * `board:read` 판정이 거부되면 `cause: { code: "forbidden" }`를 실어 던진다 — 가장 가까운
 * `error.tsx`가 `classifyError`로 이를 읽어 `RouteErrorBoundary(kind="forbidden")`를 그린다
 * (Task 014, D-030 ③). 크루 자체가 없으면(게시판도 없음) `notFound()`로 404 처리한다.
 *
 * **19일차(Task 040 UI/게이트 절반, I-066 해소)** — `canWrite`는 `post:create` role 판정에
 * `crews.status==='active'`를 추가로 요구한다. 해산된 크루는 열람(이 컨테이너의 나머지 전부)은
 * 그대로 되지만 "새 글쓰기" 버튼은 숨는다(FR-013 AC2 "과거 항목은 열람 전용으로 남는다") —
 * `(app)/crews/[crewId]/layout.tsx`의 `ArchivedCrewBanner`가 이유를 안내한다.
 *
 * **20일차(Task 042A, FR-081 AC1) — 차단한 사용자의 글은 접힘 처리한다.** `listMyBlockedProfileIds`
 * 를 한 번만 조회해 이 페이지의 모든 글 작성자와 대조한다 — 글마다 다시 조회하지 않는다
 * (N+1 방지, `getProfileById`를 글마다 부르는 것과 같은 이유로 이미 있던 패턴을 그대로 따름).
 */
export async function BoardListContainer({ crewId, page }: { crewId: Id; page: number }) {
  const board = await getBoardByCrewId(crewId);
  if (!board) {
    notFound();
  }

  const { role } = await resolveBoardViewer(crewId);
  const readPermission = checkPermission({ role, action: "board:read" });
  if (!readPermission.allowed) {
    throw new Error("게시판을 볼 권한이 없다.", {
      cause: { code: "forbidden", message: readPermission.reason ?? "board:read denied" },
    });
  }

  const crew = await getCrewById(crewId);
  const canWrite = checkPermission({ role, action: "post:create" }).allowed && crew?.status === "active";

  const blockedProfileIds = new Set(await listMyBlockedProfileIds());

  const postsPage = await listPostsByPage(board.id, { page });
  const posts: BoardPostSummary[] = await Promise.all(
    postsPage.items.map(async (post) => {
      // I-079/FR-065 AC2 — 일정 변경 제안도 poll을 갖는 제안글 갈래다. 넓히지 않으면 목록의
      // 투표 상태 배지(vote.status 재사용, board.tsx 주석 참고)가 조용히 사라진다.
      const isProposalType = post.type === "meetup_proposal" || post.type === "meetup_reschedule_proposal";
      const [author, poll] = await Promise.all([
        getProfileById(post.authorId),
        isProposalType ? getPollByPostId(post.id) : Promise.resolve(null),
      ]);
      return {
        id: post.id,
        title: post.title,
        type: post.type,
        authorDisplayName: author?.displayName ?? strings.common.profile.unknownAuthor,
        authorAvatarUrl: author?.avatarUrl ?? null,
        createdAt: post.createdAt,
        pollStatus: poll?.status ?? null,
        isAuthorBlocked: blockedProfileIds.has(post.authorId),
      };
    }),
  );

  return (
    <BoardList
      crewId={crewId}
      posts={posts}
      totalCount={postsPage.totalCount}
      page={postsPage.page}
      totalPages={postsPage.totalPages}
      canWrite={canWrite}
      writeHref={`${getBoardListHref(crewId)}/new`}
    />
  );
}
