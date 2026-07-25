import { Skeleton } from "@/components/ui/skeleton";

/** 댓글 섹션 로딩 상태(FR-033). `loading.tsx`와 `/sample` 양쪽이 공유한다. */
export function CommentListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-16 w-full" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
