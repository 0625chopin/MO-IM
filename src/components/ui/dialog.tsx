"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { strings } from "@/lib/strings"
import { cn } from "@/lib/utils"


function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      // 어두워지는 범위는 화면 전체가 아니라 **앱 프레임**이다. 이 앱은 넓은 화면에서 모바일 폭
      // 프레임을 중앙에 놓으므로(`AppShell`), 프레임 밖 여백면까지 덮으면 "앱 위에 뜬 모달"이
      // 아니라 "브라우저 전체를 가리는 모달"로 읽힌다. Portal이 `<body>`에 붙어 fixed 기준이
      // 뷰포트라, 프레임과 같은 폭·중심선을 직접 맞춰 준다(`MobileTabBar`와 같은 방식·근거).
      className={cn(
        "fixed inset-y-0 left-1/2 isolate z-50 w-full max-w-app -translate-x-1/2 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        // 폭 상한이 `max-w-[calc(100%-2rem)] sm:max-w-sm`에서 `min(...)` 한 줄로 바뀌었다.
        // 이유는 두 클래스가 모바일 프레임 도입 이후 **둘 다 제 역할을 못 하기 때문**이다:
        // `100%`는 Portal이 붙은 `<body>` 기준이라 1440px 화면에서 1408px까지 벌어지고,
        // `sm:`은 `appframe` 컨테이너 쿼리로 재정의돼 있어(`globals.css`) 프레임 밖인 여기서는
        // 조상을 못 찾아 한 번도 켜지지 않는다. `min()`은 그 둘의 의도(모바일에서는 좌우 1rem씩
        // 여백, 그 이상에서는 24rem 고정)를 브레이크포인트 없이 그대로 표현한다.
        // 좌우 중앙 정렬은 그대로 둔다 — 프레임도 `mx-auto`라 중심선이 이미 일치한다.
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[min(calc(100%-2rem),24rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">{strings.common.actions.close}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      // shadcn 기본값은 `sm:flex-row sm:justify-end`였다(넓은 화면에서 버튼을 가로로 정렬).
      // I-099 전수 조사(CORE, 23일차)로 제거했다 — `DialogPortal`이 `<body>`에 붙어(위
      // `DialogContent`의 `min()` 주석 참고) 이 요소는 `appframe` 컨테이너의 **DOM 자손조차
      // 아니다.** `globals.css`가 재정의한 `sm:`은 `@container appframe (…)`을 찾는데 조상에
      // 그 이름의 컨테이너가 아예 없으니, 프레임 폭과 무관하게 항상 꺼진 상태였다(프레임을
      // 넓혀도 살아나지 않는 다른 종류의 죽은 코드 — `AppShell`류의 "프레임이 좁아서" 죽은
      // 코드와 원인이 다르다). 항상 세로 스택(`flex-col-reverse`)으로만 렌더되던 실제 동작은
      // 그대로 유지된다(시각적 변화 없음).
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          {strings.common.actions.close}
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
