# 앱 프레임 반응형 전수 조사 — I-099 해소 근거 (23일차, CORE)

이 문서는 `docs/ISSUES.md` I-099("`HeaderNav`↔`MobileTabBar` 데스크톱·모바일 전환이 실제로는
전혀 일어나지 않는다")와 `docs/prioritization-and-risks.md` **D-066**의 근거·실측·전수 조사
전문이다. 팀장이 사전에 확정한 수정 방향(**430px 모바일 프레임을 유지한다. 프레임 폐기·
브레이크포인트별 확장 안은 기각됐다**)을 전제로, 이 문서는 (1) NFR-026 재판정, (2) `sm:`/
`md:`/`lg:`/`xl:`/`2xl:` 전수 조사와 처리, (3) 실 브라우저 실측, (4) DESIGN(I-098) 인계를
다룬다.

## 1. NFR-026 재판정

requirements.md 원문(5.2절 표):

> NFR-026 | **모바일 우선**. 최소 폭 **360px**에서 가로 스크롤 없이 모든 화면이 동작한다 |
> 360 / 768 / 1280px 검증

원문은 "360px에서 동작"과 "360/768/1280px 검증"만 요구한다 — **"뷰포트 폭에 따라 레이아웃이
바뀐다"는 요구가 원문에 없다.** "데스크톱은 인라인 내비, 모바일은 탭바"라는 서술은
`AppShell.tsx`의 docstring이 day-11~21 사이 어느 시점에 **원문에 없는 조건을 스스로 추가한
것**이었다(정확한 도입 커밋은 추적하지 않았다 — day-21 모바일 프레임 도입 시점에는 이미 있었다).

**판정: 430px 프레임은 NFR-026을 충족한다.**

- **360px**: 프레임이 뷰포트를 넘지 않으므로(`max-w-app`은 상한이지 하한이 아니다) 프레임이
  뷰포트 폭 그대로 꽉 찬다. 가로 스크롤 없음 — 기존에 검증된 상태 그대로다.
- **768px·1280px**: 프레임이 430px로 고정되고 나머지는 여백면(`bg-canvas`)이다. "모든 화면이
  동작한다"는 요구는 **프레임 안의 화면이 정상 동작하는가**로 읽는다 — 화면 콘텐츠가 잘리거나
  가로 스크롤이 생기는지가 기준이지, 화면이 뷰포트 폭을 다 채우는지는 기준이 아니다. 아래 §3
  실측에서 세 폭 모두 프레임 자체의 가로 스크롤은 없었다(`clientWidth`가 뷰포트를 초과하지
  않음).
- **검증 방법 재해석**: "360/768/1280px 검증"은 이제 "그 세 폭에서 **하단 탭바가 1차
  내비게이션으로 정상 동작하고, 프레임 폭이 항상 ≤430px로 안정적으로 고정되며, 가로 스크롤이
  없다**"로 읽는다. "그 폭에서 데스크톱 전용 레이아웃으로 전환된다"는 조건은 원문에 없었으므로
  검증 항목에서 제외한다.

이 판정과 근거는 `docs/prioritization-and-risks.md` **D-066**로 등재했다(6.3절, 결정 기록
단일 소스).

## 2. `sm:`/`md:`/`lg:`/`xl:`/`2xl:` 전수 조사

### 2.1 방법과 검산

`src/` 전역을 정규식(`grep -rnoE`)으로 3회 반복 교차 검증했다 — 처음 두 번은 경계 문자 처리가
허술해 오탐/누락이 있었다(`@sm:`류 컨테이너-네이티브 문법을 잘못 포함하거나, `data-[...]:sm:`
같은 스택 variant를 누락). 최종 정규식(경계 = 시작 또는 `[^a-zA-Z0-9_@-]`, `@` 명시 제외)으로
재검증해 **주석·문서 인용(예: `HeaderNav`가 자기 자신을 설명하며 `` `md:flex` ``를 인용한 문장,
`requirements.md:35` 같은 파일 경로)** 6건을 걸러내고 실코드 사용처만 남겼다.

**결과: 실제 사용처 55곳** (`globals.css` 머리 주석이 day-21부터 적어 온 "89곳"은 실측치가
아니라 어림값이었고 틀렸다 — 이번에 55로 정정했다).

이와 별개로 `@sm:`/`@lg:`(컨테이너 쿼리 **네이티브** 문법, `@container appframe`이 아니라 각
컴포넌트 자신이 감싼 **익명** `@container`를 조회)가 `CrewGrid`·`CrewGridSkeleton`·
`MonthCalendar`·`MessageBubble`·`PostLinkCard`·`CrewFilterPanel`·`foundation.tsx`(쇼케이스
예시) 7곳에 있다 — 이건 이번 재정의의 영향을 받지 않고 **정상 동작한다**(다른 이름의 다른
variant라 `globals.css`의 `@custom-variant`가 가로채지 않는다). 55곳 집계에는 포함하지 않았다.

### 2.2 판정 기준의 정정 — "(b) 카테고리는 존재하지 않는다"

배정 메시지는 세 갈래(a: 영원히 안 켜짐 / b: 프레임 밖이라 뷰포트 기준으로 여전히 동작 / c:
`/sample` 예외)를 가정했다. **실제로 조사해 보니 (b)는 이 코드베이스에 0건이다.**

이유: `sm:`/`md:`/`lg:`가 가리키는 컨테이너 쿼리(`@container appframe (min-width: …)`)가
활성화되려면 **DOM 트리 상에서 이름이 "appframe"인 조상 컨테이너가 존재**해야 한다. 이 앱에는
그런 조상이 `AppShell`의 루트 `div` 단 하나뿐이다. 그런데:

- `AppShell`의 **DOM 자손**(`HeaderNav`·`MobileTabBar` 등)은 조상은 있지만 그 조상의 폭이
  430px에 하드캡돼 있어 `sm:`(40rem)조차 못 켠다 — "**(a) 프레임-폭-한계형** 죽은 코드".
- `Dialog`/`Drawer`/`Toast`는 **Portal로 `<body>`에 붙거나**(`DialogPortal`·`DrawerPortal`,
  Base UI 기본 동작 — 프로젝트에 `container` prop 오버라이드 없음 확인) **`AppShell`의
  형제로 렌더**된다(`<Toaster />`는 `src/app/layout.tsx`에서 `<AppShell>` 다음에 오는 별도
  최상위 노드). 두 경우 다 DOM 트리에 "appframe" 조상 자체가 없다 — "**(a′) 컨테이너-부재형**
  죽은 코드". 결과(항상 꺼짐)는 (a)와 같지만 원인이 다르다: 프레임을 넓혀도 (a′)는 살아나지
  않는다(애초에 조회할 컨테이너가 없다). 되살리려면 `Dialog`가 이미 쓰는 `min()` 패턴처럼
  프레임 폭 값(`max-w-app`/`--container-app`)을 직접 참조해야 한다.

배정 메시지가 가정한 (b)("`fixed`라서 뷰포트 기준으로 동작")는 **CSS 스펙상 성립하지 않는다** —
컨테이너 쿼리는 DOM 트리(조상 관계)로 평가되고 `position`(레이아웃 배치)과 무관하다.
`MobileTabBar`가 `fixed`인데도 (b)가 아니라 (a)인 이유가 정확히 이거다: `fixed`라도 여전히
`appframe`의 DOM 자손이다.

### 2.3 전수 표

| # | 위치(조사 시점) | 클래스 | 판정 | 처리 |
| - | --- | --- | --- | --- |
| 1 | `app/page.tsx:42` | `sm:pt-24 sm:pb-20` | a | 제거 |
| 2 | `app/page.tsx:46` | `sm:text-5xl` | a | 제거 |
| 3 | `app/page.tsx:49` | `sm:text-lg` | a | 제거 |
| 4 | `app/page.tsx:52` | `sm:flex-row` | a | 제거 |
| 5 | `app/page.tsx:75` | `sm:p-10` | a | 제거 |
| 6 | `app/page.tsx:79` | `sm:flex-row sm:items-start sm:gap-2` | a | 제거 |
| 7 | `app/page.tsx:98` | `sm:mt-2 sm:rotate-0` | a | 제거 |
| 8 | `app/(app)/crews/new/page.tsx:14` | `sm:p-6` | a | 제거 |
| 9 | `app/(app)/crews/[crewId]/board/page.tsx:25` | `sm:p-6` | a | 제거 |
| 10 | `app/(app)/crews/[crewId]/board/new/page.tsx:21` | `sm:p-6` | a | 제거 |
| 11 | `app/(app)/crews/[crewId]/board/[postId]/page.tsx:36` | `sm:p-6` | a | 제거 |
| 12 | `app/(app)/crews/[crewId]/chat/page.tsx:21` | `sm:px-6` | a | 제거 |
| 13 | `app/(app)/meetups/[meetupId]/page.tsx:24` | `sm:p-6` | a | 제거 |
| 14 | `app/(app)/settings/page.tsx:45` | `sm:px-6` | a | 제거 |
| 15 | `app/crews/page.tsx:32` | `sm:p-6` | a | 제거 |
| 16 | `components/crews/ArchivedCrewBanner.tsx:16` | `sm:px-6` | a | 제거 |
| 17 | `components/crews/CrewSettingsContainer.tsx:62` | `sm:p-6` | a | 제거 |
| 18 | `components/crews/CrewIntroPreview.tsx:35` | `sm:p-6` | a | 제거 |
| 19 | `components/crews/CrewHomeSkeleton.tsx:6` | `sm:p-6` | a | 제거 |
| 20 | `components/crews/CrewHome.tsx:40` | `sm:p-6` | a | 제거 |
| 21 | `components/crews/CrewMembersSkeleton.tsx:7` | `sm:p-6` | a | 제거 |
| 22 | `components/crews/CrewSettingsSkeleton.tsx:7` | `sm:p-6` | a | 제거 |
| 23 | `components/crews/CrewMembersContainer.tsx:128` | `sm:p-6` | a | 제거 |
| 24 | `components/crews/CrewInfoForm.tsx:158` | `sm:w-auto` | a | 제거 |
| 25 | `components/crews/PrivateCrewNotice.tsx:28` | `sm:p-6` | a | 제거 |
| 26 | `components/profile/AccountSettingsContainer.tsx:42` | `sm:p-6` | a | 제거 |
| 27 | `components/profile/AccountSettingsContainer.tsx:59` | `sm:p-6` | a | 제거 |
| 28 | `components/ui/alert.tsx:58` | `md:text-pretty` | a | 제거 |
| 29 | `components/ui/input.tsx:12` | `md:text-sm` | a | 제거 |
| 30 | `components/ui/textarea.tsx:10` | `md:text-sm` | a | 제거 |
| 31 | `components/ui/dialog.tsx` (`DialogFooter`) | `sm:flex-row sm:justify-end` | a′ | 제거 + 원인 주석(Portal) |
| 32 | `components/ui/drawer.tsx` (`DrawerHeader`) | `md:gap-0.5 md:text-left` | a′ | 제거 + 원인 주석 |
| 33 | `components/ui/drawer.tsx` (`DrawerContent` Sizing) | `data-[swipe-axis=x]:sm:[--drawer-content-width:24rem]` | a′ | 제거 + 원인 주석(x축 드로어 미사용 상태도 병기) |
| 34 | `components/ui/toast.tsx` (`ToastViewport`) | `sm:inset-x-auto sm:right-4` | a′ | 제거 + 원인 주석(오히려 현재 동작이 제품 방향과 더 맞음) |
| 35 | `components/shell/HeaderNav.tsx:97` | `md:flex`(로딩 스켈레톤) | a | **유지** — 아래 사유 |
| 36 | `components/shell/HeaderNav.tsx:103` | `md:ml-0`(로딩) | a | 유지 |
| 37 | `components/shell/HeaderNav.tsx:143` | `md:flex`(`primaryNav`) | a | 유지 — 파일 내 주석 참고 |
| 38 | `components/shell/HeaderNav.tsx:159` | `md:flex`(`accountNav`) | a | 유지 |
| 39 | `components/shell/HeaderNav.tsx:184` | `md:ml-0`(테마 토글 위치) | a | 유지 |
| 40 | `components/shell/MobileTabBar.tsx:61` | `md:hidden`(로딩) | a | 유지 — 탭바 자체의 존재 조건, 삭제하면 로딩 스켈레톤도 항상 숨어야 하는데 그러면 안 됨(탭바는 항상 보여야 하므로 애초에 `md:hidden`이 무의미하지만, 실제 컴포넌트와 스켈레톤을 같은 조건으로 유지하는 게 실수 방지) |
| 41 | `components/shell/MobileTabBar.tsx:82` | `md:hidden`(본체) | a | 유지, 위와 동일 사유 |
| 42 | `components/shell/AppShell.tsx:98` | `md:pb-0` | a | 유지 — `pb-16` 상시 적용이 D-066이 원하는 동작 그 자체라 제거 이득이 없다 |
| 43 | `app/sample/page.tsx:23` | `sm:px-6` | c | 유지, DESIGN 인계(§4) |
| 44 | `app/sample/page.tsx:40` | `sm:-mx-6 sm:px-6` | c | 유지 |
| 45 | `components/sample/sections/certainty.tsx:67` | `sm:grid-cols-2` | c | 유지 |
| 46 | `components/sample/sections/foundation.tsx:35` | `sm:grid-cols-3 lg:grid-cols-5` | c | 유지 |
| 47 | `components/sample/sections/primitives.tsx:72` | `sm:grid-cols-2` | c | 유지 |

47행이지만 다중 토큰 셀(예: `sm:pt-24 sm:pb-20`)을 낱개로 펴면 정확히 **55개 토큰**이다(§2.1
집계와 일치).

**제거한 28곳(#1~30, ui 4곳 포함)은 전부 시각적 변화가 없다** — 이미 항상 꺼져 있던 클래스를
지운 것뿐이다. 지운 뒤 `npx tsc --noEmit`·`npm run lint` 통과 확인.

**유지한 15곳(#35~47)**: `HeaderNav`/`MobileTabBar`/`AppShell`은 이 이슈의 당사자라 지우는
대신 각 파일의 주석으로 "왜 남기는가"를 설명했다(요지: `MobileTabBar`가 이미 기능을 전부
커버해 제거해도 손실은 없지만, 프레임 정책이 다시 바뀔 때 코드 변경 없이 되살아나는 이점이
유지 비용보다 크다고 판단). `/sample` 5곳은 DESIGN의 I-098(프레임 우회) 완료 후 자동으로
살아날 예정이라 손대지 않았다.

## 3. 실 브라우저 실측

`npm run build && npm start`(포트 3010, 팀 공유 3000 서버와 분리) 후 Playwright MCP로 360→
768→1280px 리사이즈하며 `getComputedStyle`·`clientWidth` 측정. (진행 중 공유 Chrome 프로필
(`mcp-chrome-698a372`)에 다른 세션이 쓰다 만 좀비 프로세스가 잠겨 있어 `pkill` + `SingletonLock`
삭제 후 재시도 — 22일차와 같은 패턴.)

| 뷰포트 | 프레임 `clientWidth` | 헤더 `주 내비게이션` display | 헤더 `계정 메뉴` display | 탭바 display/position | 탭바 `clientWidth` |
| --- | --- | --- | --- | --- | --- |
| 360px | 360 | none | none | flex / fixed | 360 |
| 768px | 428 | none | none | flex / fixed | 430 |
| 1280px | 428 | none | none | flex / fixed | 430 |

세 폭 모두 프레임·헤더 내비·탭바 상태가 동일하다 — 정정한 docstring 서술("탭바가 유일한 1차
내비게이션이며 세 폭 모두 같다")과 실측이 일치한다.

**428px vs 430px(BOARD 교차검증 확인)**: 768·1280px에서 프레임 `clientWidth`가 `--container-app`
(430px)이 아니라 428px로 나온 것은 버그가 아니다 — `AppShell`의 루트 `div`가 뷰포트보다 넓을 때만
`min-[26.875rem]:border-x`로 좌우 1px씩 hairline 테두리를 그리는데(§ 위 `AppShell.tsx` 주석,
"여백면과 맞닿는 경계"), 기본 `box-sizing: border-box`에서 `clientWidth`는 **테두리를 제외한
내용 상자 폭**이다 — 430(전체 `max-w-app`) − 1(왼쪽 테두리) − 1(오른쪽 테두리) = 428. 360px에서는
뷰포트가 프레임보다 좁아 그 테두리 자체가 `min-[26.875rem]:` 임계값 미만이라 안 그려지므로
`clientWidth`가 정확히 360이다. 탭바(`MobileTabBar`)는 이 테두리 바깥의 별도 `fixed` 요소라
테두리 폭 손실이 없어 그대로 430이다.

1280px 스크린샷은 실측 당시 임시로 남겼다가(`day23-1280-frame.png`, 리포지토리 루트) 세션 내에서
삭제했다 — 커밋 대상이 아니었다.

가로 스크롤: 세 폭 다 `document.documentElement.scrollWidth`가 뷰포트를 넘지 않음(프레임이
`mx-auto`로 중앙 정렬되고 여백면은 배경색일 뿐 스크롤 콘텐츠가 아니다).

## 4. DESIGN 인계 — `/sample`이 프레임을 우회할 지점(I-098)

**직접 변경하지 않았다 — 조사만 남긴다.**

`src/app/layout.tsx`(45~106행 부근)의 `RootLayout`이 유일한 최상위 `layout.tsx`이며, 여기서
`<ThemeProvider><AppShell session={session}>{children}</AppShell>...</ThemeProvider>`로 **모든
라우트**(`/sample` 포함, `/sample`은 자기 `layout.tsx`가 없다 — `find src/app -iname layout.tsx`
확인)를 무조건 감싼다. Next.js App Router에서 **중첩 `layout.tsx`는 조상이 이미 렌더한 JSX를
제거할 방법이 없다** — `/sample`에 `src/app/sample/layout.tsx`를 새로 만들어도 그 안에서
`AppShell`을 다시 안 그릴 수는 있어도, 이미 `RootLayout`이 씌운 `AppShell`은 그대로 남는다.

**규약에 맞는 유일한 방법은 Next.js의 "복수 루트 레이아웃"(route groups) 패턴이다**
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`
"Use cases" — "Defining multiple root layouts", "Opting specific route segments into sharing a
layout, while keeping others out"). 구조:

1. `src/app/layout.tsx`(현재 `AppShell` 조립부)를 **route group** 안으로 옮긴다 — 예:
   `src/app/(shell)/layout.tsx`. 이 그룹이 새 **루트 레이아웃**(자기 `<html>`/`<body>`를 가짐)이
   된다.
2. `AppShell`을 필요로 하는 기존 최상위 라우트 전부(`page.tsx`(랜딩)·`login/`·`signup/`·
   `onboarding/`·`account/`·`auth/`·`crews/`·`reset-password/`·`(app)/` 그룹 전체)를
   `(shell)/` 아래로 옮긴다 — 물리적 폴더 이동이며, route group은 URL에 나타나지 않으므로
   `/crews`·`/login` 등 기존 경로는 그대로 유지된다.
3. `src/app/sample/`은 옮기지 않고 **그 자리에 남긴 채** 자신만의 루트 레이아웃
   `src/app/sample/layout.tsx`를 새로 만든다(`<html>`/`<body>`는 갖되 `AppShell`은 조립하지
   않는다 — 폰트·테마 스크립트 등 전역 설정은 두 루트 레이아웃에 중복해야 한다, 아래 주의
   참고).
4. 최상위에는 더 이상 공유 `layout.tsx`를 두지 않는다(두 루트 그룹이 각자 완전한 루트 레이아웃).

**주의(공식 문서 Caveats)**: `(shell)`↔`/sample` 사이를 클라이언트 라우팅으로 이동하면
**풀 페이지 리로드**가 강제된다("서로 다른 루트 레이아웃을 쓰는 라우트 간 이동은 항상 풀
리로드"). `/sample`은 내부 개발 도구 페이지라 이 트레이드오프는 낮은 비용으로 보이지만,
DESIGN이 실제 UX(예: 제품 화면에서 `/sample`로 링크가 있는지)를 확인해야 한다. 또한 폰트
로딩(`layout.tsx`의 `Noto_Sans_KR`/`Geist_Mono` 설정)·테마 FOUC 방지 스크립트·
`ThemeProvider`를 두 루트 레이아웃에 **중복 정의**해야 한다 — 공통 모듈로 뽑아 두 레이아웃이
import하는 형태를 권장한다(이미 `THEME_INIT_SCRIPT`가 별도 모듈이라 이 부분은 어렵지 않다).

**기각한 대안**: `proxy.ts` + `headers()`로 현재 경로를 읽어 `RootLayout`이 조건 분기하는
방법 — Next.js 공식 API가 아니라 내부 헤더(`x-invoke-path`류)에 기대는 비표준 패턴이고,
D-011이 이번 범위에서 `proxy.ts` 신규 도입 자체를 유보했다(로케일 목적으로 한정한 유보이긴
하나, 새 비표준 의존을 이 이슈 하나로 정당화하기엔 route-groups가 이미 공식 대안을 제공한다).

## 5. 남은 리스크·다음 회차 후보

- **`DayDetailPanel.tsx`(FR-063)의 실 뷰포트 반응형 — I-104로 등재 후 같은 회차(23일차)에
  실측·확정·수정까지 끝냈다.** 최초 보고에서는 정적 분석 추정으로만 남겼으나, 팀장이 "D-066을
  반증할 수 있는 유일한 항목을 추정으로 두지 마라"고 반려해 실측했다 — 전문은 §6.
- **`/sample`의 실제 프레임 이탈은 DESIGN(I-098) 완료 후에만 §2.3의 `c` 판정 5곳이 살아난다** —
  그 전까지는 `/sample`도 여전히 프레임 안에 있다(이번 조사 시점 기준으로는 사실 `c`가 아니라
  일시적으로 `a`다 — DESIGN 작업 완료를 전제로 미리 `c`로 분류해 둔 것).
  `docs/decisions/appframe-responsive-audit-099.md`(이 문서)를 I-098 착수 시 먼저 읽을 것을
  권장한다.
- **HeaderNav의 휴면 데스크톱 내비(`primaryNav`/`accountNav`)를 완전히 걷어낼지는 이번에
  결정하지 않았다.** 유지 쪽으로 판단했지만(§2.3), 코드 유지비가 실제로 0인지는 다음에 이
  파일을 만지는 사람이 다시 판단할 문제로 남긴다.
- **`/calendar`는 이미 커스텀 격자가 아니라 서드파티 라이브러리로 렌더된다 — 043B(NFR-005
  캘린더 렌더 성능) 착수 전 반드시 알아야 한다.** I-104 실측 중 발견: `MonthCalendarContainer`가
  `MonthCalendar.tsx`(자체 구현 월간 격자)를 더 이상 렌더하지 않고 `ScheduleXCalendarView.tsx`
  경유 **Schedule-X**(`@schedule-x/calendar`·`@schedule-x/react`, 2026-07-24 교체 — CORE 관할
  밖, 이번 회차에 손대지 않았다)를 렌더한다. `DayDetailPanel`(이번 I-104 실측 대상)은 두 구현
  모두에서 그대로 재사용되므로 이번 결과에는 영향이 없지만, **043B가 "캘린더 자체 렌더 시간"을
  측정할 때 측정 대상이 우리 코드가 아니라 서드파티 라이브러리다** — 최적화 여지·프로파일링
  방법이 완전히 달라진다(예: React Compiler는 Schedule-X의 명령형 코어를 대상으로 하지 않는다,
  `ScheduleXCalendarView.tsx`의 `"use no memo"` 지시어 주석 참고). `MonthCalendar.tsx` 자체는
  코드베이스에 남아 있지만(`/sample`의 정적 데모용으로 추정, 확인은 안 했다) 실제 프로덕션
  라우트에서는 죽은 경로다.

## 6. I-104 실측·확정·수정 (23일차, 같은 회차 후속)

### 6.1 왜 다시 열었는가

최초 보고에서 I-104를 "정적 분석 추정, 실측 안 함"으로 남겼더니 팀장이 반려했다 — 이 항목은
**D-066(430px 프레임이 NFR-026을 충족한다는 이번 판정) 자체를 반증할 수 있는 유일한 후보**라,
"추정"으로 덮으면 21일차(로그아웃 버튼 미노출)·22일차(팀장 검증도 얕았다는 워크로그 자기평가)와
같은 패턴(증상만 봉합하고 근본 원인은 브라우저를 열어 보지 않아 방치)이 세 번째로 반복된다는
지적이었다. 타당한 지적이라 즉시 실측했다.

### 6.2 실측 환경 — 공유 자원 경합 2단계를 우회

1. **공유 MCP Playwright Chrome 프로필**(`mcp-chrome-698a372`)이 다른 세션(DESIGN)에 실제로
   점유돼 있었다(렌더러 프로세스 CPU 76.9%·누적 11분 — 좀비가 아니라 실사용 확인). 팀장 조율로
   우선권을 받았지만, Task 033·037 전례(`.tmp-e2e/`, 실행 후 삭제)를 따라 **자체 Chromium을
   MCP 밖에서 직접 구동**하는 경로로 바꿔 애초에 경합을 없앴다(`playwright` npm 패키지를
   `--no-save`로 임시 설치 — `package.json`/`package-lock.json` 변경 없음, 캐시된
   `chromium_headless_shell-1232`를 `executablePath`로 직접 지정해 재다운로드도 없앴다).
2. **공유 `.next` 빌드 디렉터리**도 다른 팀원이 같은 저장소에서 동시에 `npm run build`를 돌려
   두 차례 충돌했다(정적 청크 전체가 500, 심지어 내 `next build` 자체가 다른 빌드와 동시에
   `.next`를 써서 `ENOENT`로 실패하기도 했다). 저장소 전체를 `/mnt/e/.../core-i104-repo`로
   복제하고(`node_modules`는 심볼릭 링크로 재사용, `rsync --exclude .git --exclude .next
   --exclude node_modules`) 포트 3013에서 완전히 격리해 빌드·서빙했다. **Turbopack은 프로젝트
   루트 밖(원본 저장소)을 가리키는 `node_modules` 심볼릭 링크를 거부**해(`Symlink […] is invalid,
   it points out of the filesystem root`) `next build --webpack`으로 우회했다 — 이번 실측
   목적에는 번들러 차이가 결과에 영향을 주지 않는다(런타임 CSS·DOM 측정이지 번들 산출물 검사가
   아니다).

두 우회 모두 **일회성 로컬 산출물**이라 실행 후 전부 삭제했다(`.tmp-e2e/`, `core-i104-repo/`) —
재현 절차는 아래 §6.4.

**이번 회차 환경 제약(다음 회차 참고)**: 이 저장소는 팀원 전원이 **같은 체크아웃**을 공유한다
(격리된 워크트리가 아니다). ① 여러 세션이 같은 공유 `.next`에 동시에 `npm run build`를 돌리면
서로의 서버를 반드시 깨뜨린다 — 팀장이 이 회차에 "빌드 슬롯"(순서를 정해 한 번에 하나씩만
빌드)으로 직렬화했다. ② `pkill -9 -f "next-server"`처럼 **이름 패턴으로 죽이면 자기 프로세스인지
구분하지 않고 다른 세션의 서버까지 함께 죽는다**(이번 회차에 실제로 발생 — BOARD가 자진
보고) — 반드시 `lsof -ti:PORT | xargs kill`처럼 **자기가 쓰는 포트로만** 좁혀야 한다. 이 문서의
실측(§6.2 1·2번)은 두 제약 다 이 문제를 겪은 뒤 회피한 결과다 — 자체 Chromium 직접 구동과
저장소 격리 복제가 애초에 공유 자원을 안 건드리는 근본 회피책이었다.

### 6.3 실측 수치

계정 `chopin0625@gmail.com`으로 실 로그인 → `/calendar?month=2026-08` → 크루 "심야 독서
모임"의 확정 Meetup 이벤트 칩("심야 독서 모임 1회차 모임", 2026-08-16, 기존 시드 재사용 — 신규
데이터 생성 없음) 클릭 → `DayDetailPanel`(`Drawer`) 오픈. `getBoundingClientRect()`·
`getComputedStyle().position`·`window.matchMedia("(min-width: 768px)")`를 `page.evaluate()`로
직접 측정했다.

**수정 전** (`data-[swipe-direction=right]:right-0`, 폭 `75%` — 둘 다 뷰포트 기준):

| 뷰포트 | `matchMedia` desktop | `swipeDirection` | 패널 rect(x~right) | 프레임 rect(x~right) | 프레임과의 어긋남 |
| --- | --- | --- | --- | --- | --- |
| 360px | false | down(바텀시트) | 0.5~360.5 | 0~360 | 없음(서브픽셀) |
| 768px | **true** | **right**(사이드 패널) | 192~768 (폭 576) | 169~599 (폭 430) | **오른쪽으로 169px 초과** |
| 1280px | **true** | **right** | 320~1280 (폭 960) | 425~855 (폭 430) | **왼쪽 경계보다 105px 더 왼쪽부터 시작, 오른쪽으로 425px 초과** — 프레임을 완전히 감싸고 뷰포트 우측 끝까지 덮는다 |

`Dialog`·`Toast`(같은 Portal-부재 축, I-099 §2.2의 (a′) 대조군)는 같은 조건에서 768px·
1280px 둘 다 프레임 안에 정확히 들어왔다(`outsideFrame: false`) — **(a′) 항목 중 `Drawer`
x축만 프레임 정합 처리가 빠져 있었다**는 뜻이다(y축 바텀시트는 애초에 프레임 대응 코드가
있었다, §2.3 #33 주석 참고).

**결론**: D-066("이 앱은 넓은 화면에서도 항상 모바일 폭 프레임 하나만 보여준다")이 실제로는
`DayDetailPanel`의 데스크톱 경로에서 **깨지고 있었다** — 추정이 아니라 확인된 결함이다.

### 6.4 수정

`src/components/ui/drawer.tsx`의 `DrawerContent` x축(좌우) 처리를 y축(바텀시트)이 이미 쓰던
프레임 기준 패턴으로 맞췄다:

- **폭**: `data-[swipe-axis=x]:[--drawer-content-width:75%]`(뷰포트 75%, 무제한) →
  `min(calc(100%-2rem), calc(var(--container-app)-3rem))` — `Dialog`의 `min()` 관용구를
  그대로 따랐다. 3rem은 프레임 안쪽에 남는 "한 뼘 보이기" 여백이다.
- **위치**: `data-[swipe-direction=right]:right-0` / `left-0`(뷰포트 가장자리 고정) →
  `right-[max(0px,calc((100%-var(--container-app))/2))]` / 좌우 대칭 — y축이 쓰는
  `inset-x-[max(0px,calc((100%-var(--container-app))/2))]`과 같은 계산식이다.

**수정 후 재실측**(같은 스크립트, 같은 계정·데이터):

| 뷰포트 | 패널 rect(x~right, 폭) | 프레임 rect(x~right) | 어긋남 |
| --- | --- | --- | --- |
| 360px | 0.4~360.4 (360) | 0~360 | 없음(서브픽셀, 이전과 동일) |
| 768px | 217~599 (382) | 169~599 | **오른쪽 정확히 일치(Δ0px)**, 왼쪽은 프레임 안쪽 48px 지점(설계한 여백) |
| 1280px | 473~855 (382) | 425~855 | **오른쪽 정확히 일치(Δ0px)**, 왼쪽은 프레임 안쪽 48px 지점 |

세 폭 전부 `outsideFrame: false`. `Dialog`·`Toast` 대조군은 수정 전후 값이 그대로다(다른 파일을
건드리지 않았으니 당연하지만, 회귀가 없음을 재확인했다). `npx tsc --noEmit`·`npm run lint`
재통과 확인.

### 6.5 재현 절차 (스크립트는 삭제했다 — 필요하면 아래로 재작성)

```bash
# 1) 저장소를 프로젝트 드라이브 안(Turbopack이 밖을 가리키는 심볼릭 링크를 거부하므로 /tmp 금지)
#    다른 위치로 복제하고 node_modules만 심볼릭 링크로 재사용
rsync -a --exclude='.git' --exclude='.next' --exclude='node_modules' --exclude='.tmp-e2e' \
  ./ ../core-i104-repo/
ln -s "$(pwd)/node_modules" ../core-i104-repo/node_modules
cd ../core-i104-repo && npx next build --webpack && npx next start -p 3013 &

# 2) playwright를 --no-save로 임시 설치(원본 저장소에서, package.json 안 건드림) 후
#    캐시된 chromium_headless_shell을 executablePath로 직접 지정해 Node 스크립트로 구동.
#    스크립트 개요: /login에서 chopin0625@gmail.com·qwer1234로 로그인 →
#    /calendar?month=2026-08 → "심야 독서 모임 1회차 모임" 텍스트 클릭 →
#    [data-slot="drawer-popup"]의 getBoundingClientRect()를 360/768/1280px에서 각각 측정,
#    [class*="max-w-app"]의 rect와 비교.
```

`.tmp-e2e/core-i104/`(스크립트)·`core-i104-repo/`(격리 복제본)는 실측 직후 삭제했다 — 저장소에
남기지 않는다(Task 033·037 전례).

## 7. D-070 최종 수정 — FR-063 원문 정정 후 `isDesktop` 분기 자체를 제거

§6의 1차 수정("프레임 안에 들어오는 사이드 패널")을 적용한 직후, BOARD가 이 D-066 교차검증
중 `requirements.md:868` FR-063 정상 흐름 ②가 "패널(**데스크톱**: 사이드 / 모바일:
바텀시트)"를 원문으로 요구하고 있음을 지적했다 — 이 문구는 문서 전체에서 "데스크톱"이
언급되는 유일한 자리였다. 1차 수정은 "원문(데스크톱=사이드 패널)을 지키면서 프레임에
맞춘" 결과였는데, **원문 자체가 D-066과 상충한다는 것이 드러나면서** 1차 수정으로는 근본
해결이 안 됐다.

사용자가 그 원문 괄호를 **비구속**으로 확정했다(**D-070**, 근거는
`docs/prioritization-and-risks.md` D-070과 `requirements.md` FR-063의 정정 이력 문단이
단일 소스 — 여기서 복제하지 않는다). 그 결정에 따라 `DayDetailPanel.tsx`에서
`useMediaQuery("(min-width: 768px)")` 기반 `isDesktop` 분기를 **완전히 제거**하고 `Drawer`를
항상 `swipeDirection="down"`으로 고정했다 — §2.2가 확인한 "이 저장소에 남아 있던 유일한 실
뷰포트 기준 반응형 분기"가 이제 없다. `ui/drawer.tsx`의 x축(좌우) 프레임 정합 CSS(§6의 1차
수정)는 되돌리지 않고 공용 프리미티브에 그대로 남겼다 — 현재 프로덕션 소비자가 0곳이지만,
되돌려서 다시 깨뜨리는 것보다 처음부터 올바른 기본값으로 남겨 두는 유지비가 낮다고 판단했다.

**최종 재실측**(같은 스크립트 유형, 새 임시 위치 — 이번엔 공유 저장소의 빌드 슬롯을
팀장에게서 명시적으로 배정받아 메인 체크아웃에서 직접 빌드·서빙했다, 포트 3012):

| 뷰포트 | `swipeDirection` | `swipeAxis` | 패널 rect(x, 폭, right) | 프레임 rect(x, 폭, right) | 어긋남 |
| --- | --- | --- | --- | --- | --- |
| 360px | down | y | 0, 360, 360 | 0, 360, 360 | 없음(완전 일치) |
| 768px | down | y | 169, 430, 599 | 169, 430, 599 | 없음(완전 일치) |
| 1280px | down | y | 425, 430, 855 | 425, 430, 855 | 없음(완전 일치) |

768·1280px에서 `matchMedia("(min-width: 768px)")`는 여전히 `true`로 평가되지만(브라우저
자체의 media query 평가는 당연히 그대로다) `Drawer`의 어떤 분기도 더 이상 그 값을 참조하지
않음을 코드·실측 양쪽으로 확인했다. `Dialog`·`Toast` 대조군도 §6과 동일한 결과(768·1280px
프레임 안, 360px는 1px 미만 서브픽셀 차이)로 회귀가 없다. `npx tsc --noEmit`·`npm run lint`
재통과.

**정리**: I-104는 "1차: 원문을 지키며 프레임에 맞춘 수정" → "2차(D-070): 원문 자체의 구속력을
부정하고 분기를 제거"의 2단계를 거쳐 최종 종결됐다. 두 단계 다 실측으로 뒷받침됐고, 어느
단계에도 "추정"으로 남긴 결론은 없다.
