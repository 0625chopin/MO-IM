import { Skeleton } from "@/components/ui/skeleton";

/** FR-082 관리자 콘솔 대기열 로딩 상태(D-030 ③, Task 042B) — `BlockedUsersListSkeleton`과 같은 패턴. */
export function AdminReportQueueSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
