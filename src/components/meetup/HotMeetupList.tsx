import Link from "next/link";

import type { HotMeetupItem } from "@/components/meetup/hot-meetup-types";
import { ErrorState } from "@/components/ui/error-state";
import { crewCertaintyVars } from "@/lib/crew-palette";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";

import type { CSSProperties } from "react";

/**
 * "지금 활발한 모임" 목록 (D-109) — 랜딩(`/`)과 홈(`/home`)이 함께 쓰는 표현 컴포넌트다.
 * `lib/data`를 import하지 않는다(D-030 ①) — `HotMeetupsContainer`가 조회·정규화해 넘긴
 * `items`를 그대로 그린다.
 *
 * **시각 장치: 활동 잔물결(ink ripple).** 각 행 아래 크루 색으로 번지는 얇은 막대의 폭이
 * `intensity`(1위 대비 상대 활동량)다. 순위 숫자를 크게 박는 흔한 처리 대신 이걸 고른 이유는,
 * **순위는 순서만 알려주고 격차를 못 알려주기 때문이다** — 1위가 압도적인지 다섯이 비슷한지가
 * 이 목록에서 실제로 궁금한 정보다. 종이에 잉크가 번진 정도라는 비유는 이 제품의 기존
 * 표면(`surface-warm`·certainty 스케일)과 같은 재료를 쓴다. 새 색·새 폰트를 만들지 않았다 —
 * 크루 12색 팔레트(D-026)와 Geist Mono(이미 로드된 유틸리티 페이스)만 쓴다.
 *
 * **잔물결은 보조 신호다**(D-026과 같은 원칙). 막대는 `aria-hidden`이고, 순서 정보는 순위
 * 텍스트가 그대로 전달한다 — 색·폭만으로 정보를 전달하지 않는다(WCAG 1.4.1). 애니메이션은
 * 넣지 않았다: 이 섹션에서 과감함은 잔물결 하나로 충분하고, 서버 렌더 목록에 진입 모션을
 * 얹으면 `prefers-reduced-motion` 처리까지 달고 다녀야 한다.
 *
 * **certainty 스케일을 쓰지 않는 이유**: 이 목록은 `status='confirmed'`인 모임만 담는다
 * (RPC가 그렇게 필터한다) — 확정성이 변수가 아니라 상수라 그 축으로는 아무것도 구분되지
 * 않는다. 여기서 변하는 값은 활동량뿐이라 시각 장치도 그것 하나에 붙였다.
 */
export interface HotMeetupListProps {
  items: HotMeetupItem[];
  /** 섹션 전체 조회 실패(D-030 ③). `/sample` 4상태의 "오류" 자리이기도 하다. */
  error?: boolean;
  /**
   * 랜딩(게스트)에서만 "크루 둘러보기" 유도를 붙인다. 홈에서는 이미 크루에 속한 사람이
   * 보는 화면이라 같은 유도가 겉돈다.
   */
  showBrowseCta?: boolean;
  className?: string;
}

export function HotMeetupList({ items, error, showBrowseCta, className }: HotMeetupListProps) {
  const s = strings.home.hotMeetups;

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-medium text-foreground">{s.title}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{s.subtitle}</p>
      </div>

      {error ? (
        <ErrorState title={s.errorTitle} description={s.errorDescription} />
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-6 text-center">
          <p className="text-sm text-foreground">{s.empty}</p>
          <p className="mt-1 text-xs text-muted-foreground">{s.emptyDescription}</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {items.map((item, index) => (
            <li key={item.id}>
              <HotMeetupRow item={item} rank={index + 1} />
            </li>
          ))}
        </ol>
      )}

      {showBrowseCta && !error ? (
        <Link
          href="/crews"
          className="inline-flex items-center self-start rounded-md py-1 text-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {s.guestCta}
        </Link>
      ) : null}
    </section>
  );
}

function HotMeetupRow({ item, rank }: { item: HotMeetupItem; rank: number }) {
  const s = strings.home.hotMeetups;
  const vars = crewCertaintyVars(item.colorIndex) as CSSProperties;

  const attendingLabel =
    item.capacity === null
      ? s.attending.replace("{count}", String(item.attendingCount))
      : s.attendingWithCapacity
          .replace("{count}", String(item.attendingCount))
          .replace("{capacity}", String(item.capacity));

  // 잔물결이 0폭이면 "활동이 없다"로 오독된다 — 목록에 오른 이상 최소 폭은 준다.
  const ripplePercent = Math.max(6, Math.round(item.intensity * 100));

  return (
    <Link
      href={item.crewHref}
      className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 transition-colors group-hover:bg-accent/40">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {/* 순위는 데이터라 유틸리티 페이스(Geist Mono)로 둔다 — 배지가 아니라 라벨이다. */}
            <span className="tnum mt-0.5 shrink-0 font-mono text-xs text-muted-foreground">
              {s.rankBadge.replace("{rank}", String(rank))}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="certainty-confirmed size-2 shrink-0 rounded-full"
                  style={vars}
                />
                <span className="truncate">{item.crewName}</span>
                {item.crewCategory ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="shrink-0">{item.crewCategory}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          {/* 날짜와 시각을 `<br>`로 나누지 않고 블록 `span` 둘로 쌓는다 — `<br>`는 접근성 이름
              계산에서 공백을 만들지 않아 "8월 21일(금)오전 10:00"으로 붙어 읽힌다(실측으로
              확인). 블록 요소는 경계에서 공백이 삽입된다. 시각적 결과는 같다. */}
          <p className="tnum shrink-0 text-right text-xs text-muted-foreground">
            <span className="block">{item.dateLabel}</span>
            <span className="block">{item.timeLabel ?? s.timeUndecided}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* 활동 잔물결 — 보조 신호(aria-hidden). 폭이 1위 대비 상대 활동량이다.
              `certainty-confirmed`(꽉 찬 칠)를 쓰지 않는다: 그 유틸은 작은 칩용이라 100% 폭
              막대에 얹으면 본문 텍스트와 경쟁하고, 같은 행의 크루 색 점과 색 신호가 두 번
              겹친다(실렌더 검토에서 확인). 크루색을 그대로 쓰되 불투명도를 낮춰 "잉크가
              번진 자국"에 가깝게 두고, 강조는 색이 아니라 **폭**이 하게 한다. */}
          <span aria-hidden="true" className="h-px min-w-0 flex-1 rounded-full bg-border">
            <span
              className="block h-px rounded-full"
              style={{
                ...vars,
                width: `${ripplePercent}%`,
                backgroundColor: "var(--crew-color)",
                opacity: 0.65,
              }}
            />
          </span>
          <span className="tnum shrink-0 text-xs text-muted-foreground">{attendingLabel}</span>
        </div>
      </div>
    </Link>
  );
}
