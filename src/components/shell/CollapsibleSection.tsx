"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { HomeSectionId } from "@/components/shell/section-collapse";
import { writeSectionCollapsed } from "@/components/shell/section-collapse-client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

export interface CollapsibleSectionProps {
  sectionId: HomeSectionId;
  /** 섹션 제목. 이 텍스트가 곧 토글 버튼의 접근 가능한 이름이 된다. */
  title: string;
  /**
   * **접었을 때만** 헤더에 남는 한 줄 요약(예: "크루 4개", "안 읽음 3"). 접기가 내용을
   * 없애는 게 아니라 밀도만 낮추도록 — 접힌 섹션도 "지금 무슨 일이 있는지"는 계속 말한다.
   * 셀 값이 없는 섹션(소개용 목록 등)은 생략한다.
   */
  summary?: string;
  /**
   * 헤더 오른쪽 링크(예: "캘린더에서 모두 보기"). 토글 버튼 **밖**에 둔다 — 버튼 안에 링크를
   * 중첩하면 키보드·보조기술에서 두 인터랙션이 겹친다. `ReactNode` 슬롯이 아니라 경로+라벨로
   * 받는 이유: 세 섹션이 같은 링크 모양을 공유해야 하는데, 슬롯으로 두면 호출부마다 클래스를
   * 다시 적고 그중 하나가 어긋난다.
   */
  actionHref?: string;
  actionLabel?: string;
  /** 서버가 쿠키에서 읽어 넘긴 초기 상태(`getCollapsedSections`) — 하이드레이션 불일치를
   *  피하려면 첫 렌더가 서버와 같아야 한다. */
  defaultOpen: boolean;
  /**
   * 토글 결과를 쿠키에 남길지. 기본은 남긴다. `/sample` 쇼케이스처럼 **실제 홈 상태를 바꾸면
   * 안 되는 자리**에서만 끈다 — 쇼케이스에서 접어 본 것 때문에 사용자의 홈에서 그 섹션이
   * 사라지면 안 된다.
   */
  persist?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * 홈 대시보드(SC-06) 섹션 하나를 감싸는 접기/펴기 셸. 4개 섹션(다가오는 모임·내 크루·최근
 * 알림·지금 활발한 모임)이 같은 헤더 문법을 공유하게 한다.
 *
 * **접근성은 프리미티브가 맡는다.** `CollapsibleTrigger`(Base UI)가 `aria-expanded`·
 * `aria-controls`를 자동으로 붙이므로(`ui/collapsible.tsx` docstring) 여기서 손으로 다시
 * 구현하지 않는다. 트리거를 `<h2>` 안에 넣는 것은 WAI-ARIA 아코디언 관례다 — 그래야 제목이
 * 접힌 상태에서도 헤딩 목록(스크린 리더 탐색)에 남는다.
 *
 * **셰브론 회전을 `data-*` 속성이 아니라 React 상태로 건다.** 이 컴포넌트는 쿠키를 쓰기 위해
 * 어차피 `open`을 제어 상태로 들고 있어서, 같은 값을 CSS 선택자로 한 번 더 유도할 이유가
 * 없다. 회전에는 `motion-reduce:transition-none`을 붙인다(NFR-021).
 *
 * **접힘 상태를 서버로 되돌리지 않는다** — 쿠키만 갱신하고 `router.refresh()`는 부르지
 * 않는다. 이유는 `section-collapse-cookie.ts` 모듈 docstring 참고.
 */
export function CollapsibleSection({
  sectionId,
  title,
  summary,
  actionHref,
  actionLabel,
  defaultOpen,
  persist = true,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (persist) writeSectionCollapsed(sectionId, !nextOpen);
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className={cn("flex flex-col gap-3", className)}
    >
      {/* 헤더 밑줄 하나로 섹션 경계를 낸다 — 카드 테두리를 겹쳐 두면 안쪽 목록(이미 각 행이
          테두리를 가진다)과 상자가 이중으로 쌓인다. */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        {/* `flex-1`이 없으면 이 헤딩은 콘텐츠 폭으로만 잡혀, 좁은 폭에서 오른쪽 링크에 밀려
            제목이 "다가오는 …"으로 잘린다(실렌더로 확인). `min-w-0`은 그 위에서 truncate가
            실제로 동작하게 하는 짝이다 — flex 자식의 기본 `min-width: auto`가 축소를 막는다. */}
        <h2 className="min-w-0 flex-1">
          <CollapsibleTrigger className="-mx-1 flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
                open ? "rotate-0" : "-rotate-90",
              )}
            />
            <span className="truncate font-heading text-base font-medium text-foreground">
              {title}
            </span>
          </CollapsibleTrigger>
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          {!open && summary ? (
            <span className="tnum text-xs text-muted-foreground">{summary}</span>
          ) : null}
          {actionHref && actionLabel ? (
            <Link
              href={actionHref}
              className="inline-flex items-center rounded-md py-1 text-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {actionLabel}
            </Link>
          ) : null}
        </div>
      </div>

      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
