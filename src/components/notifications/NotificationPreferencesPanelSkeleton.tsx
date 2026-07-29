import { Skeleton } from "@/components/ui/skeleton";

/** 알림 환경설정 로딩 상태(D-030 ③, Task 044) — `BlockedUsersListSkeleton`(같은 `/settings`
 *  페이지의 형제 컨테이너)과 같은 패턴. 두 섹션(유형별 토글 목록·크루별 음소거 목록) 각각의
 *  실제 행 개수(13종·소속 크루 수)를 알 수 없는 시점이라 대표 개수만 흉내 낸다. */
export function NotificationPreferencesPanelSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-32" />
        <div className="flex flex-col gap-0 rounded-lg border border-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-[18.4px] w-8 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-col gap-0 rounded-lg border border-border">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-[18.4px] w-8 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
