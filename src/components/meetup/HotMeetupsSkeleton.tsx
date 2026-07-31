import { Skeleton } from "@/components/ui/skeleton";

/**
 * "지금 활발한 모임"(D-109) 최초 진입 로딩 상태 — `Suspense` fallback과 `/sample` 4상태가
 * 공유한다(`HomeCalendarSummarySkeleton`과 같은 이유·같은 구조).
 *
 * 실제 `HotMeetupList`의 모양을 흉내 낸다: 제목+부제 두 줄, 그리고 행 3개(각 행은 본문 +
 * 잔물결 막대라 실제보다 살짝 높다). 5개를 다 그리지 않는 이유는 스켈레톤이 화면을 가득
 * 채우면 로딩이 더 길게 느껴지기 때문이다.
 */
export function HotMeetupsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
      <div className="flex flex-col gap-1.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[4.5rem] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
