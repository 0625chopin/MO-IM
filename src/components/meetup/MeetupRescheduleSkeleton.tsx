import { Skeleton } from "@/components/ui/skeleton";

/**
 * "일정 변경 제안" 화면 최초 진입 로딩 상태(I-079/FR-065 AC2, 26일차 BOARD) —
 * `MeetupDetailSkeleton`과 같은 이유로 `Suspense` fallback과 `/sample` 양쪽이 공유하는 별도
 * 컴포넌트로 뽑았다. `MeetupRescheduleForm`의 골격(제목 → 현재 일정 박스 → 경고 문구 →
 * 입력 필드들 → 제출 버튼)을 흉내 낸다.
 */
export function MeetupRescheduleSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-4 w-2/3" />
      <div className="flex flex-col gap-4">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>
      <Skeleton className="h-9 w-full rounded-md" />
    </div>
  );
}
