"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REPORT_STATUS_FILTERS } from "@/lib/rules/report-resolution";
import { strings } from "@/lib/strings";
import type { ReportStatusFilter } from "@/lib/types";

import type { ReactNode } from "react";

export interface AdminReportStatusTabsProps {
  /** 현재 URL(`?status=`)이 가리키는 필터 — 서버 컴포넌트(`/admin/page.tsx`)가 판정해 내려준다. */
  status: ReportStatusFilter;
  /** 선택된 상태로 조회한 결과(`AdminReportsContainer`를 감싼 `Suspense`) — 이 컴포넌트는
   *  내용을 모른다, `TabsPanel`로 감싸기만 한다. */
  children: ReactNode;
}

/**
 * `/admin` 상태 필터 탭(I-077, 26일차) — 크루 탐색의 `CrewSearchBar`와 같은 패턴이다:
 * 클릭하면 `router.push`로 `/admin?status=`를 갱신해 서버 컴포넌트가 다시 조회하게 한다
 * (클라이언트에서 이미 받은 목록을 다시 걸러내지 않는다 — RLS·`is_system_admin` 재확인이
 * 걸린 RPC를 항상 거치게 하려는 것과 같은 이유로, `AdminReportsContainer` docstring의
 * "이중 안전" 원칙과 대칭이다). `router.push`를 `startTransition`으로 감싸(D-029 렌더링
 * 전략) 탭 자신은 전환 중에도 언마운트되지 않고, `page.tsx`가 `status`를 `Suspense`의
 * `key`로 쓰므로 그 아래 목록만 스켈레톤으로 바뀐다.
 *
 * 기본값 `"pending"`일 때는 URL에 `?status=pending`을 남기지 않는다(`CrewSearchBar`가 빈
 * 검색어를 URL에 남기지 않는 것과 같은 이유) — 예전 `/admin` 북마크·링크가 그대로 대기열을
 * 가리키게 하려는 것이다.
 *
 * `TabsContent`(base-ui `Tabs.Panel`)는 `value={status}`로 항상 현재 탭과 일치한다 — 탭 전환 자체가 콘텐츠를
 * 스위칭하는 게 아니라(콘텐츠는 서버 재조회로 바뀐다) `aria-controls`/`aria-labelledby`
 * 연결을 위한 접근성 배선일 뿐이다.
 */
export function AdminReportStatusTabs({ status, children }: AdminReportStatusTabsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleValueChange(value: unknown) {
    const next = value as ReportStatusFilter;
    if (next === status) return;
    const href = next === "pending" ? "/admin" : `/admin?status=${next}`;
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <Tabs value={status} onValueChange={handleValueChange}>
      <TabsList aria-label={strings.admin.reports.statusFilterLabel}>
        {REPORT_STATUS_FILTERS.map((filter) => (
          <TabsTrigger key={filter} value={filter} disabled={isPending}>
            {strings.admin.reports.statusFilter[filter]}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={status} className="pt-4">
        {children}
      </TabsContent>
    </Tabs>
  );
}
