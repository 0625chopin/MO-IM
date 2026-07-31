import { UsersRound } from "lucide-react";
import Link from "next/link";

import type { CrewCardViewModel } from "@/components/crews/crew-explore-view-models";
import { CREW_CREATE_HREF, CREW_EXPLORE_HREF } from "@/components/crews/crew-links";
import { CrewCard } from "@/components/crews/CrewCard";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ErrorState } from "@/components/ui/error-state";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";

export interface MyCrewsSectionProps {
  items: CrewCardViewModel[];
  /** 섹션 조회 실패(D-030 ③) — `/sample` 4상태의 "오류" 자리다. */
  error?: boolean;
  className?: string;
}

/**
 * 홈 대시보드 "내 크루" 목록(SC-06 "소속 크루 카드 목록") — 표현 컴포넌트(D-030 ①).
 * `MyCrewsSectionContainer`가 조회한 카드만 받아 그린다.
 *
 * **`/crews`의 `CrewCard`를 그대로 쓴다.** 홈 전용 카드를 새로 그리면 "가입됨" 배지·읽지 않은
 * 메시지 배지(FR-055 AC1)·크루색 점이 두 벌이 되고, 그중 하나만 고치는 일이 반드시 생긴다.
 * 대신 그리드 열 수만 다르다 — 홈 섹션은 본문 폭이 좁아 최대 2열에서 멈춘다.
 *
 * **개수를 자르지 않는다.** 크루 수에는 상한이 없지만(D-014, R-017) 소속 크루를 "요약"한
 * 부분 목록은 어느 것을 잘랐는지 사용자가 알 수 없고, 잘린 나머지를 볼 화면이 이 저장소에
 * 아직 없다(D-062가 지적한 그 공백이다). 목록이 길어지는 문제는 섹션 접기가 대신 해결한다.
 *
 * **빈 상태가 이 섹션의 본래 목적 절반이다**(PRD SC-06 "소속 크루 0개 시 크루 탐색 유도").
 * 온보딩 직후 첫 로그인 사용자에게 홈은 지금까지 남의 모임 목록만 보여 줬다 — 두 행동
 * (둘러보기·개설)을 여기서 준다.
 */
export function MyCrewsSection({ items, error, className }: MyCrewsSectionProps) {
  const s = strings.home.dashboard.myCrews;

  if (error) {
    return <ErrorState title={s.errorTitle} description={s.errorDescription} className={className} />;
  }

  if (items.length === 0) {
    return (
      <Empty className={cn("border border-dashed border-border", className)}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersRound aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{s.empty.title}</EmptyTitle>
          <EmptyDescription>{s.empty.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={CREW_EXPLORE_HREF} className={buttonVariants({ size: "sm" })}>
              {s.empty.exploreCta}
            </Link>
            <Link href={CREW_CREATE_HREF} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {s.empty.createCta}
            </Link>
          </div>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    // 컨테이너 쿼리 — `/sample` 프리뷰 프레임의 폭 토글이 실제 검증 도구가 되려면 뷰포트
    // 기준(`sm:`)이 아니라 부모 폭 기준이어야 한다(CONVENTIONS "/sample 4상태 규칙").
    <div className={cn("@container", className)}>
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
        {items.map((crew) => (
          <CrewCard key={crew.id} crew={crew} />
        ))}
      </div>
    </div>
  );
}
