import Link from "next/link";

import type { UpcomingMeetupSummary } from "@/components/calendar/calendar-types";
import { CrewLegend } from "@/components/calendar/CrewLegend";
import { formatTimeRangeKo } from "@/components/calendar/date-grid";
import { ErrorState } from "@/components/ui/error-state";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";

/**
 * 홈 대시보드 캘린더 요약(Task 021B, PRD "홈 대시보드 캘린더 요약" 2인일 몫) — "다가오는
 * 모임" 목록. SC-06 전체(내 크루 카드·알림 미리보기 포함)는 이 컴포넌트 범위가 아니다 —
 * ROADMAP Task 021B는 캘린더 요약 하나만 명시적으로 산정한다(워크로그 보고에도 이 경계를
 * 남겼다).
 *
 * 표현 컴포넌트다(D-030 ①) — `lib/data`를 import하지 않는다. `HomeCalendarSummaryContainer`가
 * 조회해 넘긴 `items`를 그대로 그린다. `MeetupBar`/`DayDetailPanel`과 같은 이유로 색 계산은
 * 하지 않는다 — `colorIndex`는 컨테이너가 `Crew.colorKey`를 그대로 넘긴 값이다(월 격자와
 * 달리 여러 날짜에 걸친 목록이라 D-026 같은-날짜-셀 충돌 회피 자체가 적용되지 않는다 — 이
 * 목록의 각 행은 서로 다른 날짜일 수 있어 "충돌"이라는 개념이 없다).
 */
export interface HomeCalendarSummaryProps {
  items: UpcomingMeetupSummary[];
  /** 오류 상태(FR-061 E3와 같은 종류의 일반 조회 실패) — Mock 단계엔 실제로 발생하지 않지만
   *  `/sample` 4상태 등록 대상이라 자리를 둔다(D-030 ③). */
  error?: boolean;
  /**
   * 제목 줄(제목 + "캘린더에서 모두 보기")을 그리지 않는다 — 홈에서는 접기 셸
   * (`CollapsibleSection`)이 같은 자리에 제목과 링크를 이미 갖고 있어 두 벌이 된다.
   * 기본값(false)은 `/sample`처럼 셸 없이 이 컴포넌트만 놓는 자리를 위한 것이다.
   */
  hideHeading?: boolean;
  className?: string;
}

export function HomeCalendarSummary({ items, error, hideHeading, className }: HomeCalendarSummaryProps) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {!hideHeading && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">
            {strings.home.dashboard.upcoming.title}
          </h2>
          <Link
            href="/calendar"
            className="inline-flex items-center py-1 text-sm text-primary hover:underline"
          >
            {strings.home.dashboard.upcoming.viewAll}
          </Link>
        </div>
      )}

      {error ? (
        <ErrorState
          title={strings.home.dashboard.upcoming.errorTitle}
          description={strings.home.dashboard.upcoming.errorDescription}
        />
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {strings.home.dashboard.upcoming.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <HomeCalendarSummaryRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HomeCalendarSummaryRow({ item }: { item: UpcomingMeetupSummary }) {
  const timeLabel = formatTimeRangeKo(item.startTime, item.endTime);
  const row = (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <CrewLegend crewName={item.crewName} colorIndex={item.colorIndex} />
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
      </div>
      <p className="tnum shrink-0 text-right text-xs text-muted-foreground">
        {item.dateLabel}
        {timeLabel ? <><br />{timeLabel}</> : null}
      </p>
    </div>
  );

  // 이 링크에는 `aria-label`을 채우지 않는다 — 카드 안 텍스트(크루명·제목·날짜)가 이미
  // 충분히 서술적이라 그대로 접근성 이름이 되게 둔다(`DayDetailPanel.tsx`의 같은 판단·
  // `MeetupBar.tsx`의 title/aria-label 상호 배타 근거 참고 — `aria-label`을 채우면 그
  // 안의 풍부한 텍스트가 접근성 트리에서 통째로 가려진다).
  if (!item.postHref) return row;

  return (
    <Link
      href={item.postHref}
      className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {row}
    </Link>
  );
}
