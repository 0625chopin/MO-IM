import type { CalendarDayData, CalendarMeetupDetail } from "@/components/calendar/calendar-types";
import { MAX_VISIBLE_BARS_PER_DAY } from "@/components/calendar/calendar-types";
import { CrewFilterPanel } from "@/components/calendar/CrewFilterPanel";
import { CrewLegend } from "@/components/calendar/CrewLegend";
import {
  buildMonthWeeks,
  type BareCalendarDay,
} from "@/components/calendar/date-grid";
import { HomeCalendarSummary } from "@/components/calendar/HomeCalendarSummary";
import { HomeCalendarSummarySkeleton } from "@/components/calendar/HomeCalendarSummarySkeleton";
import { MeetupBar } from "@/components/calendar/MeetupBar";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { MonthCalendarSkeleton } from "@/components/calendar/MonthCalendarSkeleton";
import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { DayDetailPanelPreview } from "@/components/sample/sections/DayDetailPanelPreview";
import { defineSection } from "@/components/sample/showcase-types";
import { ErrorState } from "@/components/ui/error-state";
import { resolveCrewColorCollision } from "@/lib/rules/crew-color-hash";
import { strings } from "@/lib/strings";

/**
 * 통합 캘린더 격자 + Meetup 막대(FR-060~063) — Task 021A. 크루 필터·`CrewLegend`·
 * `DayDetailPanel`·홈 대시보드 캘린더 요약(Task 021B)이 이 섹션에 이어서 등록됐다.
 *
 * **색은 여기서도 계산하지 않는다** — 실제 계산은 `resolveCrewColorCollision`
 * (`lib/rules/crew-color-hash.ts`, D-026)이 아래 모듈 스코프에서 한 번 끝내고,
 * `MonthCalendar`·`MeetupBar`는 그 결과 `colorIndex`만 받는다. `MonthCalendarContainer`
 * (실제 페이지)가 하는 일과 같은 순서다 — 다만 이 파일은 `@/lib/data`를 import할 수 없는
 * 표현 전용 구역(`docs/CONVENTIONS.md` zone 4)이라 Mock 조회 대신 손으로 데이터를 짰다.
 */

const DEMO_YEAR = 2026;
const DEMO_MONTH = 8;
/** 실제 Mock 시드의 R-017/D-026 강제 충돌 데모 날짜(`generate-meetups.ts`의
 *  `forcedCollisionDate` = SEED_NOW + 21일 = 2026-08-14)와 맞췄다 — 우연이 아니다. */
const DEMO_TODAY_ISO = "2026-08-14";

/**
 * D-006 `hash(crewId) mod 12`가 두 크루를 같은 버킷에 떨어뜨린 상황을 재현한다. 실제 해시가
 * 우연히 충돌할 확률은 낮아(1/12) 데모로는 `generate-meetups.ts`가 이미 하는 것과 같은 방식으로
 * "일부러" 같은 기본 인덱스를 준다.
 */
const RUNNING_CREW_BASE_INDEX = 5; // periwinkle
const HIKING_CREW_BASE_INDEX = RUNNING_CREW_BASE_INDEX; // 강제 충돌
const hikingResolvedIndex = resolveCrewColorCollision(HIKING_CREW_BASE_INDEX, [
  RUNNING_CREW_BASE_INDEX,
]);

function emptyDay(day: BareCalendarDay): CalendarDayData {
  return { ...day, bars: [], overflowCount: 0, meetups: [] };
}

const baseWeeks = buildMonthWeeks(DEMO_YEAR, DEMO_MONTH, DEMO_TODAY_ISO);

const RUNNING_MEETUP: CalendarMeetupDetail = {
  id: "demo-meetup-running",
  crewId: "demo-crew-running",
  crewName: "새벽 러닝 크루",
  title: "한강 5km 정기런",
  colorIndex: RUNNING_CREW_BASE_INDEX,
  startTime: "07:00",
  place: "한강공원 반포지구",
  attendingCount: 12,
  capacity: 20,
  isCancelled: false,
  isArchivedCrew: false,
  postHref: "#",
};

const HIKING_MEETUP: CalendarMeetupDetail = {
  id: "demo-meetup-hiking",
  crewId: "demo-crew-hiking",
  crewName: "주말 등산 모임",
  title: "북한산 둘레길 완주",
  colorIndex: hikingResolvedIndex,
  startTime: "09:00",
  place: "북한산 둘레길",
  attendingCount: 6,
  capacity: null,
  isCancelled: false,
  isArchivedCrew: false,
  postHref: "#",
};

/**
 * FR-013 AC2(I-067, 19일차) — 해산된 크루의 과거 Meetup 데모. **그리드 바는 다른 Meetup과
 * 완전히 같은 모양으로 그린다**(archived 여부로 시각을 구분하지 않기로 한 판단,
 * `docs/ISSUES.md` I-067 "렌더링 판단" 참고) — 배지는 `DayDetailPanel`과 `CrewFilterPanel`
 * 에서만 보인다. 과거 날짜(`DEMO_TODAY_ISO`=8/14보다 이전)에 둬서 "실제 열렸던 일정"이라는
 * 성격을 데모로도 드러낸다.
 */
const ARCHIVED_CREW_MEETUP: CalendarMeetupDetail = {
  id: "demo-meetup-archived",
  crewId: "demo-crew-archived",
  crewName: "종료된 스터디 모임",
  title: "8월 첫째 주 스터디",
  colorIndex: 7,
  startTime: "20:00",
  place: "온라인",
  attendingCount: 5,
  capacity: 8,
  isCancelled: false,
  isArchivedCrew: true,
  postHref: "#",
};

const OVERFLOW_MEETUPS: CalendarMeetupDetail[] = [
  { crewName: "보드게임 소모임", title: "월례 정기모임" },
  { crewName: "사진 동호회", title: "야경 출사" },
  { crewName: "북클럽", title: "8월 지정 도서 토론" },
  { crewName: "스터디 크루", title: "알고리즘 스터디" },
  { crewName: "홈베이킹 모임", title: "레시피 공유회" },
].map((m, index) => ({
  id: `demo-overflow-${index}`,
  crewId: `demo-crew-overflow-${index}`,
  crewName: m.crewName,
  title: m.title,
  colorIndex: (index * 2) % 12,
  startTime: "19:00",
  place: "정기 모임 장소",
  attendingCount: 4,
  capacity: 10,
  isCancelled: false,
  isArchivedCrew: false,
  postHref: "#",
}));

const populatedWeeks: CalendarDayData[][] = baseWeeks.map((week) =>
  week.map((day): CalendarDayData => {
    if (day.iso === "2026-08-14") {
      const meetups = [RUNNING_MEETUP, HIKING_MEETUP];
      return {
        ...day,
        bars: meetups.map(({ id, crewName, title, colorIndex }) => ({
          id,
          crewName,
          title,
          colorIndex,
        })),
        overflowCount: 0,
        meetups,
      };
    }
    if (day.iso === "2026-08-05") {
      const meetups = [ARCHIVED_CREW_MEETUP];
      return {
        ...day,
        bars: meetups.map(({ id, crewName, title, colorIndex }) => ({
          id,
          crewName,
          title,
          colorIndex,
        })),
        overflowCount: 0,
        meetups,
      };
    }
    if (day.iso === "2026-08-20") {
      const visible = OVERFLOW_MEETUPS.slice(0, MAX_VISIBLE_BARS_PER_DAY);
      return {
        ...day,
        bars: visible.map(({ id, crewName, title, colorIndex }) => ({
          id,
          crewName,
          title,
          colorIndex,
        })),
        overflowCount: OVERFLOW_MEETUPS.length - MAX_VISIBLE_BARS_PER_DAY,
        meetups: OVERFLOW_MEETUPS,
      };
    }
    return emptyDay(day);
  }),
);

const emptyWeeks: CalendarDayData[][] = baseWeeks.map((week) => week.map(emptyDay));

const DEMO_CREW_FILTER_OPTIONS = [
  { id: "demo-crew-running", name: "새벽 러닝 크루", colorIndex: RUNNING_CREW_BASE_INDEX, isArchived: false },
  { id: "demo-crew-hiking", name: "주말 등산 모임", colorIndex: hikingResolvedIndex, isArchived: false },
  { id: "demo-crew-boardgame", name: "보드게임 소모임", colorIndex: 9, isArchived: false },
  { id: "demo-crew-book", name: "북클럽", colorIndex: 3, isArchived: false },
  // FR-013 AC2(I-067) — 기본 체크 켜짐(다른 크루와 동일), "해산됨" 배지만 다르다.
  { id: "demo-crew-archived", name: "종료된 스터디 모임", colorIndex: 7, isArchived: true },
];

const DEMO_UPCOMING_MEETUPS = [
  {
    id: "demo-upcoming-1",
    crewName: "새벽 러닝 크루",
    colorIndex: RUNNING_CREW_BASE_INDEX,
    title: "한강 5km 정기런",
    dateLabel: "8월 14일(금)",
    startTime: "07:00",
    postHref: "#",
  },
  {
    id: "demo-upcoming-2",
    crewName: "주말 등산 모임",
    colorIndex: hikingResolvedIndex,
    title: "북한산 둘레길 완주",
    dateLabel: "8월 16일(일)",
    startTime: "09:00",
    postHref: "#",
  },
];

export const calendarSection = defineSection({
  id: "calendar",
  label: "캘린더",
  title: "캘린더 — MonthCalendar · 크루 필터 · DayDetailPanel · 홈 요약",
  description: (
    <>
      통합 캘린더 월간 격자·Meetup 막대(FR-060~063, Task 021A)에 크루 필터·`CrewLegend`·
      `DayDetailPanel`·홈 대시보드 캘린더 요약(Task 021B)이 이어서 등록됐습니다.
    </>
  ),
  items: [
    {
      name: "MonthCalendar",
      note: "프리뷰 프레임 폭을 360으로 내려도 가로 스크롤이 없어야 합니다(NFR-005·026). 날짜 셀에 포커스를 두고 방향키·Home·End로 이동해 보세요(roving tabindex, NFR-020). 8/14 셀을 클릭하거나 포커스 후 Enter/Space를 누르면 DayDetailPanel이 열립니다 — 두 크루가 같은 팔레트 버킷에 강제로 충돌한 뒤 D-026 회피 워크로 서로 다른 색을 받은 예시이기도 합니다. 8/20은 Meetup 5건 중 3개 + \"+2\"로 요약되는 오버플로 예시입니다. 8/5는 해산된 크루의 과거 Meetup(FR-013 AC2, I-067) — 바 자체는 다른 확정 Meetup과 똑같이 그려지고, 그 날짜를 클릭해 열리는 패널에서만 \"해산된 크루\" 배지로 구분됩니다.",
      panels: {
        default: (
          <PreviewFrame height={520} resizable>
            <div className="p-3">
              <MonthCalendar
                year={DEMO_YEAR}
                month={DEMO_MONTH}
                weeks={populatedWeeks}
                prevMonthHref="#"
                nextMonthHref="#"
              />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={520} resizable>
            <div className="p-3">
              {/* Suspense fallback과 같은 컴포넌트(CORE 재검증 지적, 7일차) — 예전엔 이 자리에
               *  손그림 스켈레톤 JSX가 따로 있었고, 실제 `/calendar` 라우트에는 Suspense 자체가
               *  없었다(`board`·`chat`은 이미 갖췄던 것과 달랐다). `MonthCalendarSkeleton.tsx`로
               *  뽑아 두 곳이 같은 모양을 그린다. */}
              <MonthCalendarSkeleton />
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={520} resizable>
            <div className="p-3">
              <MonthCalendar
                year={DEMO_YEAR}
                month={DEMO_MONTH}
                weeks={emptyWeeks}
                prevMonthHref="#"
                nextMonthHref="#"
                isEmpty
              />
            </div>
          </PreviewFrame>
        ),
        // onRetry는 함수(클로저)라 이 파일(서버 컴포넌트)에서 만들 수 없다 — Client
        // Component(ErrorState)에 함수 prop을 서버에서 직접 넘기면 직렬화 경계 위반이다
        // (`primitives.tsx`의 ErrorState 데모와 같은 이유). 실제 화면에서는 컨테이너(클라이언트
        // 경계)가 재시도 콜백을 만들어 내려준다.
        error: (
          <div className="flex flex-col gap-3">
            <ErrorState
              title={strings.calendar.month.errorTitle}
              description={strings.calendar.month.errorDescription}
            />
            <ErrorState
              title={strings.calendar.month.forbiddenTitle}
              description={strings.calendar.month.forbiddenDescription}
            />
          </div>
        ),
      },
    },
    {
      name: "MeetupBar",
      note: "크루명 라벨과 색만 받는 표현 컴포넌트입니다. 색 계산(D-026)은 이 컴포넌트 밖에서 이미 끝나 있고, 공간이 부족하면 크루명이 말줄임됩니다(FR-062).",
      content: (
        <div className="flex max-w-xs flex-col gap-1 rounded-lg border border-border bg-background p-3">
          <MeetupBar
            crewName="새벽 러닝 크루"
            title="한강 5km 정기런"
            colorIndex={RUNNING_CREW_BASE_INDEX}
          />
          <MeetupBar
            crewName="주말 등산 모임(같은 날 충돌 회피됨)"
            title="북한산 둘레길 완주"
            colorIndex={hikingResolvedIndex}
          />
          <MeetupBar
            crewName="아주 긴 크루 이름은 이렇게 말줄임됩니다"
            title="정기 모임"
            colorIndex={9}
          />
        </div>
      ),
    },
    {
      name: "CrewLegend",
      note: "색 스와치 + 크루명(D-026 — 색은 보조 신호일 뿐이라 텍스트 라벨을 항상 병기합니다). dimmed는 필터에서 꺼진 크루를 흐리게 보여줄 때, badge는 크루 상태 배지(현재는 해산됨, FR-013 AC2·I-067)를 붙일 때 씁니다 — 둘은 다른 신호라 동시에 켜질 수 있습니다(해산된 크루를 필터에서 꺼도 배지는 계속 보여야 합니다).",
      content: (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
          <CrewLegend crewName="새벽 러닝 크루" colorIndex={RUNNING_CREW_BASE_INDEX} />
          <CrewLegend crewName="주말 등산 모임" colorIndex={hikingResolvedIndex} />
          <CrewLegend crewName="꺼진 크루(dimmed)" colorIndex={9} dimmed />
          <CrewLegend crewName="종료된 스터디 모임" colorIndex={7} badge={strings.calendar.month.filter.archivedCrewBadge} />
        </div>
      ),
    },
    {
      name: "CrewFilterPanel",
      note: "체크박스를 토글하면 즉시 로컬 상태로 반영되고 선택이 쿠키에 저장된 뒤 실제로 `router.refresh()`가 호출됩니다(FR-061 AC5) — 이 프리뷰(이 `/sample` 페이지 자체)가 짧게 재조회되는 동안 제목 옆에 스피너가 뜨는 것을 볼 수 있습니다(`isPending`, CREW 021B 재검증에서 지적됨 — 처음엔 이 값을 버려서 실재하는 pending 상태가 화면에 안 보였습니다). 다만 여기서는 크루 데이터가 바뀌지 않으므로 재조회 후 눈에 보이는 내용 변화는 없습니다(실제 `/calendar`에서는 격자가 좁혀집니다). '오류' 상태가 없는 이유: 이 컴포넌트 자신은 조회를 하지 않고 재조회를 요청만 하며, 요청 실패는 이 컴포넌트가 아니라 페이지·라우트 레벨(`error.tsx`)에서 드러난다 — 소속 크루가 0개인 경우는 호출부(`MonthCalendarContainer`)가 아예 렌더하지 않도록 걸러 둡니다. \"종료된 스터디 모임\"은 해산된 크루 예시(FR-013 AC2, I-067) — 기본 체크는 다른 크루와 동일하게 켜져 있고(과거 이력을 계속 볼 수 있어야 하므로) \"해산됨\" 배지만 다릅니다.",
      content: (
        <div className="max-w-xs rounded-lg border border-border bg-background p-3">
          <CrewFilterPanel
            crews={DEMO_CREW_FILTER_OPTIONS}
            initialSelectedCrewIds={DEMO_CREW_FILTER_OPTIONS.map((c) => c.id)}
          />
        </div>
      ),
    },
    {
      name: "DayDetailPanel",
      note: "데스크톱(≥768px)에서는 오른쪽 사이드 패널로, 좁은 화면(<768px)에서는 하단 바텀시트로 뜹니다 — 브라우저 창 폭을 실제로 바꿔 확인해 주세요(PreviewFrame 폭 토글은 컨테이너 쿼리 기준이라 이 판정에는 반영되지 않습니다, `PreviewFrame.tsx` 주석 참고). Esc로 닫히고 포커스가 트리거 버튼으로 돌아오는지, 취소된 Meetup·해산된 크루의 Meetup(FR-013 AC2, I-067)에 각각 다른 배지가 붙는지 확인해 주세요. 버튼 4개가 기본·빈·로딩·오류 4상태와 1:1 대응합니다 — 로딩·오류는 `status` prop으로 강제한 정적 스냅샷이고(`/sample` 전용, `DayDetailPanel.tsx` 모듈 docstring 참고) 실제 호출부(`MonthCalendar.tsx`)는 이 값을 만들지 않습니다.",
      content: <DayDetailPanelPreview />,
    },
    {
      name: "HomeCalendarSummary",
      note: "홈 대시보드의 \"다가오는 모임\" 요약입니다(SC-06 전체가 아니라 이 목록 하나만 Task 021B 범위입니다). '로딩'은 이제 `/home` 라우트의 실제 Suspense fallback과 같은 컴포넌트입니다(CORE 재검증 지적, 7일차 — 이전엔 이 상태 자체가 등록돼 있지 않았고 실제 라우트에도 Suspense가 없었습니다).",
      panels: {
        default: (
          <div className="max-w-sm">
            <HomeCalendarSummary items={DEMO_UPCOMING_MEETUPS} />
          </div>
        ),
        loading: (
          <div className="max-w-sm">
            <HomeCalendarSummarySkeleton />
          </div>
        ),
        empty: (
          <div className="max-w-sm">
            <HomeCalendarSummary items={[]} />
          </div>
        ),
        error: (
          <div className="max-w-sm">
            <HomeCalendarSummary items={[]} error />
          </div>
        ),
      },
    },
  ],
});
