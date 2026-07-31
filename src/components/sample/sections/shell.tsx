import { MyCrewsSectionSkeleton } from "@/components/crews/MyCrewsSectionSkeleton";
import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { defineSection } from "@/components/sample/showcase-types";
import { AppShell } from "@/components/shell/AppShell";
import type { AuthSession } from "@/components/shell/auth-session";
import { CollapsibleSection } from "@/components/shell/CollapsibleSection";
import { HeaderNav } from "@/components/shell/HeaderNav";
import { MobileTabBar } from "@/components/shell/MobileTabBar";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { strings } from "@/lib/strings";

/* ── 앱 셸 ─────────────────────────────────────────────────────────────── */

const GUEST: AuthSession = { status: "guest" };
const LOADING: AuthSession = { status: "loading" };
const AUTHED: AuthSession = {
  status: "authenticated",
  // src/lib/data/mock/fixtures.ts의 시드 profile-1과 값을 맞췄다(get-auth-session.ts와 동일 관례).
  profileId: "profile-1",
  displayName: "테스터",
  hasCompletedOnboarding: true,
  unreadNotificationCount: 3,
  isSystemAdmin: false,
};
const AUTHED_EMPTY: AuthSession = { ...AUTHED, unreadNotificationCount: 0 };
// RLS 403류 도메인 오류(D-030 ③) — 네트워크 실패가 아니라 "접근 권한 없음"으로 세션 조회가
// 실패한 경우를 흉내낸다. 셸은 크래시하지 않고 게스트 안전값으로 내비게이션을 내려야 한다.
const SESSION_ERROR: AuthSession = { status: "error", reason: "forbidden" };
// 탈퇴 유예 중(Task 039, I-060) — `forbidden`과 다른 세 번째 오류 원인이다. HeaderNav는 이
// reason에 별도 문구를 쓴다(`getSessionErrorBannerMessage`, `/account/restore`에서만 숨김).
const SESSION_DEACTIVATED: AuthSession = {
  status: "error",
  reason: "deactivated",
  graceEndsAt: "2026-08-24T00:00:00.000Z",
};

export const shellSection = defineSection({
  id: "shell",
  label: "앱 셸",
  title: "앱 셸",
  description: (
    <>
      전역 레이아웃 4종입니다. 셸은 <strong className="font-medium text-foreground">뷰포트</strong>{" "}
      기준(<code className="font-mono text-xs">md:</code>)으로 재배치됩니다 — 헤더 링크↔하단
      탭바 전환은 프레임 폭 토글이 아니라 브라우저 창을 실제로 줄여서 확인하세요.
    </>
  ),
  items: [
    {
      name: "AppShell",
      note: "HeaderNav + 콘텐츠 슬롯 + MobileTabBar 조합. 미리보기 상자가 fixed 요소를 안에 가두므로(PreviewFrame) 실제 페이지 하단의 진짜 탭바와 겹치지 않습니다.",
      panels: {
        default: (
          <PreviewFrame height={360} resizable>
            <AppShell session={AUTHED} showSkipLink={false}>
              <div className="p-4 text-sm text-muted-foreground">페이지 콘텐츠 영역</div>
            </AppShell>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={360} resizable>
            <AppShell session={LOADING} showSkipLink={false}>
              <div className="p-4 text-sm text-muted-foreground">페이지 콘텐츠 영역</div>
            </AppShell>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={360} resizable>
            <AppShell session={AUTHED_EMPTY} showSkipLink={false}>
              <div className="p-4 text-sm text-muted-foreground">
                페이지 콘텐츠 영역 (알림 0건 — 배지 없음)
              </div>
            </AppShell>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={360} resizable>
            <AppShell session={SESSION_ERROR} showSkipLink={false}>
              <div className="p-4 text-sm text-muted-foreground">페이지 콘텐츠 영역</div>
            </AppShell>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "HeaderNav",
      note: "768px 이상에서 인라인 링크가 보입니다. 활성 항목은 배경 칠이 아니라 하단 잉크 바로 표시합니다 — 색 면적은 크루 식별에 배정된 자원이라 크롬이 쓰지 않습니다. 배지 숫자는 aria-hidden이고 개수는 링크 이름에 문장으로 붙습니다. \"오류\"는 reason 2종을 모두 보여줍니다 — 위는 forbidden(접근 권한 없음), 아래는 deactivated(탈퇴 유예 중, I-060 수정) — 같은 error 상태라도 배너 문구가 달라야 함을 대조합니다.",
      panels: {
        default: (
          <PreviewFrame height={64}>
            <HeaderNav session={AUTHED} />
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={64}>
            <HeaderNav session={LOADING} />
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={64}>
            <HeaderNav session={GUEST} />
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={196} resizable>
            <div className="flex flex-col gap-2">
              <HeaderNav session={SESSION_ERROR} />
              <HeaderNav session={SESSION_DEACTIVATED} />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "MobileTabBar",
      note: "360px 뷰포트(NFR-026)의 1차 내비게이션. 게스트 4항목 / 로그인 5항목, 터치 대상 44px(NFR-027). 활성 표시는 탭 상단 잉크 바이고, iOS 홈 인디케이터 영역만큼 아래 여백을 비웁니다.",
      panels: {
        default: (
          <PreviewFrame height={72} width={360}>
            <MobileTabBar session={AUTHED} />
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={72} width={360}>
            <MobileTabBar session={LOADING} />
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={72} width={360}>
            <MobileTabBar session={GUEST} />
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={72} width={360}>
            <MobileTabBar session={SESSION_ERROR} />
          </PreviewFrame>
        ),
      },
    },
    {
      name: "PageHeader",
      note: '"오류"는 네트워크 실패가 아니라 정원 마감 같은 도메인 오류(D-030 ③)를 예시로 씁니다. 오류는 색만이 아니라 좌측 세로선으로도 표시합니다 — 색각 이상 사용자에게 붉은 글씨는 그냥 글씨입니다(WCAG 1.4.1).',
      panels: {
        default: (
          <PreviewFrame height={120}>
            <PageHeader
              eyebrow="주말 등산 크루"
              title={strings.crew.explore.title}
              description="공개 크루를 검색하고 둘러볼 수 있어요"
              backHref="/home"
              actions={<Button size="sm">크루 만들기</Button>}
            />
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={110}>
            <PageHeader title="" status="loading" />
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={80}>
            <PageHeader title={strings.crew.explore.title} />
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={120}>
            <PageHeader
              title={strings.meetup.detail.title}
              status="error"
              errorMessage={strings.meetup.attendance.full}
            />
          </PreviewFrame>
        ),
      },
    },
    {
      name: "CollapsibleSection",
      note: "홈 대시보드(SC-06)의 섹션 4개가 공유하는 접기/펴기 셸입니다. 제목 줄 전체가 토글 버튼이고(Tab으로 이동해 Enter·Space로 열고 닫히는지, 포커스 링이 보이는지 확인해 주세요) 오른쪽 링크는 버튼 **밖**에 있습니다 — 중첩하면 두 인터랙션이 겹칩니다. 접었을 때만 헤더에 요약이 남습니다(\"크루 4개\") — 접기가 정보를 지우는 게 아니라 밀도만 낮추게 하는 장치입니다. 실제 홈에서는 토글 결과가 쿠키에 저장돼 다음 방문까지 유지되지만, 이 쇼케이스는 `persist={false}`라 여기서 접어 봐도 여러분의 홈은 그대로입니다. 4상태는 셸 자신이 아니라 셸이 감싸는 내용의 상태입니다 — 셸은 조회를 하지 않습니다.",
      panels: {
        default: (
          <PreviewFrame height={220}>
            <div className="p-4">
              <CollapsibleSection
                sectionId="crews"
                title={strings.home.dashboard.myCrews.title}
                summary="크루 4개"
                actionHref="/crews"
                actionLabel={strings.home.dashboard.myCrews.viewAll}
                defaultOpen
                persist={false}
              >
                <p className="text-sm text-muted-foreground">
                  섹션 내용이 여기 들어갑니다. 제목을 눌러 접어 보세요 — 접으면 헤더 오른쪽에
                  요약만 남습니다.
                </p>
              </CollapsibleSection>
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={220}>
            <div className="p-4">
              <MyCrewsSectionSkeleton />
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={160}>
            <div className="p-4">
              <CollapsibleSection
                sectionId="hot"
                title={strings.home.hotMeetups.title}
                defaultOpen={false}
                persist={false}
              >
                <p className="text-sm text-muted-foreground">접힌 채로 시작한 섹션입니다.</p>
              </CollapsibleSection>
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={220}>
            <div className="p-4">
              <CollapsibleSection
                sectionId="notifications"
                title={strings.home.dashboard.recentNotifications.title}
                actionHref="/notifications"
                actionLabel={strings.home.dashboard.recentNotifications.viewAll}
                defaultOpen
                persist={false}
              >
                <ErrorState
                  title={strings.home.dashboard.recentNotifications.errorTitle}
                  description={strings.home.dashboard.recentNotifications.errorDescription}
                />
              </CollapsibleSection>
            </div>
          </PreviewFrame>
        ),
      },
    },
  ],
});
