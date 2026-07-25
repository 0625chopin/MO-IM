import "server-only";

import type { Id, JoinRequest, JoinRequestStatus } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { toJoinRequest } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * JoinRequest 실데이터 구현 (Task 031 읽기 + Task 032 쓰기, FR-022 가입 신청·FR-023 승인·반려).
 *
 * **`join_requests`에는 `invitations`의 `trg_invitations_provision_membership` 같은 자동
 * 프로비저닝 트리거가 없다**(실측, `rls-policies-029a.md`·`029b.md`에 없음 확인) — 최초 신청
 * 시 `crew_memberships`(status='requested') 행을 이 레이어가 직접 만든다. 승인/반려는
 * `trg_join_requests_sync_membership_on_decision`(AFTER UPDATE)이 자동 동기화하므로 이
 * 레이어가 다시 건드리지 않는다. 철회(자진, FR-022 E4)는 그 트리거의 대상이 아니라서 역시
 * 이 레이어가 직접 되돌린다 — `crew_memberships_guard_self_transition`이 Task 032
 * 마이그레이션(`crew_memberships_extend_self_service_join_request_transitions`)으로
 * `requested→rejected`(자진 철회)·`(declined|rejected|left|removed)→requested`(재신청) 자기
 * 전이를 허용하도록 확장됐다 — 이 확장 없이는 아래 쓰기가 트리거 예외로 막힌다.
 *
 * **FR-023 동시 승인 방지**: `decideJoinRequest`는 `.eq("status","pending")` 조건부 UPDATE를
 * 쓴다 — D-019와 같은 원리(행 락 획득 후 WHERE 재평가)로, 두 임원이 동시에 승인/반려를
 * 시도해도 먼저 커밋한 쪽만 0행이 아닌 결과를 받는다.
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

const REACTIVATABLE_MEMBERSHIP_STATUSES = ["declined", "rejected", "left", "removed"] as const;

export interface CreateJoinRequestInput {
  crewId: Id;
  requesterId: Id;
  message?: string | null;
}

/** 같은 크루에 대기 중인 신청이 이미 있으면 conflict — 중복 신청 방지(Mock과 동일 규칙). */
export async function createJoinRequest(
  input: CreateJoinRequestInput,
): Promise<DataResult<JoinRequest>> {
  const supabase = await createSupabaseServerClient();

  const { data: duplicate, error: duplicateError } = await supabase
    .from("join_requests")
    .select("id")
    .eq("crew_id", input.crewId)
    .eq("requester_id", input.requesterId)
    .eq("status", "pending")
    .maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) {
    return err("conflict", `crew ${input.crewId} 에 이미 대기 중인 가입 신청이 있다.`);
  }

  const { data, error } = await supabase
    .from("join_requests")
    .insert({ crew_id: input.crewId, requester_id: input.requesterId, message: input.message ?? null })
    .select("*")
    .single();
  if (error) throw error;

  const { data: existingMembership, error: membershipReadError } = await supabase
    .from("crew_memberships")
    .select("status")
    .eq("crew_id", input.crewId)
    .eq("profile_id", input.requesterId)
    .maybeSingle();
  if (membershipReadError) throw membershipReadError;

  if (!existingMembership) {
    const { error: insertMembershipError } = await supabase
      .from("crew_memberships")
      .insert({ crew_id: input.crewId, profile_id: input.requesterId, role: "member", status: "requested" });
    if (insertMembershipError) throw insertMembershipError;
  } else if (
    REACTIVATABLE_MEMBERSHIP_STATUSES.includes(
      existingMembership.status as (typeof REACTIVATABLE_MEMBERSHIP_STATUSES)[number],
    )
  ) {
    const { error: reactivateError } = await supabase
      .from("crew_memberships")
      .update({ role: "member", status: "requested", removed_reason: null })
      .eq("crew_id", input.crewId)
      .eq("profile_id", input.requesterId);
    if (reactivateError) throw reactivateError;
  }
  // else: 이미 active/invited/requested — 호출자(evaluateJoinRequestEligibility, lib/rules)가
  // 먼저 걸렀어야 하는 상태다. join_requests 행은 이미 생성됐으니 조용히 건너뛴다.

  return ok(toJoinRequest(data));
}

/** 가입 신청 승인·반려(FR-023). 조건부 UPDATE로 동시 처리 시 선행 요청만 유효하게 한다. */
export async function decideJoinRequest(
  id: Id,
  decision: Extract<JoinRequestStatus, "approved" | "rejected">,
  decidedBy: Id,
): Promise<DataResult<JoinRequest>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("join_requests")
    .update({ status: decision, decided_by: decidedBy })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    // 0행 = 이미 처리됐거나 존재하지 않는다 — 이 레이어의 "0행=안전한 실패" 원칙
    // (read-path-realdata-031.md §4)을 따라 conflict로 통일한다(Mock도 "이미 처리됨"만
    // conflict였고 not_found는 별도였으나, 실데이터는 경쟁 조건이 실제로 있어 구분보다
    // 안전한 실패 쪽을 우선한다).
    return err("conflict", `join request ${id} 는 이미 처리됐거나 존재하지 않는다.`);
  }
  // trg_join_requests_sync_membership_on_decision이 crew_memberships를 자동 동기화한다.
  return ok(toJoinRequest(data));
}

/** 가입 신청 철회(FR-022 E4). 요청한 본인만 철회할 수 있다 — 조회 조건 자체가 게이트다. */
export async function withdrawJoinRequest(
  id: Id,
  requesterId: Id,
): Promise<DataResult<JoinRequest>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("join_requests")
    .update({ status: "withdrawn" })
    .eq("id", id)
    .eq("requester_id", requesterId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return err("not_found", `join request ${id} 를 찾을 수 없다.`);

  // join_requests에는 철회 동기화 트리거가 없다 — crew_memberships를 이 레이어가 직접
  // 되돌린다(I-039 근사와 동일하게 rejected로, 위 모듈 docstring 참고).
  const { error: membershipError } = await supabase
    .from("crew_memberships")
    .update({ status: "rejected" })
    .eq("crew_id", data.crew_id)
    .eq("profile_id", requesterId)
    .eq("status", "requested");
  if (membershipError) throw membershipError;

  return ok(toJoinRequest(data));
}
