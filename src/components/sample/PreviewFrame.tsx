"use client";

import { useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import type { CSSProperties, ReactNode } from "react";

/** NFR-026이 지정한 3종 뷰포트. `"full"`은 프레임을 부모 폭에 맡긴다. */
const VIEWPORT_WIDTHS = ["360", "768", "1280", "full"] as const;
type ViewportWidth = (typeof VIEWPORT_WIDTHS)[number];

const WIDTH_LABELS: Record<ViewportWidth, string> = {
  "360": "360",
  "768": "768",
  "1280": "1280",
  full: "전체",
};

/**
 * `/sample`에서 `position: sticky`/`fixed` 요소(`HeaderNav`·`MobileTabBar`)를 미리보기 상자
 * **안에** 가둔다. `transform`이 걸린 조상은 CSS 스펙상 `position: fixed` 자손의 containing
 * block이 된다 — 이 트릭이 없으면 미리보기 안의 `MobileTabBar`가 실제 뷰포트 하단에
 * 고정되어 루트 레이아웃이 이미 그리고 있는 진짜 `MobileTabBar`와 겹쳐 보인다.
 *
 * `resizable`을 주면 360/768/1280/전체 폭 토글이 붙는다(Task 012, NFR-026).
 *
 * ## 폭 토글로 무엇이 되고 무엇이 안 되는가 — 반드시 알고 쓸 것
 *
 * 프레임은 `@container`다. 따라서 **컨테이너 쿼리(`@sm:`/`@lg:`)로 짠 컴포넌트만** 이 토글에
 * 반응해 재배치된다. Tailwind의 `sm:`/`md:`/`lg:`는 **뷰포트** 기준이라 프레임 폭을 줄여도
 * 아무 일도 일어나지 않는다.
 *
 * 앱 셸 4종은 의도적으로 뷰포트 기준(`md:`)이다 — "데스크톱에서는 헤더 링크, 모바일에서는 하단
 * 탭바"는 기기에 대한 판단이지 부모 상자 폭에 대한 판단이 아니고, 실제 앱에서 셸의 부모는 항상
 * 뷰포트다. 그래서 셸 섹션의 폭 토글은 **좁은 폭에서 레이아웃이 깨지지 않는지 보는 용도**이고,
 * 헤더↔탭바 전환 자체는 브라우저 창을 실제로 줄여서 확인해야 한다. 이 사실을 토글 옆에 적어
 * 둔다 — 적어 두지 않으면 다음 사람이 "토글이 고장났다"고 판단한다.
 *
 * 앞으로 만드는 **도메인 컴포넌트는 컨테이너 쿼리로 짠다.** 그래야 이 토글이 실제 검증 도구가
 * 되고, 같은 컴포넌트를 좁은 슬롯과 넓은 본문에 함께 쓸 수 있다.
 *
 * **`@container/appframe`(named, I-098 이후 추가)** — 이 상자는 익명 `@container`일 뿐 아니라
 * 이름을 `appframe`으로도 준다. `globals.css`가 Tailwind의 `sm:`/`md:`/`lg:`/`xl:`/`2xl:`을
 * 전역으로 "이름이 `appframe`인 조상 컨테이너" 기준으로 재정의해 두었기 때문이다(named
 * container query는 이름이 일치하는 **가장 가까운** 조상만 찾는다, `globals.css` 머리 주석).
 * `/sample`이 `AppShell` 밖으로 나간 뒤(`sample/layout.tsx`)에도 이 상자 자신이 그 이름의
 * 조상 역할을 대신해 주므로, `sm:`/`md:`/`lg:`로 짠 컴포넌트를 이 상자로 감싸 데모하면 위 폭
 * 토글이 그 variant에도 그대로 반영된다 — 익명 `@sm:`/`@lg:` 쓰는 컴포넌트와 동시에 지원된다
 * (이름 있는 조회든 없는 조회든 똑같이 이 상자를 조상으로 찾기 때문에 충돌하지 않는다).
 * `AppShell`을 통째로 데모하는 항목(`shell.tsx`)만은 예외다 — `AppShell` 자신의 루트 `div`가
 * 이미 `@container/appframe`을 선언하므로, 이 상자보다 그쪽이 항상 더 가까운 조상이 되어
 * D-066이 원하는 "항상 430px" 동작이 그대로 유지된다.
 */
export function PreviewFrame({
  height = 200,
  width,
  resizable = false,
  className,
  children,
}: {
  height?: number;
  /** 고정 폭(px). `resizable`과 함께 쓰면 토글의 초기값이 된다. */
  width?: number;
  resizable?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<ViewportWidth>(
    width ? (String(width) as ViewportWidth) : "full",
  );

  const activeWidth = resizable ? selected : width ? String(width) : "full";
  const style: CSSProperties = {
    height,
    // fixed 자손을 이 상자 안에 가두는 containing block 트릭 — 위 주석 참고.
    transform: "translateZ(0)",
    ...(activeWidth === "full" ? {} : { width: `${activeWidth}px`, maxWidth: "100%" }),
  };

  return (
    <div className="flex flex-col gap-2">
      {resizable && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <ToggleGroup
            aria-label="미리보기 폭"
            size="sm"
            variant="outline"
            value={[selected]}
            onValueChange={(value) => {
              const next = value[0] as ViewportWidth | undefined;
              if (next) setSelected(next);
            }}
          >
            {VIEWPORT_WIDTHS.map((w) => (
              <ToggleGroupItem key={w} value={w} className="tnum font-mono text-xs">
                {WIDTH_LABELS[w]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="text-xs text-muted-foreground">
            컨테이너 쿼리(<code className="font-mono">@sm:</code>)로 짠 컴포넌트만 반응합니다
          </span>
        </div>
      )}
      <div
        style={style}
        className={cn(
          "relative isolate overflow-hidden rounded-lg border border-border bg-background @container/appframe",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
