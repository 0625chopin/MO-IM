import "server-only";

import type { PostLinkCardViewModel } from "@/components/chat/post-link-card-view-models";
import { getBoardById, getPollByPostId, getPostById, getProfileById } from "@/lib/data";
import { getPollRemainingMs, isPollAwaitingClosure } from "@/lib/rules/poll-timezone";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

/**
 * 채팅 `post_link` 메시지 → `PostLinkCard` 조인(FR-052, Task 020C). `toMessageViewModel`
 * (`message-view-models.ts`)이 이 함수를 호출한다 — `MessageListContainer`·
 * `load-earlier-messages.ts`·`resync-chat-messages.ts` 세 호출부가 공유하는 조인 로직을 한
 * 곳에 모아 둔 그 원칙을 그대로 잇는다.
 *
 * 다른 크루 게시글(FR-052 E1)은 전송 시점(`sendMessage`)에 걸러지는 게 정상 흐름이지만, 이
 * 함수는 그 가정에 기대지 않고 매번 `Post.boardId → Board.crewId`를 다시 조인해 확인한다 —
 * RLS가 2차 방어선으로 거부할 수 있다는 `lib/data/contracts.ts`의 `forbidden` 코드 설계 이유와
 * 같다(D-030 ③, `contracts.ts` 모듈 docstring 참고). `viewerCrewId`는 항상 이 메시지가 속한
 * 채팅방의 크루(`ChatRoom.crewId`)다 — 방 하나는 크루 하나에 고정이므로 호출부가 그대로 넘긴다.
 */
export async function resolvePostLinkCard(
  refPostId: Id,
  viewerCrewId: Id,
): Promise<PostLinkCardViewModel> {
  const post = await getPostById(refPostId);
  if (!post) return { kind: "deleted" };

  const board = await getBoardById(post.boardId);
  if (!board || board.crewId !== viewerCrewId) return { kind: "forbidden" };

  // I-079/FR-065 AC2 — 일정 변경 제안도 poll을 갖는 제안글 갈래다(§4.1). 넓히지 않으면
  // 공유된 카드에서 투표 상태·남은 시간이 조용히 사라진다.
  const isProposalType = post.type === "meetup_proposal" || post.type === "meetup_reschedule_proposal";
  const [author, poll] = await Promise.all([
    getProfileById(post.authorId),
    isProposalType ? getPollByPostId(post.id) : Promise.resolve(null),
  ]);

  const nowIso = new Date().toISOString();

  return {
    kind: "post",
    crewId: viewerCrewId,
    postId: post.id,
    postType: post.type,
    title: post.title,
    authorDisplayName: author?.displayName ?? strings.common.profile.unknownAuthor,
    authorAvatarUrl: author?.avatarUrl ?? null,
    poll: poll
      ? {
          status: poll.status,
          closesAt: poll.closesAt,
          remainingMs: getPollRemainingMs(poll.closesAt, nowIso),
          isAwaitingClosure: isPollAwaitingClosure(poll.status, poll.closesAt, nowIso),
        }
      : null,
  };
}
