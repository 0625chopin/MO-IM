import { notFound } from "next/navigation";

import { getPostDetailHref } from "@/components/board/board-links";
import { formatPostDate } from "@/components/board/format-post-date";
import {
  formatDateRangeLabelKo,
  formatTimeRangeKo,
  todayIsoUtc,
} from "@/components/calendar/date-grid";
import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";
import type { MeetupScheduleChangeView } from "@/components/meetup/meetup-view-models";
import { MeetupDetail } from "@/components/meetup/MeetupDetail";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import {
  getCrewById,
  getCrewMembership,
  getMeetupById,
  getPollById,
  getPollTally,
  getPostById,
  getProfileById,
  listAttendance,
  listCrewMembers,
  listMeetupScheduleChanges,
} from "@/lib/data";
import { deriveUserRoleForPermissionCheck, isActiveMembership } from "@/lib/rules/crew-membership-transition";
import { resolveMeetupAttendanceButtonState } from "@/lib/rules/meetup-attendance-button-state";
import { isMeetupAttendanceOpen } from "@/lib/rules/meetup-attendance-eligibility";
import { groupMeetupParticipantIds } from "@/lib/rules/meetup-participant-grouping";
import { checkPermission } from "@/lib/rules/permission";
import type { Id, MeetupAttendance, Profile } from "@/lib/types";

/**
 * Mock 조회 컨테이너(D-030 ①) — Task 022. `src/app/(app)/meetups/[meetupId]/page.tsx`가 이
 * 컴포넌트를 조립하고, 이 컴포넌트는 `lib/data`(배럴)를 호출해 얻은 데이터를 `MeetupDetail`
 * (표현)의 props로 그대로 넘긴다. 실데이터 전환(Task 031) 시 이 파일의 조회 부분만 바뀌고
 * 표현 컴포넌트는 손대지 않는다.
 *
 * **크루원 게이트(FR-064 AC2)를 이 컨테이너가 직접 한다** — `(app)/crews/[crewId]/layout.tsx`
 * (D-039)는 `/crews/[crewId]/*` 트리에만 적용되고, 이 라우트는 `/meetups/[meetupId]`로
 * 그 트리 밖(리소스 ID 기준, R-016)에 있어 그 레이아웃을 거치지 않는다. 그래서 같은 판정
 * (`getCrewMembership` + `isActiveMembership`)을 여기서 다시 한다.
 *
 * **20일차(I-069 근본 해결, DESIGN) — 비소속 판정을 더 이상 throw하지 않는다.** 예전엔
 * `cause: { code: "forbidden" }`를 던져 `error.tsx`의 `classifyError`가 받았지만, 프로덕션
 * 빌드는 서버 컴포넌트 예외의 `cause`를 클라이언트로 넘기지 않아(Next.js 공식 보안 동작)
 * 이 분류가 항상 실패했다(I-069 — 이 파일이 그 최초 재현 지점 중 하나다). 지금은 이 컨테이너가
 * `<RouteErrorBoundary kind="forbidden" />`를 **값으로 직접 반환**한다 — `MeetupDetailPage`가
 * 이미 `<main>`을 소유하므로(`docs/CONVENTIONS.md`) 이 컨테이너는 `<main>`을 새로 열지 않고
 * `PostDetailContainer`가 `<PostDeletedNotice/>`를 반환하는 것과 같은 패턴을 따른다. HTTP
 * 응답은 500 대신 200이 된다(정상 도달 화면 상태로 취급 — 트레이드오프는
 * `docs/decisions/domain-error-channel-069.md` 참고).
 *
 * **20일차 프로덕션 브라우저 실측에서 이 분기가 당시엔 도달 불가능함을 발견했었다** — 비소속
 * 크루의 Meetup에 접근하면 이 `forbidden` 반환보다 위 `getMeetupById`의 `notFound()`가 먼저
 * 실행됐다(`meetups` 테이블 RLS `meetups_select_members`가 비소속자에게 행 자체를 0건으로
 * 숨겨서). `docs/ISSUES.md` I-073으로 등재됐던 이 gap은 **21일차(D-048)에 해소됐다** —
 * `getMeetupById`(`lib/data/supabase/meetup.ts`)가 이제 `getCrewById`와 같은 "원본 select
 * 0행 → private 최소정보 RPC(`meetup_directory_summary`) 폴백" 패턴으로 실제 `crewId`를
 * 돌려주므로, 이 컨테이너는 그 값으로 아래 크루원 재판정을 정상적으로 수행해 이 `forbidden`
 * 분기에 도달한다. 상세: `docs/prioritization-and-risks.md` D-048, `docs/decisions/
 * domain-error-channel-069.md` §6(이전 판정의 경위 보존).
 *
 * **I-079/FR-065 AC2(26일차, BOARD) 추가** — "일정 변경 이력"(`listMeetupScheduleChanges`)과
 * "일정 변경 제안" 진입 버튼 노출 여부(`canProposeReschedule`)를 이 컨테이너가 함께 계산한다.
 * 참석 응답 무효화(`invalidatedAt`) 반영도 여기서 한다 — `viewerAttendanceStatus`·
 * `attendanceInvalidated` 두 곳 모두. 근거·단일 소스는 `docs/decisions/
 * meetup-reschedule-079.md` §4.
 */
export interface MeetupDetailContainerProps {
  meetupId: Id;
}

export async function MeetupDetailContainer({ meetupId }: MeetupDetailContainerProps) {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    // (app) 레이아웃이 이미 미인증 분기를 선택했을 병렬 렌더링의 폐기 브랜치다(I-095, 24일차
    // — 이전엔 throw 기반 assertAuthenticatedSession이었다).
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

  const [members, attendances, poll, scheduleChanges] = await Promise.all([
    listCrewMembers(meetup.crewId),
    listAttendance(meetup.id),
    getPollById(meetup.pollId),
    // I-079/FR-065 AC2 — "일정 변경 이력"(AC2 "이력이 남는다"). 최신순 정렬은 데이터 레이어가
    // 이미 보장한다(mock·supabase 동일 계약, NFR-035).
    listMeetupScheduleChanges(meetup.id),
  ]);

  // FR-068 — 참석/불참/미응답 3구분(`lib/rules`, 판정)에 프로필을 조인한다(표시용 가공).
  const activeMemberIds = members
    .filter((m) => isActiveMembership(m.status))
    .map((m) => m.profileId);
  const groups = groupMeetupParticipantIds(activeMemberIds, attendances);
  const profileIds = [...new Set([...groups.attending, ...groups.absent, ...groups.noResponse])];
  const profiles = await Promise.all(profileIds.map((id) => getProfileById(id)));
  const profileById = new Map<Id, Profile>(
    profiles.filter((p): p is Profile => p !== null).map((p) => [p.id, p]),
  );
  const toParticipantView = (profileId: Id) => {
    const profile = profileById.get(profileId);
    return {
      profileId,
      displayName: profile?.displayName ?? "",
      avatarUrl: profile?.avatarUrl ?? null,
    };
  };

  const todayIso = todayIsoUtc(new Date());
  const viewerAttendance = attendances.find(
    (a: MeetupAttendance) => a.profileId === session.profileId,
  );
  // I-079/FR-065 AC2 — 무효화된 응답(`invalidatedAt !== null`)은 `status` 값과 무관하게
  // "응답 없음"으로 취급한다(팀장 결정의 UI 반영 지점, `meetup-reschedule-079.md` §4.3).
  // 이 값을 그대로 넘기면 이미 지난 일정에 낸 "참석" 응답이 새 일정에도 유효한 것처럼
  // 보여 "불참으로 변경" 버튼이 뜨는 잘못된 상태 기계 분기를 탄다.
  const viewerAttendanceValid = viewerAttendance && viewerAttendance.invalidatedAt === null;
  const attendanceState = resolveMeetupAttendanceButtonState({
    meetup,
    todayIso,
    viewerAttendanceStatus: viewerAttendanceValid ? viewerAttendance.status : null,
  });
  const attendanceInvalidated = Boolean(viewerAttendance && viewerAttendance.invalidatedAt !== null);

  const tally = poll ? await getPollTally(poll.id) : null;

  // FR-065(Task 041) — 취소 버튼 노출 여부. 제안 작성자 판정은 `PollPanelContainer`와 같은
  // 방식(poll → post.authorId)이다. `isMeetupAttendanceOpen`으로 AC3(과거 Meetup)까지 함께
  // 걸러 둔다 — 서버(`cancelMeetupAction`)가 최종 판정을 다시 하므로 여기서는 버튼 노출 여부만
  // 결정한다.
  const post = poll ? await getPostById(poll.postId) : null;
  const isProposalAuthor = post?.authorId === session.profileId;
  const attendanceOpen = isMeetupAttendanceOpen(meetup, todayIso);
  const canCancelOrUpdate =
    checkPermission({
      role: deriveUserRoleForPermissionCheck(membership),
      action: "meetup:cancel_or_update",
      context: { isProposalAuthor },
    }).allowed && attendanceOpen;
  // I-079/FR-065 AC2 — "일정 변경 제안" 진입 버튼 노출 여부. `canCancelOrUpdate`와 다르게
  // 제안자·임원·오너로 좁히지 않는다 — 일정 변경도 재투표를 거치는 이상 일반 FR-034 제안과
  // 같은 권한(활성 크루원 전원, `poll:create_proposal`)이면 충분하다(`meetup-view-models.ts`
  // 의 `canProposeReschedule` docstring 참고).
  const canProposeReschedule =
    checkPermission({
      role: deriveUserRoleForPermissionCheck(membership),
      action: "poll:create_proposal",
    }).allowed && attendanceOpen;

  const scheduleChangeViews: MeetupScheduleChangeView[] = scheduleChanges.map((change) => ({
    id: change.id,
    // `formatPostDate`(게시글 작성일 표시와 같은 절대 날짜 포맷, `board/format-post-date.ts`)를
    // 재사용한다 — "일정 변경 이력"의 changedAt도 서버 렌더 시각 고정값이라 같은 이유
    // (상대 시각을 쓰지 않는다, NFR-025)로 같은 함수가 맞다.
    changedAtLabel: formatPostDate(change.changedAt),
    // 다일 모임(2026-07-31) — 이력도 기간·시각 범위로 보여준다. 하루짜리 변경이면
    // 이전과 같은 문구가 나온다(`formatDateRangeLabelKo`가 그때는 `formatDayLabelKo`와 같다).
    previousDateLabel: formatDateRangeLabelKo(change.previousDate, change.previousEndDate),
    previousStartTimeLabel: formatTimeRangeKo(change.previousStartTime, change.previousEndTime),
    previousPlace: change.previousPlace,
    previousCapacity: change.previousCapacity,
    newDateLabel: formatDateRangeLabelKo(change.newDate, change.newEndDate),
    newStartTimeLabel: formatTimeRangeKo(change.newStartTime, change.newEndTime),
    newPlace: change.newPlace,
    newCapacity: change.newCapacity,
  }));

  return (
    <MeetupDetail
      meetup={{
        id: meetup.id,
        crewId: meetup.crewId,
        title: meetup.title,
        description: meetup.description,
        crewName: crew.name,
        crewColorIndex: crew.colorKey,
        date: meetup.date,
        endDate: meetup.endDate,
        dateLabel: formatDateRangeLabelKo(meetup.date, meetup.endDate),
        startTime: meetup.startTime,
        endTime: meetup.endTime,
        place: meetup.place,
        capacity: meetup.capacity,
        attendingCount: meetup.attendingCount,
        isCancelled: meetup.status === "cancelled",
        postHref: poll ? getPostDetailHref(meetup.crewId, poll.postId) : null,
        pollTally: tally,
        canCancelOrUpdate,
        canProposeReschedule,
        attendanceInvalidated,
        scheduleChanges: scheduleChangeViews,
      }}
      participants={{
        attending: groups.attending.map(toParticipantView),
        absent: groups.absent.map(toParticipantView),
        noResponse: groups.noResponse.map(toParticipantView),
      }}
      attendanceState={attendanceState}
    />
  );
}
