import "server-only";

import type { Id, JoinRequest, JoinRequestStatus } from "@/lib/types";

import { toJoinRequest } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * JoinRequest 읽기 전용 실데이터 구현 (Task 031, FR-022 가입 신청 조회·FR-023 승인·반려 조회).
 * Mock(`../mock/join-request.ts`)과 동일한 시그니처(NFR-035). 쓰기(`createJoinRequest`·
 * `decideJoinRequest`·`withdrawJoinRequest`)는 Task 032 몫 — 배럴이 `../mock/join-request`에서
 * 그대로 재노출한다.
 */

export async function listJoinRequestsForCrew(
  crewId: Id,
  status?: JoinRequestStatus,
): Promise<JoinRequest[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("join_requests").select("*").eq("crew_id", crewId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toJoinRequest);
}

export async function getPendingJoinRequestForRequester(
  crewId: Id,
  requesterId: Id,
): Promise<JoinRequest | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("join_requests")
    .select("*")
    .eq("crew_id", crewId)
    .eq("requester_id", requesterId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  return data ? toJoinRequest(data) : null;
}
