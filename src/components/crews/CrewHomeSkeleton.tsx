import { Skeleton } from "@/components/ui/skeleton";

/** 크루 홈 로딩 상태(D-030 ③) — 컨테이너의 `Suspense` 폴백이자 `/sample` "로딩" 패널이 함께 쓴다. */
export function CrewHomeSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4" aria-busy="true">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}
