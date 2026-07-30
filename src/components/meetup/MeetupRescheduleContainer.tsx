import { notFound } from "next/navigation";

import { formatDayLabelKo, formatStartTimeKo, todayIsoUtc } from "@/components/calendar/date-grid";
import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";
import { MeetupRescheduleConflict } from "@/components/meetup/MeetupRescheduleConflict";
import { MeetupRescheduleForm } from "@/components/meetup/MeetupRescheduleForm";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { findOpenRescheduleProposal, getCrewById, getCrewMembership, getMeetupById } from "@/lib/data";
import { deriveUserRoleForPermissionCheck, isActiveMembership } from "@/lib/rules/crew-membership-transition";
import { isMeetupAttendanceOpen } from "@/lib/rules/meetup-attendance-eligibility";
import { checkPermission } from "@/lib/rules/permission";
import type { Id } from "@/lib/types";

export interface MeetupRescheduleContainerProps {
  meetupId: Id;
}

/**
 * "일정 변경 제안" 전용 글쓰기 진입점(I-079/FR-065 AC2, 26일차 BOARD) — `docs/decisions/
 * meetup-reschedule-079.md` §4가 단일 소스다. 일반 FR-034 제안 글쓰기(`PostWriteContainer`)와
 * 구분되는 화면이다 — 대상 Meetup이 리소스 ID로 이미 특정돼 있어야 하고(R-016·FR-052,
 * `/meetups/[meetupId]/reschedule`), 유형 토글이 없다(`meetup_reschedule_proposal`로 고정).
 *
 * 게이트는 `MeetupDetailContainer`가 "일정 변경 제안" 버튼을 노출할 때 쓰는 것과 **같은 판정**
 * (활성 크루원 + `poll:create_proposal` + `isMeetupAttendanceOpen`)을 라우트 레벨에서 다시
 * 한다 — 버튼을 거치지 않은 직접 URL 접근을 방어한다(`PostWriteContainer`와 같은 이유,
 * D-039가 이 라우트 트리를 걸러주지 않는다는 점도 `MeetupDetailContainer`와 동일하다).
 *
 * **"취소된 Meetup 대상"(3.2 D-030③ 요구 도메인 오류)이 여기서 걸러진다** — 직접 URL로
 * 접근했을 때 대상이 이미 취소됐거나 예정일이 지났으면 `RouteErrorBoundary kind="conflict"`를
 * 값으로 반환한다(`cancelMeetupAction`의 "conflict" 의미와 같다, `create-post.ts`의
 * 액션 레벨 재검증과는 별개 — 이 페이지를 연 시점의 방어다). 제출 시점에 대상이 그 사이
 * 바뀌면(TOCTOU) `createPostAction`이 같은 `conflict` 코드를 반환하고 `MeetupRescheduleForm`이
 * 폼 인라인 오류로 보여준다 — "이미 처리됨" 시나리오가 그 지점이다.
 *
 * **I-130(27일차) — 같은 Meetup을 겨냥한 open 제안이 이미 있으면 여기서도 걸러진다.**
 * `findOpenRescheduleProposal`이 걸리면 폼을 아예 렌더하지 않고 `MeetupRescheduleConflict`
 * (기존 제안글로 가는 링크 포함, D-079)를 값으로 반환한다 — 버튼(`MeetupLifecycleActions`의
 * "일정 변경 제안")을 거치지 않은 직접 URL 접근도 같은 안내를 받는다. 제출 시점에 다른
 * 사람이 먼저 등록하면(TOCTOU) `createPostAction`이 같은 사실을 `code: "duplicate_proposal"`
 * 로 반환하고 `MeetupRescheduleForm`이 같은 컴포넌트를 폼 인라인으로 보여준다.
 */
export async function MeetupRescheduleContainer({ meetupId }: MeetupRescheduleContainerProps) {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    // (app) 레이아웃이 이미 미인증 분기를 선택했을 병렬 렌더링의 폐기 브랜치다
    // (`MeetupDetailContainer`의 I-095 방어와 같은 이유).
    return null;
  }

  const meetup = await getMeetupById(meetupId);
  if (!meetup) {
    notFound();
  }

  const crew = await getCrewById(meetup.crewId);
  if (!crew) {
    notFound();
  }

  const membership = await getCrewMembership(meetup.crewId, session.profileId);
  if (!membership || !isActiveMembership(membership.status)) {
    return <RouteErrorBoundary kind="forbidden" />;
  }

  const role = deriveUserRoleForPermissionCheck(membership);
  const canPropose = checkPermission({ role, action: "poll:create_proposal" }).allowed;
  // 해산된 크루는 쓰기 전용 라우트를 아예 막는다(I-066 해소 방향과 같은 정책,
  // `PostWriteContainer`의 `crew.status !== "active"` 분기 참고) — UI 안내일 뿐이고 최종
  // 경계는 posts INSERT RLS다.
  if (!canPropose || crew.status !== "active") {
    return <RouteErrorBoundary kind="forbidden" />;
  }

  const todayIso = todayIsoUtc(new Date());
  if (!isMeetupAttendanceOpen(meetup, todayIso)) {
    return <RouteErrorBoundary kind="conflict" />;
  }

  // I-130 — 이 Meetup을 겨냥한 open 일정 변경 제안이 이미 있으면 폼을 열지 않는다(사용자
  // 결정, D-079). DB 트리거가 최종 방어선이지만 raise exception이라 여기서 먼저 걸러 사용자를
  // 막다른 길이 아니라 기존 제안글로 안내한다.
  const conflictingProposal = await findOpenRescheduleProposal(meetup.id);
  if (conflictingProposal) {
    return <MeetupRescheduleConflict crewId={meetup.crewId} conflictingPostId={conflictingProposal.id} />;
  }

  return (
    <MeetupRescheduleForm
      crewId={meetup.crewId}
      targetMeetupId={meetup.id}
      currentSchedule={{
        dateLabel: formatDayLabelKo(meetup.date),
        startTimeLabel: formatStartTimeKo(meetup.startTime),
        place: meetup.place,
        capacity: meetup.capacity,
      }}
    />
  );
}
