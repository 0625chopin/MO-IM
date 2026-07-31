import type { Id, ISODateString, ISODateTimeString } from "./common.types";

export interface Board {
  id: Id;
  crewId: Id;
}

/**
 * I-079/FR-065 AC2(26일차, CORE) — `meetup_reschedule_proposal` 추가. 기존 확정 Meetup을
 * 겨냥하는 "일정 변경 투표"용 제안글이다. 일반 `meetup_proposal`(새 Meetup을 만드는 제안)과는
 * `targetMeetupId` 필드 하나로 구분된다 — `polls.post_id`/`meetups.poll_id` UNIQUE 제약을
 * 건드리지 않고 "기존 Meetup을 겨냥하는 새 투표"를 표현하는 자리다(D-051 이월 설계).
 */
export type PostType = "general" | "meetup_proposal" | "meetup_reschedule_proposal";

export interface Post {
  id: Id;
  boardId: Id;
  authorId: Id;
  type: PostType;
  title: string;
  body: string;
  /** 모임 제안글(type='meetup_proposal'·'meetup_reschedule_proposal')에서만 의미 있다. */
  meetupDate: ISODateString | null;
  /**
   * 모임 종료일 — **선택 입력이라 nullable이며, null이면 하루짜리 제안이다**(`Meetup.endDate`가
   * non-null인 것과 의도적으로 다르다. 제안글은 "입력하지 않았다"를 표현해야 하고, Meetup은
   * 확정된 기간을 표현한다). 가결 시 `finalize_closed_poll`이
   * `coalesce(meetup_end_date, meetup_date)`로 `meetups.end_date`에 담는다.
   */
  meetupEndDate: ISODateString | null;
  /**
   * 모임 제안글의 선택 입력 3종(D-013) — 시작 시각·장소·정원. `meetupDate`와 같은 이유로
   * `general` 게시글에서는 항상 null이다. 가결(closed_passed) 시 Task 034의 판정 파이프라인이
   * 이 값들을 그대로 `createMeetupFromPoll`(`lib/data/mock/meetup.ts`)의 입력으로 옮긴다 —
   * Meetup은 가결 전에는 존재하지 않으므로 등록 시점부터 판정 시점까지 이 값을 들고 있을
   * 자리가 Post 말고 없다(Task 018B). **`meetup_reschedule_proposal`에서는 "새로 제안하는"
   * 날짜·시각·장소·정원이다** — 가결되면 `finalize_closed_poll`이 이 값들로 `targetMeetupId`가
   * 가리키는 기존 Meetup 행을 UPDATE한다(새 Meetup INSERT 아님, I-079).
   */
  startTime: string | null;
  /** 모임 종료 시각(선택). `startTime`이 없으면 이 값도 없다(DB CHECK). */
  endTime: string | null;
  place: string | null;
  capacity: number | null;
  /**
   * I-079/FR-065 AC2 — `type==='meetup_reschedule_proposal'`일 때만 non-null이며, 그 값이
   * 가리키는 Meetup(같은 크루·`status==='confirmed'`)에 대한 일정 변경 투표임을 뜻한다.
   * `general`·`meetup_proposal`에서는 항상 null이다(DB CHECK `posts_target_meetup_id_check`가
   * 이 대응을 강제한다). 크루·상태 스코프는 DB 트리거(`posts_guard_reschedule_target_scope`)가
   * 추가로 강제한다 — 다른 크루의 Meetup이나 이미 취소된 Meetup을 가리킬 수 없다.
   */
  targetMeetupId: Id | null;
  createdAt: ISODateTimeString;
  /** 수정 시각. FR-032 AC1의 수정 표시 근거(D-035) — 수정 이력이 없으면 null. */
  editedAt: ISODateTimeString | null;
  deletedAt: ISODateTimeString | null;
}

/** FR-033, v0.2 대상 — 데이터 모델만 선반영. */
export interface Comment {
  id: Id;
  postId: Id;
  authorId: Id;
  parentId: Id | null;
  body: string;
  deletedAt: ISODateTimeString | null;
}
