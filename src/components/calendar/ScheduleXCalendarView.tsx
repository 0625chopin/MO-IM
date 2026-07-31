"use client";
// React Compiler 제외 — Schedule-X는 자체 반응형 코어로 DOM을 **명령형**으로 제어하고,
// `useNextCalendarApp`이 만든 인스턴스를 컴파일러가 메모이즈하면 그 갱신 모델과 충돌할 수 있다.
// Next가 제공하는 공식 탈출구 디렉티브다(D-029 — 문서가 허용한 `"use no memo"`, 측정 근거가
// 필요한 수동 useMemo/useCallback 예외와는 다른 기제다). 제3자 명령형 통합 래퍼의 관용적 처리.
"use no memo";

import "temporal-polyfill/global";
import "@schedule-x/theme-default/dist/index.css";
import "./schedule-x-theme.css";

import { createViewMonthGrid } from "@schedule-x/calendar";
import { ScheduleXCalendar, useNextCalendarApp } from "@schedule-x/react";
import { useState } from "react";

import type { CalendarMeetupDetail } from "@/components/calendar/calendar-types";
import { formatDayLabelKo } from "@/components/calendar/date-grid";
import { DayDetailPanel } from "@/components/calendar/DayDetailPanel";
import { crewCertaintyVars } from "@/lib/crew-palette";
import { strings, t } from "@/lib/strings";
import type { ISODateString } from "@/lib/types";

import type { CalendarConfig, CalendarEvent } from "@schedule-x/calendar";
import type { CSSProperties } from "react";

/** 서버 컨테이너가 넘기는 격자 이벤트 하나(확정 Meetup만). 직렬화 가능한 평범한 값이라
 *  Temporal 변환은 클라이언트에서 한다(Temporal 인스턴스는 서버→클라이언트로 직렬화 불가). */
export interface ScheduleXEventInput {
  id: string;
  /** 시작일 YYYY-MM-DD. */
  iso: string;
  /**
   * 종료일 YYYY-MM-DD. 하루짜리면 `iso`와 같다(다일 모임 지원, 2026-07-31).
   * Schedule-X는 `start`/`end`가 다른 종일 이벤트를 여러 셀에 걸친 하나의 막대로 그리므로,
   * 기간 모임은 날짜마다 이벤트를 복제하지 않고 **이벤트 하나**로 넘긴다.
   */
  endIso: string;
  title: string;
  crewName: string;
  /** 이 날짜 셀에서 D-026 충돌 회피까지 끝난 팔레트 인덱스. */
  colorIndex: number;
}

export interface ScheduleXCalendarViewProps {
  /** 격자에 그릴 확정 Meetup 이벤트(넓은 조회 창 전체). */
  events: ScheduleXEventInput[];
  /** iso → 그 날짜의 전체 Meetup(취소 포함) — `DayDetailPanel`용. */
  detailsByDate: Record<string, CalendarMeetupDetail[]>;
  /** 처음 표시할 월의 1일 ISO(`?month=` deep link 반영). */
  initialDateIso: string;
  /** 조회 창 전체에 확정 Meetup이 0건일 때만 true. */
  isEmpty: boolean;
}

/** Schedule-X 커스텀 이벤트가 받는 값에 우리 커스텀 필드를 얹은 형태(`CalendarEventExternal`은
 *  `[key: string]: any`라 임의 필드를 그대로 실어 보낼 수 있다). */
type SxEventWithCrew = CalendarEvent & {
  crewName?: string;
  colorIndex?: number;
  iso?: string;
};

/**
 * 월간 그리드 이벤트 칩(커스텀 `monthGridEvent`). 크루색 채움(`certainty-confirmed`) + 크루명
 * 텍스트로 그린다 — **색만으로 크루를 구분하지 않는다(NFR-019 · CVD)**: 색이 겹쳐 보여도
 * 크루명 텍스트가 함께 간다. Meetup은 투표 가결로만 존재하므로 항상 "확정" 상태다
 * (`MeetupBar.tsx`와 같은 근거). 색 계산은 하지 않고 `colorIndex`를 조회만 한다.
 */
function MonthGridEvent({ calendarEvent }: { calendarEvent: SxEventWithCrew }) {
  const colorIndex = calendarEvent.colorIndex ?? 0;
  const crewName = calendarEvent.crewName ?? "";
  const title = calendarEvent.title ?? "";
  const vars = crewCertaintyVars(colorIndex) as CSSProperties;
  const label = t((s) => s.calendar.month.barAriaLabel, { crewName, title });

  return (
    <div
      className="certainty-confirmed mx-0.5 flex h-full min-w-0 items-center overflow-hidden rounded-sm px-1.5"
      style={vars}
      title={label}
    >
      <span className="truncate text-xs leading-none font-medium">
        {crewName}
        {title && <span className="opacity-80"> · {title}</span>}
      </span>
    </div>
  );
}

/**
 * 통합 캘린더 월간 뷰 — 기본 격자를 오픈소스 **Schedule-X**(월간 그리드)로 교체한 것.
 * 표현 컴포넌트(D-030 ①)로, 데이터는 전부 props로 받고 `lib/data`를 import하지 않는다.
 *
 * **디자인 시그니처 보존**: Schedule-X는 색을 전부 `--sx-*` CSS 변수로 노출하므로
 * `schedule-x-theme.css`가 그 변수를 앱 토큰에 매핑한다 → 따뜻한 종이·잉크 팔레트와 다크모드가
 * 자동으로 따라온다(그래서 `isDark`를 쓰지 않는다). 이벤트 칩만은 커스텀 컴포넌트로 그려 크루
 * 12색 + 확정성 채움을 그대로 유지한다.
 *
 * **네비게이션**: 컨테이너가 넓은 기간(선택 월 ±수개월)을 한 번에 넘기므로, Schedule-X 헤더의
 * 월 이동·오늘·날짜 선택기로 서버 왕복 없이 매끄럽게 이동한다. 날짜/이벤트 클릭은 조회 전용
 * (D-012)이라 기존 `DayDetailPanel`(FR-063)을 열 뿐 아무것도 만들지 않는다.
 */
export function ScheduleXCalendarView({
  events,
  detailsByDate,
  initialDateIso,
  isEmpty,
}: ScheduleXCalendarViewProps) {
  const [openIso, setOpenIso] = useState<string | null>(null);

  const calendar = useNextCalendarApp({
    views: [createViewMonthGrid()],
    selectedDate: Temporal.PlainDate.from(initialDateIso),
    locale: "ko-KR",
    // 일요일 시작(기존 격자와 동일). Schedule-X의 `WeekDay` enum은 SUNDAY=7이지만 그 enum이
    // public export가 아니라, 설정 타입에서 인덱싱해 리터럴 7을 그 타입으로 좁힌다.
    firstDayOfWeek: 7 as NonNullable<CalendarConfig["firstDayOfWeek"]>,
    // 하루 최대 노출 이벤트(초과분은 Schedule-X가 "+N"으로 접는다) — 기존 3개 규칙과 맞춘다.
    monthGridOptions: { nEventsPerDay: 3 },
    events: events.map((e) => ({
      id: e.id,
      start: Temporal.PlainDate.from(e.iso),
      end: Temporal.PlainDate.from(e.endIso),
      title: e.title,
      // 커스텀 필드 — 이벤트 칩(MonthGridEvent)이 조회한다.
      crewName: e.crewName,
      colorIndex: e.colorIndex,
      iso: e.iso,
    })),
    callbacks: {
      // 날짜 클릭 → 그 날짜 상세 패널.
      onClickDate: (date) => setOpenIso(date.toString()),
      // 이벤트 클릭 → 그 이벤트가 속한 날짜의 상세 패널.
      onEventClick: (event) => {
        const iso = (event as SxEventWithCrew).iso ?? event.start.toString();
        setOpenIso(iso);
      },
    },
  });

  const openMeetups = openIso ? (detailsByDate[openIso] ?? []) : [];

  return (
    <div className="min-w-0 flex-1">
      {isEmpty && (
        <p className="mb-3 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
          {strings.calendar.month.empty}
        </p>
      )}

      <div className="mo-im-sx">
        <ScheduleXCalendar
          calendarApp={calendar}
          customComponents={{ monthGridEvent: MonthGridEvent }}
        />
      </div>

      <DayDetailPanel
        open={openIso !== null}
        onOpenChange={(open) => {
          if (!open) setOpenIso(null);
        }}
        dateLabel={openIso ? formatDayLabelKo(openIso as ISODateString) : ""}
        meetups={openMeetups}
      />
    </div>
  );
}
