import { getPostDetailHref } from "@/components/board/board-links";
import type { UpcomingMeetupSummary } from "@/components/calendar/calendar-types";
import { formatShortDateRangeLabelKo, todayIsoUtc } from "@/components/calendar/date-grid";
import { HomeCalendarSummary } from "@/components/calendar/HomeCalendarSummary";
import { isAuthenticated } from "@/components/shell/auth-session";
import { CollapsibleSection } from "@/components/shell/CollapsibleSection";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCollapsedSections } from "@/components/shell/section-collapse-cookie";
import { getPollById, listCrewsByProfile, listMeetupsByCrews } from "@/lib/data";
import { strings, t } from "@/lib/strings";


/** 홈 대시보드에 보여줄 최대 항목 수 — 요구사항에 값이 없어 잠정으로 잡았다(보고에 남김). */
const UPCOMING_MEETUP_LIMIT = 5;
/**
 * "다가오는 모임"은 종료일을 두지 않는다 — `listMeetupsByCrews`의 `to`는 ISO 날짜 문자열
 * 비교(`m.date <= opts.to`)라서, 실제 달력에 존재할 일 없는 미래의 상한 문자열을 넘겨도
 * "사실상 무제한"으로 동작한다. 새 날짜 범위 파라미터를 추가하는 것보다 이 편이 기존
 * `ListMeetupsQuery` 계약을 그대로 재사용한다.
 */
const FAR_FUTURE_DATE = "9999-12-31";

/**
 * 홈 대시보드 캘린더 요약 컨테이너(D-030 ①) — Task 021B. `HomeCalendarSummary`(표현)에
 * "다가오는 모임" 목록을 조회해 넘긴다. `MonthCalendarContainer`와 같은 fail-closed
 * 패턴(`isAuthenticated` 조기 반환, 24일차 이전엔 `assertAuthenticatedSession`)을 쓴다 —
 * 이 컨테이너도 `(app)/home`(인증 경계 안)에서만 호출된다는 전제다.
 *
 * **24일차(I-095)** — throw 기반이었던 인증 확인을 조기 반환으로 교체했다. 경위·대체 패턴
 * 근거는 `@/components/shell/auth-session.ts` 모듈 docstring 참고.
 *
 * **크루 필터를 적용하지 않는다**: `/calendar`의 크루 필터(FR-061)는 그 페이지에 저장된
 * 선호도이고, 홈 대시보드는 소속 전체 크루의 일정을 보여주는 게 자연스럽다고 판단했다 —
 * 요구사항에 명시가 없어 임의로 정한 지점이라 보고에 남긴다.
 */
export async function HomeCalendarSummaryContainer() {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    // (app) 레이아웃이 이미 미인증 분기를 선택했을 병렬 렌더링의 폐기 브랜치다(I-095).
    return null;
  }

  const todayIso = todayIsoUtc(new Date());

  const crews = await listCrewsByProfile(session.profileId);
  const crewById = new Map(crews.map((c) => [c.id, c]));

  const meetups = await listMeetupsByCrews({
    crewIds: crews.map((c) => c.id),
    from: todayIso,
    to: FAR_FUTURE_DATE,
  });

  const upcoming = meetups
    .slice()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
        a.id.localeCompare(b.id),
    )
    .slice(0, UPCOMING_MEETUP_LIMIT);

  const polls = await Promise.all(upcoming.map((m) => getPollById(m.pollId)));

  const items: UpcomingMeetupSummary[] = upcoming.map((meetup, index) => {
    const poll = polls[index];
    const crew = crewById.get(meetup.crewId);
    return {
      id: meetup.id,
      crewName: crew?.name ?? "",
      colorIndex: crew?.colorKey ?? 0,
      title: meetup.title,
      dateLabel: formatShortDateRangeLabelKo(meetup.date, meetup.endDate),
      startTime: meetup.startTime,
      endTime: meetup.endTime,
      postHref: poll ? getPostDetailHref(meetup.crewId, poll.postId) : null,
    };
  });

  const collapsed = await getCollapsedSections();

  return (
    <CollapsibleSection
      sectionId="upcoming"
      title={strings.home.dashboard.upcoming.title}
      // 세는 대상은 화면에 남긴 5건이 아니라 **잘리기 전 전체 예정 건수**다 — 접힌 헤더가
      // "예정 5건"이라고 말하는데 펴 보니 그게 상한이었다면 그 숫자는 거짓말이 된다.
      summary={
        meetups.length > 0
          ? t((x) => x.home.dashboard.upcoming.summary, { count: meetups.length })
          : strings.home.dashboard.upcoming.summaryEmpty
      }
      actionHref="/calendar"
      actionLabel={strings.home.dashboard.upcoming.viewAll}
      defaultOpen={!collapsed.has("upcoming")}
    >
      <HomeCalendarSummary items={items} hideHeading />
    </CollapsibleSection>
  );
}
