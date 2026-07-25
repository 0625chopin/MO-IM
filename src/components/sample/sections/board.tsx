import { Loader2Icon } from "lucide-react";

import type { BoardPostSummary, PostDetailViewModel } from "@/components/board/board-view-models";
import { BoardList } from "@/components/board/BoardList";
import { BoardListSkeleton } from "@/components/board/BoardListSkeleton";
import type { CommentSectionViewModel } from "@/components/board/comment-view-models";
import { CommentList } from "@/components/board/CommentList";
import { CommentListSkeleton } from "@/components/board/CommentListSkeleton";
import { PostDeletedNotice } from "@/components/board/PostDeletedNotice";
import { PostDetail } from "@/components/board/PostDetail";
import { PostDetailSkeleton } from "@/components/board/PostDetailSkeleton";
import { PostWriteForm } from "@/components/board/PostWriteForm";
import type { RouteErrorKind } from "@/components/errors/route-error-kind";
import { RouteErrorBoundaryPreview } from "@/components/errors/RouteErrorBoundaryPreview";
import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { BoardErrorStatePreview } from "@/components/sample/sections/BoardErrorStatePreview";
import { defineSection } from "@/components/sample/showcase-types";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";

/**
 * Task 018A — 게시판 목록·게시글 상세(FR-031·032) + Task 018B — 글쓰기(FR-030·034).
 * `BoardList`·`PostDetail`은 순수 표현 컴포넌트라 `lib/data`를 참조하지 않는다(D-030 ①) —
 * 아래 고정 데이터는 실제 컨테이너(`BoardListContainer`·`PostDetailContainer`)가 만드는
 * 조인 결과 모양을 그대로 손으로 채운 것이다. `PostWriteForm`은 표현/컨테이너 구분 없이
 * 그 자체가 클라이언트 경계다(`PostActions`와 같은 이유, `create-post.ts` 참고) — 여기서는
 * 실제 컴포넌트를 그대로 등록했다(`CrewCreateForm`과 같은 패턴). 실제 화면은
 * `/crews/[crewId]/board`·`/crews/[crewId]/board/[postId]`·`/crews/[crewId]/board/new`.
 *
 * "오류" 상태에는 네트워크 실패뿐 아니라 도메인 오류 4종을 각각 별도 항목으로 등록한다
 * (D-030 ③): **RLS 403**(비소속 크루의 `board:read` 거부) · **글쓰기 권한 없음**
 * (`post:create` 거부) · **삭제된 글 접근**(FR-032 AC4) · **잠금 규칙**(FR-032 AC2 — 모임
 * 제안글의 예정일은 투표와 동시 생성되어 항상 잠긴다, D-035).
 */

const SAMPLE_POSTS: BoardPostSummary[] = [
  {
    id: "post-1",
    title: "이번 주 코스 공지",
    type: "general",
    authorDisplayName: "서지훈",
    authorAvatarUrl: null,
    createdAt: "2026-07-20T09:00:00.000Z",
    pollStatus: null,
    isAuthorBlocked: false,
  },
  {
    id: "post-2",
    title: "8/1(토) 아침 러닝 어때요?",
    type: "meetup_proposal",
    authorDisplayName: "김유나",
    authorAvatarUrl: null,
    createdAt: "2026-07-22T10:00:00.000Z",
    pollStatus: "open",
    isAuthorBlocked: false,
  },
  {
    id: "post-3",
    title: "지난주 러닝 후기 및 정산",
    type: "meetup_proposal",
    authorDisplayName: "서지훈",
    authorAvatarUrl: null,
    createdAt: "2026-07-10T09:00:00.000Z",
    pollStatus: "closed_passed",
    isAuthorBlocked: false,
  },
];

/** FR-081 AC1(Task 042A, 20일차) 데모용 — 차단한 사용자의 글(`BoardListItem`이 접힘 처리). */
const SAMPLE_POSTS_WITH_BLOCKED: BoardPostSummary[] = [
  ...SAMPLE_POSTS,
  {
    id: "post-blocked-1",
    title: "차단된 사용자의 게시글 제목(펼치기 전까지 안 보임)",
    type: "general",
    authorDisplayName: "차단된사용자",
    authorAvatarUrl: null,
    createdAt: "2026-07-23T09:00:00.000Z",
    pollStatus: null,
    isAuthorBlocked: true,
  },
];

/**
 * `id`를 실제 시드 데이터(`post-2` 등)와 다른 값으로 둔다 — `/sample`에서 실제 `PostActions`를
 * 그대로 렌더하므로, 여기서 "저장"·"삭제"를 눌러 실제 Server Action이 호출돼도(NOT 시연 목적)
 * 존재하지 않는 id라 `not_found`로 끝나고 공용 Mock 스토어의 진짜 시드 게시글을 건드리지 않는다.
 */
const SAMPLE_POST_DETAIL: PostDetailViewModel = {
  id: "sample-demo-post",
  title: "8/1(토) 아침 러닝 어때요?",
  body: "다음 주 토요일 아침 7시 한강공원에서 뛰어요. 원하시는 분들은 댓글로 알려주세요!\n\n<script>는 이렇게 문자 그대로 보여야 해요(NFR-014).",
  type: "meetup_proposal",
  authorDisplayName: "김유나",
  authorAvatarUrl: null,
  createdAt: "2026-07-22T10:00:00.000Z",
  editedAt: "2026-07-22T11:30:00.000Z",
  meetupDate: "2026-08-01",
  pollStatus: "open",
  canEditTitleBody: true,
  canDelete: true,
  meetupDateLocked: true,
  isAuthorBlocked: false,
};

/** FR-081 AC1(Task 042A, 20일차) 데모용 — 차단한 사용자의 게시글 상세(본문만 접힘, 제목·작성자는
 *  그대로 — `PostDetail.tsx` docstring 참고). */
const SAMPLE_POST_DETAIL_BLOCKED: PostDetailViewModel = {
  ...SAMPLE_POST_DETAIL,
  id: "sample-demo-post-blocked",
  authorDisplayName: "차단된사용자",
  isAuthorBlocked: true,
};

/** FR-033(Task 041) 데모용 — 최상위 댓글 2건(그중 하나는 답글 1건), 삭제된 댓글 아래 답글이
 *  유지되는 AC3 사례를 함께 보여준다. */
const SAMPLE_COMMENTS: CommentSectionViewModel = {
  postId: "sample-demo-post",
  crewId: "crew-1",
  canComment: true,
  comments: [
    {
      id: "sample-comment-1",
      authorDisplayName: "박민준",
      authorAvatarUrl: null,
      body: "저도 갈게요! 몇 시까지 도착하면 될까요?",
      isDeleted: false,
      isAuthorBlocked: false,
      canEdit: false,
      canDelete: false,
      canReply: true,
      replies: [
        {
          id: "sample-comment-1-reply-1",
          authorDisplayName: "김유나",
          authorAvatarUrl: null,
          body: "7시까지 오시면 돼요, 준비운동은 각자 해오세요!",
          isDeleted: false,
          isAuthorBlocked: false,
          canEdit: true,
          canDelete: true,
          // 답글에는 다시 답글을 달 수 없다(depth 1, canReplyToComment).
          canReply: false,
          replies: [],
        },
      ],
    },
    {
      // FR-033 AC3 — 삭제된 부모 댓글 아래 답글은 그대로 유지된다.
      id: "sample-comment-2-deleted",
      authorDisplayName: "탈퇴한사용자",
      authorAvatarUrl: null,
      body: "",
      isDeleted: true,
      isAuthorBlocked: false,
      canEdit: false,
      canDelete: false,
      canReply: true,
      replies: [
        {
          id: "sample-comment-2-reply-1",
          authorDisplayName: "서지훈",
          authorAvatarUrl: null,
          body: "저도 궁금했는데 답변 감사합니다!",
          isDeleted: false,
          isAuthorBlocked: false,
          canEdit: false,
          canDelete: false,
          canReply: false,
          replies: [],
        },
      ],
    },
  ],
};

/** FR-081 AC1(Task 041) — 차단한 사용자의 댓글(I-072 "댓글은 화면 자체가 없어 남은 범위"
 *  해소). 최상위 댓글 하나의 작성자를 차단한 경우만 접는다 — 본문만 BlockedContentNotice로
 *  감싼다(작성자 이름은 그대로 보여야 신고·차단 판단이 가능하다, `CommentItem.tsx`와 같은
 *  원칙). */
const SAMPLE_COMMENTS_WITH_BLOCKED: CommentSectionViewModel = {
  ...SAMPLE_COMMENTS,
  comments: [
    {
      id: "sample-comment-blocked-1",
      authorDisplayName: "차단된사용자",
      authorAvatarUrl: null,
      body: "차단된 사용자의 댓글 내용(펼치기 전까지 안 보임)",
      isDeleted: false,
      isAuthorBlocked: true,
      canEdit: false,
      canDelete: false,
      canReply: true,
      replies: [],
    },
    ...SAMPLE_COMMENTS.comments,
  ],
};

const DOMAIN_ERROR_ITEMS: Array<{ kind: RouteErrorKind; name: string; note: string }> = [
  {
    kind: "forbidden",
    name: "게시판 접근 권한 없음 (RLS 403)",
    note: "board:read 판정 거부 — 비소속 크루의 게시판에 접근하면 이 화면이 뜬다(lib/rules/permission.ts, BoardListContainer/PostDetailContainer가 던지고 error.tsx가 받는다).",
  },
  {
    kind: "forbidden",
    name: "글쓰기 권한 없음 (post:create 거부)",
    note: "PostWriteContainer가 던진다(Task 018B) — (app)/crews/[crewId]/layout.tsx(D-039)가 크루원 여부를 이미 걸렀지만, Server Component가 다른 경로로 렌더될 가능성에 대한 방어로 컨테이너가 다시 판정한다. 실제 화면 결과는 위 게시판 접근 항목과 같다(둘 다 kind='forbidden'). 20일차 확인 — post:create는 현재 권한 매트릭스에서 crew_member 이상 전원 allow라 이 분기는 도달 불가능한 방어적 코드다(19일차 영향 범위 인벤토리 #7) — 그래서 이번 회차 전환(아래 항목) 대상에서 뺐고 여전히 throw다(I-069 근본 해결 범위 밖).",
  },
  {
    kind: "forbidden",
    name: "글쓰기 차단 — 해산된 크루 (crew_archived)",
    note: "PostWriteContainer가 값으로 직접 반환한다(20일차, I-069 근본 해결) — 해산된 크루원이 /board/new에 직접 접근하는 경로다(19일차 영향 범위 인벤토리 #4, DESIGN이 이 지점에서 I-069를 최초 발견). 예전엔 cause:{code:'forbidden', message:'crew_archived'}를 던졌지만 프로덕션에서 Next.js가 서버 컴포넌트 예외의 cause를 클라이언트로 넘기지 않아 error.tsx가 항상 오분류했다 — 지금은 <RouteErrorBoundary kind=\"forbidden\"/>을 직접 반환해 이 문제를 구조적으로 피한다. HTTP 응답은 500 대신 200이다(정상 도달 화면 상태로 취급, docs/decisions/domain-error-channel-069.md).",
  },
];

export const boardSection = defineSection({
  id: "board",
  label: "게시판",
  title: "게시판 목록·글쓰기·게시글 상세",
  description:
    "SC-10·SC-11·SC-12(FR-030·031·032·034). 목록은 유형·투표 상태 배지 + 20건 페이지네이션(AC2), 글쓰기는 유형 토글 · 모임 제안글 필드 6종 · 날짜 검증(D-013) · 임시 저장/초안 복구, 상세는 본문 · 수정/삭제 · 모임 제안글의 잠금 규칙(D-035)을 다룹니다. 투표 참여 UI 자체는 Task 019 몫이라 상태 배지만 보여줍니다.",
  items: [
    {
      name: "게시판 목록 (BoardList)",
      note: "0건이면 컴포넌트 내부에서 빈 상태로 전환됩니다(AC1). '오류'는 목록 조회 자체가 실패한 경우(AC4)입니다.",
      panels: {
        default: (
          <PreviewFrame height={520}>
            <div className="p-4">
              <BoardList
                crewId="crew-1"
                posts={SAMPLE_POSTS}
                totalCount={SAMPLE_POSTS.length}
                page={1}
                totalPages={1}
                canWrite
                writeHref="/crews/crew-1/board/new"
              />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={420}>
            <div className="p-4">
              <BoardListSkeleton rows={3} />
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={260}>
            <div className="p-4">
              <BoardList
                crewId="crew-1"
                posts={[]}
                totalCount={0}
                page={1}
                totalPages={1}
                canWrite
                writeHref="/crews/crew-1/board/new"
              />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={160}>
            <div className="p-4">
              <BoardErrorStatePreview />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "게시판 목록 — 차단한 사용자의 글 (FR-081 AC1, Task 042A)",
      note: "마지막 카드(post-blocked-1)의 작성자를 뷰어가 차단했다고 가정합니다. isAuthorBlocked=true인 글은 BlockedContentNotice로 감싸져 카드 전체(제목·작성자·날짜)가 접히고 '펼치기'를 눌러야 보입니다 — 이 카드는 목록 전체가 <Link>라(BoardListItem.tsx docstring) 접힌 동안은 클릭도 되지 않습니다. 게시판·채팅에는 이번 회차(20일차)에 배선했고, 크루원 목록(MemberList)에는 이미 배선돼 있습니다.",
      panels: {
        default: (
          <PreviewFrame height={620}>
            <div className="p-4">
              <BoardList
                crewId="crew-1"
                posts={SAMPLE_POSTS_WITH_BLOCKED}
                totalCount={SAMPLE_POSTS_WITH_BLOCKED.length}
                page={1}
                totalPages={1}
                canWrite
                writeHref="/crews/crew-1/board/new"
              />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "페이지네이션(2/5 페이지)",
      note: "총 100건 · 20건씩(AC2). 양 끝에서는 이전/다음이 비활성 표시로 바뀝니다.",
      panels: {
        default: (
          <PreviewFrame height={200}>
            <div className="p-4">
              <BoardList
                crewId="crew-1"
                posts={SAMPLE_POSTS}
                totalCount={100}
                page={2}
                totalPages={5}
                canWrite={false}
                writeHref="/crews/crew-1/board/new"
              />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "글쓰기 (PostWriteForm)",
      note: "실제 컴포넌트입니다(Task 018B). 유형 토글로 모임 제안글 필드 6종(예정일·투표 마감·시작 시각·장소·정원)이 나타납니다. /sample은 게스트 세션이라 제출하면 접근 권한 오류로 막힙니다(CrewCreateForm과 같은 패턴) — checkPermission이 실제로 작동한다는 증거입니다. 새로고침 후 다시 열면 입력 중이던 내용이 로컬 저장소에서 복구됩니다(AC2).",
      panels: {
        default: (
          <PreviewFrame height={720}>
            <div className="mx-auto w-full max-w-md p-4">
              <PostWriteForm crewId="crew-1" />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={120}>
            <div className="mx-auto flex w-full max-w-md justify-center p-4">
              <Button disabled className="w-full">
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {strings.board.write.submitPending}
              </Button>
            </div>
          </PreviewFrame>
        ),
      },
    },
    ...DOMAIN_ERROR_ITEMS.map(({ kind, name, note }) => ({
      name,
      note,
      panels: {
        error: (
          <PreviewFrame height={280}>
            <RouteErrorBoundaryPreview kind={kind} />
          </PreviewFrame>
        ),
      },
    })),
    {
      name: "게시글 상세 (PostDetail)",
      note: "모임 제안글 예시 — 유형 배지 + 투표 상태 배지(Task 019가 만들 투표 참여 UI는 여기 들어가지 않습니다) + 잠긴 모임 예정일(D-035) + 작성자 본인 기준 수정·삭제 액션.",
      panels: {
        default: (
          <PreviewFrame height={460}>
            <div className="p-4">
              <PostDetail crewId="crew-1" post={SAMPLE_POST_DETAIL} />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={280}>
            <div className="p-4">
              <PostDetailSkeleton />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={160}>
            <div className="p-4">
              <BoardErrorStatePreview />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "게시글 상세 — 타인 글 조회 (수정·삭제 버튼 없음)",
      note: "post:update_own·post:delete_own·post:delete_any가 전부 거부된 경우 — PostActions가 아무것도 렌더하지 않는다(null).",
      panels: {
        default: (
          <PreviewFrame height={420}>
            <div className="p-4">
              <PostDetail
                crewId="crew-1"
                post={{ ...SAMPLE_POST_DETAIL, canEditTitleBody: false, canDelete: false }}
              />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "게시글 상세 — 차단한 사용자의 글 (FR-081 AC1, Task 042A)",
      note: "isAuthorBlocked=true면 본문(CardContent)만 BlockedContentNotice로 감싸 접힙니다 — 제목·작성자·날짜는 그대로 보입니다(PostDetail.tsx docstring: 이미 목록에서 본 정보이고 신고 대상을 특정하려면 계속 보여야 함). 이 컴포넌트는 <Link>로 감싸여 있지 않아 BoardListItem과 달리 카드 전체를 접을 필요가 없습니다.",
      panels: {
        default: (
          <PreviewFrame height={420}>
            <div className="p-4">
              <PostDetail crewId="crew-1" post={SAMPLE_POST_DETAIL_BLOCKED} />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "게시글 상세 — 삭제된 글 (FR-032 AC4)",
      note: "getPostById가 소프트 삭제(deletedAt)를 걸러 null을 반환하면 PostDetailContainer가 이 안내를 그린다 — 채팅 공유 링크로 들어와도 동일하다.",
      panels: {
        error: (
          <PreviewFrame height={260}>
            <div className="p-4">
              <PostDeletedNotice crewId="crew-1" />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "게시글 상세 — 수정 잠금 (FR-032 AC2, D-035)",
      note: "모임 제안글의 투표는 등록과 동시에 생성되므로 '투표 시작 후' 잠금이 아니라 처음부터 무조건 잠긴다(PRD 검증 m-4). 제목·본문은 계속 수정 가능하고 모임 예정일만 잠긴다 — lib/rules/post-edit-lock.ts의 hasLockedFields가 이 배지를 켠다.",
      panels: {
        error: (
          <PreviewFrame height={460}>
            <div className="p-4">
              <PostDetail crewId="crew-1" post={SAMPLE_POST_DETAIL} />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "댓글 (CommentList, FR-033)",
      note: "최상위 댓글 2건 — 하나는 답글 1건이 달렸고, 다른 하나는 삭제된 부모 아래 답글이 그대로 유지되는 AC3 사례입니다(depth 1 제한 — 답글에는 '답글' 버튼이 없습니다). 작성 폼은 실제 CommentComposer/createCommentAction입니다 — postId가 실재하지 않는 값(sample-demo-post)이라 등록을 눌러도 'not_found' 오류만 안전하게 보여줍니다.",
      panels: {
        default: (
          <PreviewFrame height={520}>
            <div className="p-4">
              <CommentList section={SAMPLE_COMMENTS} />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={280}>
            <div className="p-4">
              <CommentListSkeleton />
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={220}>
            <div className="p-4">
              <CommentList section={{ ...SAMPLE_COMMENTS, comments: [] }} />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={160}>
            <div className="p-4">
              <BoardErrorStatePreview />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "댓글 — 차단한 사용자의 댓글 (FR-081 AC1, Task 041 — I-072 해소)",
      note: "isAuthorBlocked=true인 댓글은 본문만 BlockedContentNotice로 감싸 접힙니다 — 작성자 이름은 그대로 보여야 신고·차단 판단이 가능합니다(PostDetail·MessageBubble과 같은 원칙). I-072가 '댓글은 화면 자체가 없어 남은 범위'로 남겨 뒀던 지점을 이 회차에서 닫았습니다.",
      panels: {
        default: (
          <PreviewFrame height={520}>
            <div className="p-4">
              <CommentList section={SAMPLE_COMMENTS_WITH_BLOCKED} />
            </div>
          </PreviewFrame>
        ),
      },
    },
  ],
});
