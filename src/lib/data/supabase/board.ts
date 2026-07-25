import "server-only";

import type { Board, Id, Post, PostType } from "@/lib/types";


import { toBoard, toPost } from "./mappers";
import { createSupabaseServerClient } from "./server";

import type { CursorPage } from "../contracts";

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
