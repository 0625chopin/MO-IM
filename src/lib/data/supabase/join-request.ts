import "server-only";

import type { Id, JoinRequest, JoinRequestStatus } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { toJoinRequest } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * JoinRequest 실데이터 구현 (Task 031 읽기 + Task 032 쓰기, FR-022 가입 신청·FR-023 승인·반려).
 *
 * **I-054 해소(28일차, CORE)** — `createJoinRequest`는 더 이상 `join_requests` INSERT와
 * `crew_memberships` INSERT/UPDATE를 별도 PostgREST 호출(=별도 트랜잭션)로 나누지 않는다.
 * `create_join_request` RPC(029B 2단 구조 — `private.create_join_request` SECURITY DEFINER
 * 실구현 + `public.create_join_request` SECURITY INVOKER 얇은 래퍼) 하나로 묶여, 두 INSERT가
 * 단일 DB 트랜잭션 안에서 원자적으로 처리된다. 이 RPC가 이제 유일한 정당 생성 경로라
 * `join_requests`·`crew_memberships`의 client INSERT GRANT는 회수됐다(D-065 전제 변경,
 * 마이그레이션 `i054_atomic_join_request_and_poll_creation_rpcs`). 실패는 예외가 아니라
 * `reason_code`(forbidden·not_found·conflict) 반환값으로 알린다. 자기반증(강제 실패 유도 후
 * 두 테이블 모두에 부분 커밋이 남지 않음을 SELECT로 직접 확인) 원시 로그는
 * `docs/decisions/i054-atomic-write-rpcs.md` 참고.
 *
 * **I-141 해소(29일차, CORE)** — `withdrawJoinRequest`도 같은 클래스 결함이었다: `join_requests`
 * UPDATE(`status: "withdrawn"`)와 `crew_memberships` UPDATE(`status: "rejected"`)를 별도
 * PostgREST 호출 두 개로 실행해, 두 번째가 실패하면 `crew_memberships`가 `requested`로 영구
 * 고아 상태가 됐다(재신청 불가·임원 재처리 불가, `docs/ISSUES.md` I-141). `withdraw_join_request`
 * RPC(같은 029B 2단 구조)로 단일 트랜잭션에 묶었다. 자기반증(강제 실패 시 두 UPDATE 모두 롤백
 * 확인 + 정상 회귀 + `crew_memberships_guard_self_transition`의 `requested→rejected` self-service
 * 분기가 non-nested 트리거 호출 경로에서도 허용됨을 실측)은 `docs/decisions/i141-atomic-
 * withdraw-join-request.md` 참고. 이 RPC 전환에 맞춰 `join_requests_update_requester_or_staff`
 * RLS 정책에서 신청자 본인의 직접 UPDATE(`status='withdrawn'`) 분기를 제거했다 — 정당 경로가
 * RPC 단독으로 바뀌어 그 분기를 남겨 두면 클라이언트가 여전히 비원자적 2단 쓰기를 재현할 수
 * 있었다(D-064/I-054와 동일 근거). staff/owner의 승인·반려(FR-023) 분기는 무변경이다.
 *
 * 승인/반려는 `trg_join_requests_sync_membership_on_decision`(AFTER UPDATE)이 자동
 * 동기화하므로 `decideJoinRequest`가 다시 건드리지 않는다. 철회(자진, FR-022 E4)는 그
 * 트리거의 대상이 아니라서 `withdraw_join_request` RPC가 같은 트랜잭션 안에서 직접
 * 되돌린다.
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

export interface CreateJoinRequestInput {
  crewId: Id;
  requesterId: Id;
  message?: string | null;
}

/**
 * 같은 크루에 대기 중인 신청이 이미 있으면 conflict — 중복 신청 방지(Mock과 동일 규칙).
 *
 * **`requesterId`는 실데이터에서 쓰지 않는다** — `respondAttendance`(meetup.ts)와 같은 이유로
 * `create_join_request` RPC가 내부에서 `auth.uid()`를 쓴다(호출자가 실제 로그인 사용자와 다른
 * 값을 넘겨도 결과는 세션 기준으로만 나온다). Mock과의 시그니처 동일성(NFR-034)을 위해 입력
 * 타입에는 남겨 둔다.
 */
export async function createJoinRequest(
  input: CreateJoinRequestInput,
): Promise<DataResult<JoinRequest>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("create_join_request", { p_crew_id: input.crewId, p_message: input.message ?? undefined })
    .single();
  if (error) throw error;

  if (!data.ok) {
    if (data.reason_code === "not_found" || data.reason_code === "conflict" || data.reason_code === "forbidden") {
      return err(data.reason_code, `crew ${input.crewId} 가입 신청이 거부됐다(${data.reason_code}).`);
    }
    throw new Error(
      `create_join_request(${input.crewId})가 예상 밖의 reason_code를 반환했다: ${data.reason_code}`,
    );
  }
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

/**
 * 가입 신청 철회(FR-022 E4). 요청한 본인만 철회할 수 있다 — `withdraw_join_request` RPC가
 * 내부에서 `auth.uid()`를 쓰므로(`create_join_request`와 같은 이유, RPC가 유일한 정당 경로),
 * 호출자가 다른 `requesterId`를 넘겨도 결과는 세션 기준으로만 나온다. `join_requests` UPDATE
 * (`status: "withdrawn"`)와 `crew_memberships` UPDATE(`status: "rejected"`)가 단일 트랜잭션
 * 안에서 원자적으로 처리된다(I-141 해소, 29일차 — 위 모듈 docstring 참고). `requesterId`는
 * Mock과의 시그니처 동일성(NFR-034)을 위해 파라미터로 남겨 둔다.
 */
export async function withdrawJoinRequest(
  id: Id,
  // Mock 시그니처 호환용(NFR-034) — withdraw_join_request RPC가 auth.uid()를 쓰므로 실데이터는
  // 이 값을 쓰지 않는다(위 docstring). 사용하지 않지만 시그니처 자리는 유지한다.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  requesterId: Id,
): Promise<DataResult<JoinRequest>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("withdraw_join_request", { p_id: id }).single();
  if (error) throw error;

  if (!data.ok) {
    if (data.reason_code === "not_found" || data.reason_code === "forbidden") {
      return err(data.reason_code, `join request ${id} 철회가 거부됐다(${data.reason_code}).`);
    }
    throw new Error(
      `withdraw_join_request(${id})가 예상 밖의 reason_code를 반환했다: ${data.reason_code}`,
    );
  }
  return ok(toJoinRequest(data));
}
