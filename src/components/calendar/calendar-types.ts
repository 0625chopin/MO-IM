/**
 * `MonthCalendar`/`MeetupBar`/`DayDetailPanel`/`CrewFilterPanel`이 공유하는 순수 데이터
 * 타입 + 상수 — Task 021A(격자·바), Task 021B(상세 패널·크루 필터)가 이어서 채웠다.
 *
 * **왜 별도 파일인가**: `MonthCalendar.tsx`는 roving tabindex 상태 때문에 `"use client"`다.
 * Next.js는 `"use client"` 모듈의 export를 "클라이언트 레퍼런스"로 바꾸는데, 이 변환은
 * React 컴포넌트가 아닌 일반 값(`MAX_VISIBLE_BARS_PER_DAY` 같은 상수)에도 적용된다 —
 * 서버 컴포넌트(`MonthCalendarContainer`)가 그 값을 가져다 산술 연산에 쓰면 실제 숫자가 아니라
 * 클라이언트 레퍼런스 스텁을 받아 `NaN`이 된다(실측: "일정 NaN건"으로 렌더된 것을 컨테이너
 * 통합 후 실제로 재현·확인했다). 타입(`interface`)은 컴파일 타임에 지워져 이 문제가 없지만,
 * **값**은 서버·클라이언트 양쪽이 다 참조해야 하면 `"use client"`가 아닌 모듈에 둬야 한다.
 * 그래서 `MonthCalendar.tsx`·`MonthCalendarContainer.tsx`·`DayDetailPanel.tsx`·
 * `CrewFilterPanel.tsx`·`crew-filter-cookie.ts`·`/sample`의 `calendar.tsx` 전부 이 파일에서
 * 가져다 쓴다.
 *
 * **크루 필터 쿠키 파싱(`parseCrewFilterSelection`)은 이 파일에 없다** — 처음엔 여기 뒀다가
 * CORE 재검증(7일차)에서 "`use client` 함정 회피는 `MonthCalendar.tsx`에 두면 안 된다는
 * 근거는 되지만, 이 파일에 있어야 한다는 근거는 아니다"는 지적을 받고
 * `src/lib/rules/crew-filter-selection.ts`로 옮겼다 — 그 함수는 값이 아니라 **판정**
 * (쿠키 원본 네 갈래 → 최종 선택 목록 결정)이라 `resolveCrewColorCollision`이 3일차에
 * `crew-palette.ts`에서 `lib/rules/`로 이관된 것과 같은 종류의 결정이다(그 파일 docstring
 * 참고). 반대로 `serializeCrewFilterSelection`(쉼표 join, 분기 없음)은 판정이 아니라 순수
 * 포맷팅이라 계속 이 파일에 남는다.
 */

/** 하루 셀에 실제로 그리는 최대 바 개수(FR-061 AC2 "바 3개 + '+2'"). */
export const MAX_VISIBLE_BARS_PER_DAY = 3;

export interface CalendarBarData {
  /** React key + `aria-describedby` 텍스트 매칭용. 보통 Meetup id. */
  id: string;
  crewName: string;
  title: string;
  /** 이 날짜 셀에서 이미 D-026 충돌 회피까지 끝난 최종 팔레트 인덱스. */
  colorIndex: number;
}

/**
 * `DayDetailPanel`(Task 021B, FR-063)이 그리는 항목 하나. 격자의 {@link CalendarBarData}보다
 * 필드가 많다 — 패널은 시각·장소·참석 인원·취소 여부·원 제안글 링크까지 보여줘야 한다(FR-063
 * AC1·E3, FR-064 AC1). `crewName`·`title`은 {@link CalendarBarData}와 이름이 겹치므로
 * `MonthCalendar.tsx`의 `barAriaLabel` 보간(구조적 타입이라 초과 필드는 무시된다)이 그대로
 * 재사용된다 — 두 타입을 완전히 분리하지 않은 이유.
 */
export interface CalendarMeetupDetail {
  /** Meetup id. */
  id: string;
  crewId: string;
  crewName: string;
  title: string;
  /** 이 날짜 셀에서 D-026 충돌 회피까지 끝난 팔레트 인덱스 — 취소된 Meetup도 같은 규칙을 쓴다. */
  colorIndex: number;
  /**
   * 모임 시작일·종료일(다일 모임 지원, 2026-07-31). **패널이 열린 날짜와 다를 수 있다** —
   * 기간 모임은 걸치는 날짜마다 이 목록에 등장하므로, 8/3 패널에 있는 항목의 `date`가 8/1일
   * 수 있다. 패널은 이 둘로 "8월 1일 ~ 8월 5일" 기간 문구를 만든다(`formatShortDateRangeLabelKo`).
   * 하루짜리면 둘이 같다.
   */
  date: string;
  endDate: string;
  /** "HH:MM" 24시간제 원본. 표시용 가공(오전/오후)은 `date-grid.ts`의 `formatStartTimeKo`. */
  startTime: string | null;
  /** 종료 시각 "HH:MM"(선택). `startTime`이 없으면 이 값도 없다. */
  endTime: string | null;
  place: string | null;
  attendingCount: number;
  /** null이면 정원 제한 없음. */
  capacity: number | null;
  /** FR-063 E3 — 취소된 Meetup도 패널에는 표시하되 배지를 붙인다(월 격자 바에는 애초에 안 뜬다). */
  isCancelled: boolean;
  /**
   * FR-013 AC2(I-067, 19일차) — 이 Meetup이 속한 크루가 해산(`status='archived'`)됐는지.
   * `isCancelled`와 독립이다 — archived 크루의 과거 Meetup은 `status='confirmed'`로 실제
   * 열렸던 일정이라 취소와 다른 사실이다. 월 격자 바에는 반영하지 않는다(그리드는 archived
   * 여부로 시각을 구분하지 않기로 했다 — 열려 있었던 일정을 다르게 보이게 하면 틀린 신호가
   * 된다, `docs/ISSUES.md` I-067 "렌더링 판단" 참고). `DayDetailPanel`에서만 배지로 쓴다.
   */
  isArchivedCrew: boolean;
  /**
   * FR-063 AC2 "항목 클릭 시 원 제안글로 이동" — 크루 게시판의 그 제안글 상세 경로.
   * Poll을 못 찾는 등 방어적으로만 null이 될 수 있다(정상 경로에서는 항상 값이 있다).
   */
  postHref: string | null;
}

export interface CalendarDayData {
  /** YYYY-MM-DD. */
  iso: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  /** 이미 {@link MAX_VISIBLE_BARS_PER_DAY}로 잘린 목록(취소분 제외) — `MonthCalendar`는 자르지 않는다. */
  bars: CalendarBarData[];
  /** 잘려서 안 보이는 나머지 건수(0이면 "+N" 칩을 그리지 않는다). 취소분은 세지 않는다. */
  overflowCount: number;
  /**
   * 이 날짜의 Meetup 전체(오버플로·취소 포함) — 스크린 리더 설명(`aria-describedby`)과
   * `DayDetailPanel`(Task 021B, FR-063)이 함께 쓴다. 시각적으로 격자에는 3개(취소 제외)만
   * 보여도, 이 목록은 항상 전체를 담는다(FR-061 AC3 · FR-063 AC1).
   */
  meetups: CalendarMeetupDetail[];
}

/** 크루 필터·`CrewLegend`가 공유하는 항목 하나 — 크루의 이름·팔레트 인덱스만 있으면 된다. */
export interface CrewFilterOption {
  id: string;
  name: string;
  /** `Crew.colorKey`(D-006 `hash(crewId) mod 12`) 그대로 — 날짜 셀 충돌 회피 이전의 기본값. */
  colorIndex: number;
  /**
   * FR-013 AC2(I-067, 19일차) — 이 크루가 해산(`status='archived'`)됐는지. `CrewFilterPanel`이
   * `CrewLegend`의 범용 `badge` prop에 `strings.calendar.month.filter.archivedCrewBadge`를
   * 넘길지 결정하는 데만 쓴다 — 기본 체크 상태·목록 노출 여부는 이 필드로 바꾸지 않는다
   * (해산된 크루도 과거 이력을 계속 볼 수 있어야 하므로 기본은 다른 크루와 동일하게 켜짐).
   */
  isArchived: boolean;
}

/**
 * 크루 필터 선택 상태를 담는 쿠키 이름(FR-061 AC5 "선택은 다음 방문까지 유지된다", D-014·R-017).
 * `httpOnly`가 아닌 평범한 선호도 쿠키다 — 인증·개인정보가 아니라 "필터 UI에 어떤 크루가
 * 켜져 있는가"라는 순수 표시 설정이라, 클라이언트 컴포넌트가 `document.cookie`로 직접 쓰고
 * 서버 컴포넌트(`MonthCalendarContainer`)가 `next/headers`의 `cookies()`로 읽는다(자세한
 * 이유는 `crew-filter-cookie.ts` 모듈 docstring 참고).
 */
export const CREW_FILTER_COOKIE_NAME = "mo_im_crew_filter";

/** 쿠키 값 직렬화 — 크루 id를 쉼표로 잇는다(uuid엔 쉼표가 없으므로 이스케이프가 필요 없다). */
export function serializeCrewFilterSelection(crewIds: readonly string[]): string {
  return crewIds.join(",");
}

/**
 * 홈 대시보드 캘린더 요약(Task 021B, PRD "홈 대시보드 캘린더 요약")의 항목 하나 — "다가오는
 * 모임" 목록. `CalendarMeetupDetail`과 필드가 겹치지만(`crewName`·`title`·`colorIndex`)
 * 별도 타입으로 둔 이유는 이 목록이 **월 하나가 아니라 여러 달에 걸친 항목**을 다뤄 날짜
 * 자체를 표시 문구(`dateLabel`)로 들고 있어야 하기 때문이다(`CalendarDayData`는 이미 그
 * 날짜 소속 배열이라 각 항목이 날짜를 따로 들지 않는다).
 */
export interface UpcomingMeetupSummary {
  id: string;
  crewName: string;
  colorIndex: number;
  title: string;
  /** `formatShortDateRangeLabelKo`가 만든 "8월 14일(금)" 또는 기간 모임의
   *  "8월 14일(금) ~ 8월 16일(일)" 완성 문구. */
  dateLabel: string;
  /** "HH:MM" 원본 — 표시 가공은 `date-grid.ts`의 `formatTimeRangeKo`. */
  startTime: string | null;
  endTime: string | null;
  postHref: string | null;
}
