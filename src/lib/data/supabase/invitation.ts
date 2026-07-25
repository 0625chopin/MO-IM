import "server-only";

import type { Id, Invitation, InvitationStatus } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { toInvitation } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * Invitation 실데이터 구현 (Task 031 읽기 + Task 032 쓰기, FR-020 초대 발급·FR-021 수락·거절).
 *
 * **crew_memberships 동기화는 이 레이어가 하지 않는다** — `trg_invitations_provision_membership`
 * (AFTER INSERT)이 초대 발급 시 `invited` 멤버십을, `trg_invitations_sync_membership_on_response`
 * (AFTER UPDATE)이 수락/거절 시 `active`/`declined` 전이를 **자동으로** 처리한다
 * (`rls-policies-029a.md` §5 표). Mock은 이 동기화를 `lib/actions/`가 별도 함수
 * (`initiateCrewMembership`·`acceptCrewInvitationMembership`·`declineCrewInvitationMembership`)
 * 로 명시 호출했지만, 실 DB에서는 그 함수들을 호출하면 트리거가 이미 끝낸 전이를 다시
 * 시도하다 상태 불일치로 막힌다 — Server Action(`invite-crew-member.ts`·
 * `respond-to-invitation.ts`)에서 그 호출을 제거했다.
 */

export async function getInvitationById(id: Id): Promise<Invitation | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toInvitation(data) : null;
}

export async function listInvitationsForProfile(
  inviteeId: Id,
  status?: InvitationStatus,
): Promise<Invitation[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("invitations").select("*").eq("invitee_id", inviteeId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toInvitation);
}

export async function listInvitationsForCrew(
  crewId: Id,
  status?: InvitationStatus,
): Promise<Invitation[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("invitations").select("*").eq("crew_id", crewId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toInvitation);
}

export interface CreateInvitationInput {
  crewId: Id;
  inviteeId: Id;
  inviterId: Id;
  /** ISO 8601. 호출자가 "발급 후 14일"(요구사항 2.2절 용어집) 계산 결과를 넘긴다. */
  expiresAt: string;
}

/** 초대 발급(FR-020). `invitations_insert_staff_or_owner` RLS가 오너·임원만 허용한다. */
export async function createInvitation(input: CreateInvitationInput): Promise<Invitation> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invitations")
    .insert({
      crew_id: input.crewId,
      invitee_id: input.inviteeId,
      inviter_id: input.inviterId,
      expires_at: input.expiresAt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toInvitation(data);
}

/**
 * 초대 수락·거절(FR-021). 조건부 UPDATE(`.eq("status","pending")`)로 이미 응답했거나 만료된
 * 초대는 conflict — 동시에 두 번 응답하는 경쟁도 이 조건으로 막힌다(D-019와 같은 원리).
 */
export async function respondToInvitation(
  id: Id,
  response: Extract<InvitationStatus, "accepted" | "declined">,
): Promise<DataResult<Invitation>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invitations")
    .update({ status: response })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return err("conflict", `invitation ${id} 는 이미 처리됐거나 존재하지 않는다.`);
  return ok(toInvitation(data));
}
