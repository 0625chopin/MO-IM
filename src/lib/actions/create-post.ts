"use server";

import { refresh } from "next/cache";

import { todayIsoUtc } from "@/components/calendar/date-grid";
import { getAuthSession } from "@/components/shell/get-auth-session";
import {
  createPoll,
  createPost,
  findOpenRescheduleProposal,
  getBoardByCrewId,
  getCrewMembership,
  getMeetupById,
  listCrewMembers,
} from "@/lib/data";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { isMeetupAttendanceOpen } from "@/lib/rules/meetup-attendance-eligibility";
import {
  type MeetupProposalScheduleField,
  type MeetupProposalScheduleReason,
  validateMeetupProposalSchedule,
} from "@/lib/rules/meetup-proposal-schedule";
import { checkPermission } from "@/lib/rules/permission";
import { validatePostContent } from "@/lib/rules/post-content-validation";
import { strings } from "@/lib/strings";
import type { Id, PostType } from "@/lib/types";

/**
 * 게시글 작성(FR-030) + 모임 제안글이면 찬반 투표 동시 생성(FR-034 정상 흐름 ④) Server
 * Action(Task 018B). `PostWriteForm`이 `startTransition`으로 직접 호출한다 —
 * `useActionState`/`FormData` 대신 `PostActions.tsx`(018A)의 인라인 편집 폼과 같은
 * 직접 호출 패턴을 쓴다. 이 폼은 임시 저장 자동 저장·유형 토글에 따른 필드 표시 전환·
 * 날짜 중복 경고(비차단) 때문에 처음부터 클라이언트 상태를 갖고 있어야 해서, 진행
 * 향상(progressive enhancement)의 이점이 실질적으로 없다 — `CrewCreateForm`(단순
 * 입력만 받는 폼)과는 그 지점에서 갈린다.
 *
 * **인증·권한 검사가 여기 있다** — `(app)/crews/[crewId]/layout.tsx`(D-039)가 크루원
 * 여부는 이미 걸렀지만, Server Action은 그 라우트를 거치지 않고 직접 호출될 수 있다
 * (Next.js 공식 경고, `updatePostAction`·`deletePostAction`과 동일한 방어). `post:create`
 * (일반글)와 `poll:create_proposal`(모임 제안글) 둘 다 매트릭스상 crew_member 이상만
 * 허용이라 사실상 동시에 통과/거부되지만, 유형별로 별도 행이 존재하는 이상 둘 다
 * 명시적으로 판정한다 — 하나를 생략하면 나중에 두 매트릭스 행이 갈릴 때(예: 모임 제안만
 * 임원 이상으로 제한) 조용히 놓친다.
 *
 * **날짜 중복 경고(FR-034 E4)는 여기서 재확인하지 않는다** — "경고 후 진행 허용"이라
 * 차단 조건이 아니다. 클라이언트가 `checkDuplicateMeetupDateAction`으로 비차단 안내만
 * 보여준다.
 *
 * **I-079/FR-065 AC2(26일차, BOARD) — `meetup_reschedule_proposal`도 이 액션이 처리한다.**
 * CORE의 인계 문서(`docs/decisions/meetup-reschedule-079.md` §4.1)대로 "새 Server Action을
 * 만들지 않는다" — 일반 FR-034 제안과 정확히 같은 2단계(`createPost` → `createPoll`)이고
 * `poll:create_proposal` 권한 매트릭스 행도 그대로 재사용한다(`permission.ts` 무변경).
 * **다른 점은 사전 검증 하나뿐이다**: DB 트리거 `posts_guard_reschedule_target_scope`가
 * 크루·상태 스코프를 최종 방어하지만 `raise exception`으로 막아(`DataResult`가 아니다)
 * 사전 확인 없이 `createPost`를 부르면 처리되지 않은 500이 사용자에게 노출된다. 그래서
 * `cancelMeetupAction`이 이미 쓰는 패턴(`targetMeetupId` 존재 → 대상 Meetup 조회 → 같은
 * 크루·`isMeetupAttendanceOpen`)을 그대로 가져와 트리거에 도달하기 전에 깔끔한 도메인
 * 오류로 바꾼다(아래 `code: "conflict"` 분기). 트리거의 원문 예외 메시지는 파싱해 분기하지
 * 않는다 — 애초에 도달하지 않게 만드는 쪽이 맞다.
 *
 * **I-130(27일차, BOARD) — 같은 Meetup을 겨냥한 open 제안 상호 배제.** 사용자 결정: "트리거로
 * DB에서 차단하고, UI는 도달 전에 사전 안내한다"(D-079). `posts_guard_reschedule_target_scope`
 * 트리거가 최종 방어선(상관 서브쿼리로 두 번째 open 제안 INSERT/UPDATE를 거부)이지만, 이
 * 트리거도 `raise exception`으로 막으므로 위와 같은 이유로 사전 검증이 필요하다 —
 * `findOpenRescheduleProposal`을 먼저 호출해 걸리면 `code: "duplicate_proposal"`로 깔끔하게
 * 돌려주고, 그 안내에 **기존 제안글로 가는 링크**(`conflictingPostId`)를 함께 담는다(팀장 지시
 * — "막다른 길로 느끼지 않게"). 트리거 예외 메시지는 여기서도 파싱하지 않는다.
 */
export interface CreatePostActionInput {
  crewId: Id;
  type: PostType;
  title: string;
  body: string;
  /** type='meetup_proposal'·'meetup_reschedule_proposal'일 때만 쓴다. */
  meetupDate?: string;
  /** 모임 종료일(선택) — 비면 하루짜리 모임이다(다일 모임 지원, 2026-07-31). */
  meetupEndDate?: string;
  voteDeadline?: string;
  startTime?: string;
  /** 모임 종료 시각(선택). 시작 시각 없이 넣을 수 없다. */
  endTime?: string;
  place?: string;
  capacity?: number | null;
  /** type='meetup_reschedule_proposal'일 때만 쓴다 — 대상 기존 Meetup의 id(I-079). */
  targetMeetupId?: Id;
}

export interface CreatePostFieldErrors {
  title?: string;
  body?: string;
  scheduledDate?: string;
  scheduledEndDate?: string;
  endTime?: string;
  voteDeadline?: string;
}

/**
 * I-079 — `code: "conflict"`를 추가했다(기존 "fields"|"denied" 두 kind는 그대로 둔다,
 * BOARD 판단). CORE의 인계 문서는 취소된 대상 Meetup을 위한 새 `kind`(예: "conflict")를
 * 검토할지 BOARD 판단에 맡겼는데, 새 `kind`를 추가하는 대신 기존 `kind: "denied"`의 `code`
 * 유니온에 `"conflict"`만 얹었다 — 근거:
 * 1. `cancelMeetupAction`(`DataResult`)이 정확히 같은 상황("취소됐거나 예정일이 지난
 *    Meetup")에 이미 `err("conflict", …)`를 쓰고 있어(`lib/actions/cancel-meetup.ts:81`),
 *    이 액션도 같은 어휘를 재사용하면 두 액션의 오류 코드가 갈라지지 않는다(§4 "같은 개념은
 *    같은 값을 쓴다").
 * 2. "다른 크루 Meetup 대상"은 대상이 존재하지 않는 것과 사용자 관점에서 구분할 이유가
 *    없어(권한 있는 사용자에게 굳이 "다른 크루 소속"이라고 알려줄 필요가 없다 — 오히려 크루
 *    경계 정보 누출) `cancelMeetupAction`과 동일하게 `not_found`로 합친다
 *    (`cancel-meetup.ts:55~57` 참고 — 이미 그렇게 하고 있다).
 * 3. `kind: "fields"`는 "사용자가 고친 입력값 자체의 문제"(제목·날짜 형식 등)에 쓰고,
 *    `kind: "denied"`는 "이 요청 자체를 이 사용자·이 대상으로는 수행할 수 없다"에 쓴다 —
 *    "취소된 Meetup 대상"은 후자(입력값이 아니라 대상의 상태 문제)라 `denied`가 맞는 자리다.
 *
 * **I-130(27일차) — `code: "duplicate_proposal"` 추가.** "conflict"(대상 Meetup 자체의 상태
 * 문제)와 성격이 달라 같은 코드로 합치지 않았다 — 이쪽은 대상 Meetup은 멀쩡하고 "이미 같은
 * 대상을 겨냥한 다른 제안이 진행 중"이라는 별개 사실이라, 안내에 그 제안글 id
 * (`conflictingPostId`)를 함께 실어야 해서 `code`만으로는 UI가 필요한 정보를 못 만든다.
 */
export type CreatePostActionResult =
  | { ok: true; postId: Id }
  | { ok: false; kind: "fields"; fieldErrors: CreatePostFieldErrors }
  | { ok: false; kind: "denied"; code: "forbidden" | "not_found" | "conflict" }
  | { ok: false; kind: "denied"; code: "duplicate_proposal"; conflictingPostId: Id };

/**
 * 일정 검증 위반(필드 × 사유) → 사용자 문구.
 *
 * **필드 키가 {@link CreatePostFieldErrors}의 키와 같은 이름이라 그대로 대입한다** — 위반 하나가
 * 어느 입력 칸에 붙어야 하는지를 판정 쪽(`MeetupProposalScheduleField`)이 이미 정하고 있어서,
 * 여기서 다시 분기로 옮겨 적을 이유가 없다. 안쪽이 `Partial`인 이유는 사유 유니온이 네 필드
 * 전체의 합집합이기 때문이다(예: `too_short`는 `voteDeadline`에만 온다) — 판정 함수가 그 필드에
 * 낼 수 없는 사유는 여기 없고, 없으면 아래 루프가 조용히 건너뛴다.
 */
const SCHEDULE_VIOLATION_MESSAGES: Record<
  MeetupProposalScheduleField,
  Partial<Record<MeetupProposalScheduleReason, string>>
> = {
  scheduledDate: {
    in_past: strings.board.write.validation.scheduledDateInPast,
  },
  scheduledEndDate: {
    before_schedule_date: strings.board.write.validation.scheduledEndDateBeforeStart,
    duration_too_long: strings.board.write.validation.scheduledEndDateTooLong,
  },
  endTime: {
    before_start_time: strings.board.write.validation.endTimeBeforeStartTime,
    start_time_missing: strings.board.write.validation.endTimeWithoutStartTime,
  },
  voteDeadline: {
    in_past: strings.board.write.validation.voteDeadlineInPast,
    after_schedule_date: strings.board.write.validation.voteDeadlineAfterSchedule,
    too_short: strings.board.write.validation.voteDeadlineTooShort,
    too_long: strings.board.write.validation.voteDeadlineTooLong,
  },
};

export async function createPostAction(
  input: CreatePostActionInput,
): Promise<CreatePostActionResult> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { ok: false, kind: "denied", code: "forbidden" };
  }

  const board = await getBoardByCrewId(input.crewId);
  if (!board) {
    return { ok: false, kind: "denied", code: "not_found" };
  }

  const membership = await getCrewMembership(input.crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);

  // I-079 — 'meetup_proposal'·'meetup_reschedule_proposal' 둘 다 같은 제안글 갈래다(§4.1
  // 인계 문서: "일반 FR-034 제안과 정확히 같은 2단계"). 새 권한 행을 만들지 않는다.
  const isProposalType =
    input.type === "meetup_proposal" || input.type === "meetup_reschedule_proposal";

  const canCreatePost = checkPermission({ role, action: "post:create" });
  if (!canCreatePost.allowed) {
    return { ok: false, kind: "denied", code: "forbidden" };
  }
  if (isProposalType) {
    const canProposeMeetup = checkPermission({ role, action: "poll:create_proposal" });
    if (!canProposeMeetup.allowed) {
      return { ok: false, kind: "denied", code: "forbidden" };
    }
  }

  // I-079/FR-065 AC2 — 대상 Meetup 사전 검증(`meetup-reschedule-079.md` §4.1). DB 트리거
  // `posts_guard_reschedule_target_scope`가 크루·상태 스코프를 최종 방어하지만 `raise
  // exception`으로 막는다 — 여기서 먼저 걸러 처리되지 않은 500을 막는다. `isMeetupAttendanceOpen`
  // (FR-066 사전조건 "확정 + 예정일 미경과")을 재사용한다 — `cancelMeetupAction`이 "취소됐거나
  // 예정일이 지난 모임"에 쓰는 것과 같은 판정이라 두 액션의 "conflict" 의미가 갈라지지 않는다.
  if (input.type === "meetup_reschedule_proposal") {
    if (!input.targetMeetupId) {
      return { ok: false, kind: "denied", code: "forbidden" };
    }
    const targetMeetup = await getMeetupById(input.targetMeetupId);
    // 대상이 없거나 다른 크루 소속이면 둘 다 not_found로 합친다 — cancelMeetupAction과 같은
    // 관례(크루 경계 정보를 굳이 구분해 노출하지 않는다).
    if (!targetMeetup || targetMeetup.crewId !== input.crewId) {
      return { ok: false, kind: "denied", code: "not_found" };
    }
    if (!isMeetupAttendanceOpen(targetMeetup, todayIsoUtc(new Date()))) {
      return { ok: false, kind: "denied", code: "conflict" };
    }

    // I-130 — 같은 Meetup을 겨냥한, 아직 종료되지 않은(open) 일정 변경 제안이 이미 있으면
    // 여기서 막는다. DB 트리거(posts_guard_reschedule_target_scope)가 최종 방어선이지만
    // raise exception이라 사전에 걸러야 처리되지 않은 500을 피한다(위 두 검증과 같은 이유).
    // 종료된(closed/withdrawn) 제안은 findOpenRescheduleProposal이 애초에 보지 않는다 — 재제안은
    // 막지 않는다.
    const conflictingProposal = await findOpenRescheduleProposal(input.targetMeetupId);
    if (conflictingProposal) {
      return {
        ok: false,
        kind: "denied",
        code: "duplicate_proposal",
        conflictingPostId: conflictingProposal.id,
      };
    }
  }

  const fieldErrors: CreatePostFieldErrors = {};
  const contentViolations = validatePostContent(input.title, input.body);
  if (contentViolations.includes("title_required")) {
    fieldErrors.title = strings.board.write.validation.titleRequired;
  }
  if (contentViolations.includes("body_required")) {
    fieldErrors.body = strings.board.write.validation.descriptionRequired;
  }

  const nowIso = new Date().toISOString();
  const meetupDate = input.meetupDate ?? "";
  const meetupEndDate = input.meetupEndDate ?? "";
  const startTime = input.startTime ?? "";
  const endTime = input.endTime ?? "";
  const voteDeadline = input.voteDeadline ?? "";

  if (isProposalType) {
    const scheduleViolations = validateMeetupProposalSchedule({
      scheduledDate: meetupDate,
      scheduledEndDate: meetupEndDate,
      startTime,
      endTime,
      voteDeadline,
      nowIso,
    });
    for (const violation of scheduleViolations) {
      if (fieldErrors[violation.field] !== undefined) continue;
      const message = SCHEDULE_VIOLATION_MESSAGES[violation.field][violation.reason];
      if (message) fieldErrors[violation.field] = message;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, kind: "fields", fieldErrors };
  }

  const createResult = await createPost({
    boardId: board.id,
    authorId: session.profileId,
    type: input.type,
    title: input.title.trim(),
    body: input.body.trim(),
    meetupDate: isProposalType ? meetupDate : null,
    // 종료일이 시작일과 같으면 null로 저장한다 — DB에서 "하루짜리"는 `meetup_end_date is null`과
    // `= meetup_date` 둘 다로 표현될 수 있는데, 두 표현이 섞이면 "기간 모임인가"를 판정하는
    // 코드가 두 갈래가 된다. 입력 시점에 하나로 정규화한다(가결 시 coalesce가 어차피 같은
    // 값을 만든다).
    meetupEndDate:
      isProposalType && meetupEndDate && meetupEndDate !== meetupDate ? meetupEndDate : null,
    startTime: isProposalType ? (input.startTime || null) : null,
    endTime: isProposalType ? (input.endTime || null) : null,
    place: isProposalType ? (input.place || null) : null,
    // 0·음수 정원은 저장하지 않는다 — D-019의 조건부 UPDATE(`attendingCount < capacity`)가
    // 0 이하를 받으면 "정원 있음 + 항상 마감"이 되어 D-013 "정원 미지정 = 무제한"과 구분이
    // 안 된다. 클라이언트가 `min={1}`을 두지만 Server Action은 그 힌트를 신뢰하지 않는다.
    capacity:
      isProposalType && input.capacity !== null && input.capacity !== undefined && input.capacity > 0
        ? input.capacity
        : null,
    // I-079 — 'meetup_reschedule_proposal'일 때만 채운다. `createPost`(데이터 레이어) 쪽
    // `isReschedule` 플래그가 다른 유형에서는 어차피 null로 고정하지만, 의도를 명시적으로
    // 드러내기 위해 호출부에서도 유형을 한 번 더 좁힌다.
    targetMeetupId: input.type === "meetup_reschedule_proposal" ? input.targetMeetupId : undefined,
  });
  // 32일차(I-150 해소) — `createComment`가 이미 쓰는 패턴과 같다: `createPost`가 이제
  // `DataResult<Post>`를 반환하므로(archived 크루 등 `posts_insert_members` RLS 거부 시
  // `err("forbidden", …)`) 원시 예외 대신 이 액션의 기존 `denied/forbidden` 어휘로 옮겨 담는다
  // — 새 `kind`·새 오류 코드를 만들지 않는다.
  if (!createResult.ok) {
    return { ok: false, kind: "denied", code: "forbidden" };
  }
  const post = createResult.data;

  if (isProposalType) {
    // FR-040 AC1 — 대상자는 "등록 시각의 active 크루원" 스냅샷(D-025). 강퇴·탈퇴·초대
    // 대기 중인 멤버십 행은 제외한다. 일정 변경 제안도 같은 규칙을 그대로 쓴다 — FR-040이
    // 제안글 유형을 구분하지 않는다.
    const members = await listCrewMembers(input.crewId);
    const eligibleVoterIds = members.filter((m) => m.status === "active").map((m) => m.profileId);
    await createPoll({
      postId: post.id,
      opensAt: post.createdAt,
      closesAt: voteDeadline,
      eligibleVoterIds,
    });
  }

  refresh();
  return { ok: true, postId: post.id };
}
