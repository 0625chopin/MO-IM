import type { Board, ChatRoom, Crew, Id, Post } from "@/lib/types";

import { GENERAL_POST_TEMPLATES, MEETUP_PROPOSAL_TEMPLATES } from "./content-bank";
import { pick, randomInt, type Rng } from "./prng";
import { addDays, SEED_NOW, toDateOnly } from "./time";

/** Board·ChatRoom은 크루와 1:1이라 순수 매핑이다 — PRNG가 필요 없다. */
export function generateBoardsAndRooms(
  crewIds: readonly Id[],
  generateId: (prefix: string) => Id,
): { boards: Board[]; chatRooms: ChatRoom[] } {
  return {
    boards: crewIds.map((crewId) => ({ id: generateId("board"), crewId })),
    chatRooms: crewIds.map((crewId) => ({ id: generateId("room"), crewId })),
  };
}

export interface GeneratePostsResult {
  posts: Post[];
  /** 이번 회차에 새로 만든 "모임 제안글"만 — poll 생성기가 postId를 여기서 가져간다. */
  newMeetupProposalPosts: Post[];
  /** `guaranteedProposalCrewIds`로 강제 배정한 제안글(R-017/D-026 실증용) — 순서 보존. */
  forcedProposalPosts: Post[];
  postsByCrewId: Map<Id, Post[]>;
}

/**
 * 게시글 200개(기존 3개 포함) 목표 중 신규분을 만든다. `meetupProposalCount`는
 * Poll·Meetup 파이프라인(FR-060, D-034)의 소스가 될 "모임 제안글" 개수 — 정확히
 * 이 개수만큼만 poll이 붙는다(1:1). 남는 글은 전부 general이다.
 *
 * `guaranteedProposalCrewIds`가 주어지면 그 크루들에 제안글을 최소 1건씩 강제
 * 배정한다 — colorKey가 같은 두 크루가 실제로 "제안글이 있어야" 가결 Poll·Meetup까지
 * 이어지므로, 가중 랜덤에만 맡기면 작은 크루가 우연히 하나도 못 뽑힐 수 있다.
 */
export function generatePosts(
  rng: Rng,
  generateId: (prefix: string) => Id,
  crews: readonly Crew[],
  boardByCrewId: Map<Id, Id>,
  rosterByCrewId: Map<Id, Id[]>,
  existingPostsByCrewId: Map<Id, Post[]>,
  generalCount: number,
  meetupProposalCount: number,
  guaranteedProposalCrewIds: readonly Id[] = [],
): GeneratePostsResult {
  const posts: Post[] = [];
  const newMeetupProposalPosts: Post[] = [];
  const forcedProposalPosts: Post[] = [];
  const postsByCrewId = new Map<Id, Post[]>(existingPostsByCrewId);

  function addPost(crewId: Id, post: Post) {
    posts.push(post);
    // `postsByCrewId`는 `existingPostsByCrewId`의 배열을 얕은 복사(Map만 새로 만듦)로
    // 물려받았다 — `list.push(post)`로 제자리 변형하면 호출자가 넘긴 **원본** 배열까지
    // 같이 바뀐다(참조 공유). 대신 새 배열을 만들어 교체한다.
    const list = postsByCrewId.get(crewId) ?? [];
    postsByCrewId.set(crewId, [...list, post]);
  }

  function makeProposalPost(crewId: Id): Post {
    const roster = rosterByCrewId.get(crewId) ?? [];
    const authorId = pick(rng, roster);
    const boardId = boardByCrewId.get(crewId)!;
    const createdAt = addDays(SEED_NOW, -randomInt(rng, 1, 150));
    const template = pick(rng, MEETUP_PROPOSAL_TEMPLATES);
    const meetupDate = toDateOnly(addDays(createdAt, randomInt(rng, 3, 14)));
    const post: Post = {
      id: generateId("post"),
      boardId,
      authorId,
      type: "meetup_proposal",
      title: template.title,
      body: template.body,
      meetupDate,
      // 시드 데이터는 선택 입력 3종(D-013)까지 채우지 않는다 — 정원·시작 시각·장소는
      // Task 018B(글쓰기)가 실제로 입력받는 경로를 시연하는 목적이 아니라 Poll/Meetup
      // 파이프라인(FR-060) 실증이 이 생성기의 목표라 필수값(meetupDate)만 채운다.
      startTime: null,
      place: null,
      capacity: null,
      targetMeetupId: null,
      createdAt,
      editedAt: null,
      deletedAt: null,
    };
    addPost(crewId, post);
    newMeetupProposalPosts.push(post);
    return post;
  }

  for (const crewId of guaranteedProposalCrewIds) {
    forcedProposalPosts.push(makeProposalPost(crewId));
  }

  const totalNew = generalCount + meetupProposalCount - guaranteedProposalCrewIds.length;
  // 게시글마다 크루를 하나 배정한다 — 크루 규모(로스터 크기)에 비례해 큰 크루가 글을
  // 더 많이 쓰도록 가중치를 준다(현실적인 활동량 분포).
  const weightedCrewIds: Id[] = [];
  for (const crew of crews) {
    const size = rosterByCrewId.get(crew.id)?.length ?? 1;
    const weight = Math.max(1, Math.round(size / 3));
    for (let i = 0; i < weight; i++) weightedCrewIds.push(crew.id);
  }

  let generalMade = 0;
  let proposalMade = 0;
  const remainingProposalCount = meetupProposalCount - guaranteedProposalCrewIds.length;
  for (let i = 0; i < totalNew; i++) {
    const makeProposal =
      proposalMade < remainingProposalCount &&
      (generalMade >= generalCount || rng() < remainingProposalCount / totalNew);
    const crewId = pick(rng, weightedCrewIds);
    const roster = rosterByCrewId.get(crewId) ?? [];
    if (roster.length === 0) continue;

    if (makeProposal) {
      makeProposalPost(crewId);
      proposalMade += 1;
    } else {
      const authorId = pick(rng, roster);
      const boardId = boardByCrewId.get(crewId)!;
      const createdAt = addDays(SEED_NOW, -randomInt(rng, 1, 150));
      const template = pick(rng, GENERAL_POST_TEMPLATES);
      const post: Post = {
        id: generateId("post"),
        boardId,
        authorId,
        type: "general",
        title: template.title,
        body: template.body,
        meetupDate: null,
        startTime: null,
        place: null,
        capacity: null,
        targetMeetupId: null,
        createdAt,
        editedAt: rng() < 0.1 ? addDays(createdAt, 1) : null,
        deletedAt: null,
      };
      addPost(crewId, post);
      generalMade += 1;
    }
  }

  return { posts, newMeetupProposalPosts, forcedProposalPosts, postsByCrewId };
}
