import type { Id, Invitation, InvitationStatus } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { generateId, store } from "./fixtures";

/** Invitation 데이터 접근 (FR-020 초대 발급·FR-021 수락·거절). */

export interface CreateInvitationInput {
  crewId: Id;
  inviteeId: Id;
  inviterId: Id;
  /** ISO 8601. 호출자가 "발급 후 14일"(요구사항 2.2절 용어집) 계산 결과를 넘긴다. */
  expiresAt: string;
}

export async function createInvitation(input: CreateInvitationInput): Promise<Invitation> {
  const invitation: Invitation = {
    id: generateId("invitation"),
    crewId: input.crewId,
    inviteeId: input.inviteeId,
    inviterId: input.inviterId,
    status: "pending",
    expiresAt: input.expiresAt,
  };
  store.invitations.push(invitation);
  return invitation;
}

export async function getInvitationById(id: Id): Promise<Invitation | null> {
  return store.invitations.find((i) => i.id === id) ?? null;
}

/**
 * **D-073 (I-030)**: 초대 만료는 상태 전이가 아니라 **조회 필터링**으로 다룬다 — Supabase
 * 구현(`lib/data/supabase/invitation.ts`)과 동일한 규칙(D-030 "조회부만 교체" 원칙, 두
 * 구현이 갈리면 안 된다). `status === "pending"` 조회에서만 `expiresAt`이 지난 초대를
 * 제외한다 — 이미 응답이 끝난 상태를 조회할 때 만료로 걸러내면 과거 이력이 왜곡된다(이유는
 * Supabase 구현 쪽 주석 참고). ISO 8601 문자열은 사전식 비교가 시각 순서와 일치한다
 * (`invitation-response-eligibility.ts`와 같은 관례).
 */
export async function listInvitationsForProfile(
  inviteeId: Id,
  status?: InvitationStatus,
): Promise<Invitation[]> {
  const nowIso = new Date().toISOString();
  return store.invitations.filter(
    (i) =>
      i.inviteeId === inviteeId &&
      (!status || i.status === status) &&
      (status !== "pending" || i.expiresAt > nowIso),
  );
}

export async function listInvitationsForCrew(
  crewId: Id,
  status?: InvitationStatus,
): Promise<Invitation[]> {
  return store.invitations.filter((i) => i.crewId === crewId && (!status || i.status === status));
}

/** 초대 수락·거절(FR-021). 이미 응답했거나 만료된 초대에는 conflict를 반환한다. */
export async function respondToInvitation(
  id: Id,
  response: Extract<InvitationStatus, "accepted" | "declined">,
): Promise<DataResult<Invitation>> {
  const invitation = store.invitations.find((i) => i.id === id);
  if (!invitation) return err("not_found", `invitation ${id} 를 찾을 수 없다.`);
  if (invitation.status !== "pending") {
    return err("conflict", `invitation ${id} 는 이미 ${invitation.status} 상태다.`);
  }
  invitation.status = response;
  return ok(invitation);
}
