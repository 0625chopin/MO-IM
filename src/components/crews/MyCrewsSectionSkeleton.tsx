import { Skeleton } from "@/components/ui/skeleton";

/**
 * 홈 "내 크루" 섹션의 최초 진입 로딩 상태 — `Suspense` fallback과 `/sample` 양쪽이 공유한다
 * (`HomeCalendarSummarySkeleton`과 같은 패턴).
 *
 * 헤더(제목 + 액션 링크)까지 흉내 내는 이유: 접기 셸은 컨테이너 안에 있어 로딩 중에는 아직
 * 없다 — 여기서 같은 높이의 헤더 자리를 잡아 두지 않으면 데이터가 도착하는 순간 아래 섹션이
 * 한 줄만큼 밀린다.
 */
export function MyCrewsSectionSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-20" />
      </div>
      {/* 실제 목록과 같은 컨테이너 쿼리 기준으로 접는다 — 로딩과 완료의 열 수가 다르면
          데이터가 도착하는 순간 카드가 재배치된다. */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
