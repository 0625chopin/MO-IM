# `/sample`을 `AppShell` 430px 프레임 밖으로 — I-098 해소 (23일차, DESIGN)

이 문서는 `docs/ISSUES.md` I-098과 `docs/prioritization-and-risks.md` **D-069**의 근거·실측
전문이다. CORE의 조사(`docs/decisions/appframe-responsive-audit-099.md` §4, 이하 "CORE 인계
문서")를 전제로 하되, 실행 과정에서 CORE 인계 문서가 다루지 않은 두 가지 공백(§3·§4)을 추가로
발견해 함께 처리했다.

## 1. 문제와 방향(팀장 사전 확정)

`src/app/layout.tsx`가 유일한 최상위 레이아웃으로 모든 라우트(`/sample` 포함)를 `AppShell`로
감쌌다. `AppShell`의 루트 `div`가 `@container/appframe`(430px 하드캡, `max-w-app`)을 선언하고,
`globals.css`가 Tailwind `sm:`/`md:`/`lg:`/`xl:`/`2xl:`을 전역으로 이 이름 있는 컨테이너 기준
으로 재정의해 두었다(D-065/D-066 계열). 그 결과 `/sample`의 `PreviewFrame` 폭 토글
(360/768/1280/전체)이 무엇을 선택해도 실제 렌더 폭이 ~394~430px를 넘지 못했다(I-098 원 실측).

**팀장이 사전 확정한 방향**: 430px 모바일 프레임은 유지한다. `/sample`만 그 프레임 밖으로
뺀다. 프레임을 폐기하거나 넓히는 안은 기각됐다(D-066과 동일 선상의 판단).

## 2. 구조 — 복수 루트 레이아웃(route groups)

Next.js 16 공식 문서(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`
"Defining multiple root layouts", `01-app/03-api-reference/03-file-conventions/layout.md` "root
layout")를 직접 재확인했다 — 중첩 `layout.tsx`는 조상이 이미 그린 JSX를 제거할 방법이 없으므로,
그룹 없이 갇힌 `AppShell`을 자식에서 벗겨낼 수 없다. 복수 루트 레이아웃이 유일한 규약 준수
경로라는 CORE의 결론을 그대로 확인했다.

**실행**(전부 `git mv`로 이력 보존):

1. `src/app/layout.tsx` → `src/app/(shell)/layout.tsx`(함수명도 `RootLayout` → `ShellRootLayout`로
   변경 — 이제 두 번째 루트 레이아웃이 따로 있으므로 "그 하나"라는 이름이 더 이상 맞지 않는다).
2. `AppShell`이 필요한 최상위 라우트 전부를 `(shell)/` 아래로 이동: `page.tsx`(랜딩)·`account/`·
   `auth/`·`crews/`(공개 크루 탐색/홈, `(app)/crews`와는 별개)·`login/`·`onboarding/`·
   `reset-password/`·`signup/`·`(app)/` 그룹 전체. route group은 URL에 나타나지 않으므로 기존
   경로(`/login`, `/crews/[crewId]` 등)는 전부 그대로다.
3. `src/app/error.tsx`·`src/app/not-found.tsx`도 `(shell)/` 아래로 함께 옮겼다 — 이 둘은
   `(shell)/layout.tsx`가 그리는 `<html>/<body>` 안에 중첩돼야 하는 세그먼트 경계 파일이라
   최상위에 홀로 남으면 어느 루트 레이아웃에도 속하지 못한다(§3에서 실측으로 확인, CORE 인계
   문서는 이 두 파일을 다루지 않았다).
4. `src/app/sample/`은 제자리에 남기고 `src/app/sample/layout.tsx`(신규)를 그 자체 루트
   레이아웃으로 만들었다 — `AppShell`을 조립하지 않는다. `src/app/sample/error.tsx`·
   `not-found.tsx`도 짝으로 신설했다(§3와 같은 이유).
5. 최상위(`src/app/`)에는 더 이상 공유 `layout.tsx`를 두지 않는다. `globals.css`·`favicon.ico`·
   `global-error.tsx`(§4)만 남는다.

**다른 루트 레이아웃 사이 이동 시 풀 페이지 리로드**(공식 caveat)는 그대로 발생한다 — `/sample`은
내부 개발 도구 페이지고 제품 화면에서 여기로 가는 링크가 없어 낮은 비용으로 판단했다(CORE 인계
문서와 같은 결론).

**폰트·FOUC 스크립트·`ThemeProvider`·`Toaster` 중복**은 예정대로 발생했다 — `global-error.tsx`가
이미 같은 이유로 같은 방식(폰트 로더 재호출)을 쓰고 있어 그 선례를 따랐다(공유 모듈로 뽑아도
`next/font`는 파일마다 호출해야 하므로 중복 자체는 없어지지 않는다). `sample/layout.tsx`는
`ToastHostContainer`(인증 세션 필요)는 생략했다 — `/sample`의 실시간 알림 데모
(`NotificationSimulatorPreviewContainer`)는 자기 안에서 직접 마운트한다.

## 3. CORE 인계 문서가 다루지 않은 공백 — `error.tsx`/`not-found.tsx`/전역 404

CORE의 조사는 §4에서 `AppShell` 조립 이동만 다루고 `error.tsx`·`not-found.tsx`·
`global-error.tsx`의 배치는 언급하지 않았다. 직접 재확인한 결과:

- **`error.tsx`/`not-found.tsx`는 세그먼트 경계 파일**이라(공식 문서 "component hierarchy") 그
  파일이 속한 루트 레이아웃의 `<html>/<body>` 안에 중첩돼야 한다 — 최상위에 홀로 두면 (shell)과
  sample 중 어느 쪽에도 속하지 않아 성립하지 않는다. 그래서 §2-③·④처럼 각 루트 그룹에 하나씩
  두었다.
- **`global-error.tsx`는 다르다** — "루트 레이아웃이 크래시했을 때의 최후 대체"이며 그 정의상
  특정 루트 레이아웃에 속하지 않는다. 원래 위치(`src/app/global-error.tsx`, 최상위) 그대로
  두었다 — 실측 결과 두 루트 레이아웃(`(shell)`·`sample`) 어느 쪽이 크래시해도 정상적으로
  대체된다.
- **진짜 문제 — "그 어떤 라우트도 매칭되지 않는 URL"**: `(shell)/not-found.tsx`·
  `sample/not-found.tsx` 어느 쪽도 이 경우를 처리하지 않는다는 것을 실측으로 발견했다(아래
  §3.1). 복수 루트 레이아웃에서는 "하나의 layout으로 구성하는 전역 404"가 애초에 성립하지
  않기 때문이다 — 이건 회귀가 아니라 Next.js의 구조적 한계이고, 공식 문서가 정확히 이 상황을
  위해 `global-not-found.js`(experimental)를 제공한다(§4).

### 3.1 실측 — 두 단계

1주차: 격리 빌드(§5)에서 `curl /this-route-does-not-exist-xyz`, `curl /sample/존재하지-않는-경로`
둘 다 200이 아니라 404를 반환하되, 본문이 우리 커스텀 화면(`페이지를 찾을 수 없어요`)이 아니라
Next.js 내장 제네릭 404(`<title>404: This page could not be found.</title>`)였다. `.next/server/app`
아래 산출물을 대조한 결과 `_not-found` 라우트 자체가 group-agnostic한 단일 대체 경로로만 생성돼
있었다 — 어느 루트 레이아웃을 태울지 결정할 근거가 없어서다.

## 4. 해법 — `experimental.globalNotFound`

`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`가 정확히
이 시나리오("여러 root layout이 있어 하나의 layout으로 전역 404를 구성할 수 없다")를 위해
`global-not-found.js`(experimental)를 제공한다고 명시한다. 도입:

1. `next.config.ts`에 `experimental.globalNotFound: true` 추가.
2. `src/app/global-not-found.tsx` 신설 — 자기 완결적 `<html>/<body>`(어떤 레이아웃도 거치지
   않으므로), 폰트·전역 스타일을 `global-error.tsx`와 같은 방식으로 직접 로드, `RouteErrorBoundary
   kind="not_found"`를 그린다.

**실측(재확인, 격리 빌드)**: 도입 후 `/this-route-does-not-exist-xyz`·`/sample/존재하지-않는-경로`
·`/_not-found` 셋 다 `<title>페이지를 찾을 수 없어요</title>`(커스텀 화면)로 정상 대체됨을
확인했다. `notFound()`를 명시적으로 호출하는 기존 코드(`CrewHomeContainer` 등, 매칭된 세그먼트
안에서 호출)는 이 파일이 아니라 자신이 속한 `(shell)/not-found.tsx`를 그대로 탄다 — 공식 문서의
"Good to know"(전역 파일은 매칭되지 않은 URL만 처리) 그대로다.

**"experimental" 표기 인지**: 빌드 로그에 `Experiments (use with caution): ✓ globalNotFound`가
뜬다. 대안(포기하고 제네릭 404를 받아들인다)보다 이 기능을 켜는 비용이 낮다고 판단했다 —
이 기능이 정확히 이 케이스를 위해 설계됐고, 실측상 기존 라우트·`notFound()` 경로에 부작용이
없었다. 다음 Next.js 마이너 업그레이드 시 `globalNotFound`가 표준으로 승격되는지 확인하는 것을
남은 확인 항목으로 둔다.

## 5. `/sample`이 자기 기준면을 갖게 하기 — 명명된 컨테이너

`globals.css`의 `@custom-variant`는 `sm:`/`md:`/`lg:`/`xl:`/`2xl:`을 전역으로 "이름이 `appframe`
인 조상 컨테이너" 기준으로 재정의해 둔다. `/sample`이 `AppShell` 밖으로 나가면 그 이름의 조상이
완전히 사라져, 이 variant를 쓰는 코드는 폭과 무관하게 **영구적으로 죽는다** — CORE의 55곳 전수
조사에서 "c"(`/sample` 예외, DESIGN 인계)로 남긴 5곳이 정확히 이 문제였다.

**해법 — 두 층**:

1. **`sample/layout.tsx`가 `<body>`에 직접 `@container/appframe`을 준다** — `AppShell`처럼 폭을
   430px로 가두지 않고, 실제 페이지 폭을 그대로 따라간다(하드캡 없음). `sample/page.tsx`의 헤더·
   내비 패딩(`sm:px-6` 등)과 `certainty.tsx`·`foundation.tsx`·`primitives.tsx`의 `sm:grid-cols-*`
   /`lg:grid-cols-*`(PreviewFrame 밖, 페이지 본문에 직접 있는 것들 — 의도적으로 뷰포트 기준)가
   이 조상을 기준으로 삼는다.
2. **`PreviewFrame`도 자신을 `@container/appframe`으로 선언한다**(기존에는 익명 `@container`
   뿐이었다). CSS 컨테이너 쿼리는 이름이 일치하는 **가장 가까운** 조상을 찾으므로, `PreviewFrame`
   으로 감싼 데모는 `<body>` 대신 `PreviewFrame` 자신의 토글된 폭을 기준면으로 삼는다 — 폭
   토글이 "그 컴포넌트가 그 폭에서 어떻게 보이는가"를 실제로 보여주게 된다. `AppShell`을 통째로
   데모하는 `shell.tsx`의 `PreviewFrame` 안에서는 `AppShell` 자신의 `@container/appframe`이 더
   가까워 그쪽이 이긴다 — D-066이 원하는 "항상 430px" 데모가 그대로 유지된다(충돌 없음, 이름
   있는 컨테이너 쿼리의 최근접 매칭 규칙).

`sample/page.tsx`의 `<main>` 최대 폭도 `max-w-4xl`(896px)에서 `max-w-[90rem]`(1440px)로
넓혔다 — 896px로는 `lg:`(64rem=1024px)가 실 브라우저 폭과 무관하게 영원히 못 켜져 "시맨틱 색"
5열 그리드가 살아나지 않는다. 본문 프로즈(문단·설명)는 각자 `max-w-2xl`을 따로 가지고 있어 줄
길이는 영향받지 않는다.

`globals.css` 머리 주석·`PreviewFrame.tsx` docstring에 이 변경을 각각 반영했다(코드 참고).

## 6. 실 브라우저 실측(Playwright, 격리 프로덕션 빌드, 포트 3099)

공유 dev/build 디렉터리와의 레이스를 피하려 `mo_im`을 별도 디렉터리로 복사(`node_modules`
포함 리얼 카피, 심볼릭 링크는 Turbopack이 "프로젝트 루트 밖" 오류로 거부해 실패)해 격리 빌드·
실행했다(§7 참고 — 공유 디렉터리에서 실제로 레이스를 겪었다).

### 6.1 `/sample` 폭 토글 4단계 — `foundation.tsx`의 "컨테이너 쿼리" 데모(네이티브 `@sm:`/`@lg:`,
I-098 원 재현 지점)

브라우저 뷰포트 1920×1080.

| 토글 | 프레임 렌더 폭(px) | 카드 그리드 `grid-template-columns` |
| --- | --- | --- |
| 360 | 360 | `326px`(1열) |
| 768 | 768 | `236.656px 236.672px 236.672px`(3열) |
| 1280 | 1280 | `407.328px 407.328px 407.344px`(3열, 카드 폭 확대) |
| 전체 | 1392 | `444.656px 444.672px 444.656px`(3열, 카드 폭 더 확대) |

**4단계 전부 실제 렌더 폭과 그리드 값이 서로 다르다** — I-098 원 실측("360→326px 정상, 768·
1280·전체가 전부 175px 175px 2열로 동일")이 재발하지 않았다. "전체"가 1920이 아니라 1392인
이유는 `<main>`의 `max-w-[90rem]`(1440px) 캡 안에서 좌우 패딩(24px×2)을 뺀 실제 콘텐츠 폭이라
의도된 동작이다.

### 6.2 `/sample`의 되살린 5곳 — 실 폭 반응 확인

1920px에서: `foundation.tsx` "시맨틱 색" 그리드 `grid-template-columns`가 `268.797px`×5(5열,
`lg:grid-cols-5` 활성), 상단 앵커 내비 `padding-left: 24px`(`sm:px-6` 활성), `<main>`
`max-width: 1440px` 확인. 500px로 줄이면 같은 그리드가 2열(`220.5px`×2, base `grid-cols-2`로
복귀)·내비 패딩 16px(`px-4`로 복귀)로 정상 반응 — 항상 켜진 게 아니라 진짜 폭 기준으로
반응함을 확인했다. 360px에서 `/sample` 자체의 가로 스크롤 없음(`scrollWidth` 354 ≤
`innerWidth` 360) 확인.

### 6.3 앱 본체 회귀 확인 — `/crews`(공개 라우트, `(shell)` 그룹)

| 뷰포트 | 프레임 `clientWidth` | 헤더 인라인 내비 `display` | 탭바 `display` | 가로 스크롤 |
| --- | --- | --- | --- | --- |
| 360 | 345 | — | — | 없음 |
| 768 | 430 | `none`(2곳) | `flex` | 없음 |
| 1280 | 430 | `none`(2곳) | `flex` | 없음(`scrollWidth` 1265 ≤ 1280) |

D-066이 확정한 "항상 430px 모바일 프레임, 탭바가 유일한 1차 내비게이션"이 세 폭 모두 그대로다
— `/sample` 분리가 앱 본체에 영향을 주지 않았다.

### 6.4 `/sample` 4상태 토글 회귀 확인

`[aria-label="상태 전환"]` 89개 인스턴스가 전부 렌더됐고(등록된 컴포넌트 수만큼), 그중 4상태
(기본/로딩/빈 상태/오류) 전부 가진 것 23개. 임의로 하나를 골라 "오류" 탭 클릭 → `aria-selected`가
정확히 그 탭으로 이동함을 확인(shadcn `Tabs`/roving tabindex 그대로 동작). 콘솔에는 무관한
브라우저 경고(비밀번호 필드 폼 미포함, CSS preload 미사용 경고)만 있고 하이드레이션 불일치·
에러는 0건.

## 7. 격리 빌드가 필요했던 이유 — 공유 디렉터리 레이스 조우

최초 검증을 공유 `mo_im` 디렉터리에서 진행하다 `/crews/[crewId]`에서 `InvariantError: The
client reference manifest for route "/crews/[crewId]" does not exist`(500)를 만났다. `rm -rf
.next` 후 재빌드해도 재현돼 처음엔 "중첩 라우트 그룹에서 이름이 겹치는 동적 세그먼트
(`(shell)/crews/[crewId]` vs `(shell)/(app)/crews/[crewId]/...`)가 Turbopack 버그를 유발하는가"를
의심했다. 그런데 `ps`/`ss`로 확인한 결과 **같은 디렉터리에서 다른 팀원의 `next-server` 프로세스
2~3개가 동시에 `.next`를 쓰고 있었다** — 별도 디렉터리로 통째 복사(`node_modules`는 실제 복사,
Turbopack이 프로젝트 루트 밖 심볼릭 링크를 거부해 심볼릭 링크는 실패)해 격리 빌드하니 문제의
라우트가 정상 200을 반환했다 — **버그가 아니라 공유 빌드 디렉터리 레이스였다.** 이후 §6의 모든
실측은 격리 사본에서 했다.

**부수 피해 고지**: 이 조사 과정에서 공유 디렉터리에 `rm -rf .next` + 재빌드를 두 차례 수행했다
— 이후 확인 결과 포트 3012에서 서비스 중이던 다른 팀원의 서버 프로세스가 사라졌다(포트 3000
프로세스는 그 이전부터 이미 500 상태였어서 이번 조사와 무관해 보인다). 팀장에게 별도 고지했다.

## 8. 산출물

- 이동(`git mv`): `layout.tsx`·`page.tsx`·`account/`·`auth/`·`crews/`·`login/`·`onboarding/`·
  `reset-password/`·`signup/`·`(app)/`(전체) → `(shell)/` 아래로. `error.tsx`·`not-found.tsx` →
  `(shell)/`.
- 신규: `src/app/sample/layout.tsx`·`error.tsx`·`not-found.tsx`, `src/app/global-not-found.tsx`.
- 수정: `next.config.ts`(`experimental.globalNotFound`), `src/app/globals.css`(머리 주석 갱신),
  `src/components/sample/PreviewFrame.tsx`(named container + docstring),
  `src/app/sample/page.tsx`(`<main>` 최대 폭), `src/app/(shell)/layout.tsx`·`not-found.tsx`
  (docstring 갱신, 경로 참조 정정).
- `npx tsc --noEmit`·`npm run lint`·`npm run build` 전부 0 errors(격리 사본과 공유 저장소 양쪽
  최종 확인).
- 결정: `docs/prioritization-and-risks.md` **D-069**. 이슈: `docs/ISSUES.md` I-098(해결됨으로
  갱신).

## 9. 남은 것

- `experimental.globalNotFound`가 이후 Next.js 버전에서 표준화되는지 다음 업그레이드 시 확인.
- I-104(`DayDetailPanel` 실 뷰포트 반응형, CORE가 다른 회차에 조사 중)는 이 작업과 별개다 —
  손대지 않았다.
- `/sample`↔`(shell)` 간 이동 시 풀 페이지 리로드는 받아들인 트레이드오프이나, 제품 화면에
  `/sample` 링크가 생기면 재검토 대상이다.
