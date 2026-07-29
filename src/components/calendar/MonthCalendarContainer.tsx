import { getPostDetailHref } from "@/components/board/board-links";
import type { CalendarMeetupDetail, CrewFilterOption } from "@/components/calendar/calendar-types";
import { getCrewFilterCookieRaw } from "@/components/calendar/crew-filter-cookie";
import { CrewFilterPanel } from "@/components/calendar/CrewFilterPanel";
import {
  addMonths,
  currentYearMonthUtc,
  formatIsoDate,
  getMonthRangeIso,
  parseMonthParam,
} from "@/components/calendar/date-grid";
import {
  ScheduleXCalendarView,
  type ScheduleXEventInput,
} from "@/components/calendar/ScheduleXCalendarView";
import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getPollById, listCrewsByProfile, listMeetupsByCrews } from "@/lib/data";
import { resolveCrewColorCollision } from "@/lib/rules/crew-color-hash";
import { parseCrewFilterSelection } from "@/lib/rules/crew-filter-selection";
import type { Meetup } from "@/lib/types";

/**
 * Mock 조회 컨테이너(D-030 ①). `src/app/(app)/calendar/page.tsx`가 이 컴포넌트를 조립하고,
 * 이 컴포넌트는 `lib/data`(배럴)를 호출해 얻은 데이터를 표현 컴포넌트(`ScheduleXCalendarView`·
 * `CrewFilterPanel`)의 props로 넘긴다. 실데이터 전환(Task 031) 시 이 파일의 조회 부분만
 * 바뀌고 표현 컴포넌트는 손대지 않는다.
 *
 * **캘린더 라이브러리 교체(2026-07-24)**: 기존 커스텀 월간 격자(`MonthCalendar`)를 오픈소스
 * **Schedule-X**로 교체했다. 라이브러리는 클라이언트에서 월을 자유롭게 이동하므로, 한 달치만
 * 조회하던 방식을 **선택 월 기준 넓은 창(±수개월)** 을 한 번에 조회하는 방식으로 바꿨다 —
 * 그래야 헤더의 월 이동에 서버 왕복 없이 이벤트가 채워진다. Mock 데이터는 작아 이 창이
 * 저렴하고, 실데이터에서는 이 조회를 범위 기반 쿼리로 바꾸면 된다(뷰는 그대로).
 *
 * **fail-closed(6일차, CORE 재검증 E-2)**: `isAuthenticated` 조기 반환으로 guest 도달 시
 * 조용한 `profile-1` 대체(fail-open)를 막는다 — `(app)/layout.tsx`가 인증을 보장하지만 이
 * 컨테이너 자신도 같은 불변식을 강제한다.
 *
 * **24일차(I-095)** — 이 확인은 원래 throw 기반 `assertAuthenticatedSession`이었다. 조기
 * 반환으로 바꿔도 fail-closed 성질은 그대로다(둘 다 미인증이면 아래 조회 로직에 도달하지
 * 않는다) — 경위·대체 패턴 근거는 `@/components/shell/auth-session.ts` 모듈 docstring 참고.
 *
 * **크루 필터(FR-061 AC5·E5, D-014·R-017)**: 선택한 크루만 `listMeetupsByCrews`에 넘긴다 —
 * 격자 이벤트와 `DayDetailPanel` 상세가 같은 조회에서 파생돼 자동으로 일치한다. 필터 변경은
 * `CrewFilterPanel`이 쿠키를 쓰고 `router.refresh()`로 이 서버 컴포넌트를 다시 돌린다.
 */
export interface MonthCalendarContainerProps {
  /** `page.tsx`가 `await searchParams`로 이미 풀어 넘긴 `?month=YYYY-MM` 값. */
  monthParam?: string;
}

/** 넓은 조회 창의 반경(개월). 선택 월 기준 뒤로 `BEFORE`, 앞으로 `AFTER`. */
const WINDOW_MONTHS_BEFORE = 6;
const WINDOW_MONTHS_AFTER = 12;

export async function MonthCalendarContainer({ monthParam }: MonthCalendarContainerProps) {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    // (app) 레이아웃이 이미 미인증 분기를 선택했을 병렬 렌더링의 폐기 브랜치다(I-095).
    return null;
  }
  const profileId = session.profileId;

  const now = new Date();
  const { year, month } = parseMonthParam(monthParam, currentYearMonthUtc(now));

  // FR-013 AC2(I-067, 19일차) — archived 크루도 포함해야 그 크루의 과거 Meetup을 "열람
  // 전용"으로 계속 보여줄 수 있다(크루명·색상을 crewById로 조인하려면 해산된 크루 자체가
  // 이 목록에 있어야 한다). `listCrewsByProfile`의 다른 호출자(홈 요약·크루 탐색·계정 설정)는
  // 전부 `active`만 봐야 해서 이 옵션을 켜지 않는다 — `crew.ts`의 `ListCrewsByProfileOptions`
  // docstring 참고.
  const crews = await listCrewsByProfile(profileId, { includeArchived: true });
  const crewById = new Map(crews.map((c) => [c.id, c]));

  const rawFilterCookie = await getCrewFilterCookieRaw();
  const memberCrewIds = crews.map((c) => c.id);
  const selectedCrewIds = parseCrewFilterSelection(rawFilterCookie, memberCrewIds);

  // 선택 월 기준 넓은 창을 한 번에 조회한다(위 모듈 docstring). `includeCancelled: true` —
  // `DayDetailPanel`(FR-063 E3)이 취소된 Meetup도 배지와 함께 보여줘야 하므로 한 번에 받는다.
  const windowStart = addMonths(year, month, -WINDOW_MONTHS_BEFORE);
  const windowEnd = addMonths(year, month, WINDOW_MONTHS_AFTER);
  const from = getMonthRangeIso(windowStart.year, windowStart.month).from;
  const to = getMonthRangeIso(windowEnd.year, windowEnd.month).to;

  const windowMeetups = await listMeetupsByCrews({
    crewIds: selectedCrewIds,
    from,
    to,
    includeCancelled: true,
  });

  // Meetup → 원 제안글 경로(FR-063 AC2)를 창 전체분 한 번에 미리 푼다(NFR-005 사전 인덱싱).
  const polls = await Promise.all(windowMeetups.map((m) => getPollById(m.pollId)));
  const postHrefByMeetupId = new Map<string, string | null>();
  windowMeetups.forEach((meetup, index) => {
    const poll = polls[index];
    postHrefByMeetupId.set(
      meetup.id,
      poll ? getPostDetailHref(meetup.crewId, poll.postId) : null,
    );
  });

  // 날짜별 그룹핑(사전 인덱싱).
  const meetupsByDate = new Map<string, Meetup[]>();
  for (const meetup of windowMeetups) {
    const list = meetupsByDate.get(meetup.date);
    if (list) list.push(meetup);
    else meetupsByDate.set(meetup.date, [meetup]);
  }

  const events: ScheduleXEventInput[] = [];
  const detailsByDate: Record<string, CalendarMeetupDetail[]> = {};

  for (const [iso, dayMeetupsRaw] of meetupsByDate) {
    // 시작 시각 → id 순 정렬(매 렌더 같은 결과).
    const dayMeetups = dayMeetupsRaw
      .slice()
      .sort(
        (a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.id.localeCompare(b.id),
      );

    // D-026 같은 날짜 셀 충돌 회피 — 날짜마다 새로 계산한다. 크루당 한 번만 판정하고(같은
    // 크루의 여러 Meetup은 항상 같은 색), 취소분도 순회에 포함시켜 격자(확정)와 패널(전체)이
    // 크루당 같은 색을 쓰게 한다.
    const occupiedIndices: number[] = [];
    const colorIndexByCrewId = new Map<string, number>();
    for (const meetup of dayMeetups) {
      if (colorIndexByCrewId.has(meetup.crewId)) continue;
      const baseIndex = crewById.get(meetup.crewId)?.colorKey ?? 0;
      const resolved = resolveCrewColorCollision(baseIndex, occupiedIndices);
      occupiedIndices.push(resolved);
      colorIndexByCrewId.set(meetup.crewId, resolved);
    }

    // 패널용: 전체(취소 포함).
    detailsByDate[iso] = dayMeetups.map((meetup) => ({
      id: meetup.id,
      crewId: meetup.crewId,
      crewName: crewById.get(meetup.crewId)?.name ?? "",
      title: meetup.title,
      colorIndex: colorIndexByCrewId.get(meetup.crewId) ?? 0,
      startTime: meetup.startTime,
      place: meetup.place,
      attendingCount: meetup.attendingCount,
      capacity: meetup.capacity,
      isCancelled: meetup.status === "cancelled",
      // FR-013 AC2(I-067) — `isCancelled`와 독립 신호(모듈 docstring 없음, calendar-types.ts의
      // `CalendarMeetupDetail.isArchivedCrew` 참고). 격자 바 필터(아래)에는 영향을 주지 않는다.
      isArchivedCrew: crewById.get(meetup.crewId)?.status === "archived",
      postHref: postHrefByMeetupId.get(meetup.id) ?? null,
    }));

    // 격자용: 확정만(기존 바 규칙과 동일 — archived 크루 여부와 무관하게 이 필터는 그대로
    // 둔다. 미래 Meetup은 해산 시 `cancelled`로 전이되므로 이 필터 하나로 계속 숨는다).
    for (const meetup of dayMeetups) {
      if (meetup.status !== "confirmed") continue;
      events.push({
        id: meetup.id,
        iso,
        title: meetup.title,
        crewName: crewById.get(meetup.crewId)?.name ?? "",
        colorIndex: colorIndexByCrewId.get(meetup.crewId) ?? 0,
      });
    }
  }

  const initialDateIso = formatIsoDate(year, month, 1);

  const crewFilterOptions: CrewFilterOption[] = crews.map((c) => ({
    id: c.id,
    name: c.name,
    colorIndex: c.colorKey,
    // FR-013 AC2(I-067) — `CrewFilterPanel`이 이 값으로 `CrewLegend`의 범용 `badge` prop을
    // 채운다. 목록 노출·기본 체크 상태는 바꾸지 않는다(calendar-types.ts의 `CrewFilterOption.
    // isArchived` docstring 참고).
    isArchived: c.status === "archived",
  }));

  return (
    <div className="@container flex flex-col gap-4 @4xl:flex-row @4xl:items-start">
      {crewFilterOptions.length > 0 && (
        <CrewFilterPanel
          crews={crewFilterOptions}
          initialSelectedCrewIds={selectedCrewIds}
          className="@4xl:w-64 @4xl:shrink-0"
        />
      )}
      <ScheduleXCalendarView
        events={events}
        detailsByDate={detailsByDate}
        initialDateIso={initialDateIso}
        isEmpty={events.length === 0}
      />
    </div>
  );
}
