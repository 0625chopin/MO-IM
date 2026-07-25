"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { strings } from "@/lib/strings";

export interface BlockedContentNoticeProps {
  /** 접혔을 때 대신 보여줄 안내 아래, 펼치면 원래 콘텐츠(children)가 나온다. */
  children: React.ReactNode;
}

/**
 * FR-081 AC1 "B의 콘텐츠가 접힘 처리되고 펼치기 옵션이 제공된다"의 표현 컴포넌트(Task 042A,
 * D-030 ① — 데이터를 props로만 받는다, `lib/data`·차단 판정을 모른다). 차단 여부 판정
 * (`isContentFromBlockedAuthor`, `lib/rules/block-content-visibility.ts`)은 호출자가 끝내고
 * `true`일 때만 이 컴포넌트로 감싼다 — 이 컴포넌트 자신은 "누가 차단됐는지" 모른다.
 *
 * 세 사용처(`BoardListItem`·`PostDetail`·`MessageBubble`) 전부에 배선돼 있다
 * (`docs/decisions/report-block-042a.md` §9).
 *
 * **20일차 후속(DESIGN 브라우저 실측 minor) — `ui/collapsible.tsx`(Base UI) 기반으로 재작성**.
 * 이전 버전은 `expanded`에 따라 완전히 다른 JSX 트리를 반환했다 — 펼쳤을 때 "펼치기" 버튼
 * 자체가 DOM에서 사라져(대체 트리로 통째로 교체) 포커스가 갈 곳을 잃고 `<body>`로
 * 빠졌고, `aria-expanded`도 없었다. `Collapsible.Trigger`는 열림/닫힘과 무관하게 **항상
 * DOM에 남아 있고** `aria-expanded`·`aria-controls`를 자동으로 붙인다(Base UI 소스 확인,
 * `ui/collapsible.tsx` 모듈 docstring) — 그래서 토글을 눌러도 포커스가 그 버튼 자신에게
 * 그대로 남는다(브라우저 기본 동작, 별도 코드 불필요). 부수 효과로 접었다 폈다를 왕복할
 * 수 있게 됐다(이전엔 한 번 펼치면 되돌릴 수 없었다).
 */
export function BlockedContentNotice({ children }: BlockedContentNoticeProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
        <p className="text-sm text-muted-foreground">{strings.moderation.blockedContent.notice}</p>
        <CollapsibleTrigger render={<Button type="button" size="sm" variant="ghost" />}>
          {open ? strings.moderation.blockedContent.collapseButton : strings.moderation.blockedContent.expandButton}
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="flex flex-col gap-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}
