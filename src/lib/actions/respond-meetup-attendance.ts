"use server";

import { refresh } from "next/cache";

import { todayIsoUtc } from "@/components/calendar/date-grid";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCrewMembership, getMeetupById, respondAttendance } from "@/lib/data";
import { isActiveMembership } from "@/lib/rules/crew-membership-transition";
import { isMeetupAttendanceOpen } from "@/lib/rules/meetup-attendance-eligibility";
import { strings } from "@/lib/strings";
import type { AttendanceStatus } from "@/lib/types";

/**
 * FR-066·FR-067 참석/불참 응답 Server Action(Task 022). `MeetupAttendanceActions`가
 * `useActionState(respondMeetupAttendanceAction, ...)`로 건다 — `JoinRequestButton`의
 * `requestToJoinCrewAction`/`withdrawJoinRequestAction`과 같은 형태(D-030 쓰기 후 갱신
 * 패턴, Server Action + `refresh()`).
 *
 * **클라이언트 상태를 신뢰하지 않는다** — `MeetupAttendanceActions`는 컨테이너가 이미
 * 계산한 `MeetupAttendanceButtonState`(`lib/rules/meetup-attendance-button-state.ts`)로
 * 버튼을 숨기거나 비활성화하지만, 이 액션은 그 판정을 서버에서 **다시** 한다 — 크루원
 * 여부(FR-066 E5)·모임 상태와 예정일(E3·E4)을 순서대로 재확인한 뒤에야
 * `respondAttendance`(`lib/data`)를 호출한다. 정원 초과 방지의 실제 원자성은
 * `respondAttendance` 내부(D-019 — `respond_meetup_attendance` RPC가 조건부 UPDATE를 단일
 * 트랜잭션으로 보장한다)가 맡고, 여기서는 그 결과(`AttendanceJoinResult`)만 문구로 옮긴다.
 *
 * **Task 032 교차검증(CORE, 18일차) major 1 수정** — `result.reason === "forbidden"`도
 * 처리한다(RPC의 2차 방어선, 위 활성 멤버십 확인과 호출 사이의 TOCTOU나 publishable key로
 * RPC를 직접 호출하는 경로에서만 도달한다). `notMember`와 같은 문구를 재사용한다 — 사용자
 * 관점에서는 같은 사실("이 크루의 크루원만 응답할 수 있다")이고, 이미 위에서 같은 문구를 쓰고
 * 있어 새 문자열을 만들지 않았다.
 */
export interface RespondMeetupAttendanceFormState {
  success?: boolean;
  formError?: string;
}

// 초기 상태 상수는 여기 두지 않는다 — `'use server'` 파일은 async 함수만 export할 수 있다
// (signup.ts 모듈 docstring 참고). 호출부(`MeetupAttendanceActions`)가 타입만 가져다 직접 만든다.

function isAttendanceStatus(value: string): value is AttendanceStatus {
  return value === "attending" || value === "absent";
}

export async function respondMeetupAttendanceAction(
  _prevState: RespondMeetupAttendanceFormState,
  formData: FormData,
): Promise<RespondMeetupAttendanceFormState> {
  const meetupId = String(formData.get("meetupId") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  if (!isAttendanceStatus(statusRaw)) {
    return { formError: strings.meetup.attendance.errors.invalidRequest };
  }

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { formError: strings.meetup.attendance.errors.sessionExpired };
  }

  const meetup = await getMeetupById(meetupId);
  if (!meetup) {
    return { formError: strings.meetup.attendance.errors.notFound };
  }

  const membership = await getCrewMembership(meetup.crewId, session.profileId);
  if (!membership || !isActiveMembership(membership.status)) {
    return { formError: strings.meetup.attendance.errors.notMember };
  }

  if (meetup.status === "cancelled") {
    return { formError: strings.meetup.attendance.errors.cancelled };
  }
  if (!isMeetupAttendanceOpen(meetup, todayIsoUtc(new Date()))) {
    return { formError: strings.meetup.attendance.errors.closed };
  }

  const result = await respondAttendance({
    meetupId,
    profileId: session.profileId,
    status: statusRaw,
  });
  if (!result.success) {
    return {
      formError:
        result.reason === "forbidden"
          ? strings.meetup.attendance.errors.notMember
          : strings.meetup.attendance.errors.full,
    };
  }

  refresh();
  return { success: true };
}
