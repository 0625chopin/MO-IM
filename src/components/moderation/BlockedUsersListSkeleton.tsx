import { Skeleton } from "@/components/ui/skeleton";

/** 차단 관리 목록 로딩 상태(D-030 ③, Task 042A) — `CrewMembersSkeleton`과 같은 패턴. */
export function BlockedUsersListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <Skeleton className="h-5 w-32" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
