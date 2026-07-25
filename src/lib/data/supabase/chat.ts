import "server-only";

import type { ChatMessage, ChatMessageType, ChatRoom, Id } from "@/lib/types";

import { type CursorPage, type DataResult, err, ok } from "../contracts";

import { toChatMessage, toChatRoom } from "./mappers";
import { createSupabaseServerClient } from "./server";

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

/** 단건 조회(FR-054, Task 041) — `deleteChatMessageAction`이 삭제 실행 전에 `senderId`로
 *  본인 여부를 판정하기 위해 쓴다(Mock 구현과 같은 이유 — 순서가 중요하다). `chat_messages_
 *  select_members` RLS가 그대로 적용된다(비소속자는 0행 → null). */
export async function getMessageById(id: Id): Promise<ChatMessage | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("chat_messages").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toChatMessage(data) : null;
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

export interface SendMessageInput {
  roomId: Id;
  senderId: Id;
  type: ChatMessageType;
  body?: string | null;
  refPostId?: Id | null;
  /** 재전송 중복 방지 키(D-030 ②). `chat_messages.client_key`가 UNIQUE라 DB가 이 멱등성을
   *  강제한다. */
  clientKey: string;
}

/**
 * 메시지 전송(FR-050·052). `clientKey`가 이미 존재하면 새로 만들지 않고 기존 메시지를
 * 그대로 반환한다(Task 020B 재전송 멱등 처리) — 유니크 제약 위반(23505)을 "이미 보낸
 * 메시지"로 해석해 재조회한다(먼저 SELECT하는 것보다 경쟁에 안전하다).
 */
export async function sendMessage(input: SendMessageInput): Promise<DataResult<ChatMessage>> {
  const supabase = await createSupabaseServerClient();

  if (input.type === "post_link" && !input.refPostId) {
    return err("validation_failed", "post_link 타입 메시지는 refPostId가 필요하다(FR-052).");
  }
  if (input.type === "text" && !input.body) {
    return err("validation_failed", "text 타입 메시지는 body가 필요하다.");
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      room_id: input.roomId,
      sender_id: input.senderId,
      type: input.type,
      body: input.type === "text" ? (input.body ?? null) : null,
      ref_post_id: input.type === "post_link" ? (input.refPostId ?? null) : null,
      client_key: input.clientKey,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: existingError } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("client_key", input.clientKey)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return ok(toChatMessage(existing));
    }
    throw error;
  }
  return ok(toChatMessage(data));
}

/** 메시지 삭제(FR-054, v0.2) — 소프트 삭제. `chat_messages_guard_delete_only` 트리거가
 *  `deletedAt` 외 컬럼 변경을 전원(발신자 포함)에게 막는다. */
export async function deleteMessage(id: Id): Promise<DataResult<ChatMessage>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return err("not_found", `message ${id} 를 찾을 수 없다.`);
  return ok(toChatMessage(data));
}
