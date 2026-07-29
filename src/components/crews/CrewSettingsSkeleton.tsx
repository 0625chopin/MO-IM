import { Skeleton } from "@/components/ui/skeleton";

/** 크루 설정 페이지 로딩 상태(D-030 ③, Task 017B) — 컨테이너의 `Suspense` 폴백이자 `/sample`
 *  "로딩" 패널이 함께 쓴다(`CrewMembersSkeleton`과 같은 패턴). */
export function CrewSettingsSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-4" aria-busy="true">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
