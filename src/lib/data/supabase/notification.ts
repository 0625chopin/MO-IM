import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Id, Notification, NotificationChannel, NotificationType } from "@/lib/types";

import { type CursorPage, type DataResult, err, ok } from "../contracts";

import { getSupabasePublicEnv } from "./env";
import { toNotification } from "./mappers";
import { createSupabaseServerClient } from "./server";

import type { Database, Json } from "./database.types";

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

/**
 * `notifications`는 INSERT RLS 정책이 아예 없다(029A §5, "서버 전용" — 클라이언트가 직접 알림을
 * 만들 수 없다). 그래서 `createNotification`만 예외적으로 service-role 클라이언트를 쓴다 —
 * `src/lib/auth/lockout.ts`(CREW)·`profile.ts`의 `createProfile`(이 파일과 같은 소유자)과 같은
 * 패턴이다. 이 클라이언트는 이 함수 밖으로 내보내지 않는다.
 */
function createSupabaseServiceRoleClient() {
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았다 — .env.local을 확인한다.");
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface CreateNotificationInput {
  recipientId: Id;
  type: NotificationType;
  channel: NotificationChannel;
  payload: Record<string, unknown>;
}

/** 알림 생성 — 투표 종료(FR-045)·가입 신청(FR-023) 등 다른 도메인 이벤트가 호출한다. */
export async function createNotification(input: CreateNotificationInput): Promise<Notification> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      recipient_id: input.recipientId,
      type: input.type,
      channel: input.channel,
      // `NotificationType`별 payload 형태가 제각각이라(I-024, 아직 discriminated union이 아니다)
      // 도메인 타입은 `Record<string, unknown>`이다 — DB의 `jsonb` 컬럼(`Json`)과 구조적으로
      // 호환되지만 TS는 `unknown` 값이 `Json`(재귀적으로 직렬화 가능해야 함)과 같다고 정적으로
      // 증명하지 못한다. 호출자가 이미 JSON 직렬화 가능한 값만 넘긴다는 전제(NFR-037)로 캐스팅한다.
      payload: input.payload as Json,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toNotification(data);
}

/**
 * 알림 읽음 처리. `notifications_update_self` RLS + `notifications_guard_read_only_self_update`
 * 트리거로 본인 소유만, `read_at`만 바꿀 수 있다 — 다른 사람의 알림 id를 넘기면 0행(안전한
 * 실패)이 되어 `forbidden`으로 표현한다. 이미 읽은 알림에 다시 호출해도 조용히 성공(멱등).
 */
export async function markNotificationRead(id: Id, recipientId: Id): Promise<DataResult<Notification>> {
  const supabase = await createSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from("notifications")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) return err("not_found", `notification ${id} 를 찾을 수 없다.`);
  if (existing.recipient_id !== recipientId) {
    return err("forbidden", `notification ${id} 는 profile ${recipientId} 소유가 아니다.`);
  }
  if (existing.read_at) return ok(toNotification(existing));

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return ok(toNotification(data));
}

/** FR-071 AC3 "모두 읽음" — 대상자의 안읽음 알림을 전부 읽음 처리하고 처리 건수를 반환한다. */
export async function markAllNotificationsRead(recipientId: Id): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", recipientId)
    .is("read_at", null)
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
}
