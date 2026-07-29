import { notFound } from "next/navigation";

import type { PostDetailViewModel } from "@/components/board/board-view-models";
import { PostDeletedNotice } from "@/components/board/PostDeletedNotice";
import { PostDetail } from "@/components/board/PostDetail";
import { resolveBoardViewer } from "@/components/board/resolve-board-viewer";
import { getBoardByCrewId, getPollByPostId, getPostById, getProfileById, listMyBlockedProfileIds } from "@/lib/data";
import { checkPermission } from "@/lib/rules/permission";
import { hasLockedFields } from "@/lib/rules/post-edit-lock";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

/**
 * 게시글 상세 컨테이너(D-030 ①). `PostDetail`(표현)에는 이미 조인·판정을 마친
 * `PostDetailViewModel`만 내려준다.
 *
 * 판정 순서: ① 크루 자체가 없으면 404(`notFound()`) — ② `board:read` 거부는 `error.tsx`가
 * 잡는 도메인 오류(D-030 ③, `BoardListContainer`와 동일한 패턴) — ③ 게시글이 없거나
 * (`getPostById`가 소프트 삭제를 이미 걸러 null을 반환한다) 다른 크루 소속이면 "삭제된
 * 게시글" 안내(FR-032 AC4) — 이 셋은 서로 다른 사용자 경험이라 하나로 뭉뚱그리지 않는다.
 */
export async function PostDetailContainer({ crewId, postId }: { crewId: Id; postId: Id }) {
  const board = await getBoardByCrewId(crewId);
  if (!board) {
    notFound();
  }

  const { session, role } = await resolveBoardViewer(crewId);
  const readPermission = checkPermission({ role, action: "board:read" });
  if (!readPermission.allowed) {
    throw new Error("게시판을 볼 권한이 없다.", {
      cause: { code: "forbidden", message: readPermission.reason ?? "board:read denied" },
    });
  }

  const post = await getPostById(postId);
  if (!post || post.boardId !== board.id) {
    return <PostDeletedNotice crewId={crewId} />;
  }

  // I-079/FR-065 AC2 — 일정 변경 제안도 poll을 갖는 제안글 갈래다. `BoardListContainer`와
  // 같은 이유로 이 게이트를 넓힌다(넓히지 않으면 pollStatus가 항상 null로 남아 `PostDetail`의
  // 투표 상태 배지가 조용히 사라진다).
  const isProposalType = post.type === "meetup_proposal" || post.type === "meetup_reschedule_proposal";
  const [author, poll, blockedProfileIds] = await Promise.all([
    getProfileById(post.authorId),
    isProposalType ? getPollByPostId(post.id) : Promise.resolve(null),
    // FR-081 AC1(Task 042A, 20일차) — BoardListContainer와 같은 패턴.
    listMyBlockedProfileIds(),
  ]);

  const isSelf = session.status === "authenticated" && session.profileId === post.authorId;
  const canEditTitleBody = checkPermission({
    role,
    action: "post:update_own",
    context: { isSelf },
  }).allowed;
  const canDeleteOwn = checkPermission({ role, action: "post:delete_own", context: { isSelf } }).allowed;
  const canDeleteAny = checkPermission({ role, action: "post:delete_any" }).allowed;
  // FR-080(I-117 해소, 25일차) — 본인 글에는 신고 버튼을 보여주지 않는다(`MemberList`의
  // `canReportOrBlock: !isSelf`와 같은 원칙). `report:create`는 로그인한 회원 전체에 allow라
  // 역할 판정보다 본인 여부가 실질적인 게이트다.
  const canReport = checkPermission({ role, action: "report:create" }).allowed && !isSelf;

  const viewModel: PostDetailViewModel = {
    id: post.id,
    title: post.title,
    body: post.body,
    type: post.type,
    authorDisplayName: author?.displayName ?? strings.common.profile.unknownAuthor,
    authorAvatarUrl: author?.avatarUrl ?? null,
    createdAt: post.createdAt,
    editedAt: post.editedAt,
    meetupDate: post.meetupDate,
    pollStatus: poll?.status ?? null,
    canEditTitleBody,
    canDelete: canDeleteOwn || canDeleteAny,
    meetupDateLocked: hasLockedFields(post.type),
    isAuthorBlocked: blockedProfileIds.includes(post.authorId),
    canReport,
  };

  return <PostDetail crewId={crewId} post={viewModel} />;
}
