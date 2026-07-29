import type { Id, JoinRequest, JoinRequestStatus } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { generateId, store } from "./fixtures";

/** JoinRequest 데이터 접근 (FR-022 가입 신청·FR-023 승인·반려). */

export interface CreateJoinRequestInput {
  crewId: Id;
  requesterId: Id;
  message?: string | null;
}

/** 같은 크루에 대기 중인 신청이 이미 있으면 conflict — 중복 신청 방지. */
export async function createJoinRequest(
  input: CreateJoinRequestInput,
): Promise<DataResult<JoinRequest>> {
  const duplicate = store.joinRequests.some(
    (r) => r.crewId === input.crewId && r.requesterId === input.requesterId && r.status === "pending",
  );
  if (duplicate) {
    return err("conflict", `crew ${input.crewId} 에 이미 대기 중인 가입 신청이 있다.`);
  }
  const joinRequest: JoinRequest = {
    id: generateId("join-request"),
    crewId: input.crewId,
    requesterId: input.requesterId,
    message: input.message ?? null,
    status: "pending",
    decidedBy: null,
    decidedAt: null,
  };
  store.joinRequests.push(joinRequest);
  return ok(joinRequest);
}

export async function listJoinRequestsForCrew(
  crewId: Id,
  status?: JoinRequestStatus,
): Promise<JoinRequest[]> {
  return store.joinRequests.filter((r) => r.crewId === crewId && (!status || r.status === status));
}

/**
 * 신청자 본인 관점의 대기 중 신청 1건(FR-022 AC3 "신청 대기 중 · 철회" 버튼, Task 016B).
 * `joinRequestId`를 클라이언트가 들고 있다가 넘기는 대신, 크루 id + 세션의 profileId만으로
 * 서버가 직접 찾는다 — 다른 사람의 신청 id를 추측해 넘기는 경로 자체가 없다.
 */
export async function getPendingJoinRequestForRequester(
  crewId: Id,
  requesterId: Id,
): Promise<JoinRequest | null> {
  return (
    store.joinRequests.find(
      (r) => r.crewId === crewId && r.requesterId === requesterId && r.status === "pending",
    ) ?? null
  );
}

/** 가입 신청 승인·반려(FR-023). 이미 처리된 신청은 conflict. */
export async function decideJoinRequest(
  id: Id,
  decision: Extract<JoinRequestStatus, "approved" | "rejected">,
  decidedBy: Id,
): Promise<DataResult<JoinRequest>> {
  const joinRequest = store.joinRequests.find((r) => r.id === id);
  if (!joinRequest) return err("not_found", `join request ${id} 를 찾을 수 없다.`);
  if (joinRequest.status !== "pending") {
    return err("conflict", `join request ${id} 는 이미 ${joinRequest.status} 상태다.`);
  }
  joinRequest.status = decision;
  joinRequest.decidedBy = decidedBy;
  return ok(joinRequest);
}

/**
 * 가입 신청 철회(FR-022 E4, Task 016B). 요청한 본인만 철회할 수 있다 — `requesterId`가
 * 세션의 profileId와 일치하지 않으면 (다른 사람의 신청이거나 이미 없는 신청이거나) `not_found`로
 * 뭉뚱그린다. "존재하지만 남의 것"과 "존재하지 않음"을 구분해 주지 않는 것은
 * `handle-search.ts`의 R-012와 같은 이유 — 존재 여부 자체를 정보로 흘리지 않는다.
 */
export async function withdrawJoinRequest(
  id: Id,
  requesterId: Id,
): Promise<DataResult<JoinRequest>> {
  const joinRequest = store.joinRequests.find((r) => r.id === id && r.requesterId === requesterId);
  if (!joinRequest) return err("not_found", `join request ${id} 를 찾을 수 없다.`);
  if (joinRequest.status !== "pending") {
    return err("conflict", `join request ${id} 는 이미 ${joinRequest.status} 상태다.`);
  }
  joinRequest.status = "withdrawn";
  return ok(joinRequest);
}
