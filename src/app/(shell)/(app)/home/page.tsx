import { Suspense } from "react";

import { HomeCalendarSummaryContainer } from "@/components/calendar/HomeCalendarSummaryContainer";
import { HomeCalendarSummarySkeleton } from "@/components/calendar/HomeCalendarSummarySkeleton";
import { MyCrewsSectionContainer } from "@/components/crews/MyCrewsSectionContainer";
import { MyCrewsSectionSkeleton } from "@/components/crews/MyCrewsSectionSkeleton";
import { HotMeetupsContainer } from "@/components/meetup/HotMeetupsContainer";
import { HotMeetupsSkeleton } from "@/components/meetup/HotMeetupsSkeleton";
import { RecentNotificationsContainer } from "@/components/notifications/RecentNotificationsContainer";
import { RecentNotificationsSkeleton } from "@/components/notifications/RecentNotificationsSkeleton";
import { CollapsibleSection } from "@/components/shell/CollapsibleSection";
import { PageHeader } from "@/components/shell/PageHeader";
import { getCollapsedSections } from "@/components/shell/section-collapse-cookie";
import { strings } from "@/lib/strings";

/**
 * 홈 대시보드 페이지 (SC-06, PRD §6 "홈 대시보드 페이지"). PRD가 정의한 네 가지 —
 * 소속 크루 카드 목록 · 다가오는 Meetup 요약 · 최근 알림 미리보기 · 소속 크루 0개 빈 상태 —
 * 가 이제 모두 있다(앞의 둘은 Task 021B와 D-109가, 나머지는 이 회차가 채웠다).
 *
 * **섹션 순서는 "내 것 → 남의 것"이다.** 다가오는 모임·내 크루·최근 알림은 이 사람의 크루에서
 * 지금 벌어지는 일이고, "지금 활발한 모임"은 공개 크루 소개다(D-109) — 그래서 마지막이다.
 * 다가오는 모임을 맨 위에 두는 이유는 SC-06의 역할이 "조망"이고, 그중 시간에 쫓기는 것은
 * 일정 하나뿐이기 때문이다.
 *
 * **네 섹션이 모두 접힌다.** 소속 크루 수에 상한이 없어(D-014, R-017) 크루가 많은 사용자의
 * 홈은 세로로 길어질 수밖에 없는데, 어느 섹션이 불필요한지는 사람마다 다르다 — 개수를 임의로
 * 자르는 대신 접기를 준다. 접힌 섹션도 헤더에 요약("크루 4개", "안 읽음 3")은 남는다.
 * 상태는 쿠키에 저장돼 다음 방문까지 유지된다(`section-collapse.ts`).
 *
 * **접기 셸의 소유자가 섹션마다 다르다.** 앞의 세 섹션은 각자의 컨테이너가 셸까지 렌더한다 —
 * 헤더 요약이 조회 결과에서 나오므로 그 값을 페이지로 끌어올리면 `Suspense` 경계 밖에서
 * 데이터를 기다리게 된다. "지금 활발한 모임"만 여기서 감싼다: 셀 값이 없어 요약이 없고,
 * 컨테이너를 랜딩(`/`)과 공유해 그쪽에는 셸이 필요 없기 때문이다.
 *
 * **`Suspense`는 섹션마다 따로 건다** — 한쪽이 느려도 다른 쪽이 먼저 보인다.
 */
export default async function HomeDashboardPage() {
  const collapsed = await getCollapsedSections();

  return (
    <main className="flex flex-1 flex-col gap-6">
      <PageHeader title={strings.home.dashboard.title} />
      <div className="flex flex-col gap-8 p-4">
        <Suspense fallback={<HomeCalendarSummarySkeleton />}>
          <HomeCalendarSummaryContainer />
        </Suspense>

        <Suspense fallback={<MyCrewsSectionSkeleton />}>
          <MyCrewsSectionContainer />
        </Suspense>

        <Suspense fallback={<RecentNotificationsSkeleton />}>
          <RecentNotificationsContainer />
        </Suspense>

        <CollapsibleSection
          sectionId="hot"
          title={strings.home.hotMeetups.title}
          defaultOpen={!collapsed.has("hot")}
        >
          <Suspense fallback={<HotMeetupsSkeleton hideHeading />}>
            <HotMeetupsContainer hideHeading />
          </Suspense>
        </CollapsibleSection>
      </div>
    </main>
  );
}
