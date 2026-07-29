import { crewColorIndex } from "@/lib/rules/crew-color-hash";
import {
  createCrewMembershipStatus,
  transitionCrewMembershipStatus,
} from "@/lib/rules/crew-membership-transition";
import type {
  Crew,
  CrewMembership,
  CrewMembershipRole,
  Id,
  Invitation,
  JoinRequest,
  Profile,
} from "@/lib/types";

import { NEW_CREWS, REMOVED_REASONS } from "./content-bank";
import { pick, pickN, randomInt, type Rng } from "./prng";
import { addDays, SEED_NOW } from "./time";

/**
 * Crew·CrewMembership·JoinRequest·Invitation을 함께 만든다 — 넷이 서로의 상태를
 * 참조하므로(예: `invited` 멤버십은 `pending` Invitation 1건과 짝이어야 한다) 한
 * 함수에서 다뤄야 정합이 깨지지 않는다.
 *
 * 상태 전이는 `lib/rules/crew-membership-transition.ts`의 실제 판정 함수
 * (`createCrewMembershipStatus`·`transitionCrewMembershipStatus`)를 그대로 호출해
 * 만든다 — 문자열 리터럴을 직접 쓰지 않는 이유는, 2.4절 다이어그램이 나중에 바뀌면
 * 이 시드도 자동으로 같이 바뀌게 하기 위해서다(규칙과 시드가 따로 놀지 않는다).
 */

export interface ExistingCrewContext {
  /** 기존 최소 픽스처(crew-1·crew-2)의 실제 Crew 객체 — colorKey를 이 함수가 직접 고쳐 쓴다. */
  crew: Crew;
  /** 오너 포함, 이미 active인 멤버 id 목록(기존 최소 픽스처分). */
  activeMemberIds: Id[];
}

interface CrewRegistryEntry {
  crewId: Id;
  ownerId: Id;
  staffIds: Id[];
  usedProfileIds: Set<Id>;
}

export interface CrewGenerationResult {
  /** 신규 크루 13개(기존 crew-1·crew-2는 포함하지 않는다 — 호출자가 이미 갖고 있다). */
  crews: Crew[];
  /** 신규 멤버십 행 전부(기존 2크루에 추가되는 행 + 신규 13크루 전체 로스터 + 생애주기 다양성 행). */
  memberships: CrewMembership[];
  joinRequests: JoinRequest[];
  invitations: Invitation[];
  /** crewId → 활성 멤버 id 목록(오너 포함). 이후 게시판·투표·채팅·Meetup 생성이 이 로스터로 대상자를 뽑는다. */
  rosterByCrewId: Map<Id, Id[]>;
  /** crewId → colorKey. R-017/D-026 충돌 실증에도 이 맵을 그대로 쓴다. */
  colorKeyByCrewId: Map<Id, number>;
  /** crewId → 오너 id(15개 크루 전부, 기존 2개 포함) — poll 조기 종료·notification 수신자 결정에 쓴다. */
  ownerIdByCrewId: Map<Id, Id>;
  /** crewId → 임원 id 목록(15개 크루 전부) — poll 조기 종료 처리자 후보로 쓴다. */
  staffIdsByCrewId: Map<Id, Id[]>;
  /** role이 'staff'인 멤버십 행만 — notification의 staff_appointed 소스. */
  staffMemberships: CrewMembership[];
  /** status가 'removed'인 멤버십 행만 — notification의 member_removed 소스. */
  removedMemberships: CrewMembership[];
}

function staffCountFor(rosterSize: number): number {
  if (rosterSize >= 20) return 3;
  if (rosterSize >= 10) return 2;
  if (rosterSize >= 5) return 1;
  return 0;
}

export function generateCrewsAndMemberships(
  rng: Rng,
  generateId: (prefix: string) => Id,
  existingCrews: readonly ExistingCrewContext[],
  newProfiles: readonly Profile[],
): CrewGenerationResult {
  const crews: Crew[] = [];
  const memberships: CrewMembership[] = [];
  const joinRequests: JoinRequest[] = [];
  const invitations: Invitation[] = [];
  const rosterByCrewId = new Map<Id, Id[]>();
  const colorKeyByCrewId = new Map<Id, number>();
  const registry = new Map<Id, CrewRegistryEntry>();
  const newProfileIds = newProfiles.map((p) => p.id);

  // ---- 1) 기존 크루(crew-1·crew-2)의 colorKey를 실제 hash(crewId) mod 12로 맞추고
  //         레지스트리에 등록한다. Task 007 최소 픽스처는 colorKey를 0·1로 손으로 넣어
  //         뒀는데, 실제 `crewColorIndex`와 값이 다르다 — 이번 회차에서 바로잡는다.
  for (const ctx of existingCrews) {
    ctx.crew.colorKey = crewColorIndex(ctx.crew.id);
    colorKeyByCrewId.set(ctx.crew.id, ctx.crew.colorKey);
    registry.set(ctx.crew.id, {
      crewId: ctx.crew.id,
      ownerId: ctx.crew.ownerId,
      staffIds: [],
      usedProfileIds: new Set(ctx.activeMemberIds),
    });
    rosterByCrewId.set(ctx.crew.id, [...ctx.activeMemberIds]);
  }

  // ---- 2) 기존 두 크루에 신규 프로필 1명씩 추가(top-up) — crew-1: 3명, crew-2: 2명
  //         목표. 둘 다 5명 미만으로 남겨 D-031(대상자 5명 미만 투표 비공개) 데모 크루로 쓴다.
  const topUpProfiles = pickN(rng, newProfileIds, existingCrews.length);
  existingCrews.forEach((ctx, i) => {
    const profileId = topUpProfiles[i];
    const entry = registry.get(ctx.crew.id)!;
    entry.usedProfileIds.add(profileId);
    rosterByCrewId.get(ctx.crew.id)!.push(profileId);
    memberships.push({
      crewId: ctx.crew.id,
      profileId,
      role: "member",
      status: "active",
      joinedAt: addDays(SEED_NOW, -randomInt(rng, 5, 60)),
      removedReason: null,
    });
  });

  // ---- 3) 신규 크루 13개 — 오너 단일성(D-002)을 구조적으로 보장한다: rosterIds[0]이
  //         항상 오너이고 다른 어떤 코드도 crew.ownerId 외의 값을 owner role로 넣지 않는다.
  for (const spec of NEW_CREWS) {
    const crewId = generateId("crew");
    const colorKey = crewColorIndex(crewId);
    colorKeyByCrewId.set(crewId, colorKey);

    const foundedDaysAgo = randomInt(rng, 30, 400);
    const foundedAt = addDays(SEED_NOW, -foundedDaysAgo);

    const rosterIds = pickN(rng, newProfileIds, spec.roster);
    const ownerId = rosterIds[0];
    const staffCount = staffCountFor(spec.roster);
    const staffIds = rosterIds.slice(1, 1 + staffCount);

    const roleFor = (profileId: Id): CrewMembershipRole =>
      profileId === ownerId ? "owner" : staffIds.includes(profileId) ? "staff" : "member";

    for (const profileId of rosterIds) {
      memberships.push({
        crewId,
        profileId,
        role: roleFor(profileId),
        status: "active",
        joinedAt:
          profileId === ownerId ? foundedAt : addDays(foundedAt, randomInt(rng, 0, foundedDaysAgo)),
        removedReason: null,
      });
    }

    crews.push({
      id: crewId,
      name: spec.name,
      description: spec.description,
      category: spec.category,
      visibility: spec.visibility,
      colorKey,
      ownerId,
      status: "active",
    });
    rosterByCrewId.set(crewId, rosterIds);
    registry.set(crewId, {
      crewId,
      ownerId,
      staffIds,
      usedProfileIds: new Set(rosterIds),
    });
  }

  // ---- 4) 생애주기 다양성 — 2.4절 상태 다이어그램의 7개 상태 전부를 최소 1건 이상
  //         만든다. 대상 크루·프로필은 아직 그 크루에 멤버십 행이 없는 조합만 고른다
  //         (PK가 (crewId, profileId)이므로 중복 행을 만들면 안 된다).
  const allCrewIds = [...registry.keys()];

  function pickCrewWithRoom(): CrewRegistryEntry {
    for (let attempt = 0; attempt < 50; attempt++) {
      const entry = registry.get(pick(rng, allCrewIds))!;
      if (entry.usedProfileIds.size < newProfileIds.length) return entry;
    }
    throw new Error("생애주기 다양성 행을 배치할 여유 크루를 찾지 못했다 — 프로필 풀이 너무 작다.");
  }

  function pickUnusedProfile(entry: CrewRegistryEntry): Id {
    for (let attempt = 0; attempt < 200; attempt++) {
      const candidate = pick(rng, newProfileIds);
      if (!entry.usedProfileIds.has(candidate)) return candidate;
    }
    throw new Error(`crew ${entry.crewId} 에 배치할 미사용 프로필을 찾지 못했다.`);
  }

  function approverFor(entry: CrewRegistryEntry): Id {
    return entry.staffIds[0] ?? entry.ownerId;
  }

  // invited(대기) — Invitation(pending) 1건과 짝을 이룬다.
  for (let i = 0; i < 10; i++) {
    const entry = pickCrewWithRoom();
    const inviteeId = pickUnusedProfile(entry);
    entry.usedProfileIds.add(inviteeId);
    invitations.push({
      id: generateId("invitation"),
      crewId: entry.crewId,
      inviteeId,
      inviterId: approverFor(entry),
      status: "pending",
      expiresAt: addDays(SEED_NOW, randomInt(rng, 1, 14)),
    });
    memberships.push({
      crewId: entry.crewId,
      profileId: inviteeId,
      role: "member",
      status: createCrewMembershipStatus("invite"),
      joinedAt: addDays(SEED_NOW, -randomInt(rng, 0, 5)),
      removedReason: null,
    });
  }

  // requested(대기) — JoinRequest(pending) 1건과 짝을 이룬다.
  for (let i = 0; i < 10; i++) {
    const entry = pickCrewWithRoom();
    const requesterId = pickUnusedProfile(entry);
    entry.usedProfileIds.add(requesterId);
    joinRequests.push({
      id: generateId("join-request"),
      crewId: entry.crewId,
      requesterId,
      message: chanceMessage(rng),
      status: "pending",
      decidedBy: null,
      decidedAt: null,
    });
    memberships.push({
      crewId: entry.crewId,
      profileId: requesterId,
      role: "member",
      status: createCrewMembershipStatus("request"),
      joinedAt: addDays(SEED_NOW, -randomInt(rng, 0, 5)),
      removedReason: null,
    });
  }

  // declined — invited --decline_invitation--> declined. Invitation도 declined로 맞춘다.
  for (let i = 0; i < 5; i++) {
    const entry = pickCrewWithRoom();
    const inviteeId = pickUnusedProfile(entry);
    entry.usedProfileIds.add(inviteeId);
    invitations.push({
      id: generateId("invitation"),
      crewId: entry.crewId,
      inviteeId,
      inviterId: approverFor(entry),
      status: "declined",
      expiresAt: addDays(SEED_NOW, -randomInt(rng, 1, 20)),
    });
    memberships.push({
      crewId: entry.crewId,
      profileId: inviteeId,
      role: "member",
      status: transitionCrewMembershipStatus("invited", "decline_invitation")!,
      joinedAt: addDays(SEED_NOW, -randomInt(rng, 10, 40)),
      removedReason: null,
    });
  }

  // rejected — requested --reject_request--> rejected. JoinRequest도 rejected로 맞춘다.
  for (let i = 0; i < 5; i++) {
    const entry = pickCrewWithRoom();
    const requesterId = pickUnusedProfile(entry);
    entry.usedProfileIds.add(requesterId);
    joinRequests.push({
      id: generateId("join-request"),
      crewId: entry.crewId,
      requesterId,
      message: chanceMessage(rng),
      status: "rejected",
      decidedBy: approverFor(entry),
      decidedAt: addDays(SEED_NOW, -randomInt(rng, 0, 3)),
    });
    memberships.push({
      crewId: entry.crewId,
      profileId: requesterId,
      role: "member",
      status: transitionCrewMembershipStatus("requested", "reject_request")!,
      joinedAt: addDays(SEED_NOW, -randomInt(rng, 10, 40)),
      removedReason: null,
    });
  }

  // left — active --leave--> left. 부수효과(멤버십 전이)만 남긴다(FR-026).
  for (let i = 0; i < 5; i++) {
    const entry = pickCrewWithRoom();
    const profileId = pickUnusedProfile(entry);
    entry.usedProfileIds.add(profileId);
    memberships.push({
      crewId: entry.crewId,
      profileId,
      role: "member",
      status: transitionCrewMembershipStatus("active", "leave")!,
      joinedAt: addDays(SEED_NOW, -randomInt(rng, 30, 120)),
      removedReason: null,
    });
  }

  // removed — active --remove--> removed(FR-027). removedReason을 채운다.
  for (let i = 0; i < 5; i++) {
    const entry = pickCrewWithRoom();
    const profileId = pickUnusedProfile(entry);
    entry.usedProfileIds.add(profileId);
    memberships.push({
      crewId: entry.crewId,
      profileId,
      role: "member",
      status: transitionCrewMembershipStatus("active", "remove")!,
      joinedAt: addDays(SEED_NOW, -randomInt(rng, 30, 120)),
      removedReason: pick(rng, REMOVED_REASONS),
    });
  }

  // 만료된 초대 — Invitation.status="expired"만 남긴다. 대응하는 CrewMembership 행은
  // 만들지 않는다: 2.4절 다이어그램에 "invited --(기한 도래)--> ?" 전이가 없어(TRANSITIONS에
  // invited는 accept/decline만 있다) 만료 시 멤버십 행을 어떤 상태로 둬야 하는지 규칙에
  // 정의돼 있지 않다 — 근거 없이 값을 지어내는 대신 이 간극을 보고에 남긴다.
  for (let i = 0; i < 3; i++) {
    const entry = pickCrewWithRoom();
    const inviteeId = pickUnusedProfile(entry);
    // usedProfileIds에는 넣지 않는다 — 멤버십 행 자체가 없으므로 그 프로필은 이 크루에
    // 다른 생애주기 행(예: 나중 재초대)의 대상이 될 수 있다.
    invitations.push({
      id: generateId("invitation"),
      crewId: entry.crewId,
      inviteeId,
      inviterId: approverFor(entry),
      status: "expired",
      expiresAt: addDays(SEED_NOW, -randomInt(rng, 1, 30)),
    });
  }

  // 승인된 과거 가입 신청 — 이미 active인 멤버 중 한 명을 골라 "그 사람이 어떻게
  // 들어왔는지"의 이력만 남긴다(FR-023). 이미 active 멤버십 행이 있으므로 새 멤버십
  // 행을 만들지 않는다.
  for (let i = 0; i < 5; i++) {
    const crewId = pick(rng, allCrewIds);
    const roster = rosterByCrewId.get(crewId) ?? [];
    const entry = registry.get(crewId)!;
    const requesterId = roster.length > 1 ? pick(rng, roster.filter((id) => id !== entry.ownerId)) : entry.ownerId;
    joinRequests.push({
      id: generateId("join-request"),
      crewId,
      requesterId,
      message: chanceMessage(rng),
      status: "approved",
      decidedBy: approverFor(entry),
      decidedAt: addDays(SEED_NOW, -randomInt(rng, 0, 10)),
    });
  }

  const ownerIdByCrewId = new Map<Id, Id>();
  const staffIdsByCrewId = new Map<Id, Id[]>();
  for (const entry of registry.values()) {
    ownerIdByCrewId.set(entry.crewId, entry.ownerId);
    staffIdsByCrewId.set(entry.crewId, entry.staffIds);
  }
  const staffMemberships = memberships.filter((m) => m.role === "staff");
  const removedMemberships = memberships.filter((m) => m.status === "removed");

  return {
    crews,
    memberships,
    joinRequests,
    invitations,
    rosterByCrewId,
    colorKeyByCrewId,
    ownerIdByCrewId,
    staffIdsByCrewId,
    staffMemberships,
    removedMemberships,
  };
}

function chanceMessage(rng: Rng): string | null {
  if (rng() < 0.4) return null;
  const messages = ["같이 하고 싶어요!", "잘 부탁드립니다.", "열심히 참여하겠습니다!", "관심 있어서 신청합니다."];
  return pick(rng, messages);
}
