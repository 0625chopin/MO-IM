import type { CommentItemView, CommentSectionViewModel } from "@/components/board/comment-view-models";
import { CommentList } from "@/components/board/CommentList";
import { resolveBoardViewer } from "@/components/board/resolve-board-viewer";
import { getPostById, getProfileById, listCommentsByPost, listMyBlockedProfileIds } from "@/lib/data";
import { canReplyToComment } from "@/lib/rules/comment-depth";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";
import type { Comment, Id } from "@/lib/types";

export interface CommentListContainerProps {
  crewId: Id;
  postId: Id;
}

/**
 * 댓글 섹션 컨테이너(D-030 ①, Task 041, FR-033). `PollPanelContainer`와 같은 자리 —
 * `CrewBoardPostPage`가 `PostDetailContainer`·`PollPanelContainer`와 나란히 세 번째
 * `Suspense` 경계로 조립한다(페이지 조립부는 이 파일이 아니라 `page.tsx`에서 고친다).
 *
 * **크루원 게이트를 다시 하지 않는다** — `PollPanelContainer` 모듈 docstring과 같은 이유
 * (`(app)/crews/[crewId]/layout.tsx`, D-039). `comment:create`·`comment:update_own`·
 * `comment:delete_own`·`comment:delete_any` **세분 권한**만 이 컨테이너가 판정한다.
 *
 * 게시글이 없거나 삭제됐으면(`getPostById`가 이미 소프트 삭제를 걸러 null) 아무것도
 * 그리지 않는다 — `PostDetailContainer`가 이미 "삭제된 게시글" 안내를 그 자리에서 보여주므로,
 * 이 컨테이너까지 빈 댓글 섹션을 덧붙이면 중복 정보가 된다.
 */
export async function CommentListContainer({ crewId, postId }: CommentListContainerProps) {
  const post = await getPostById(postId);
  if (!post) {
    return null;
  }

  const { session, role } = await resolveBoardViewer(crewId);
  const canComment = checkPermission({ role, action: "comment:create" }).allowed;
  const canDeleteAny = checkPermission({ role, action: "comment:delete_any" }).allowed;

  const [comments, blockedProfileIds] = await Promise.all([
    listCommentsByPost(postId),
    listMyBlockedProfileIds(),
  ]);

  const authorIds = [...new Set(comments.map((c) => c.authorId))];
  const authors = await Promise.all(authorIds.map((id) => getProfileById(id)));
  const authorById = new Map(authors.filter((a) => a !== null).map((a) => [a.id, a]));
  const blockedSet = new Set(blockedProfileIds);

  function toView(comment: Comment, replies: CommentItemView[]): CommentItemView {
    const author = authorById.get(comment.authorId);
    const isSelf = session.status === "authenticated" && session.profileId === comment.authorId;
    const canEdit =
      !comment.deletedAt &&
      checkPermission({ role, action: "comment:update_own", context: { isSelf } }).allowed;
    const canDeleteOwn = checkPermission({
      role,
      action: "comment:delete_own",
      context: { isSelf },
    }).allowed;

    return {
      id: comment.id,
      authorDisplayName: author?.displayName ?? strings.common.profile.unknownAuthor,
      authorAvatarUrl: author?.avatarUrl ?? null,
      body: comment.body,
      isDeleted: comment.deletedAt !== null,
      // FR-081 AC1 — 삭제된 댓글은 본문을 어차피 안 보여주므로 접힘 표시가 무의미하다.
      isAuthorBlocked: !comment.deletedAt && blockedSet.has(comment.authorId),
      canEdit,
      canDelete: !comment.deletedAt && (canDeleteOwn || canDeleteAny),
      canReply: canComment && canReplyToComment(comment),
      replies,
    };
  }

  // depth 1 트리 구성 — 최상위(parentId===null)만 자식을 갖는다. `canReplyToComment`가 쓰기
  // 시점에 이미 depth 2를 막으므로, 여기서는 "부모가 최상위가 아닌 답글"이 실제로 없다는
  // 전제로 단순 그룹핑만 한다(방어적으로 depth 2 이상이 섞여 있어도 그 항목의 자식은 버려진다
  // — `repliesByParentId`에서 한 번만 조회하기 때문).
  const repliesByParentId = new Map<Id, Comment[]>();
  for (const comment of comments) {
    if (comment.parentId === null) continue;
    const list = repliesByParentId.get(comment.parentId) ?? [];
    list.push(comment);
    repliesByParentId.set(comment.parentId, list);
  }

  const topLevel = comments
    .filter((c) => c.parentId === null)
    .map((c) =>
      toView(
        c,
        (repliesByParentId.get(c.id) ?? []).map((reply) => toView(reply, [])),
      ),
    );

  const viewModel: CommentSectionViewModel = {
    postId,
    crewId,
    canComment,
    comments: topLevel,
  };

  return <CommentList section={viewModel} />;
}
