import "server-only";

import type { Board, Id, Post, PostType } from "@/lib/types";

import { type CursorPage, type DataResult, err, ok } from "../contracts";

import { toBoard, toPost } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * Board·Post 읽기 전용 실데이터 구현 (Task 031, FR-030~032·034). Mock(`../mock/board.ts`)과
 * 동일한 시그니처·반환 타입(NFR-035). 쓰기(`createPost`·`updatePost`·`deletePost`)는 Task 032
 * 몫이라 이 파일에 없다 — 배럴(`../index.ts`)이 그 셋을 `../mock/board`에서 그대로 재노출한다.
 *
 * **RLS 0행 = not_found(단일 조회)/빈 배열(목록)** — `boards`·`posts`는 크루원 전용 SELECT
 * 정책이다(rls-policies-029a.md §5). 비크루원이 조회하면 PostgREST는 오류를 내지 않고 조용히
 * 0행을 반환한다(16일차 교훈). 이 파일의 단일 조회 함수(`getBoardByCrewId` 등)는 Mock과 같은
 * `T | null` 시그니처라 "없음"과 "권한 없음"을 구분해 표현할 자리가 애초에 없다 — 구분하려면
 * 반환 타입을 `DataResult`로 바꿔야 하는데 그러면 NFR-035(Mock과 동일 타입)가 깨지고 소비자
 * 코드(컨테이너)도 고쳐야 해서 D-030 "배럴 밖은 안 바뀐다" 원칙과 충돌한다. 그래서 이 계층에서는
 * 의도적으로 구분하지 않는다 — 근거는 `docs/decisions/read-path-realdata-031.md` §5.
 */

export async function getBoardByCrewId(crewId: Id): Promise<Board | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .eq("crew_id", crewId)
    .maybeSingle();
  if (error) throw error;
  return data ? toBoard(data) : null;
}

export async function getBoardById(id: Id): Promise<Board | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("boards").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toBoard(data) : null;
}

export interface ListPostsQuery {
  type?: PostType;
  cursor?: Id | null;
  limit?: number;
}

/**
 * 게시글 목록(FR-031), 최신순, 커서 페이지네이션. `cursor`는 이전 페이지 마지막 항목의 id다 —
 * 그 행의 `created_at`을 먼저 조회해 `created_at < 그 값`인 행만 이어서 가져온다(오프셋이 아니라
 * 값 기반 seek). 같은 밀리초에 두 게시글이 동시에 생성되는 극단적 동시성 충돌은 tie-break하지
 * 않는다 — `created_at`이 서버 `now()`(마이크로초 정밀도) 기본값이라 실무상 거의 발생하지 않는다
 * (알려진 한계, 설계 문서 §4 기록). 커서 행 자체를 못 찾으면(삭제됐거나 권한 밖) Mock의
 * `findIndex(...)===-1 → startIndex=0`과 같은 효과로 필터 없이 첫 페이지부터 반환한다.
 */
export async function listPosts(
  boardId: Id,
  opts: ListPostsQuery = {},
): Promise<CursorPage<Post>> {
  const supabase = await createSupabaseServerClient();
  const limit = opts.limit ?? 20;

  let query = supabase
    .from("posts")
    .select("*")
    .eq("board_id", boardId)
    .is("deleted_at", null);
  if (opts.type) query = query.eq("type", opts.type);
  query = query.order("created_at", { ascending: false }).order("id", { ascending: false });

  if (opts.cursor) {
    const { data: anchor } = await supabase
      .from("posts")
      .select("created_at")
      .eq("id", opts.cursor)
      .maybeSingle();
    if (anchor) query = query.lt("created_at", anchor.created_at);
  }

  const { data, error } = await query.limit(limit + 1);
  if (error) throw error;
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { items: page.map(toPost), nextCursor: hasMore ? page[page.length - 1].id : null };
}

export async function getPostById(id: Id): Promise<Post | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toPost(data) : null;
}

/**
 * I-130(27일차, BOARD) — 이 Meetup을 `target_meetup_id`로 겨냥한, 아직 종료되지 않은
 * (`polls.status='open'`) 일정 변경 제안 post가 있으면 그 post를 반환한다. DB 트리거
 * (`posts_guard_reschedule_target_scope`, I-130 확장)가 두 번째 open 제안의 INSERT/UPDATE
 * 자체를 막지만 `raise exception`이라 사전에 걸러야 한다(`create-post.ts` 상단 docstring과
 * 같은 근거 — `MeetupRescheduleContainer`(라우트 진입 시점)·`createPostAction`(제출 시점)
 * 양쪽이 이 함수를 쓴다). **종료된(closed/withdrawn) 제안은 대상이 아니다** — 한 번 부결된
 * 뒤 재제안은 정상 경로다(트리거가 `pl.status='open'`만 본다).
 *
 * `posts`→`polls` 순차 조회다(embedded select 대신) — `listEligibleVotersWithCurrentStatus`와
 * 같은 이유로 단순한 형태를 택했다. 트리거가 이미 "같은 대상 + open은 최대 1건"을 강제하므로
 * 후보가 여럿이어도 실제로 open인 것은 많아야 1건이다.
 */
export async function findOpenRescheduleProposal(targetMeetupId: Id): Promise<Post | null> {
  const supabase = await createSupabaseServerClient();
  const { data: candidates, error } = await supabase
    .from("posts")
    .select("*")
    .eq("target_meetup_id", targetMeetupId)
    .eq("type", "meetup_reschedule_proposal")
    .is("deleted_at", null);
  if (error) throw error;
  if (!candidates || candidates.length === 0) return null;

  for (const row of candidates) {
    const post = toPost(row);
    const { data: poll, error: pollError } = await supabase
      .from("polls")
      .select("status")
      .eq("post_id", post.id)
      .maybeSingle();
    if (pollError) throw pollError;
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
  totalCount: number;
  totalPages: number;
}

/** 게시글 목록(FR-031), 20건 페이지네이션 + 총 건수(AC2) — `count: "exact"` + `.range()`. */
export async function listPostsByPage(
  boardId: Id,
  opts: ListPostsPageQuery = {},
): Promise<PostsPage> {
  const supabase = await createSupabaseServerClient();
  const pageSize = opts.pageSize ?? 20;
  const page = Math.max(1, opts.page ?? 1);
  const start = (page - 1) * pageSize;

  let query = supabase
    .from("posts")
    .select("*", { count: "exact" })
    .eq("board_id", boardId)
    .is("deleted_at", null);
  if (opts.type) query = query.eq("type", opts.type);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, start + pageSize - 1);
  if (error) throw error;

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  return { items: (data ?? []).map(toPost), page, pageSize, totalCount, totalPages };
}

export interface CreatePostInput {
  boardId: Id;
  authorId: Id;
  type: PostType;
  title: string;
  body: string;
  /**
   * 아래 4개 필드는 전부 type='meetup_proposal'·'meetup_reschedule_proposal'일 때만 의미
   * 있다(FR-034, D-013). 일정 변경 제안에서는 "새로 제안하는" 값이다.
   */
  meetupDate?: string | null;
  startTime?: string | null;
  place?: string | null;
  capacity?: number | null;
  /**
   * I-079/FR-065 AC2(26일차, CORE) — type='meetup_reschedule_proposal'일 때만 채운다.
   * 이 제안이 가결되면 `finalize_closed_poll`이 새 Meetup을 만드는 대신 이 id가 가리키는
   * 기존 Meetup을 UPDATE한다. `posts_target_meetup_id_check` CHECK + `posts_guard_
   * reschedule_target_scope` 트리거(같은 크루·`confirmed` 상태만 허용)가 DB에서 강제한다 —
   * 여기서 크루·상태를 다시 확인하지 않는다(호출부가 실패하면 그대로 예외가 전파된다).
   */
  targetMeetupId?: Id | null;
}

/** `general` 게시글은 모임 제안 필드 4종·`targetMeetupId`를 전부 null로 고정한다(DB CHECK
 *  제약과도 일치). `meetup_reschedule_proposal`만 `targetMeetupId`를 싣는다. */
export async function createPost(input: CreatePostInput): Promise<Post> {
  const supabase = await createSupabaseServerClient();
  const isProposal = input.type === "meetup_proposal" || input.type === "meetup_reschedule_proposal";
  const isReschedule = input.type === "meetup_reschedule_proposal";
  const { data, error } = await supabase
    .from("posts")
    .insert({
      board_id: input.boardId,
      author_id: input.authorId,
      type: input.type,
      title: input.title,
      body: input.body,
      meetup_date: isProposal ? (input.meetupDate ?? null) : null,
      start_time: isProposal ? (input.startTime ?? null) : null,
      place: isProposal ? (input.place ?? null) : null,
      capacity: isProposal ? (input.capacity ?? null) : null,
      target_meetup_id: isReschedule ? (input.targetMeetupId ?? null) : null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toPost(data);
}

export type UpdatePostInput = Partial<Pick<Post, "title" | "body">>;

/** 게시글 수정(FR-032). `editedAt`을 갱신한다(D-035). `posts_update_author_or_staff_delete`
 *  RLS + `posts_guard_non_author_delete_only` 트리거가 본인 외의 본문 수정을 막는다. */
export async function updatePost(id: Id, patch: UpdatePostInput): Promise<DataResult<Post>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("posts")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      edited_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return err("not_found", `post ${id} 를 찾을 수 없다.`);
  return ok(toPost(data));
}

/** 게시글 삭제(FR-032). 소프트 삭제 — `deletedAt`만 채운다. */
export async function deletePost(id: Id): Promise<DataResult<Post>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return err("not_found", `post ${id} 를 찾을 수 없다.`);
  return ok(toPost(data));
}
