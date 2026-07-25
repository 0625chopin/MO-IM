import { Badge } from "@/components/ui/badge";
import { crewCertaintyVars } from "@/lib/crew-palette";
import { cn } from "@/lib/utils";

import type { CSSProperties } from "react";

/**
 * 크루 색 스와치 + 크루명 라벨(D-026 "색은 보조 신호일 뿐이며 크루명 텍스트 라벨을 반드시
 * 병기한다") — Task 021B. `CrewFilterPanel`(필터 체크박스 각 행)과 `DayDetailPanel`(모임
 * 목록 각 행)이 함께 쓰는 표현 컴포넌트다. `MeetupBar.tsx`처럼 색 계산은 하지 않는다 —
 * `colorIndex`는 호출자가 이미 결정한 값이다(크루 필터는 `Crew.colorKey` 그대로, `DayDetailPanel`은
 * 그날 셀의 D-026 충돌 회피까지 끝난 값).
 *
 * 서버·클라이언트 어디서든 쓸 수 있도록 `"use client"`를 붙이지 않는다 — 상태도 이벤트 핸들러도
 * 없는 순수 표현 컴포넌트다.
 */
export interface CrewLegendProps {
  crewName: string;
  colorIndex: number;
  /** 필터에서 꺼진 크루처럼 시각적으로 흐리게 보여줄 때. `badge`와는 다른 신호라 혼용하지
   *  않는다 — `dimmed`는 "선택 해제됨"(체크 여부에 종속), `badge`는 "이 크루의 상태"(선택
   *  여부와 무관하게 항상 사실이면 보인다). archived 크루가 기본값대로 체크돼 있어도
   *  배지는 계속 떠야 하므로 하나로 합칠 수 없다. */
  dimmed?: boolean;
  /**
   * 크루명 옆에 붙는 범용 상태 배지(FR-013 AC2, I-067, 19일차) — 이름을 "archived 전용"으로
   * 짓지 않은 이유: 지금 당장의 소비자는 해산된 크루뿐이지만, 다음에 다른 크루 상태 배지가
   * 필요해지면(예: 정지) 같은 슬롯을 재사용하면 된다. 비워 두면(`undefined`) 아무것도 안
   * 그린다 — 기존 호출부(`CrewFilterPanel`의 다른 크루들, `DayDetailPanel`이 아직 안 넘기는
   * 경우)는 전부 이 값을 생략하므로 시각적으로 그대로다.
   */
  badge?: string;
  className?: string;
}

export function CrewLegend({ crewName, colorIndex, dimmed, badge, className }: CrewLegendProps) {
  const vars = crewCertaintyVars(colorIndex) as CSSProperties;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {/* `certainty-confirmed`(globals.css)이 `--crew-color`를 배경으로 칠한다 — MeetupBar와
       *  같은 유틸리티라 스와치와 바가 항상 같은 값을 그린다(두 곳에 색 계산을 따로 두지 않는다). */}
      <span
        aria-hidden="true"
        className={cn(
          "certainty-confirmed size-2.5 shrink-0 rounded-full",
          dimmed && "opacity-40",
        )}
        style={vars}
      />
      <span
        className={cn("truncate text-sm text-foreground", dimmed && "text-muted-foreground")}
      >
        {crewName}
      </span>
      {badge && (
        <Badge variant="secondary" className="shrink-0">
          {badge}
        </Badge>
      )}
    </span>
  );
}
