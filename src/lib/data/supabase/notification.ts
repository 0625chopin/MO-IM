import "server-only";

import type { Id, Notification } from "@/lib/types";


import { toNotification } from "./mappers";
import { createSupabaseServerClient } from "./server";

import type { CursorPage } from "../contracts";

/**
 * Notification 읽기 전용 실데이터 구현 (Task 031, FR-070 토스트·FR-071 알림 센터).
 * Mock(`../mock/notification.ts`)과 동일한 시그니처(NFR-035). 쓰기(`createNotification`·
 * `markNotificationRead`·`markAllNotificationsRead`)는 Task 032 몫 — 배럴이
 * `../mock/notification`에서 그대로 재노출한다. `notifications` INSERT 정책 자체가 없어(서버
 * 전용, 029A §5) 쓰기는 어차피 `service_role` 경로가 필요하다 — Task 032가 그 클라이언트를
 * 만든다.
 */

export interface ListNotificationsQuery {
  unreadOnly?: boolean;
  cursor?: Id | null;
  limit?: number;
}

export async function listNotificationsForProfile(
  recipientId: Id,
  opts: ListNotificationsQuery = {},
): Promise<CursorPage<Notification>> {
  const supabase = await createSupabaseServerClient();
  const limit = opts.limit ?? 20;

  let query = supabase.from("notifications").select("*").eq("recipient_id", recipientId);
  if (opts.unreadOnly) query = query.is("read_at", null);
  query = query.order("created_at", { ascending: false }).order("id", { ascending: false });

  if (opts.cursor) {
    const { data: anchor } = await supabase
      .from("notifications")
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
  return { items: page.map(toNotification), nextCursor: hasMore ? page[page.length - 1].id : null };
}

/** FR-071 AC1 "헤더 배지" — 안읽음 개수만 필요한 호출부를 위한 가벼운 카운트(head:true, 행 미전송). */
export async function countUnreadNotifications(recipientId: Id): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_id", recipientId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}
