import { Skeleton } from "@/components/ui/skeleton";

/** 멤버 관리 페이지 로딩 상태(D-030 ③, Task 017A) — 컨테이너의 `Suspense` 폴백이자 `/sample`
 *  "로딩" 패널이 함께 쓴다(`CrewHomeSkeleton`과 같은 패턴). */
export function CrewMembersSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4" aria-busy="true">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
