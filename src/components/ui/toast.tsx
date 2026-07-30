"use client"

import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { cva, type VariantProps } from "class-variance-authority"
import { XIcon } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { strings } from "@/lib/strings"
import { cn } from "@/lib/utils"

/**
 * `@base-ui/react/toast` 위에 얹은 원자(Task 013). 레지스트리(`shadcn`)에는 `sonner`(별도
 * 패키지 + `next-themes` 의존)만 있고 base-nova 스타일의 순정 토스트 프리미티브가 없어, 이미
 * 설치된 `@base-ui/react`(Dialog·Drawer·Select 등과 동일 계열)의 `toast` 모듈을 직접 스타일링했다
 * — 새 런타임 의존성을 추가하지 않는다.
 *
 * 전역 매니저 패턴(공식 문서 "Global manager")을 쓴다 — `toastManager`를 모듈 스코프에 하나
 * 만들어 두면 `toast.show(...)`를 React 트리 밖(Server Action 콜백 등)에서도 호출할 수 있고,
 * `<Toaster />`는 뷰포트만 렌더하는 얇은 구독자가 된다.
 *
 * **색은 두 가지뿐이다** — `default`(잉크 중립)와 `destructive`(파괴적 알림)만 있다.
 * "success"류 채도 변형을 넣지 않는 이유는 디자인 언어(①)의 "채도는 크루 데이터만 쓴다" 규칙
 * 때문이다 — 초록 성공 토스트는 크루 팔레트가 아닌 새 유채색을 UI 크롬에 들이는 것과 같다.
 *
 * **NFR-021 (동적 변경은 live region으로 안내)**: Base UI의 `priority`가 그대로 aria-live
 * 강도로 매핑된다(`low` → polite, `high` → assertive). 이 파일은 `variant: "destructive"`일
 * 때만 `priority: "high"`를 준다 — "파괴적 알림만 assertive"라는 지시를 여기 한 곳에서 강제하고,
 * 호출부가 매번 priority를 판단하지 않게 한다.
 *
 * **액션 버튼(Task 023, FR-070 AC4 "토스트 클릭 → 이동 + 읽음 처리")**: `showToast`가 이미
 * 5초 자동소멸(NFR-021과 별개로 시간 압박이 있는 위젯)이라 토스트 전체를 클릭 영역으로 만들면
 * 오탐(실수로 닫기 전에 다른 곳을 눌러 이동)이 늘어난다고 판단해, Base UI가 이 목적으로 이미
 * 제공하는 `ToastObject.actionProps`(공식 "action button" 확장점, `Toast.Action`)를 그대로
 * 쓴다 — 새 클릭 오버레이를 직접 만들지 않는다. `actionLabel`/`onAction`을 준 토스트만 버튼이
 * 보이고, 기존 호출부(`ToastTriggerPreview` 등)는 그 필드를 안 주므로 동작이 그대로다.
 */

const toastManager = ToastPrimitive.createToastManager<{ actionLabel?: string }>()

export type ToastVariant = "default" | "destructive"

const TOAST_VARIANTS: readonly ToastVariant[] = ["default", "destructive"]

/**
 * Base UI의 `ToastObject.type`은 `string | undefined`다 — 이 모듈의 `show()`가 항상
 * `ToastVariant`만 넣는다는 보장은 타입 시스템이 아니라 이 파일의 규율에 달려 있다(누군가
 * `toastManager.add({ type: "success" })`처럼 이 모듈을 거치지 않고 직접 호출하면 깨진다).
 * `as` 단언 대신 이 가드로 좁혀서, 알 수 없는 값이 와도 `default`로 안전하게 떨어지게 한다.
 */
function isToastVariant(value: string | undefined): value is ToastVariant {
  return TOAST_VARIANTS.includes(value as ToastVariant)
}

export interface ShowToastOptions {
  title?: string
  description?: string
  variant?: ToastVariant
  /** ms. 0이면 자동으로 닫히지 않는다. 생략하면 Base UI 기본값(5000ms)을 쓴다. */
  timeout?: number
  /** 액션 버튼 라벨. `onAction`과 함께 줘야 버튼이 보인다(위 모듈 docstring 참고). */
  actionLabel?: string
  onAction?: () => void
}

function show({ title, description, variant = "default", timeout, actionLabel, onAction }: ShowToastOptions) {
  return toastManager.add({
    title,
    description,
    type: variant,
    priority: variant === "destructive" ? "high" : "low",
    timeout,
    data: actionLabel ? { actionLabel } : undefined,
    actionProps: onAction ? { onClick: onAction } : undefined,
  })
}

/** 어디서든(컴포넌트 밖 포함) 토스트를 큐에 넣는 공개 API. */
export const toast = {
  show,
  destructive: (opts: Omit<ShowToastOptions, "variant">) => show({ ...opts, variant: "destructive" }),
  close: (id?: string) => toastManager.close(id),
}

const toastVariants = cva(
  "pointer-events-auto relative flex w-full items-start gap-3 rounded-xl bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-[opacity,transform] duration-200 ease-out data-ending-style:opacity-0 data-limited:opacity-0 data-starting-style:translate-y-1 data-starting-style:opacity-0",
  {
    variants: {
      variant: {
        default: "",
        destructive: "ring-destructive/65 [&_[data-slot=toast-title]]:text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      // shadcn 기본값의 `sm:inset-x-auto sm:right-4`(넓은 화면에서 우하단 고정)는 I-099
      // 전수 조사(CORE, 23일차)로 제거했다 — `<Toaster />`는 `src/app/layout.tsx`에서
      // `AppShell`의 **형제**로 렌더된다(자손이 아니다), 즉 `appframe` 컨테이너가 DOM
      // 트리 어디에도 조상으로 없다. `globals.css`가 재정의한 `sm:`은 그 컨테이너를 찾는
      // 조건이라 프레임 폭과 무관하게 항상 꺼져 있었다(`DialogFooter` 주석과 같은 원인).
      // 실제로는 오히려 이게 맞는 동작이다 — 이 앱은 넓은 화면에서도 중앙의 모바일 폭
      // 프레임 하나만 보여주므로(D-066), 토스트가 프레임과 무관하게 브라우저 우하단
      // 모서리에 붙으면 "프레임 밖에 뜬 이질적인 배너"로 보인다. 지금처럼 가운데
      // 하단(프레임과 같은 중심선)에 고정되는 편이 제품 정체성과 맞는다.
      className={cn(
        "fixed inset-x-4 bottom-4 z-50 mx-auto flex w-auto max-w-sm flex-col gap-2 outline-none",
        className,
      )}
      {...props}
    />
  )
}

function ToastRoot({
  toast: toastObject,
  className,
  ...props
}: ToastPrimitive.Root.Props & VariantProps<typeof toastVariants>) {
  const variant = isToastVariant(toastObject.type) ? toastObject.type : "default"
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      toast={toastObject}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
}

function ToastContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toast-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}
      {...props}
    />
  )
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("font-heading text-sm font-medium text-foreground", className)}
      {...props}
    />
  )
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function ToastAction({ className, ...props }: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      className={cn(
        "shrink-0 self-center rounded-md px-2 py-1 text-xs font-medium text-foreground underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/70",
        className,
      )}
      {...props}
    />
  )
}

function ToastClose({ className, ...props }: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      render={<Button variant="ghost" size="icon-sm" className={cn("shrink-0", className)} />}
      {...props}
    >
      <XIcon />
      <span className="sr-only">{strings.common.actions.close}</span>
    </ToastPrimitive.Close>
  )
}

/** 실제 큐에 쌓인 토스트를 카드로 그린다. `<Toaster />` 내부 전용이라 별도로 내보내지 않는다. */
function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()
  return toasts.map((t) => (
    <ToastRoot key={t.id} toast={t}>
      <ToastContent>
        {t.title && <ToastTitle />}
        {t.description && <ToastDescription />}
      </ToastContent>
      {t.actionProps && t.data?.actionLabel && (
        <ToastAction {...t.actionProps}>{t.data.actionLabel}</ToastAction>
      )}
      <ToastClose />
    </ToastRoot>
  ))
}

/**
 * 앱에 한 번(루트 레이아웃) 배치하는 뷰포트. `toast.show(...)`가 어디서 호출되든 여기로
 * 모인다 — Provider가 `toastManager`(전역 매니저)를 쓰므로 `<Toaster />` 자신은 트리거를
 * 소유하지 않는다.
 */
export function Toaster() {
  return (
    <ToastPrimitive.Provider toastManager={toastManager} limit={3}>
      <ToastPrimitive.Portal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  )
}

export { ToastRoot, ToastContent, ToastTitle, ToastDescription, ToastAction, ToastClose, ToastViewport }
