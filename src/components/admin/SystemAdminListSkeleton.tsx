import { Skeleton } from "@/components/ui/skeleton";

/** I-075 관리자 지정/회수 목록 로딩 상태(D-030 ③) — `AdminReportQueueSkeleton`과 같은 패턴. */
export function SystemAdminListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
