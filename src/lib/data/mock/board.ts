import type { Board, Id, Post, PostType } from "@/lib/types";

import { type CursorPage, type DataResult, err, ok } from "../contracts";

import { generateId, store } from "./fixtures";

/** Board·Post 데이터 접근 (FR-030~032·034). Comment(FR-033)는 v0.2라 다루지 않는다. */

export async function getBoardByCrewId(crewId: Id): Promise<Board | null> {
  return store.boards.find((b) => b.crewId === crewId) ?? null;
}

/** id 역방향 조회 — 채팅 게시글 카드(PostLinkCard, Task 020C)가 `Post.boardId`에서 소속
 *  크루를 알아낼 때 쓴다(FR-052 E1 "다른 크루" 판정, R-016 — 저장은 리소스 ID만). */
export async function getBoardById(id: Id): Promise<Board | null> {
  return store.boards.find((b) => b.id === id) ?? null;
}

export interface ListPostsQuery {
  type?: PostType;
  /** 이전 페이지 마지막 항목의 id. 그보다 오래된(작성일 기준) 게시글부터 반환한다. */
  cursor?: Id | null;
  limit?: number;
}

/** 게시글 목록(FR-031), 최신순, 커서 페이지네이션. 삭제된 게시글은 제외한다. */
export async function listPosts(
  boardId: Id,
  opts: ListPostsQuery = {},
): Promise<CursorPage<Post>> {
  const limit = opts.limit ?? 20;
  const all = store.posts
    .filter((p) => p.boardId === boardId && !p.deletedAt && (!opts.type || p.type === opts.type))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const startIndex = opts.cursor ? all.findIndex((p) => p.id === opts.cursor) + 1 : 0;
  const page = all.slice(startIndex, startIndex + limit);
  const nextCursor = all[startIndex + limit] ? page[page.length - 1].id : null;
  return { items: page, nextCursor };
}

export async function getPostById(id: Id): Promise<Post | null> {
  const post = store.posts.find((p) => p.id === id);
  return post && !post.deletedAt ? post : null;
}

/** I-130(27일차, BOARD) — `supabase/board.ts`와 동일 계약(NFR-035). Mock은 DB 트리거를
 *  흉내내지 않지만(이 파일 상단 `CreatePostInput.targetMeetupId` 참고와 같은 사정), 이 조회
 *  함수 자체는 Server Action의 사전 검증이 호출하므로 양쪽 다 구현해 둔다. */
export async function findOpenRescheduleProposal(targetMeetupId: Id): Promise<Post | null> {
  const candidates = store.posts.filter(
    (p) => p.targetMeetupId === targetMeetupId && p.type === "meetup_reschedule_proposal" && !p.deletedAt,
  );
  for (const post of candidates) {
    const poll = store.polls.find((pl) => pl.postId === post.id);
    if (poll?.status === "open") return post;
  }
  return null;
}

export interface ListPostsPageQuery {
  type?: PostType;
  /** 1부터 시작. */
  page?: number;
  pageSize?: number;
}

export interface PostsPage {
  items: Post[];
  page: number;
  pageSize: number;
  /** 삭제되지 않은 전체 게시글 수 — FR-031 AC2 "총 건수" 표시 근거. */
  totalCount: number;
  totalPages: number;
}

/**
 * 게시글 목록(FR-031), 20건 페이지네이션 + 총 건수 표시(AC2)를 위한 번호 기반 조회.
 * `listPosts`(커서 기반, 위)와 나란히 둔다 — 커서 기반은 무한 스크롤류 소비자를 위해 남겨 두고,
 * 번호 페이지 UI(총 건수·페이지 이동)가 필요한 게시판 목록은 이 함수를 쓴다. 둘 다 같은 필터
 * (crewId 소속 board·삭제 제외·유형)를 적용하되 페이지네이션 방식만 다르다.
 */
export async function listPostsByPage(
  boardId: Id,
  opts: ListPostsPageQuery = {},
): Promise<PostsPage> {
  const pageSize = opts.pageSize ?? 20;
  const page = Math.max(1, opts.page ?? 1);
  const all = store.posts
    .filter((p) => p.boardId === boardId && !p.deletedAt && (!opts.type || p.type === opts.type))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const totalCount = all.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = (page - 1) * pageSize;
  const items = all.slice(start, start + pageSize);
  return { items, page, pageSize, totalCount, totalPages };
}

export interface CreatePostInput {
  boardId: Id;
  authorId: Id;
  type: PostType;
  title: string;
  body: string;
  /**
   * 아래 4개 필드는 전부 type='meetup_proposal'·'meetup_reschedule_proposal'일 때만 의미
   * 있다(FR-034, D-013).
   */
  meetupDate?: string | null;
  startTime?: string | null;
  place?: string | null;
  capacity?: number | null;
  /** I-079/FR-065 AC2(26일차, CORE) — type='meetup_reschedule_proposal'일 때만 채운다.
   *  실 DB 구현(`supabase/board.ts`)과 동일 계약(NFR-035) — 여기서는 크루·상태 스코프를
   *  검증하지 않는다(DB CHECK·트리거가 강제하는 부분을 Mock이 흉내내지 않는다). */
  targetMeetupId?: Id | null;
}

/** `general` 게시글은 모임 제안 필드 4종·`targetMeetupId`를 전부 null로 고정한다 — 유형별
 *  분기를 호출부(Server Action)에 흩어 두지 않고 이 함수 하나가 강제한다. */
export async function createPost(input: CreatePostInput): Promise<Post> {
  const isProposal = input.type === "meetup_proposal" || input.type === "meetup_reschedule_proposal";
  const isReschedule = input.type === "meetup_reschedule_proposal";
  const post: Post = {
    id: generateId("post"),
    boardId: input.boardId,
    authorId: input.authorId,
    type: input.type,
    title: input.title,
    body: input.body,
    meetupDate: isProposal ? (input.meetupDate ?? null) : null,
    startTime: isProposal ? (input.startTime ?? null) : null,
    place: isProposal ? (input.place ?? null) : null,
    capacity: isProposal ? (input.capacity ?? null) : null,
    targetMeetupId: isReschedule ? (input.targetMeetupId ?? null) : null,
    createdAt: new Date().toISOString(),
    editedAt: null,
    deletedAt: null,
  };
  store.posts.push(post);
  return post;
}

export type UpdatePostInput = Partial<Pick<Post, "title" | "body">>;

/** 게시글 수정(FR-032). `editedAt`을 갱신해 수정 표시 근거를 남긴다(D-035). */
export async function updatePost(id: Id, patch: UpdatePostInput): Promise<DataResult<Post>> {
  const post = store.posts.find((p) => p.id === id && !p.deletedAt);
  if (!post) return err("not_found", `post ${id} 를 찾을 수 없다.`);
  Object.assign(post, patch);
  post.editedAt = new Date().toISOString();
  return ok(post);
}

/** 게시글 삭제(FR-032). 소프트 삭제 — `deletedAt`만 채운다. */
export async function deletePost(id: Id): Promise<DataResult<Post>> {
  const post = store.posts.find((p) => p.id === id && !p.deletedAt);
  if (!post) return err("not_found", `post ${id} 를 찾을 수 없다.`);
  post.deletedAt = new Date().toISOString();
  return ok(post);
}
