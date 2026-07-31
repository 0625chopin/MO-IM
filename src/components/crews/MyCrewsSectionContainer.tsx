import type { CrewCardViewModel } from "@/components/crews/crew-explore-view-models";
import { CREW_EXPLORE_HREF } from "@/components/crews/crew-links";
import { fetchMyCrewCards } from "@/components/crews/fetch-crew-cards";
import { MyCrewsSection } from "@/components/crews/MyCrewsSection";
import { isAuthenticated } from "@/components/shell/auth-session";
import { CollapsibleSection } from "@/components/shell/CollapsibleSection";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getCollapsedSections } from "@/components/shell/section-collapse-cookie";
import { strings, t } from "@/lib/strings";

/**
 * 홈 대시보드 "내 크루" 섹션 컨테이너(SC-06, D-030 ①). 조회 + 접기 셸 조립을 맡는다.
 *
 * **접기 셸을 페이지가 아니라 이 컨테이너가 소유한다.** 접었을 때 헤더에 남는 요약("크루 4개")은
 * 조회 결과를 알아야 만들 수 있는데, 그 값을 페이지로 끌어올리면 `Suspense` 경계 밖에서
 * 데이터를 기다리게 돼 이 섹션 하나 때문에 홈 전체가 늦어진다.
 *
 * **인증 확인은 `HomeCalendarSummaryContainer`와 같은 fail-closed 조기 반환이다**(I-095) —
 * `(app)/home`은 이미 레이아웃이 가드하므로 여기서 리다이렉트하지 않는다.
 *
 * **조회 실패를 삼켜 섹션만 오류로 바꾼다**(`HotMeetupsContainer`와 같은 판단) — 크루 목록
 * 하나가 실패했다고 홈 전체를 오류 화면으로 떨어뜨리면 다가오는 모임·알림까지 함께 사라진다.
 */
export async function MyCrewsSectionContainer() {
  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    // (app) 레이아웃이 이미 미인증 분기를 선택했을 병렬 렌더링의 폐기 브랜치다(I-095).
    return null;
  }

  const collapsed = await getCollapsedSections();

  let items: CrewCardViewModel[] = [];
  let error = false;
  try {
    items = await fetchMyCrewCards(session.profileId);
  } catch (cause) {
    // 원본 오류는 서버 로그로만 남긴다(NFR-014 — 사용자에게 원문을 노출하지 않는다).
    console.error("[home] failed to load my crews", cause);
    error = true;
  }

  const s = strings.home.dashboard.myCrews;
  const hasCrews = !error && items.length > 0;

  return (
    <CollapsibleSection
      sectionId="crews"
      title={s.title}
      // 오류·빈 상태에서는 셀 값이 없다. 빈 상태에서 "크루 더 찾기" 링크도 빼는 이유는
      // 빈 상태 자체가 같은 곳으로 가는 버튼("크루 둘러보기")을 이미 크게 내밀기 때문이다.
      summary={hasCrews ? t((x) => x.home.dashboard.myCrews.summary, { count: items.length }) : undefined}
      actionHref={hasCrews ? CREW_EXPLORE_HREF : undefined}
      actionLabel={hasCrews ? s.viewAll : undefined}
      defaultOpen={!collapsed.has("crews")}
    >
      <MyCrewsSection items={items} error={error} />
    </CollapsibleSection>
  );
}
