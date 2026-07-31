import { crewCertaintyVars } from "@/lib/crew-palette";
import { cn } from "@/lib/utils";

import type { CSSProperties } from "react";

/**
 * 크루의 배정된 팔레트 색을 작은 점으로 보여준다(D-006·D-026). `MeetupBar.tsx`와 같은 이유로
 * 색 계산은 여기 없다 — 호출자가 이미 결정한 `colorIndex`(크루의 `colorKey`)를 조회만 한다.
 * `--background`/`--card` 표면 위에서만 쓴다(디자인 토큰 규칙 — UI 크롬에 유채색을 쓰지
 * 않는다, 예외는 크루색 자신).
 *
 * **`certainty-confirmed` 유틸리티(`globals.css`)를 그대로 쓴다** — `MeetupBar.tsx`·
 * `CrewLegend.tsx`(Task 021B, DESIGN)와 같은 이유다. 처음엔 `backgroundColor:
 * "var(--crew-color)"`를 직접 인라인했는데, 텍스트가 없는 점 하나라 시각 결과는 같아도
 * 크루색 채움을 매번 이 유틸리티 하나로 통일해 둔 규칙(D-026)에서 벗어난 재구현이었다 —
 * DESIGN의 `CrewLegend`를 검증하다 발견해 이 파일에서 바로잡았다.
 *
 * **`colorIndex: null`("색 미확인", 33일차 I-158 처분)** — 호출자가 실제 팔레트 인덱스를
 * 모를 때 쓴다(`getCrewById`의 private+비소속 폴백이 `colorKey`를 하드코딩된 `0`으로 줄 수
 * 있는 경우, `InvitationInboxContainer` 참고). **`certainty-draft`(점선 테두리)는 일부러
 * 재사용하지 않는다** — `docs/design/design-language.md` §2 "확정성 스케일"에서 그 점선은
 * 이미 "제안·투표 중"이라는 구체적인 의미를 갖고 캘린더·투표 카드·Meetup 배지·알림 전체가
 * 공유하는 형태다. 크루 색 자체를 모른다는 것은 그 스케일과 무관한 별개 개념이라, 같은 점선
 * 형태를 빌리면 "이 초대가 아직 투표 중인가?"로 오독될 수 있다. 대신 무채(`--muted-foreground`)
 * 채움만 쓴다 — 세 확정성 단계(점선/12% 채움/완전 채움) 중 어디와도 겹치지 않는 네 번째
 * 형태이면서, 채도는 여전히 0으로 규칙 ①("채도는 데이터만 쓴다")도 지킨다.
 */
export function CrewColorDot({
  colorIndex,
  className,
}: {
  colorIndex: number | null;
  className?: string;
}) {
  if (colorIndex === null) {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-block size-3 shrink-0 rounded-full bg-muted-foreground/35", className)}
      />
    );
  }

  const vars = crewCertaintyVars(colorIndex) as CSSProperties;
  return (
    <span
      aria-hidden="true"
      className={cn("certainty-confirmed inline-block size-3 shrink-0 rounded-full", className)}
      style={vars}
    />
  );
}
