import type {
  Board,
  ChatMessage,
  ChatMessageType,
  ChatRoom,
  Comment,
  Crew,
  CrewMembership,
  CrewMembershipRole,
  CrewMembershipStatus,
  CrewVisibility,
  Invitation,
  InvitationStatus,
  JoinRequest,
  JoinRequestStatus,
  Meetup,
  MeetupAttendance,
  MeetupScheduleChange,
  Notification,
  NotificationChannel,
  NotificationPreference,
  NotificationType,
  Poll,
  PollEligibleVoter,
  PollOutcome,
  PollStatus,
  PollVote,
  Post,
  PostType,
  Profile,
  ProfileStatus,
  VoteChoice,
} from "@/lib/types";

import type { Tables } from "./database.types";

/**
 * DB 행(snake_case) → 도메인 타입(camelCase) 매퍼 모음(NFR-034·035).
 *
 * 9개 도메인 모듈이 공유한다 — 매핑 규칙을 한 곳에 모아 두면 컬럼이 하나 바뀌었을 때 고칠
 * 자리가 하나로 줄어든다. 값 자체의 검증(예: status가 실제로 저 열거값 중 하나인지)은 DB의
 * CHECK 제약(`supabase/migrations`)이 이미 강제하므로 여기서는 단순 캐스팅만 한다 — 스키마와
 * 도메인 타입의 열거값 어휘가 1:1로 맞아떨어짐을 전제한다(어긋나면 CHECK 제약을 추가한
 * 마이그레이션 시점에 `database.types.ts` 재생성 + 이 파일 동시 갱신이 필요하다).
 */

export function toBoard(row: Tables<"boards">): Board {
  return { id: row.id, crewId: row.crew_id };
}

export function toPost(row: Tables<"posts">): Post {
  return {
    id: row.id,
    boardId: row.board_id,
    authorId: row.author_id,
    type: row.type as PostType,
    title: row.title,
    body: row.body,
    meetupDate: row.meetup_date,
    startTime: row.start_time,
    place: row.place,
    capacity: row.capacity,
    targetMeetupId: row.target_meetup_id,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
  };
}

/** `created_at`은 도메인 타입(Comment)에 없는 운영 부기 컬럼이다(`comments` 테이블 코멘트,
 *  `posts`·`invitations`와 같은 취급) — 매핑하지 않는다. 정렬은 호출부가 쿼리에서
 *  `order("created_at")`로 한다. */
export function toComment(row: Tables<"comments">): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    parentId: row.parent_id,
    body: row.body,
    deletedAt: row.deleted_at,
  };
}

export function toChatRoom(row: Tables<"chat_rooms">): ChatRoom {
  return { id: row.id, crewId: row.crew_id };
}

export function toChatMessage(row: Tables<"chat_messages">): ChatMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    type: row.type as ChatMessageType,
    body: row.body,
    refPostId: row.ref_post_id,
    clientKey: row.client_key,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

export function toCrew(row: Tables<"crews">): Crew {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    visibility: row.visibility as CrewVisibility,
    colorKey: row.color_key,
    ownerId: row.owner_id,
    status: row.status as Crew["status"],
  };
}

export function toCrewMembership(row: Tables<"crew_memberships">): CrewMembership {
  return {
    crewId: row.crew_id,
    profileId: row.profile_id,
    role: row.role as CrewMembershipRole,
    status: row.status as CrewMembershipStatus,
    joinedAt: row.joined_at,
    removedReason: row.removed_reason,
  };
}

export function toInvitation(row: Tables<"invitations">): Invitation {
  return {
    id: row.id,
    crewId: row.crew_id,
    inviteeId: row.invitee_id,
    inviterId: row.inviter_id,
    status: row.status as InvitationStatus,
    expiresAt: row.expires_at,
  };
}

export function toJoinRequest(row: Tables<"join_requests">): JoinRequest {
  return {
    id: row.id,
    crewId: row.crew_id,
    requesterId: row.requester_id,
    message: row.message,
    status: row.status as JoinRequestStatus,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
  };
}

export function toMeetup(row: Tables<"meetups">): Meetup {
  return {
    id: row.id,
    crewId: row.crew_id,
    pollId: row.poll_id,
    title: row.title,
    description: row.description,
    date: row.date,
    startTime: row.start_time,
    place: row.place,
    capacity: row.capacity,
    attendingCount: row.attending_count,
    status: row.status as Meetup["status"],
    createdAt: row.created_at,
  };
}

export function toMeetupAttendance(row: Tables<"meetup_attendances">): MeetupAttendance {
  return {
    meetupId: row.meetup_id,
    profileId: row.profile_id,
    status: row.status as MeetupAttendance["status"],
    respondedAt: row.responded_at,
    invalidatedAt: row.invalidated_at,
  };
}

/** I-079/FR-065 AC2(26일차, CORE) — Meetup 일정 변경 이력 1건. */
export function toMeetupScheduleChange(row: Tables<"meetup_schedule_changes">): MeetupScheduleChange {
  return {
    id: row.id,
    meetupId: row.meetup_id,
    pollId: row.poll_id,
    previousDate: row.previous_date,
    previousStartTime: row.previous_start_time,
    previousPlace: row.previous_place,
    previousCapacity: row.previous_capacity,
    newDate: row.new_date,
    newStartTime: row.new_start_time,
    newPlace: row.new_place,
    newCapacity: row.new_capacity,
    changedAt: row.changed_at,
  };
}

export function toNotification(row: Tables<"notifications">): Notification {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    type: row.type as NotificationType,
    channel: row.channel as NotificationChannel,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/** FR-072(Task 044). 도메인 타입은 DB의 대리키 `id`를 노출하지 않는다(`profileId`·`type`·
 *  `crewId` 조합이 유일성을 이미 보장한다, `notification.types.ts` 참고). */
export function toNotificationPreference(row: Tables<"notification_preferences">): NotificationPreference {
  return {
    profileId: row.profile_id,
    type: row.type as NotificationType,
    crewId: row.crew_id,
    enabled: row.enabled,
  };
}

export function toPoll(row: Tables<"polls">): Poll {
  return {
    id: row.id,
    postId: row.post_id,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    status: row.status as PollStatus,
    closedBy: row.closed_by,
    result: row.result as PollOutcome | null,
    decidedAt: row.decided_at,
  };
}

export function toPollEligibleVoter(row: Tables<"poll_eligible_voters">): PollEligibleVoter {
  return {
    pollId: row.poll_id,
    profileId: row.profile_id,
    notifiedAt: row.notified_at,
    notifyAttempts: row.notify_attempts,
  };
}

export function toPollVote(row: Tables<"poll_votes">): PollVote {
  return {
    pollId: row.poll_id,
    voterId: row.voter_id,
    choice: row.choice as VoteChoice,
    votedAt: row.voted_at,
    invalidated: row.invalidated,
  };
}

export function toProfile(row: Tables<"profiles">): Profile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    status: row.status as ProfileStatus,
    searchOptOut: row.search_opt_out,
    anonymizedAt: row.anonymized_at,
    deactivatedAt: row.deactivated_at,
    handleChangedAt: row.handle_changed_at,
    onboardingCompletedAt: row.onboarding_completed_at,
    isSystemAdmin: row.is_system_admin,
  };
}

/** ILIKE 와일드카드(`%`·`_`)와 `.or()` 필터 문자열의 구분자(`,`·`"`)를 이스케이프한다
 *  (`listCrews`의 자유 텍스트 검색어용, 최선 노력 수준 — R-007 참고는 없으나 사용자 입력을
 *  PostgREST 필터 문법에 그대로 꽂지 않기 위한 최소 방어). */
export function escapeForIlikeOr(value: string): string {
  return value.replace(/[%_]/g, (ch) => `\\${ch}`).replace(/"/g, '\\"');
}
