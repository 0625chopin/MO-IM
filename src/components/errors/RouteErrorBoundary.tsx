"use client";

import { AlertTriangle, CircleHelp, GitCompare, Lock, SearchX, Users, WifiOff } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { strings, t } from "@/lib/strings";
import { cn } from "@/lib/utils";

import type { RouteErrorKind } from "./route-error-kind";
import type { LucideIcon } from "lucide-react";

const KIND_META: Record<RouteErrorKind, { icon: LucideIcon; content: { title: string; description: string } }> = {
  not_found: { icon: SearchX, content: strings.error.notFound },
  forbidden: { icon: Lock, content: strings.error.forbidden },
  network: { icon: WifiOff, content: strings.error.network },
  conflict: { icon: GitCompare, content: strings.error.conflict },
  validation_failed: { icon: AlertTriangle, content: strings.error.validationFailed },
  full: { icon: Users, content: strings.error.capacityFull },
  /** 19일차, I-069 완화 — `network`(WifiOff, "연결 문제"로 원인을 단정)와 시각적으로도
   *  구분한다. `error.tsx`의 `classifyError`가 분류에 실패했을 때만 쓴다. */
  unknown: { icon: CircleHelp, content: strings.error.unknown },
};

export interface RouteErrorBoundaryProps {
  /** 어떤 도메인 오류인지(D-030 ③) — 문구·아이콘을 결정한다. */
  kind: RouteErrorKind;
  /** Next.js `error.digest`. 프로덕션에서는 원본 오류 메시지 대신 이 값만 노출한다(NFR-014). */
  digest?: string;
  /** 지정하면 "다시 시도" 버튼을 보여준다. 세그먼트 오류(`error.tsx`)의 `unstable_retry`처럼
   *  재요청이 의미 있을 때만 넘긴다 — 404처럼 재요청해도 결과가 같은 경우는 생략한다. */
  onRetry?: () => void;
  homeHref?: string;
  className?: string;
}

/**
 * 전역 오류·경계 화면(Task 014)의 표현 컴포넌트. `error.tsx`·`not-found.tsx`가 데이터를 props로만
 * 넘겨 이 컴포넌트를 그린다(D-030 ①) — 이 파일은 `@/lib/data`·`@/lib/realtime`을 import하지
 * 않는다(zone 4가 강제).
 *
 * `"use client"`가 필요하다 — `onRetry`(함수 prop, 버튼 `onClick`)를 받는다. 이 컴포넌트는
 * Server Component인 `not-found.tsx`와 Client Component인 `error.tsx`·`global-error.tsx` 양쪽에서
 * 공유되는데, 지시어가 없으면 번들러가 두 그래프 중 한쪽(서버)으로만 귀속시켜 클라이언트 쪽
 * 렌더에서 "Event handlers cannot be passed to Client Component props" 오류가 난다 — 이벤트
 * 핸들러를 받는 컴포넌트는 명시적으로 클라이언트여야 한다는 React 규칙 그대로다.
 */
export function RouteErrorBoundary({ kind, digest, onRetry, homeHref = "/", className }: RouteErrorBoundaryProps) {
  const { icon: Icon, content } = KIND_META[kind];

  return (
    <Empty className={cn("min-h-[50vh]", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{content.title}</EmptyTitle>
        <EmptyDescription>{content.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex items-center gap-2">
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {strings.common.actions.retry}
            </Button>
          )}
          <Link href={homeHref} className={buttonVariants({ size: "sm" })}>
            {strings.common.actions.goHome}
          </Link>
        </div>
        {digest && (
          <p className="text-xs text-muted-foreground/70">{t((s) => s.error.digest, { digest })}</p>
        )}
      </EmptyContent>
    </Empty>
  );
}
