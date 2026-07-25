"use client";

import Link from "next/link";

import type { CalendarMeetupDetail } from "@/components/calendar/calendar-types";
import { CrewLegend } from "@/components/calendar/CrewLegend";
import { formatStartTimeKo } from "@/components/calendar/date-grid";
import { getMeetupDetailHref } from "@/components/meetup/meetup-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { strings, t } from "@/lib/strings";

/** NFR-026 3종 뷰포트(360/768/1280)의 768px 경계선을 "데스크톱" 기준으로 쓴다. */
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

/**
 * 날짜 상세 패널(FR-063) — Task 021B. 데스크톱은 오른쪽 사이드 패널, 모바일은 하단
 * 바텀시트로 뜬다(요구사항 문구 그대로). 하나의 `Drawer`(`ui/drawer.tsx`, Base UI)를
 * `swipeDirection`만 뷰포트에 따라 바꿔서 재사용한다 — `Dialog`(중앙 모달)+`Drawer` 두 갈래로
 * 나누는 shadcn 예시(`drawer-dialog`) 대신 이 방식을 택한 이유는 `drawer.tsx`가 이미 4방향
 * `swipeDirection`을 전부 지원해서다(리서치로 확인 — shadcn `sheet`/`dialog`는 Radix 기반이라
 * 이 저장소의 Base UI 래퍼와 원시 라이브러리가 달라 그대로 설치할 수 없었다).
 *
 * **표현 컴포넌트다(D-030 ①)** — `open`이 클릭된 날짜의 `iso`와 그 날의 `meetups`를 그대로
 * props로 받는다. `lib/data`를 import하지 않는다 — 호출자(`MonthCalendar.tsx`)가 이미
 * `MonthCalendarContainer`로부터 그 달 전체의 상세 데이터를 다 받아 뒀다가 클릭된 날짜분만
 * 넘긴다. 그래서 이 패널은 **실제 프로덕션 경로에서는 자체적으로 조회를 재시도할 대상이
 * 없다** — `MonthCalendar.tsx`는 이 컴포넌트를 항상 `status` 생략(기본값 `"default"`)으로만
 * 부른다.
 *
 * **그런데도 `status?: "default" | "loading" | "error"` prop이 있는 이유(CORE 재검증
 * 지적, 7일차)**: FR-063 E2("조회 실패 → 오류 + 재시도")를 `/sample`이 실제로 보여주려면
 * 그 모양을 그릴 어딘가가 있어야 한다 — 021A의 `MonthCalendar` `/sample` 항목이 이미 같은
 * 전례다(로딩 스켈레톤·오류 패널 둘 다 실제 재조회에 연결되지 않은 **정적 데모**). 그
 * 전례를 그대로 따르되, `MonthCalendar.tsx`처럼 스켈레톤을 아예 별도로 손으로 그리는 대신
 * 이 컴포넌트 자신에 `status` 분기를 둔 이유는 `DayDetailPanel`이 오버레이(Drawer)라서다 —
 * `overlays.tsx`의 `BottomSheet`/`ToastTriggerPreview` 전례처럼 오버레이는 "열림" 자체가
 * 트리거로만 재현되므로, 실제 컴포넌트를 그대로 열어야 헤더·푸터·포커스 동작까지 진짜로
 * 보여줄 수 있다(외부에 통째로 다시 그린 모조품은 그 부분을 놓친다). 나중에 패널을 열 때마다
 * 서버에서 그 날짜만 다시 읽어 오는 방식으로 실제 바뀌면(예: Server Action) `status`를
 * 그 비동기 상태에 그대로 연결하면 된다 — 지금은 그 설계를 앞당기지 않고 `/sample` 전용
 * 정적 값으로만 쓴다.
 *
 * **포커스 트랩·Esc·복귀 포커스**: `Drawer`(Base UI) 프리미티브가 기본 제공한다
 * (`overlays.tsx`의 BottomSheet 항목과 같은 근거 — Drawer 공식 문서의 `finalFocus`/`modal`
 * 표). 이 패널은 `DrawerTrigger`를 쓰지 않고 `open`을 외부(`MonthCalendar`의 날짜 셀)에서
 * 제어하므로, 닫힐 때 포커스는 "이전에 포커스가 있던 요소"(그 날짜 셀)로 돌아간다 — 실제
 * 브라우저 확인은 팀장 회차 말미 렌더 체크 항목으로 남겨 둔다(보고 참고).
 *
 * **Meetup 상세(SC-17)로 이어지는 경로(Task 022, 8일차)**: 각 행의 카드 전체는 여전히
 * FR-063 AC2대로 "원 제안글"로 이동한다 — 이 동작은 요구사항 고정값이라 바꾸지 않았다. 대신
 * 카드 아래에 `meetupId` 기준(R-016/FR-052, `meetup-links.ts`의 `getMeetupDetailHref`) 링크를
 * **형제 요소로** 추가했다 — 카드 링크 안에 중첩하면 `<a>` 안에 `<a>`가 되어 유효하지 않은
 * HTML이 된다.
 */
export interface DayDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `formatDayLabelKo`가 만든 "8월 14일 금요일" 같은 완성 문구 — 패널은 날짜를 계산하지 않는다. */
  dateLabel: string;
  meetups: CalendarMeetupDetail[];
  /**
   * `/sample` 전용 — 프로덕션 호출부(`MonthCalendar.tsx`)는 이 prop을 생략해 항상
   * `"default"`로 둔다. `"loading"`/`"error"`는 실제로 도달하지 않고, `meetups` 내용 대신
   * 스켈레톤/`ErrorState`를 보여주는 정적 스위치일 뿐이다(위 모듈 docstring 참고).
   */
  status?: "default" | "loading" | "error";
}

export function DayDetailPanel({
  open,
  onOpenChange,
  dateLabel,
  meetups,
  status = "default",
}: DayDetailPanelProps) {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const title = t((s) => s.calendar.month.detail.title, { date: dateLabel });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection={isDesktop ? "right" : "down"}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
          {status === "loading" ? (
            <DayDetailSkeletonRows />
          ) : status === "error" ? (
            <ErrorState
              title={strings.calendar.month.detail.errorTitle}
              description={strings.calendar.month.detail.errorDescription}
            />
          ) : meetups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {strings.calendar.month.detail.empty}
            </p>
          ) : (
            meetups.map((meetup) => <DayDetailMeetupRow key={meetup.id} meetup={meetup} />)
          )}
        </div>

        <DrawerFooter>
          <DrawerClose render={<Button variant="outline" size="sm" />}>
            {strings.calendar.month.detail.close}
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/** `status="loading"` 정적 스켈레톤 — `DayDetailMeetupRow`의 카드 모양(범례+제목+메타 한 줄)을 흉내 낸다. */
function DayDetailSkeletonRows() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

function DayDetailMeetupRow({ meetup }: { meetup: CalendarMeetupDetail }) {
  const timeLabel = formatStartTimeKo(meetup.startTime) ?? strings.calendar.month.detail.timeUnset;
  const capacityLabel =
    meetup.capacity !== null
      ? t((s) => s.calendar.month.detail.capacityLabel, {
          count: meetup.attendingCount,
          capacity: meetup.capacity,
        })
      : t((s) => s.calendar.month.detail.noCapacityLabel, { count: meetup.attendingCount });

  const card = (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <CrewLegend crewName={meetup.crewName} colorIndex={meetup.colorIndex} />
        {/* FR-013 AC2(I-067) — 두 배지는 배타적이지 않다(해산 전에 이미 취소됐던 Meetup은
         *  둘 다 뜬다, 사실이 둘 다 참이면 그대로 보여준다). archived 배지가 "취소됨"과
         *  혼동되면 안 되므로 독립 문구를 쓴다(calendar-types.ts의 `isArchivedCrew`
         *  docstring 참고). */}
        <div className="flex shrink-0 items-center gap-1">
          {meetup.isArchivedCrew && (
            <Badge variant="secondary">{strings.calendar.month.detail.archivedCrewBadge}</Badge>
          )}
          {meetup.isCancelled && (
            <Badge variant="secondary">{strings.calendar.month.detail.cancelledBadge}</Badge>
          )}
        </div>
      </div>
      <p className="truncate text-sm font-medium text-foreground">{meetup.title}</p>
      <p className="tnum text-xs text-muted-foreground">
        {[timeLabel, meetup.place, capacityLabel].filter(Boolean).join(" · ")}
      </p>
    </div>
  );

  // FR-063 AC2 — 항목(카드) 자체를 클릭하면 원 제안글로 이동한다. `postHref`가 없으면
  // (방어적 경우, 정상 경로에서는 항상 값이 있다) 그냥 목록 카드로만 보여준다 — 갈 곳 없는
  // 링크를 만들지 않는다.
  const cardWithPostLink = meetup.postHref ? (
    <Link
      href={meetup.postHref}
      className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {card}
      <span className="sr-only">{strings.calendar.month.detail.goToPostHint}</span>
    </Link>
  ) : (
    card
  );

  return (
    <div className="flex flex-col gap-1">
      {cardWithPostLink}
      {/* Meetup 상세(SC-17, FR-064)로 이어지는 별도 경로 — 카드 전체를 감싼 위 Link(원
       *  제안글행)와 나란한 형제 요소로 둔다(<a> 중첩은 유효하지 않은 HTML이다). 리소스 ID
       *  (meetupId) 기준 경로다(R-016/FR-052, `meetup-links.ts`). */}
      <Link
        href={getMeetupDetailHref(meetup.id)}
        className="self-end text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        {strings.calendar.month.detail.goToMeetupDetail}
      </Link>
    </div>
  );
}
