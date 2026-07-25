import "server-only";

import type { Id, Invitation, InvitationStatus } from "@/lib/types";

import { toInvitation } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * Invitation 읽기 전용 실데이터 구현 (Task 031, FR-020 초대 발급 조회·FR-021 수락·거절 조회).
 * Mock(`../mock/invitation.ts`)과 동일한 시그니처(NFR-035). 쓰기(`createInvitation`·
 * `respondToInvitation`)는 Task 032 몫 — 배럴이 `../mock/invitation`에서 그대로 재노출한다.
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
