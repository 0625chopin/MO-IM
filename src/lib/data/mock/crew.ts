
import { crewColorIndex } from "@/lib/rules/crew-color-hash";
import {
  createCrewMembershipStatus,
  transitionCrewMembershipStatus,
} from "@/lib/rules/crew-membership-transition";
import type {
  Board,
  ChatRoom,
  Crew,
  CrewMembership,
  CrewMembershipRole,
  CrewVisibility,
  Id,
} from "@/lib/types";

import { type CursorPage, type DataResult, err, ok } from "../contracts";

import { generateId, store } from "./fixtures";

/**
 * Crew·CrewMembership 데이터 접근 (FR-010~012·014·020(초대 발급은 invitation.ts)·
 * 022~024·026·028).
 *
 * `colorKey`(캘린더 팔레트 인덱스)는 `hash(crewId) mod 12`(D-006) 판정 결과다 — 그 판정
 * 함수(`crewColorIndex`, `lib/rules/crew-color-hash.ts`)는 크루 id가 있어야 계산할 수 있는데,
 * id는 이 파일의 `generateId`가 만들므로 **`createCrew` 내부에서** id를 만든 직후 곧바로
 * 계산한다(D-016 — 개설 폼은 색을 묻지 않는다, 호출자가 값을 들고 올 수 없다). 마찬가지로
 * 크루원 강퇴·임명 같은 조작의 **허용 여부**는 `lib/rules`의 권한 판정이 먼저 걸러낸다 — 이
 * 레이어에 도달했다는 것 자체가 이미 그 판정을 통과했다는 전제다.
 */

export interface ListCrewsQuery {
  visibility?: CrewVisibility;
  /** 이름·설명 부분 일치(FR-014 크루 검색·탐색). 2자 미만 검색어를 거르는 것은 이 함수의 몫이
   *  아니다 — 호출자(`CrewExploreContainer`·`loadMoreCrewsAction`)가 `lib/rules/
   *  crew-search-query.ts`로 먼저 판정한다. */
  query?: string;
  /** 카테고리 필터(FR-014, Task 016A). `lib/rules/crew-category.ts`의 값과 같은 어휘를 쓴다. */
  category?: string;
  /**
   * 조회자 프로필 id. `private` 크루는 이 프로필이 **활성 멤버인 크루만** 결과에 포함한다
   * (D-017·D-028 — "노출 판정은 화면 단위가 아니라 데이터 접근 규칙"). 비로그인 방문자는
   * `null`(또는 생략)을 넘긴다 — 그러면 `private` 크루는 무조건 제외된다. `visibility: "private"`
   * 를 명시적으로 요청해도 이 필터를 우회할 수 없다(아래 구현에서 두 조건을 AND로 겹친다).
   */
  viewerProfileId?: Id | null;
  /** 이전 페이지 마지막 항목의 id. 없으면 첫 페이지(`listMessages`와 같은 커서 규약, D-023). */
  cursor?: Id | null;
  /** 기본 20건(`listPostsByPage`와 같은 페이지 크기 관례). */
  limit?: number;
}

/**
 * 크루 탐색(FR-014, Task 016A) — 커서 기반 페이지네이션 + 카테고리·검색어 필터를 함께 받는다.
 * `private` 크루 비노출(D-017)을 **이 함수 안에서** 걸러낸다 — 호출자가 반환된 배열을 다시
 * 필터링하는 방식이면 "필터링을 깜빡한 호출부"가 생길 여지가 남는다(D-028이 명시하는
 * "화면 필터링이 아니라 데이터 접근 규칙"의 Mock 버전).
 */
export async function listCrews(opts: ListCrewsQuery = {}): Promise<CursorPage<Crew>> {
  const needle = opts.query?.trim().toLowerCase();
  const limit = opts.limit ?? 20;

  const viewerActiveCrewIds = new Set(
    opts.viewerProfileId
      ? store.crewMemberships
          .filter((m) => m.profileId === opts.viewerProfileId && m.status === "active")
          .map((m) => m.crewId)
      : [],
  );

  const all = store.crews.filter((c) => {
    if (c.status !== "active") return false;
    if (opts.visibility && c.visibility !== opts.visibility) return false;
    if (opts.category && c.category !== opts.category) return false;
    // D-017/D-028 — private 크루는 비소속자에게 존재 자체가 보이지 않는다(검색어·카테고리
    // 필터와 무관하게 항상 우선 적용).
    if (c.visibility === "private" && !viewerActiveCrewIds.has(c.id)) return false;
    if (needle && !c.name.toLowerCase().includes(needle) && !c.description.toLowerCase().includes(needle)) {
      return false;
    }
    return true;
  });

  const startIndex = opts.cursor ? all.findIndex((c) => c.id === opts.cursor) + 1 : 0;
  const page = all.slice(startIndex, startIndex + limit);
  const nextCursor = all[startIndex + limit] ? page[page.length - 1].id : null;
  return { items: page, nextCursor };
}

export async function getCrewById(id: Id): Promise<Crew | null> {
  return store.crews.find((c) => c.id === id) ?? null;
}

export interface CreateCrewInput {
  name: string;
  description: string;
  category: string;
  visibility: CrewVisibility;
  ownerId: Id;
}

/**
 * 크루 개설(FR-010 AC1·AC2, D-008, D-016). 한 번의 호출로 FR-010 정상 흐름 ④를 전부 만족한다:
 * 크루 생성 + 오너 `active`/`owner` 멤버십 + 게시판·채팅방 자동 생성 + 색상 자동 배정.
 * 넷을 분리해 호출부(Server Action)가 순서대로 조립하게 두면 하나를 빠뜨렸을 때(예: 채팅방
 * 생성만 잊음) AC2("게시판 탭과 채팅 탭이 이미 존재")가 조용히 깨진다 — 그래서 이 함수가
 * 원자적으로 묶는다.
 */
export async function createCrew(input: CreateCrewInput): Promise<Crew> {
  const crewId = generateId("crew");
  const crew: Crew = {
    id: crewId,
    name: input.name,
    description: input.description,
    category: input.category,
    visibility: input.visibility,
    colorKey: crewColorIndex(crewId),
    ownerId: input.ownerId,
    status: "active",
  };
  store.crews.push(crew);
  store.crewMemberships.push({
    crewId: crew.id,
    profileId: input.ownerId,
    role: "owner",
    status: "active",
    joinedAt: new Date().toISOString(),
    removedReason: null,
  });

  const board: Board = { id: generateId("board"), crewId: crew.id };
  store.boards.push(board);
  const chatRoom: ChatRoom = { id: generateId("room"), crewId: crew.id };
  store.chatRooms.push(chatRoom);

  return crew;
}

/**
 * FR-011이 "크루명, 소개, 카테고리, 대표 이미지, 색상, 규칙을 조회하고 수정한다"고 명시한 대로
 * `colorKey`(캘린더 팔레트 인덱스, D-016 — "변경은 크루 설정에서만")도 이 정보 수정의 일부다.
 * 개설 시 자동 배정된 값(`crewColorIndex`)을 크루 설정 화면에서 팔레트 12색 내로 수동
 * 재지정할 수 있다 — 유효 범위(0~11) 검증은 호출자(Server Action)가 `CREW_PALETTE_SIZE`로 한다.
 */
export type UpdateCrewInfoInput = Partial<Pick<Crew, "name" | "description" | "category" | "colorKey">>;

/** 크루 정보 수정(FR-011). */
export async function updateCrewInfo(
  id: Id,
  patch: UpdateCrewInfoInput,
): Promise<DataResult<Crew>> {
  const crew = store.crews.find((c) => c.id === id);
  if (!crew) return err("not_found", `crew ${id} 를 찾을 수 없다.`);
  Object.assign(crew, patch);
  return ok(crew);
}

/** 크루 공개 범위 변경(FR-012, D-007). */
export async function updateCrewVisibility(
  id: Id,
  visibility: CrewVisibility,
): Promise<DataResult<Crew>> {
  const crew = store.crews.find((c) => c.id === id);
  if (!crew) return err("not_found", `crew ${id} 를 찾을 수 없다.`);
  crew.visibility = visibility;
  return ok(crew);
}

export async function listCrewMembers(crewId: Id): Promise<CrewMembership[]> {
  return store.crewMemberships.filter((m) => m.crewId === crewId);
}

/**
 * 프로필이 속한 크루 목록(FR-061 "사용자가 속한 모든 크루" 조회 — 통합 캘린더 Task 021A).
 * `listCrewMembers`(크루 → 멤버)의 반대 방향이다. 활성 멤버십(`status === "active"`)만
 * 포함한다 — 탈퇴·강퇴된 크루의 Meetup은 캘린더에 뜨지 않아야 한다. 크루 필터 UI(FR-061
 * AC5, D-014·R-017)는 Task 021B 몫이라 이 함수는 필터링 없이 전량을 반환한다.
 */
export async function listCrewsByProfile(profileId: Id): Promise<Crew[]> {
  const crewIds = new Set(
    store.crewMemberships
      .filter((m) => m.profileId === profileId && m.status === "active")
      .map((m) => m.crewId),
  );
  return store.crews.filter((c) => crewIds.has(c.id) && c.status === "active");
}

export async function getCrewMembership(
  crewId: Id,
  profileId: Id,
): Promise<CrewMembership | null> {
  return (
    store.crewMemberships.find((m) => m.crewId === crewId && m.profileId === profileId) ?? null
  );
}

/** 임원 임명·해임(FR-024) — role만 바꾼다. owner 승격/강등은 오너 이양(FR-025, v0.2) 몫이라 다루지 않는다. */
export async function setCrewMembershipRole(
  crewId: Id,
  profileId: Id,
  role: Extract<CrewMembershipRole, "staff" | "member">,
): Promise<DataResult<CrewMembership>> {
  const membership = store.crewMemberships.find(
    (m) => m.crewId === crewId && m.profileId === profileId,
  );
  if (!membership) return err("not_found", `crew ${crewId} 의 멤버십(${profileId})을 찾을 수 없다.`);
  membership.role = role;
  return ok(membership);
}

/**
 * 가입 신청 승인(FR-023) — 멤버십 쪽 반영. 2.4절 `requested --approve_request--> active`를
 * `transitionCrewMembershipStatus`(`lib/rules`)로 검증해 그대로 옮긴다 — 상태 하드코딩 대신
 * 규칙 함수를 거치므로, 이미 처리된(활성이 아닌) 멤버십에 대한 승인 시도는 `conflict`로
 * 걸러진다(FR-023 E1 "다른 임원이 먼저 처리"의 멤버십 쪽 방어선 — `JoinRequest.status`의
 * 1차 방어는 `decideJoinRequest`가 맡는다).
 */
export async function approveCrewMembership(
  crewId: Id,
  profileId: Id,
): Promise<DataResult<CrewMembership>> {
  const membership = store.crewMemberships.find(
    (m) => m.crewId === crewId && m.profileId === profileId,
  );
  if (!membership) return err("not_found", `crew ${crewId} 의 멤버십(${profileId})을 찾을 수 없다.`);
  const next = transitionCrewMembershipStatus(membership.status, "approve_request");
  if (!next) {
    return err("conflict", `crew ${crewId} 의 멤버십(${profileId})은 승인 가능한 상태가 아니다.`);
  }
  membership.status = next;
  membership.joinedAt = new Date().toISOString();
  return ok(membership);
}

/**
 * 가입 신청 반려(FR-023) — 멤버십 쪽 반영. 2.4절 `requested --reject_request--> rejected`.
 * 신청자 본인의 자진 철회도 개념상 같은 종착 상태(`rejected`)로 합류한다(D-086) — 다만
 * 그 경로를 담당하던 별도 Mock 함수(`withdrawPendingCrewMembership`)는 Task 032(18일차)부터
 * 실제 호출부가 0건이던 죽은 코드였음이 30일차(I-143·I-144)에 드러나 31일차에 삭제됐다.
 * "누가 끝냈는지"는 함수 분리가 아니라 `JoinRequest.decidedBy`(반려는 값 있음, 철회는
 * `null`)로 구분된다(I-040).
 */
export async function rejectCrewMembership(
  crewId: Id,
  profileId: Id,
): Promise<DataResult<CrewMembership>> {
  const membership = store.crewMemberships.find(
    (m) => m.crewId === crewId && m.profileId === profileId,
  );
  if (!membership) return err("not_found", `crew ${crewId} 의 멤버십(${profileId})을 찾을 수 없다.`);
  const next = transitionCrewMembershipStatus(membership.status, "reject_request");
  if (!next) {
    return err("conflict", `crew ${crewId} 의 멤버십(${profileId})은 반려 가능한 상태가 아니다.`);
  }
  membership.status = next;
  return ok(membership);
}

/**
 * 크루 탈퇴(FR-026)·강퇴(FR-027, v0.2)를 함께 받는다 — 둘 다 "active → left/removed"라는
 * 같은 상태 전이(`CrewMembershipStatus`)이고, 새 필드도 필요 없어 함수를 나누지 않았다.
 */
export async function updateCrewMembershipStatus(
  crewId: Id,
  profileId: Id,
  status: Extract<CrewMembership["status"], "left" | "removed">,
  removedReason: string | null = null,
): Promise<DataResult<CrewMembership>> {
  const membership = store.crewMemberships.find(
    (m) => m.crewId === crewId && m.profileId === profileId,
  );
  if (!membership) return err("not_found", `crew ${crewId} 의 멤버십(${profileId})을 찾을 수 없다.`);
  membership.status = status;
  membership.removedReason = status === "removed" ? removedReason : null;
  return ok(membership);
}

/**
 * 초대 수락(FR-021) — 멤버십 쪽 반영. 2.4절 `invited --accept_invitation--> active`를
 * `transitionCrewMembershipStatus`로 검증해 그대로 옮긴다(`approveCrewMembership`과 같은
 * 패턴 — 발생 이벤트(오너·임원의 승인 vs 초대 대상 본인의 수락)만 다르다).
 */
export async function acceptCrewInvitationMembership(
  crewId: Id,
  profileId: Id,
): Promise<DataResult<CrewMembership>> {
  const membership = store.crewMemberships.find(
    (m) => m.crewId === crewId && m.profileId === profileId,
  );
  if (!membership) return err("not_found", `crew ${crewId} 의 멤버십(${profileId})을 찾을 수 없다.`);
  const next = transitionCrewMembershipStatus(membership.status, "accept_invitation");
  if (!next) {
    return err("conflict", `crew ${crewId} 의 멤버십(${profileId})은 수락 가능한 상태가 아니다.`);
  }
  membership.status = next;
  membership.joinedAt = new Date().toISOString();
  return ok(membership);
}

/** 초대 거절(FR-021) — 멤버십 쪽 반영. 2.4절 `invited --decline_invitation--> declined`.
 *  AC2("거절해도 재초대 가능")는 이 함수가 아니라 `evaluateInviteEligibility`의 몫이다 —
 *  `declined`는 그 판정에서 재초대 차단 대상이 아니다. */
export async function declineCrewInvitationMembership(
  crewId: Id,
  profileId: Id,
): Promise<DataResult<CrewMembership>> {
  const membership = store.crewMemberships.find(
    (m) => m.crewId === crewId && m.profileId === profileId,
  );
  if (!membership) return err("not_found", `crew ${crewId} 의 멤버십(${profileId})을 찾을 수 없다.`);
  const next = transitionCrewMembershipStatus(membership.status, "decline_invitation");
  if (!next) {
    return err("conflict", `crew ${crewId} 의 멤버십(${profileId})은 거절 가능한 상태가 아니다.`);
  }
  membership.status = next;
  return ok(membership);
}

/**
 * 초대(FR-020, Task 017A)·가입 신청(FR-022) 시작점 — 둘 다 2.4절 다이어그램의 `[*] --> invited`/
 * `[*] --> requested`다. `(crewId, profileId)`가 PK라 이미 종결 상태(declined·rejected·left)로
 * 남아 있는 예전 멤버십 행이 있으면 **새 행을 추가하지 않고 그 행을 재사용**한다 — 중복 행을
 * 만들면 `getCrewMembership`의 `.find`가 어느 쪽을 반환할지 보장할 수 없어진다. `removed`
 * (강퇴) 상태는 호출자가 먼저 `evaluateJoinRequestEligibility`(`lib/rules`)로 걸러야 한다 —
 * 이 함수 자신은 상태값을 그대로 받아 쓸 뿐 재신청 차단(FR-022 E3)을 판정하지 않는다.
 */
export async function initiateCrewMembership(
  crewId: Id,
  profileId: Id,
  origin: "invite" | "request",
): Promise<CrewMembership> {
  const status = createCrewMembershipStatus(origin);
  const existing = store.crewMemberships.find(
    (m) => m.crewId === crewId && m.profileId === profileId,
  );
  if (existing) {
    existing.role = "member";
    existing.status = status;
    existing.joinedAt = new Date().toISOString();
    existing.removedReason = null;
    return existing;
  }

  const membership: CrewMembership = {
    crewId,
    profileId,
    role: "member",
    status,
    joinedAt: new Date().toISOString(),
    removedReason: null,
  };
  store.crewMemberships.push(membership);
  return membership;
}

// `withdrawPendingCrewMembership`(가입 신청 자진 철회의 멤버십 쪽 반영)은 31일차에 삭제됐다.
// Task 032(18일차)부터 `src/lib/data/index.ts` 배럴이 `./mock/*`를 재노출하지 않아 실제
// 호출부가 0건이던 죽은 코드였다(I-144, CLAUDE.md "확실히 unused면 완전히 지운다" 원칙 적용).
// 실제 자진 철회 쓰기 경로는 Mock `withdrawJoinRequest`(`./join-request.ts`, `join_requests`만
// 갱신)와 Supabase `withdraw_join_request` RPC(SQL 트랜잭션 안에서 `crew_memberships`까지
// 원자적으로 갱신)가 각각 담당한다 — 이 함수는 애초에 그 경로들 중 어디에도 연결된 적이
// 없었다.
