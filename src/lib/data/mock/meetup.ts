import type {
  AttendanceJoinResult,
  AttendanceStatus,
  Id,
  Meetup,
  MeetupAttendance,
} from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { generateId, store } from "./fixtures";

/** Meetup·MeetupAttendance 데이터 접근 (FR-060~061·063~064·066~068). */

export async function getMeetupById(id: Id): Promise<Meetup | null> {
  return store.meetups.find((m) => m.id === id) ?? null;
}

/**
 * 가결 Poll → Meetup 역참조(FR-060, 1:1). Task 019(투표 UI)가 `PollResult`의 "확정된 모임 보기"
 * 링크를 리소스 ID 기준으로 만들기 위해 추가했다(R-016·FR-052와 같은 원칙 — 경로 문자열을
 * 저장해 두지 않는다). Poll이 `closed_passed`라도 Meetup 자동 생성 파이프라인(FR-060)은 아직
 * Task 034 몫이라 없을 수 있다 — 호출부가 `null`을 정상 상태로 다룬다.
 */
export async function getMeetupByPollId(pollId: Id): Promise<Meetup | null> {
  return store.meetups.find((m) => m.pollId === pollId) ?? null;
}

export interface ListMeetupsQuery {
  crewIds: Id[];
  /** 캘린더 월간 뷰(FR-061)의 조회 구간 — 양끝 포함, ISO date 문자열 비교. */
  from: string;
  to: string;
  /**
   * `true`면 취소된(`status === "cancelled"`) Meetup도 함께 반환한다. 기본값 `false`는
   * 021A 때부터의 기존 동작(월 격자 바는 취소분을 아예 숨긴다)을 그대로 유지한다 — 이 옵션을
   * 추가한 이유는 Task 021B의 `DayDetailPanel`이 FR-063 E3("취소된 Meetup → 취소 배지와
   * 함께 표시")를 만족하려면 같은 날짜의 취소 건도 알아야 하기 때문이다. 월 격자 바는 여전히
   * 이 옵션 없이(기본값) 호출해 동작이 바뀌지 않는다 — `MonthCalendarContainer`가 상세 목록용
   * 조회 한 번만 `includeCancelled: true`로 부른다.
   */
  includeCancelled?: boolean;
}

/** 캘린더 월간 뷰 + 크루 필터(FR-061). 기본은 취소된 Meetup을 제외한다({@link ListMeetupsQuery.includeCancelled}). */
export async function listMeetupsByCrews(opts: ListMeetupsQuery): Promise<Meetup[]> {
  const crewIdSet = new Set(opts.crewIds);
  return store.meetups.filter(
    (m) =>
      (opts.includeCancelled || m.status === "confirmed") &&
      crewIdSet.has(m.crewId) &&
      m.date >= opts.from &&
      m.date <= opts.to,
  );
}

export interface CreateMeetupFromPollInput {
  crewId: Id;
  pollId: Id;
  title: string;
  description?: string | null;
  date: string;
  startTime?: string | null;
  place?: string | null;
  capacity?: number | null;
}

/**
 * 가결 Meetup 자동 등록(FR-060). 투표 가결 여부(D-034)는 호출자(Server Action)가
 * `lib/rules`의 판정 결과로 이미 확인했다는 전제 — 이 함수는 무조건 confirmed로 만든다.
 */
export async function createMeetupFromPoll(input: CreateMeetupFromPollInput): Promise<Meetup> {
  const meetup: Meetup = {
    id: generateId("meetup"),
    crewId: input.crewId,
    pollId: input.pollId,
    title: input.title,
    description: input.description ?? null,
    date: input.date,
    startTime: input.startTime ?? null,
    place: input.place ?? null,
    capacity: input.capacity ?? null,
    attendingCount: 0,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };
  store.meetups.push(meetup);
  return meetup;
}

export interface RespondAttendanceInput {
  meetupId: Id;
  profileId: Id;
  status: AttendanceStatus;
}

/**
 * 참석/불참 응답(FR-066) + 취소 시 자리 반환(FR-067). `unique(meetupId, profileId)`가
 * upsert 멱등성의 전제(D-019) — 여기서는 배열 검색으로 같은 전제를 흉내낸다.
 *
 * `capacity`가 null이면 정원 제한이 없어 조건부 판정을 거치지 않고 바로 반영한다.
 * capacity가 있으면 "attending으로 바뀌는 순간"에만 `attendingCount < capacity`를
 * 검사한다 — 실데이터에서는 이 검사와 증가가 단일 조건부 UPDATE로 원자적이어야
 * 하지만(D-019), Mock은 단일 스레드 이벤트 루프라 순차 실행 자체가 동등한 보장을 준다.
 */
export async function respondAttendance(
  input: RespondAttendanceInput,
): Promise<AttendanceJoinResult> {
  const meetup = store.meetups.find((m) => m.id === input.meetupId);
  if (!meetup) {
    // 호출자가 존재를 이미 보장해야 하는 진짜 프로그래밍 오류 — DataResult가 아니라 예외.
    throw new Error(`meetup ${input.meetupId} 를 찾을 수 없다.`);
  }

  const existing = store.meetupAttendances.find(
    (a) => a.meetupId === input.meetupId && a.profileId === input.profileId,
  );

  if (existing?.status === input.status) {
    return { success: true, changed: false };
  }

  const becomingAttending = input.status === "attending";
  const wasAttending = existing?.status === "attending";

  if (becomingAttending && !wasAttending) {
    if (meetup.capacity !== null && meetup.attendingCount >= meetup.capacity) {
      return { success: false, reason: "full" };
    }
    meetup.attendingCount += 1;
  } else if (!becomingAttending && wasAttending) {
    meetup.attendingCount = Math.max(0, meetup.attendingCount - 1);
  }

  const respondedAt = new Date().toISOString();
  if (existing) {
    existing.status = input.status;
    existing.respondedAt = respondedAt;
  } else {
    store.meetupAttendances.push({
      meetupId: input.meetupId,
      profileId: input.profileId,
      status: input.status,
      respondedAt,
    });
  }
  return { success: true, changed: true };
}

/** 참석자 목록 조회(FR-068). */
export async function listAttendance(meetupId: Id): Promise<MeetupAttendance[]> {
  return store.meetupAttendances.filter((a) => a.meetupId === meetupId);
}

/**
 * Meetup 취소(FR-065 AC1). 이미 취소된 Meetup을 다시 취소하면 `conflict`를 반환한다 — 과거
 * Meetup 가드(AC3)는 이 함수의 책임이 아니라 호출자(Server Action)가 `isMeetupAttendanceOpen`
 * (`lib/rules/meetup-attendance-eligibility.ts`, "확정 상태 + 예정일 미경과" 판정을 FR-066과
 * 공유한다)로 먼저 판정한다.
 */
export async function cancelMeetup(id: Id): Promise<DataResult<Meetup>> {
  const meetup = store.meetups.find((m) => m.id === id);
  if (!meetup) return err("not_found", `meetup ${id} 를 찾을 수 없다.`);
  if (meetup.status === "cancelled") {
    return err("conflict", `meetup ${id} 는 이미 취소됐다.`);
  }
  meetup.status = "cancelled";
  return ok(meetup);
}
