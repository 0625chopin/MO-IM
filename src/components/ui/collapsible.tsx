"use client"

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { cn } from "@/lib/utils"

/**
 * shadcn `collapsible` 레지스트리 항목을 이 프로젝트의 Base UI 프리미티브로 옮겨 적었다
 * (Task 042A 후속, 20일차) — 레지스트리 원본은 `radix-ui` 의존성이라 이 프로젝트의 다른
 * 모든 `ui/*.tsx`(`dialog.tsx`·`popover.tsx`·`toggle.tsx` 등)가 쓰는 `@base-ui/react`와
 * 어긋난다. `@base-ui/react/collapsible`이 Radix Collapsible과 대응하는 Root/Trigger/Panel
 * 3파트를 그대로 제공해(`CollapsibleTrigger`가 `aria-expanded`·`aria-controls`를 자동으로
 * 붙인다 — `node_modules/@base-ui/react/collapsible/trigger` 소스 확인) 손으로 접근성을
 * 다시 구현하지 않는다. `DialogPrimitive.Popup` → `DialogContent`처럼 Base UI의 `Panel`을
 * shadcn 관례 이름인 `CollapsibleContent`로 노출한다.
 */
function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  )
}

function CollapsibleContent({
  className,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={cn(
        "overflow-hidden data-starting-style:animate-in data-starting-style:fade-in-0 data-ending-style:animate-out data-ending-style:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger }
