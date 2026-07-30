
import { NotificationBellServerContainer } from "@/components/notifications/NotificationBellServerContainer";
import { strings } from "@/lib/strings";

import { HeaderNav } from "./HeaderNav";
import { MobileTabBar } from "./MobileTabBar";

import type { AuthSession } from "./auth-session";
import type { ReactNode } from "react";

/**
 * 전역 앱 셸(Task 011, D-030 ④). `src/app/layout.tsx`가 `getAuthSession()`으로 조회한 세션을
 * props로 내려주는 표현 컴포넌트다 — 이 컴포넌트 자신은 데이터를 조회하지 않는다(D-030 ①).
 * `layout.tsx`가 사실상 컨테이너 역할을 하므로 별도 `AppShellContainer.tsx`를 두지 않았다
 * (근거는 보고 "설계 결정" 참고).
 *
 * **NFR-026 판정(I-099·D-066, 23일차 정정)**: 이 컴포넌트의 이전 docstring은 "데스크톱은
 * `HeaderNav`의 인라인 링크, 모바일은 하단 고정 `MobileTabBar`가 1차 내비게이션을 맡는다"고
 * 적어 **전환이 실제로 일어난다**는 것을 요구사항으로 명시했었다. 실 브라우저 360/768/1280px
 * 3단계 실측 결과 셋 다 동일하게 `HeaderNav`의 인라인 내비는 항상 숨고 `MobileTabBar`가 항상
 * 1차 내비게이션을 맡는다 — **전환은 없다.** 팀장 판정(D-066)은 이것이 버그가 아니라고
 * 확정했다: 이 앱은 넓은 화면에서도 항상 모바일 폭 프레임 하나만 화면 중앙에 놓는 형태가
 * 제품 정체성이고(바로 아래 문단), 프레임이 `sm:`(40rem=640px)에조차 닿지 않으므로 그 안에
 * 사는 `HeaderNav`·`MobileTabBar`의 `md:` 분기도 같은 이유로 항상 같은 쪽(`MobileTabBar`)만
 * 켜진다 — NFR-026("360/768/1280px 검증")은 **"하단 탭바 1차 내비게이션이 그 세 폭 전부에서
 * 가로 스크롤 없이 정상 동작한다"로 재해석해 충족한다.** "데스크톱 전용 인라인 내비로
 * 전환된다"는 원래 문구는 틀렸으므로 지운다. `HeaderNav`의 `md:flex` 인라인 내비 자체는 코드에
 * 남아 있다(제거하지 않은 이유는 `HeaderNav.tsx` 해당 지점 주석). 근거·전수 조사·실측 전문은
 * `docs/decisions/appframe-responsive-audit-099.md`, 결정은 `docs/prioritization-and-risks.md`
 * D-066.
 *
 * 콘텐츠 래퍼에 `pb-16 md:pb-0`을 줘 모바일에서 하단 탭바에 콘텐츠가 가리지 않게 한다(`md:`는
 * 위 이유로 항상 꺼져 있으므로 실질적으로는 `pb-16`이 상시 적용된다 — 그 자체가 D-066이 원하는
 * 동작이다).
 *
 * **이 루트 `div`가 앱의 모바일 프레임이다.** 넓은 화면에서도 앱은 폭을 다 쓰지 않고
 * `max-w-app`(430px, `globals.css`의 `--container-app`)으로 묶인 채 `mx-auto`로 화면 중앙에
 * 놓인다 — 헤더·콘텐츠·하단 탭바가 **모두** 이 프레임 안에 들어간다. 좌우 `border-x`는 프레임이
 * 바깥 여백면(`bg-canvas`, `body`)과 맞닿는 경계를 hairline으로 긋는다(그림자를 쓰지 않는 건
 * 이 앱의 잉크 언어와 이질적이기 때문이다 — `globals.css` 머리 주석 ①).
 *
 * **`@container/appframe`이 그 프레임을 반응형의 기준면으로 만든다.** `globals.css`가
 * `sm:`/`md:`/`lg:` variant를 뷰포트가 아니라 이 컨테이너 기준으로 재정의해 뒀으므로, 여기
 * 이름(`appframe`)이 붙어 있지 않으면 **앱 전체의 반응형이 통째로 죽는다**(조상 컨테이너를
 * 못 찾아 어떤 브레이크포인트도 켜지지 않는다). 근거·한계는 `globals.css`의 해당 블록 주석.
 * 프레임보다 좁은 실제 모바일 기기에서는 `max-w-app`이 걸리지 않아 폭을 꽉 채운다.
 *
 * 콘텐츠 래퍼는 `<main>`이 아니라 `<div id="main-content">`다 — 19개 페이지가 이미 각자
 * `<main>`을 렌더링하고 있어(CREW 2일차 산출물), 여기서도 `<main>`을 쓰면 페이지마다 `<main>`
 * 랜드마크가 중첩되어 스크린 리더 내비게이션이 깨진다(HTML 표준상 `<main>` 중첩 금지). 스킵
 * 링크의 이동 대상 역할만 이 `div`가 맡고, 실제 `<main>` 랜드마크 소유권은 각 페이지에 둔다.
 *
 * `showSkipLink`(기본 `true`)를 `false`로 주면 스킵 링크와 `id="main-content"`를 렌더링하지
 * 않는다 — `/sample`이 `PreviewFrame` 안에 이 컴포넌트를 데모로 여러 번 그릴 때 쓴다. 실제
 * 페이지를 감싸는 루트 인스턴스(`src/app/layout.tsx`)는 항상 기본값(`true`)을 쓴다. 이 스위치가
 * 없으면 `id="main-content"`가 문서에 중복되고(HTML 표준 위반) 스킵 링크도 두 벌 생겨 키보드
 * 사용자가 Tab 첫 포커스에서 어디로 이동하는지 예측할 수 없다(3일차 교차검증, CREW 실측 지적).
 *
 * **높이 체인(I-118·I-122, 25일차 CORE 해소)**: 루트 `div`는 `min-h-full`이 아니라 `h-full`을
 * 쓴다. `min-height`는 하한만 정하고 상한이 없어 자손이 아무리 길어도 이 요소 어디서도 실제로
 * "clip"되는 박스가 생기지 않는다 — `MessageList.tsx`의 하단 sentinel
 * `IntersectionObserver({ root: scrollRef.current })`가 그 컨테이너로 아무것도 클리핑하지
 * 못해 마운트 즉시(그리고 레이아웃이 재계산될 때마다) "교차 중"으로 오보하는 근본 원인이었다
 * (FR-055 AC2 자체가 깨졌다, `docs/ISSUES.md` I-122). `h-full`이 실제 높이 제약이 되려면
 * **체인 전체가 `min-height`가 아니라 확정된 높이**여야 한다 — `html`(`(shell)/layout.tsx`,
 * 이미 `h-full`)→`body`(같은 파일, `min-h-full`→`h-full`로 함께 고쳤다)→여기(루트 `div`)까지
 * 셋 다 정의됐을 때만 백분율 높이가 "확정값"으로 전파된다(CSS 퍼센트 높이는 조상이 확정
 * 높이가 아니면 `auto`로 무너진다). 아래 `#main-content` 래퍼도 `flex-1`만으로는 부족해
 * `min-h-0`을 더했다 — flex 아이템의 기본 최소 높이는 `auto`(콘텐츠 크기)라, 이게 없으면
 * 콘텐츠가 배분된 flex-basis보다 길 때 박스가 그만큼 늘어나 버려 체인이 여기서 다시 끊긴다.
 * **다른 18개 라우트는 영향받지 않는다** — `overflow`는 어디서도 `hidden`/`auto`로 바꾸지
 * 않았고(기본값 `visible` 유지), 채팅 페이지 외 `<main>`들은 자기 쪽에 `min-h-0`을 선언하지
 * 않으므로 여전히 콘텐츠만큼 자라 조상 체인을 타고 문서 전체가 스크롤된다(오늘과 동일한
 * 동작) — 오직 `min-h-0 flex-1 overflow-y-auto`를 명시적으로 선언한 후손(채팅의 `<main>`→
 * `MessageRoomContainer`→`MessageList`)만 이제 실제로 확정된 높이를 물려받아 자체 스크롤
 * 컨테이너가 된다. 실측·회귀 확인은 `docs/decisions/appshell-height-chain-118-122.md`(25일차
 * CORE 산출물) 참고.
 */
export function AppShell({
  session,
  children,
  showSkipLink = true,
}: {
  session: AuthSession;
  children: ReactNode;
  showSkipLink?: boolean;
}) {
  return (
    <div
      // `min-[26.875rem]:`은 이 파일에서 유일하게 **뷰포트** 기준으로 남겨 둔 조건이다.
      // 값은 `--container-app`(26.875rem)과 같아야 하며, 화면이 프레임보다 넓어 여백면이
      // 실제로 보일 때만 경계선을 긋는다. `sm:`을 쓸 수 없다 — 재정의된 `sm:`은 프레임
      // 컨테이너 기준인데 컨테이너 쿼리는 **자기 자신을 조회하지 못하고**(조상만 본다),
      // 프레임 폭 430px은 그 임계값(40rem)에 닿지도 않아 영원히 꺼진 채로 남는다.
      className="@container/appframe mx-auto flex h-full w-full max-w-app flex-1 flex-col border-border bg-background min-[26.875rem]:border-x"
    >
      {showSkipLink && (
        <a
          href="#main-content"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
        >
          {strings.common.actions.skipToContent}
        </a>
      )}

      {/* NotificationBell(Task 023, D-030 ①) — 서버 컴포넌트(`AppShell`)가 조립해 클라이언트
          컴포넌트(`HeaderNav`)에 슬롯으로 내려준다. `HeaderNav`가 이 컨테이너를 직접 import할
          수 없다(RSC 경계 — 클라이언트 모듈은 서버 전용 컴포넌트를 import하지 못한다). 게스트면
          `NotificationBellServerContainer`가 `null`을 렌더하므로 `HeaderNav`는 그때 기존
          정적 배지 링크로 폴백한다. */}
      <HeaderNav session={session} notificationBell={<NotificationBellServerContainer />} />

      {/* **I-136(27일차) 재작성 — padding-bottom에서 스페이서 형제 요소로.** 이 `div`는
          `min-h-0 flex-1`이라 조상 높이 체인(I-118·I-122)을 따라 **확정 높이**를 받고
          늘어나지 않는다. 옛 구현은 이 확정 높이 박스 자체에 `pb-[calc(3.5rem+…)]`을 줬는데,
          `min-h-0`가 이 박스의 자동 최소 높이를 0으로 지워 버려 **자식(`{children}`, 즉 각
          페이지의 `<main>`)이 padding까지 포함한 이 박스 전체보다 커지는 순간(콘텐츠가
          뷰포트보다 길어 스크롤이 필요해지는 순간) padding이 실제로 그려지는 자리를 자식의
          넘친 콘텐츠가 뒤덮어 버렸다** — `padding`은 부모 자신의 박스 안에서만 의미가
          있고, 부모 박스가 늘어나지 않으면 자식이 그 padding "구간"을 그대로 밟고 지나간다.
          실측(격리 Chromium, `/meetups/[id]/reschedule` 스크롤 최하단): 예약값 56px >
          탭바 실제 높이 53.6875px — 예약값 자체는 부족하지 않았는데도, `elementFromPoint`가
          제출 버튼 좌표에서 탭바 아이콘 `<path>`를 반환했고 CDP 실좌표 클릭·터치 탭 둘 다
          `/calendar`로 오내비게이트됐다(탭바가 실제로 그 좌표를 차지하고 있었다는 뜻).
          같은 패턴(`<main flex-1 flex-col p-4>`, 다른 17개 라우트 대부분과 동일 골격)을 쓰는
          `/crews/[id]/settings`("크루 해산" 버튼)·`/notifications`(마지막 알림 링크)·
          `/meetups/[id]`("모임 취소" 버튼)에서도 콘텐츠가 뷰포트보다 길어지는 순간 같은
          겹침이 재현됐다 — 페이지 개별 결함이 아니라 이 셸의 여백 예약 전략 자체의 결함이었다.

          고침: padding 대신 **`{children}`의 형제로 실제 높이를 가진 스페이서 `div`**를 둔다.
          flex-column 레이아웃은 한 아이템이 자기 몫보다 커져도(overflow) 다음 형제를 그
          아이템의 "이상적인" 자리가 아니라 **실제로 그려진 자리 바로 다음**에 이어 그린다 —
          이게 flex의 기본 스택 순서 보장이다(padding은 이 보장을 받지 못하는 부모 자신의
          속성일 뿐이다). 그래서 콘텐츠가 넘치든 안 넘치든 탭바 높이만큼의 빈 공간이 항상
          실제로 확보된다. 값은 `globals.css`의 `--tab-bar-height`(`MobileTabBar`의 로딩
          스켈레톤과 공유)로 뒀다 — 임의 px가 아니라 토큰 하나를 두 곳이 함께 참조한다.
          `MobileTabBar`가 같은 `env(safe-area-inset-bottom)`을 쓰므로 두 값은 함께 움직인다. */}
      <div id={showSkipLink ? "main-content" : undefined} className="flex min-h-0 flex-1 flex-col">
        {children}
        <div
          aria-hidden="true"
          className="h-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom))] w-full shrink-0 md:hidden"
        />
      </div>

      <MobileTabBar session={session} />
    </div>
  );
}
