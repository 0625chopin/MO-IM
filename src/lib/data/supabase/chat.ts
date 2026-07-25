import "server-only";

import type { ChatMessage, ChatRoom, Id } from "@/lib/types";


import { toChatMessage, toChatRoom } from "./mappers";
import { createSupabaseServerClient } from "./server";

import type { CursorPage } from "../contracts";

/**
 * ChatRoom·ChatMessage 읽기 전용 실데이터 구현 (Task 031, FR-050~053). Mock(`../mock/chat.ts`)과
 * 동일한 시그니처(NFR-035). 쓰기(`sendMessage`·`deleteMessage`)는 Task 032 몫 — 배럴이
 * `../mock/chat`에서 그대로 재노출한다. 실시간 전달은 `lib/realtime`(Task 033) 몫으로 이 파일이
 * 담당하지 않는다(Mock 버전 docstring과 동일 원칙).
 */

export async function getChatRoomByCrewId(crewId: Id): Promise<ChatRoom | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("chat_rooms")
    .select("*")
    .eq("crew_id", crewId)
    .maybeSingle();
  if (error) throw error;
  return data ? toChatRoom(data) : null;
}

export interface ListMessagesQuery {
  beforeMessageId?: Id | null;
  afterMessageId?: Id | null;
  limit?: number;
}

/**
 * 채팅 메시지 목록(FR-051), 최신순 커서 페이지네이션. `beforeMessageId`(위로 이어 로드)와
 * `afterMessageId`(재연결 누락분 보충, 페이지네이션 없이 전량)는 Mock과 같이 동시에 쓰지 않는다
 * (호출부가 방향을 하나만 고른다). 커서 앵커 조회 후 값 기반 seek을 쓰는 것은 `listPosts`와
 * 같은 패턴 — 설계 근거는 `docs/decisions/read-path-realdata-031.md` §4 참고.
 */
export async function listMessages(
  roomId: Id,
  opts: ListMessagesQuery = {},
): Promise<CursorPage<ChatMessage>> {
  const supabase = await createSupabaseServerClient();
  const limit = opts.limit ?? 50;

  if (opts.afterMessageId) {
    let query = supabase
      .from("chat_messages")
      .select("*")
      .eq("room_id", roomId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    const { data: anchor } = await supabase
      .from("chat_messages")
      .select("created_at")
      .eq("id", opts.afterMessageId)
      .maybeSingle();
    // 앵커를 못 찾으면(삭제됐거나 페이지 밖) Mock과 같이 "놓쳤을 수 있는 메시지 전체"로 과다
    // 반환한다 — 누락보다 중복(호출부가 clientKey/id로 걸러냄)이 NFR-008 방향에 맞다.
    if (anchor) query = query.gt("created_at", anchor.created_at);

    const { data, error } = await query;
    if (error) throw error;
    return { items: (data ?? []).map(toChatMessage), nextCursor: null };
  }

  let query = supabase
    .from("chat_messages")
    .select("*")
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (opts.beforeMessageId) {
    const { data: anchor } = await supabase
      .from("chat_messages")
      .select("created_at")
      .eq("id", opts.beforeMessageId)
      .maybeSingle();
    if (anchor) query = query.lt("created_at", anchor.created_at);
  }

  const { data, error } = await query.limit(limit + 1);
  if (error) throw error;
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { items: page.map(toChatMessage), nextCursor: hasMore ? page[page.length - 1].id : null };
}
