import { notFound } from "next/navigation";

import { getBoardWriteHref, getPostDetailHref } from "@/components/board/board-links";
import { formatDayLabelKo, todayIsoUtc } from "@/components/calendar/date-grid";
import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";
import { MeetupDetail } from "@/components/meetup/MeetupDetail";
import { assertAuthenticatedSession } from "@/components/shell/auth-session";
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
 */
export interface MeetupDetailContainerProps {
  meetupId: Id;
}

export async function MeetupDetailContainer({ meetupId }: MeetupDetailContainerProps) {
  const session = await getAuthSession();
  assertAuthenticatedSession(session);

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

  const [members, attendances, poll] = await Promise.all([
    listCrewMembers(meetup.crewId),
    listAttendance(meetup.id),
    getPollById(meetup.pollId),
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
  const attendanceState = resolveMeetupAttendanceButtonState({
    meetup,
    todayIso,
    viewerAttendanceStatus: viewerAttendance?.status ?? null,
  });

  const tally = poll ? await getPollTally(poll.id) : null;

  // FR-065(Task 041) — 취소·일정 변경 버튼 노출 여부. 제안 작성자 판정은 `PollPanelContainer`
  // 와 같은 방식(poll → post.authorId)이다. `isMeetupAttendanceOpen`으로 AC3(과거 Meetup)까지
  // 함께 걸러 둔다 — 서버(`cancelMeetupAction`)가 최종 판정을 다시 하므로 여기서는 버튼 노출
  // 여부만 결정한다.
  const post = poll ? await getPostById(poll.postId) : null;
  const isProposalAuthor = post?.authorId === session.profileId;
  const canCancelOrUpdate =
    checkPermission({
      role: deriveUserRoleForPermissionCheck(membership),
      action: "meetup:cancel_or_update",
      context: { isProposalAuthor },
    }).allowed && isMeetupAttendanceOpen(meetup, todayIso);

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
        dateLabel: formatDayLabelKo(meetup.date),
        startTime: meetup.startTime,
        place: meetup.place,
        capacity: meetup.capacity,
        attendingCount: meetup.attendingCount,
        isCancelled: meetup.status === "cancelled",
        postHref: poll ? getPostDetailHref(meetup.crewId, poll.postId) : null,
        pollTally: tally,
        canCancelOrUpdate,
        boardWriteHref: getBoardWriteHref(meetup.crewId),
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
