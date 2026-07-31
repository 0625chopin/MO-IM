import { Skeleton } from "@/components/ui/skeleton";

/**
 * 홈 "최근 알림" 섹션의 최초 진입 로딩 상태 — `Suspense` fallback과 `/sample` 양쪽이
 * 공유한다(`NotificationListSkeleton`은 알림 센터 전체 목록용이라 건수·헤더가 다르다).
 * 헤더 자리를 함께 잡아 두는 이유는 `MyCrewsSectionSkeleton`과 같다.
 */
export function RecentNotificationsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex flex-col gap-1">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
