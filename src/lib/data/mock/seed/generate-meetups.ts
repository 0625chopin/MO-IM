import type {
  AttendanceStatus,
  Id,
  ISODateString,
  Meetup,
  MeetupAttendance,
  Poll,
  Post,
} from "@/lib/types";

import { chance, pick, pickN, randomInt, type Rng } from "./prng";

const PLACES = [
  "한강공원 반포지구", "서울숲", "남산 둘레길", "성수동 카페거리", "연남동 소공원",
  "광교호수공원", "올림픽공원", "북한산 둘레길", "여의도 한강공원", "을지로 스터디카페",
  "홍대 놀이터 앞", "선릉역 인근 카페", "잠실 종합운동장", "낙산공원", "경의선숲길",
] as const;

const START_TIMES = ["07:00", "09:00", "10:00", "14:00", "19:00", "19:30", "20:00"] as const;

export interface MeetupGenerationResult {
  meetups: Meetup[];
  meetupAttendances: MeetupAttendance[];
}

/**
 * FR-060 — Meetup은 반드시 가결(passed)된 Poll 1건에서 파생된다(Task 007의
 * `meetup-1`↔`poll-2` 관계와 같은 1:1 전제). `passedPolls`는 `generate-polls.ts`가
 * 실제 정족수·판정 파이프라인으로 확정한 결과이므로, 여기서 다시 승/패를 판단하지
 * 않는다 — 이미 결정된 사실을 Meetup 레코드로 옮겨 적을 뿐이다.
 *
 * `forcedCollisionPollIds`(2건)는 R-017/D-026 실증용 — 두 Poll의 소속 크루가 같은
 * colorKey를 갖도록 이미 골라진 상태이므로, 여기서는 이 둘의 Meetup 날짜만
 * `forcedCollisionDate`로 강제 일치시킨다(같은 날짜 셀 충돌을 실제로 만든다).
 */
export function generateMeetups(
  rng: Rng,
  generateId: (prefix: string) => Id,
  passedPolls: readonly Poll[],
  postsByPostId: Map<Id, Post>,
  crewIdByBoardId: Map<Id, Id>,
  rosterByCrewId: Map<Id, Id[]>,
  forcedCollisionPollIds: ReadonlySet<Id>,
  forcedCollisionDate: ISODateString,
): MeetupGenerationResult {
  const meetups: Meetup[] = [];
  const meetupAttendances: MeetupAttendance[] = [];

  for (const poll of passedPolls) {
    const post = postsByPostId.get(poll.postId)!;
    const crewId = crewIdByBoardId.get(post.boardId)!;
    const roster = rosterByCrewId.get(crewId) ?? [];
    const isCollisionDemo = forcedCollisionPollIds.has(poll.id);

    const capacity = !isCollisionDemo && chance(rng, 0.5)
      ? Math.max(2, Math.round(roster.length * (0.3 + rng() * 0.4)))
      : null;

    const meetupId = generateId("meetup");
    const respondentCount = randomInt(rng, Math.min(1, roster.length), roster.length);
    const respondents = pickN(rng, roster, respondentCount);

    let attendingCount = 0;
    for (const profileId of respondents) {
      const wantsToAttend = chance(rng, 0.7);
      const capacityFull = capacity !== null && attendingCount >= capacity;
      const status: AttendanceStatus = wantsToAttend && !capacityFull ? "attending" : "absent";
      if (status === "attending") attendingCount += 1;
      meetupAttendances.push({
        meetupId,
        profileId,
        status,
        respondedAt: poll.decidedAt ?? poll.closesAt,
        invalidatedAt: null,
      });
    }

    // 확정된 59건 중 소수만 이후 취소(FR-065)로 상태를 바꾼다 — 충돌 실증용 2건은
    // 반드시 캘린더에 계속 보여야 하므로 취소 대상에서 제외한다.
    const status: Meetup["status"] = !isCollisionDemo && chance(rng, 0.08) ? "cancelled" : "confirmed";

    // 다일 모임(2026-07-31) — 제안글이 기간을 담고 있으면 그 길이를 그대로 옮긴다.
    // 색 충돌 실증용 2건은 날짜를 강제로 겹치게 만들므로 하루짜리로 고정한다(원 제안글의
    // 기간을 쓰면 강제한 날짜와 어긋난다).
    const date = isCollisionDemo ? forcedCollisionDate : post.meetupDate!;
    const endDate = isCollisionDemo ? forcedCollisionDate : (post.meetupEndDate ?? date);
    const startTime = pick(rng, START_TIMES);

    meetups.push({
      id: meetupId,
      crewId,
      pollId: poll.id,
      title: post.title,
      description: post.body,
      date,
      endDate,
      startTime,
      // 절반 정도만 종료 시각을 갖는다 — 있는 경우/없는 경우가 캘린더·상세 화면에 둘 다
      // 나타나야 "시각 미정" 표시가 시드 데이터로 검증된다. 시작 시각 목록의 최댓값이
      // 20:00이라 +2시간은 날짜를 넘지 않는다(같은 날 역전 CHECK를 시드가 위반하지 않는다).
      endTime: chance(rng, 0.5) ? `${String(Number(startTime.slice(0, 2)) + 2).padStart(2, "0")}:00` : null,
      place: pick(rng, PLACES),
      capacity,
      attendingCount,
      status,
      createdAt: poll.decidedAt ?? poll.closesAt,
    });
  }

  return { meetups, meetupAttendances };
}
