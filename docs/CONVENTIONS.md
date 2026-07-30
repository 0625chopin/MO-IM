# 디렉터리 구조·명명 규약

> **Task 001** (`docs/ROADMAP/team/01.CORE.md`) 산출물. 참조: **R-007**, R-003, R-015, NFR-034·036·037, CON-05, D-030.
> 이 문서는 **규칙**을 적는다. 갱신되는 값(번호·개수·진행률·날짜)은 적지 않는다 — `CLAUDE.md`의 재발 방지 규칙(R-006)을 따른다.

## 왜 필요한가

저장소는 `create-next-app` 스캐폴드 그대로였고 `src/app/{layout,page}.tsx`·`globals.css` 밖에는 배치 규칙이 없었다(**R-007**). 먼저 코드를 쓰는 사람이 사실상 컨벤션을 정하게 되고 나중에 되돌리는 비용이 크다. 동시에 이 프로젝트는 두 가지 되돌리기 비싼 경계를 안고 있다.

- **Mock↔실데이터 전환**(R-003): 데이터 접근 로직이 컴포넌트 안에 흩어지면 전환 시점에 UI를 광범위하게 고쳐야 한다.
- **웹→네이티브 전환 가능성**(R-015): 투표 판정·정족수·권한 판정 같은 핵심 규칙이 서버 컴포넌트 본문에 흩어지면 전환 시 재작성 대상이 된다.

아래 구조는 이 두 경계를 **디렉터리 위치와 ESLint 규칙으로 강제**해 "새 파일을 어디에 둘지 고민하는 것 자체가 경계를 지키는 것"이 되도록 한다.

---

## 디렉터리 구조

범례 — **[완료]**: 실제 코드/문서가 이미 채워짐. **[스캐폴드]**: 디렉터리와 `README.md`만 있고
비어 있음(정상 — Task 001은 구조만 잡는다). **[향후]**: 아직 디렉터리도 없고, 명시된 담당 Task가
실제로 만든다. 표시가 없으면 라우팅 파일처럼 팀원이 그때그때 만드는 위치다.

```
src/
  app/                      # 라우팅 전용. 로직을 두지 않는다 — 얇은 껍데기
    sample/                 # [완료] /sample 쇼케이스 (아래 "/sample 4상태 규칙" 참고).
                             #   3일차 Task 011(DESIGN)이 최소 골격을, 디자인 개편(D-038)이
                             #   Task 012 구조로 확장했다 — 카테고리 섹션 + 앵커 내비 +
                             #   폭 토글(360/768/1280/전체) 프리뷰 프레임. 섹션은 기반(색·조판)·
                             #   확정성 스케일·앱 셸·원자 컴포넌트 넷이다. `page.tsx` 자체에는
                             #   섹션·항목 데이터가 없다 — 4일차 Task 012(DESIGN)가
                             #   `src/components/sample/registry.ts`로 등록 인터페이스를
                             #   확정해, 다른 팀원이 이 파일을 고치지 않고 자기 섹션을 등록한다.
    (app)/                  # [완료] 6일차, D-030 ④ 인증 경계(I-025 해소). 라우트 그룹이라
                             #   URL에 영향 없음 — `(app)/calendar/`는 여전히 `/calendar`다.
                             #   `layout.tsx` 하나가 이 아래 전체(로그인 필요한 실제 앱 콘텐츠:
                             #   home·crews·calendar·notifications·invitations·meetups·
                             #   settings)의 인증 가드를 맡는다. "인증 경계는 레이아웃에서
                             #   처리" 절 참고 — 게스트 전용 진입 페이지(랜딩·login·signup·
                             #   onboarding)는 이 그룹 밖에 남는다.
      <route-segment>/        # [향후] 예: crews/, calendar/ — FR 단위로 팀원이 생성
      page.tsx
      layout.tsx
      loading.tsx
      error.tsx
      default.tsx           # 병렬 라우트(@slot)를 쓰는 세그먼트는 Next 16에서 필수

  components/
    ui/                     # [완료·부분] shadcn/ui 원시 컴포넌트. `button`·`card`(CREW, Task 004) +
                             #   디자인 개편(D-038)이 추가한 `badge`·`skeleton`·`tabs`·`separator`·
                             #   `toggle`/`toggle-group`·`empty`·`avatar`. **직접 만들기 전에
                             #   shadcn MCP 레지스트리에서 먼저 찾는다** — 손으로 다시 짜면
                             #   접근성 처리와 다크모드 토큰 연결을 매번 새로 검증해야 한다.
                             #   추가 시 React Compiler 수동 메모 여부를 확인한다(I-022, D-029)
    shell/                  # [완료] 3일차 Task 011(DESIGN, D-030 ④). 앱 셸 4종 —
                             #   `AppShell`·`HeaderNav`·`MobileTabBar`·`PageHeader`(전부 표현
                             #   컴포넌트, `<Name>Container.tsx` 없음 — `src/app/layout.tsx`가
                             #   구성 루트로서 컨테이너 역할을 겸한다). `auth-session.ts`(세션
                             #   타입 + 순수 판정, 클라이언트 번들 안전)·`get-auth-session.ts`
                             #   (Mock 쿠키 세션 조회, 서버 컴포넌트 전용)·`nav-items.ts`(세션 →
                             #   내비 항목 순수 함수)도 여기 있다 — `lib/data`·`lib/rules`
                             #   어디에도 지정 위치가 없어 부득이 이곳에 뒀다(I-026 참고, 실 인증
                             #   연동 시 이관 검토 대상).
    sample/                 # [완료] 3일차 Task 011(DESIGN) + 디자인 개편(D-038) + 4일차
                             #   Task 012(DESIGN). `/sample` 전용 쇼케이스 인프라 —
                             #   `StatePreview`(기본·로딩·빈·오류 토글, shadcn `Tabs` 기반),
                             #   `PreviewFrame`(`position: fixed`/`sticky` 요소를 미리보기
                             #   상자 안에 가두는 컨테이너 + 폭 토글), `showcase-types.ts`
                             #   (`ShowcaseSection`·`ShowcaseItem`·`defineSection` — 등록
                             #   인터페이스), `registry.ts`(팀원별 섹션을 조립하는 단일
                             #   진입점), `ShowcaseSectionBlock.tsx`(섹션 렌더러),
                             #   `sections/`(카테고리별 데이터 — `foundation`·`certainty`·
                             #   `shell`·`primitives`). 다른 팀원이 자기 섹션을 등록하는
                             #   방법은 `src/components/sample/README.md` 참고 — `page.tsx`를
                             #   고치지 않고 `sections/`에 파일을 추가하고 `registry.ts`에
                             #   한 줄만 더한다. 제품 도메인 컴포넌트가 아니라 개발 도구라
                             #   `<domain>/` 규칙(아래) 대신 여기 별도 표기한다.
    <domain>/                # [향후] 도메인별 컴포넌트 (예: crews/, polls/, chat/, calendar/)
      <Name>Container.tsx     # 컨테이너: 데이터 조회·구독 소유 (D-030 ①)
      <Name>.tsx               # 표현: props만 받는 순수 렌더 (D-030 ①)

  lib/
    types/                  # [스캐폴드] 도메인 TypeScript 타입 — Mock·실데이터 공용 (NFR-035, Task 006)
    data/                   # 데이터 접근 레이어 (NFR-034·037, Task 007)
      index.ts                # [향후] 유일한 진입점(배럴) — 여기서 mock/supabase 중 하나를 조립.
                               #   **아직 없다** — 이 파일이 생기기 전까지 소비자는 `mock/`·`supabase/`가
                               #   비어 있어 어차피 아무것도 import할 게 없다. 배럴이 mock/supabase를
                               #   조립 import하는 것은 `eslint.config.mjs` zone 6이 허용한다(zone 2·3만
                               #   상호 참조를 막는다) — 남은 리스크 절 참고
      mock/                    # [스캐폴드] Mock 구현
      supabase/                # [스캐폴드] 실데이터(Supabase) 구현 — Phase 4
    realtime/                # [스캐폴드] 구독 인터페이스 (D-030 ②)
      index.ts                # [향후] subscribeToRoom(id, onEvent): Unsubscribe 등 인터페이스 + 조립
      mock.ts                  # [향후] Mock: 타이머 기반
      broadcast.ts              # [향후] 실데이터: Supabase Realtime Broadcast (D-023)
    rules/                  # [스캐폴드] React 비의존 순수 함수 (NFR-036) — 투표 판정·정족수·권한 판정·
                             #   색 해시 등. `crew-palette.ts`(아래)와의 경계는 "배치 원칙" 참고
    actions/                # [스캐폴드] Server Action
    strings/                # [완료] 사용자 노출 문자열 모듈 — BOARD 담당(`index.ts`·`ko.ts` 이미 존재).
                             #   이 Task에서 파일 생성 안 함
    utils.ts                # [완료] 범용 유틸리티 — **폴더가 아니라 단일 파일.** shadcn CLI
                             #   (`components.json` `aliases.utils: "@/lib/utils"`)가 만드는 `cn()`이
                             #   이미 이 경로에 있다(CREW). 새 범용 유틸은 이 파일에 추가하고, 도메인
                             #   전용 로직은 여기 넣지 않는다(도메인 순수 함수는 `lib/rules/`로)
    crew-palette.ts         # [완료] DESIGN, Task 002(CON-04·D-026·FR-062). 캘린더 12색 팔레트 상수 +
                             #   충돌 회피 워크. 애초 이 트리 초안에 없던 파일이라 1일차 교차검증에서
                             #   추가했다 — `lib/rules/`가 아니라 `lib/` 최상위에 있는 이유와 위치
                             #   타당성은 "배치 원칙"과 `src/lib/rules/README.md` 참고

  hooks/                    # [스캐폴드] 커스텀 React 훅 (useXxx)
```

### 배치 원칙

- **`src/app/`은 라우팅과 조립만 한다.** 데이터 조회·구독·판정 로직을 두지 않는다. 페이지는 컨테이너 컴포넌트를 조립하거나, 서버 컴포넌트에서 `lib/data`를 직접 호출해 표현 컴포넌트에 props로 내려준다.
- **`lib/rules/`는 React·Next·데이터 접근 레이어를 import하지 않는다.** 입력을 인자로 받고 출력을 반환하는 순수 함수만 둔다 — React Compiler는 컴포넌트·훅만 메모이즈하므로(`CLAUDE.md`) 이 계층은 애초에 최적화 대상 밖이며, 네이티브 전환 시 그대로 재사용해야 하는 부분이다(R-015, CON-05).
- **`lib/data/mock`과 `lib/data/supabase`는 서로 참조하지 않는다.** 둘 다 같은 타입(`lib/types`)을 구현하고, 소비자는 `lib/data`(배럴)만 import한다 — 구현체를 직접 import하면 전환 시 교체 지점이 흩어진다(NFR-034, R-003).
- **`lib/realtime`도 같은 이유로 배럴을 통해서만 소비한다.** Mock 단계에서는 `mock.ts`(타이머)를, 실데이터에서는 `broadcast.ts`(Supabase Broadcast)를 배럴이 선택해 조립한다(D-030 ②).
- **표현 컴포넌트(`<Name>.tsx`)는 `lib/data`·`lib/realtime`·Supabase 클라이언트를 import하지 않는다.** 데이터는 오직 props로만 받는다 — 컨테이너(`<Name>Container.tsx`)가 조회·구독을 소유한다(D-030 ①). `components/ui/`(shadcn 원시 컴포넌트)는 이 구분에서 컨테이너와 같은 취급(= 데이터 레이어 접근 없음, 별도 강제 없음)을 받는다.
- **Supabase 클라이언트(`@supabase/supabase-js` 등)는 `lib/data/supabase`와 `lib/realtime`(구현체 파일)에서만 import한다.** 그 밖의 모든 위치에서 직접 import하면 전환 경계가 새는 신호다(R-015 신호: "컴포넌트 파일에서 Supabase 클라이언트를 직접 import한다").

### 이 Task에서 만들지 않는 것 (담당 표기만)

| 경로 | 담당 | 비고 |
| --- | --- | --- |
| `src/components/ui/` | CREW | `components.json`(shadcn 레지스트리 설정)과 함께 생성. 이 회차에 `button.tsx`·`card.tsx`로 이미 채워졌다 |
| `src/lib/strings/` | BOARD | 사용자 노출 문자열 모듈(D-011·NFR-023 대응). 이 회차에 `index.ts`·`ko.ts`·`README.md`로 이미 채워졌다 |
| `src/lib/utils.ts` | CREW | shadcn CLI 산출물(`cn()`). 폴더가 아니라 파일이며 이미 존재한다 |

이 세 경로는 위 트리에 위치만 정의했고 실제 파일·디렉터리는 담당자가 만든다 — CORE는 이 Task에서 손대지 않았다.

---

## 명명 규약

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| 라우트 세그먼트 폴더 | kebab-case | `app/crew-settings/` |
| Next.js 특수 파일 | 프레임워크 고정 이름 그대로 | `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `default.tsx`, `not-found.tsx` |
| 컴포넌트 파일 | PascalCase, export하는 컴포넌트명과 일치 | `PollCard.tsx`, `PollCardContainer.tsx` |
| 컨테이너 컴포넌트 | `<Name>Container.tsx` 접미사 고정 | `ChatRoomContainer.tsx` |
| 훅 | camelCase, `use` 접두 | `useSubscribeToRoom.ts` |
| 그 외 TS 모듈(함수·상수·타입) | kebab-case | `quorum.ts`, `crew-color-hash.ts` |
| 도메인 타입 파일 | `<entity>.types.ts` | `poll.types.ts`, `crew.types.ts` |
| Server Action 파일 | kebab-case, 동사로 시작 | `create-poll.ts` |
| 테스트 파일(도입 시) | 소스와 동일 위치에 `*.test.ts(x)` 콜로케이션 | `quorum.test.ts` — 러너 미도입(R-002) 상태라 규약만 예약 |

경로 별칭 `@/*` → `./src/*`는 그대로 유지한다. 같은 디렉터리·형제 파일은 상대 경로(`./`)를, 그 밖은 `@/*` 별칭을 쓴다.

---

## D-030 전환 경계 네 가지와 이 규약의 대응

`CLAUDE.md` "전환 경계 네 가지 (D-030)"를 디렉터리·규칙 수준에서 아래처럼 강제·유도한다.

1. **표현/컨테이너 분리** → `components/<domain>/<Name>.tsx`(표현) / `<Name>Container.tsx`(컨테이너) 명명 규약 + ESLint가 표현 컴포넌트의 `lib/data` import를 차단.
2. **구독을 인터페이스로 감싼다** → `lib/realtime/index.ts` 배럴 하나만 소비자에게 노출. ESLint가 `lib/data`·Supabase 클라이언트의 산발적 직접 import를 차단해 배럴 경유를 유도.
3. **`/sample` 4상태에 도메인 오류 포함** → 아래 "`/sample` 4상태 규칙" 참고.
4. **인증 경계는 레이아웃에서 처리** → `proxy.ts`는 D-011로 v0.1 범위 밖이므로 만들지 않는다. 실제로는 **성격이 다른 두 형태**가 코드에 공존한다(6일차, I-025 해소로 정리) — 둘을 섞어 쓰지 않는다.
   - **게스트 전용 진입 페이지의 자기 가드**: 랜딩(`/`)·`/login`·`/signup`·`/onboarding` 4개는 각 `page.tsx`가 `getAuthSession()`+`isAuthenticated()`+`redirect()`를 직접 갖는다(반대 방향 가드 — "이미 로그인했으면 다른 곳으로"). 이 넷은 하위 세그먼트가 없는 단일 페이지이고 앞으로도 늘어나지 않는 고정된 집합이라, 페이지마다 반복해도 "하나를 빠뜨리는" 위험이 없다 — 레이아웃으로 모을 이유가 없다.
   - **인증된 앱 라우트 하위 트리 보호**: `/home`·`/calendar`·`/notifications`·`/invitations`·`/meetups/[meetupId]`·`/settings`·`/crews/new`·`/crews/[crewId]/{board,chat,members,settings}`처럼 **로그인이 필요한 실제 앱 콘텐츠**는 `src/app/(app)/layout.tsx` 라우트 그룹 레이아웃 **한 곳**이 가드한다("미로그인이면 `/login`으로" — 앞의 것과 반대 방향). 이 집합은 계속 페이지가 늘어나는 쪽이라 개별 `page.tsx`에 반복하면 하나를 빠뜨릴 위험이 실제로 있다 — 실제로 6일차에 `/calendar`가 이 가드를 빠뜨린 채 배포됐었다(라우트 그룹은 URL에 영향이 없다 — `(app)/calendar/page.tsx`는 여전히 `/calendar`).
   - **`/crews`·`/crews/[crewId]`는 의도적으로 `(app)` 밖이다(6일차, I-036 해소).** 크루 탐색(FR-014)·공개 크루 홈 열람(FR-011)은 권한 매트릭스(`requirements.md:236-237`)가 비로그인 방문자에게 `○³`(공개 크루 한정 허용)로 명시한다 — D-007 그대로다. 반면 같은 크루의 `new`(개설)·`board`·`chat`·`members`·`settings`는 확실히 회원 전용이라 `(app)` 안에 있다. **처음엔 팀장 지시("`/crews` 하위 전부")를 문자 그대로 따라 이 둘까지 `(app)` 안에 넣었다가 이 회귀를 냈다** — 요구사항을 다시 대조해 잡아내고 두 파일만 `(app)` 밖으로 되돌렸다.
     - **이 구조(같은 이름 폴더를 라우트 그룹 안팎으로 분할)는 Next.js 16에서 허용되고 실측 검증됐다.** `route-groups.md`의 "Conflicting paths" 캐비어트는 **동일 URL에 두 페이지가 겹치는 경우**만 다루고(우리 케이스는 `/crews`·`/crews/[crewId]`·`/crews/new`·`/crews/[crewId]/board` 전부 URL이 다르다), `project-structure.md`의 "Opting specific segments into a layout" 공식 예시는 **다른 이름의 형제 폴더**(`account`/`cart` vs `checkout`)를 그룹 안팎으로 가르는 그림이라 우리 경우(같은 이름 `crews` 분할)와 문서 예시가 정확히 일치하지는 않았다 — 문서만으로는 허용·금지 어느 쪽도 확정할 수 없었다. **`npm run build`로 실측한 결과 정상 동작한다**(21개 라우트 전부 올바르게 resolve — `/crews`·`/crews/[crewId]`는 `(app)` 밖 레이아웃 체인, 나머지 크루 하위 라우트는 `(app)/layout.tsx`를 거치는 체인으로 각각 분리) — 6일차에 확정. 다음에 같은 상황(그룹 경계로 라우트를 쪼개야 하는데 문서 예시가 우리 경우와 정확히 안 맞음)을 만나면 이 사례를 참고해 문서를 다시 왕복하지 않아도 된다.
   - **새 보호 페이지를 추가할 때**: `src/app/(app)/` 아래에 라우트를 만들면 **리다이렉트용 가드**는 자동으로 적용된다 — `page.tsx`에 "미로그인이면 `/login`으로" 리다이렉트를 다시 쓰지 않는다. 새 게스트 전용 진입 페이지가 필요하면(흔치 않음) `(app)` 밖에 두고 그 페이지 자신이 반대 방향 가드를 갖는다.
   - **금지되는 재작성과 허용되는 재작성은 다르다**(6일차, CORE 재검증 E-1로 정리 — 이전 판에는 이 구분이 없어 "인증 체크를 다시 쓰지 않는다"가 "어떤 세션 관련 코드도 다시 쓰면 안 된다"로 오독될 여지가 있었다):
     - **금지**: `(app)/` 아래 `page.tsx`·컨테이너가 `redirect("/login")`을 다시 호출하는 것. 레이아웃이 이미 했다 — 이중 가드다.
     - **허용, 사실 필수**: `(app)/` 아래 컨테이너가 `AuthSession` 유니온이 아니라 좁혀진 `authenticated` 타입을 요구하는 경우(예: `AccountSettingsContainer`·`MonthCalendarContainer`가 `session.profileId`를 바로 쓴다), TypeScript는 레이아웃의 보장을 정적으로 모르므로 **타입 내로잉용 재조회**가 필요하다. 이때 쓰는 게 `src/components/shell/auth-session.ts`의 **`assertAuthenticatedSession(session)`**(`asserts` 타입 서술어)이다 — 내부에서 실패하면 `redirect`가 아니라 `throw`한다(도달하면 사용자 오류가 아니라 레이아웃 가드 자체가 깨졌다는 뜻, D-030 ③). `as` 단언을 쓰지 않는 이유도 같다 — 단언은 이 불변식이 깨져도 조용히 통과시킨다.
     - **`(app)` 밖(예: 크루 게시판처럼 D-007상 guest도 유효한 역할인 라우트)**: 이 헬퍼를 쓰지 않는다. 대신 `src/components/board/resolve-board-viewer.ts`의 패턴 — guest를 오류가 아니라 `role: "guest"`인 정상 값으로 반환하고, `lib/rules/permission.ts`의 `checkPermission` 매트릭스가 거부 여부를 판정하게 한다. 두 패턴은 **경쟁하는 두 방식이 아니라 서로 다른 문제**(guest가 애초에 불가능한 곳 vs guest가 유효한 역할인 곳)를 푼다 — 섞어 쓰지 않는다.
     - **fail-open 금지**: 인증되지 않은/판정 불가 상태를 "실존 Mock 사용자로 대체"해 조용히 통과시키지 않는다(예전 `MonthCalendarContainer`의 `MOCK_FALLBACK_PROFILE_ID`가 이 실수였다 — 6일차 CORE 재검증 E-2로 제거) — 안전한 실패는 항상 거부(guest 역할 낙하 또는 `assertAuthenticatedSession`의 `throw`) 쪽이어야 한다.
   - **`(app)`은 인증 게이트이지 크루원 게이트가 아니다**(6일차, 팀장 판정 E-3 — I-035). `(app)/layout.tsx`가 보장하는 불변식은 "로그인했다"까지다 — "그 크루의 멤버다"는 별개 판정이고 이 레이아웃이 대신해 주지 않는다. D-007이 크루 게시판·채팅·멤버 목록·캘린더를 크루원 전용으로 규정한다.
     - **크루원 게이트는 `src/app/(app)/crews/[crewId]/layout.tsx`가 맡는다**(7일차, **D-039** — I-035 해소). 이 동적 세그먼트 레이아웃 한 곳이 `getCrewMembership`+`isActiveMembership`로 "활성 크루원인가"만 판정해 `board`·`chat`·`members`·`settings` 전체에 적용한다 — 비멤버는 `cause: { code: "forbidden" }`를 던져 전역 `RouteErrorBoundary(kind="forbidden")`로 떨어진다. 판정은 **"크루원인가" 한 가지뿐**이다 — `board:read`처럼 액션별 세밀한 매트릭스 조건(관리자 열람 등)까지 이 레이아웃이 흉내 내지 않는다(지금 `AuthSession`에 `system_admin`을 표현할 필드 자체가 없어 이 근사가 안전하다).
     - **`resolveBoardViewer` + `BoardListContainer`의 컨테이너 레벨 방어(`board:read`)는 제거하지 않았다.** 레이아웃이 이미 "크루원인가"를 걸렀어도, 그 컨테이너는 `role`(member/staff/owner 세분)을 계산해 `post:create`(글쓰기 버튼 노출) 같은 **다른** 판정에 그대로 재사용한다 — "같은 판정을 같은 방식(리다이렉트)으로 반복하는 것"(위 165행 금지 규칙)과는 다른 경우다. 새 하위 화면(채팅·멤버 관리 등)도 이 패턴을 따른다: **라우트 레벨은 이 레이아웃이, 액션별 세밀한 판정은 각 컨테이너·Server Action이** 계속 책임진다. 근거 전문은 `docs/prioritization-and-risks.md` D-039 참고.
     - **`(app)/crews/new`는 이 레이아웃 밖이다** — `[crewId]`의 형제 세그먼트라 적용되지 않고(Next.js 동적 세그먼트 레이아웃은 형제에 적용 안 됨), 크루 개설 시점엔 "그 크루의 멤버"라는 개념 자체가 아직 없어 걸리면 안 된다.

## Server Action 폼 상태 관리

폼이 Server Action 결과(성공·오류·pending)를 화면에 반영하는 방법은 **성공했을 때 이 페이지에
남아 있는가**로 가른다(7일차, Task 020A 교차검증에서 DESIGN이 정리 제안 → 팀장 승인).

- **성공 시 다른 곳으로 리다이렉트하는 폼**(예: `LoginForm`·`SignupForm`) → `useActionState`.
  성공 후에는 이 컴포넌트가 더 이상 화면에 없으므로 "성공하면 로컬 상태를 정리한다" 같은
  후처리가 필요 없다.
- **성공 후 같은 화면에 남아 입력만 비우거나 목록을 갱신하는 폼**(예: `Composer`, FR-051) →
  `useTransition` + 수동 로컬 상태(`useState`로 값·에러를 직접 관리하고, 액션 호출·결과 처리를
  `startTransition`의 비동기 콜백 안에서 한다). **이유**: "성공하면 입력창을 비운다"를
  `useActionState`의 반환 `state`를 지켜보는 `useEffect`로 구현하면
  `react-hooks/set-state-in-effect` 린트 에러가 난다 — effect 안에서 동기적으로 setState하는
  패턴은 React가 명시적으로 비권장한다(공식 안내: "Subscribe for updates ... calling setState in
  a callback function when external state changes"). 전송 결과를 아는 시점이 이미 이벤트
  핸들러(폼 `action`)의 비동기 콜백 안이므로, 그 자리에서 바로 처리하면 이 문제가 생기지 않는다.
  실제 코드는 `src/components/chat/Composer.tsx` 참고.

이 팀이 반복해 지적받은 것은 두 방식 중 어느 쪽이 맞는지가 아니라 **기준이 문서화돼 있지
않았다는 점**이다 — 다음에 폼을 만들 때는 위 두 갈래 중 어디 해당하는지만 먼저 정하면 된다.

## `/sample` 4상태 규칙

- 접근 경로는 **`/sample`**(로케일 세그먼트 없음, D-011).
- 쇼케이스는 `src/app/sample/page.tsx`. 카테고리 섹션 + 앵커 내비 구조.
- **컴포넌트를 새로 만들 때마다 여기 등록한다.** 등록을 미루면 쇼케이스가 실제 컴포넌트 목록과 어긋난다(R-006 신호).
- 각 컴포넌트는 **기본·로딩·빈·오류** 4상태를 토글로 노출한다. "오류"에는 네트워크 실패뿐 아니라 **도메인 오류**(RLS 403, 정원 마감, 동시 수정 충돌)를 포함한다(D-030 ③).
- 뷰포트 확인은 프리뷰 프레임 안에서 **컨테이너 쿼리**(`@container` + `@sm:`/`@lg:`)로 한다. Tailwind의 `sm:`/`lg:`는 뷰포트 기준이라 프레임 폭만 줄여서는 재배치되지 않는다.
  - **따라서 도메인 컴포넌트는 컨테이너 쿼리로 짠다.** 그래야 `PreviewFrame`의 폭 토글이 실제 검증 도구가 되고, 같은 컴포넌트를 좁은 슬롯과 넓은 본문에 함께 쓸 수 있다.
  - **앱 셸 4종은 의도적 예외로 뷰포트 기준(`md:`)이다** — "데스크톱은 헤더 링크, 모바일은 하단 탭바"는 기기에 대한 판단이지 부모 상자 폭에 대한 판단이 아니고, 실제 앱에서 셸의 부모는 항상 뷰포트다. 셸의 헤더↔탭바 전환은 브라우저 창을 실제로 줄여서 확인한다.

## 디자인 토큰 규칙 (D-038)

전체 근거·실측 수치는 [`design/design-language.md`](./design/design-language.md). 컴포넌트를 만들 때 어기기 쉬운 것만 여기 옮겨 둔다.

- **색·간격·폰트에 임의 값을 쓰지 않는다.** `globals.css`의 `@theme inline` 토큰을 쓴다 — 다크모드 대응이 토큰에 걸려 있다.
- **UI 크롬에 유채색을 쓰지 않는다.** 화면의 채도는 크루 12색(데이터)이 가져간다. 예외는 `--destructive`뿐이다.
- **크루색은 `--background`·`--card` 표면 위에만 놓는다.** `--muted`/`--secondary`/`--accent` 위에서는 crew-3(pink)·crew-6(periwinkle)이 **2.99**로 3:1(NFR-018)을 깬다(실측).
- **크루색을 채울 때는 글자색을 짝으로 가져온다.** `crewCertaintyVars(index)`가 채움색과 그 위 글자색을 함께 돌려준다 — 짝을 깨면 4.5:1을 어기고, 그 실수는 라이트 모드 테스트만으로는 드러나지 않는다.
- **모노(`font-mono`)에 한글을 넣지 않는다.** Geist Mono에 한글 글리프가 없어 OS 폰트로 폴백되고 한 줄에서 서체가 갈린다. 한글이 섞이면 **sans + `.tnum`**.
- **상태를 색만으로 전달하지 않는다**(WCAG 1.4.1). 확정성 3단계는 점선/실선/채움이라는 형태 차이를 함께 갖는다.
- **다크 값을 고칠 때는 `@media (prefers-color-scheme: dark)`와 `.dark` 두 블록을 함께 고친다.** 명시적 토글이 아직 없어(I-020) 두 벌을 손으로 동기화하는 상태다.

---

## ESLint로 강제하는 것 (`eslint.config.mjs`)

ESLint 규칙만으로 아키텍처를 완전히 강제할 수는 없다(파일명 케이스 검사는 별도 플러그인이 필요하며 이 Task의 파일 담당 경계상 `package.json`을 건드릴 수 없어 보류 — 아래 "남은 리스크" 참고). 대신 **import 방향**은 규칙으로 강제했다.

**아래 표가 zone 1~8(6b 포함) 전체의 단일 소스다 — I-088(21일차, DESIGN 발견) 해소.** zone 7·8은
신설 시점에, zone 3의 `noProfileHandleOracleRelative` 추가와 zone 6→6/6b 분리는 21일차 변경
시점에 각각 이 표에 등재되지 않은 채로 남아 있었다(zone 1~6만 반영된 옛 표). **새 zone을
추가하거나 기존 zone의 `files`/`ignores`/차단 대상을 바꾸면 반드시 이 표도 같은 커밋에서
갱신한다** — `eslint.config.mjs` 상단 주석에도 같은 문구를 남겼다. zone 번호는 파일 안 등장
순서(파일 내 실제 배치 순서, 선언 순서와 다를 수 있다 — 예: zone 7·8이 zone 3과 zone 4 사이에
온다)를 그대로 따른다.

| zone | 대상(`files`) | 제외(`ignores`) | 차단 대상 | 근거 |
| --- | --- | --- | --- | --- |
| 1 | `src/lib/rules/**` | — | `react`·`react-dom`, `next`·`next/*`, `@/app/*`, `@/components/*`, `@/lib/data/*`, `@/lib/realtime/*`, Supabase 클라이언트(`@supabase/supabase-js`·`@supabase/*`) | NFR-036, R-015, CON-05 — 순수 함수는 프레임워크·데이터 레이어에 의존하지 않는다 |
| 2 | `src/lib/data/mock/**` | — | `@/lib/data/supabase/*`, Supabase 클라이언트 | NFR-034 — Mock 구현은 실데이터 구현을 참조하지 않는다 |
| 3 | `src/lib/data/supabase/**` | — | `@/lib/data/mock/*`, `profile-handle-oracle`(모든 상대경로 표기·확장자 변형, `noProfileHandleOracleRelative`) | NFR-034 — 실데이터 구현은 Mock 구현을 참조하지 않는다(Supabase 클라이언트는 여기서 허용). `profile-handle-oracle` 제한은 I-074(21일차) 재발 방지 — service-role로 RLS를 완전 우회하는 `getProfileByHandle`을 이 파일 밖에서 상대경로로 import하지 못하게 막는다 |
| 7 | `src/lib/auth/**` | — | `@/lib/data/mock/*`, `@/lib/data/supabase/*`(단 `server`·`client`·`env` 3개는 예외 허용) | Task 030(17일차, CREW) — 인증 세션은 `lib/data/contracts.ts`의 CON-05·CON-06(이 레이어는 쿠키·세션·요청 객체를 직접 읽지 않는다) 때문에 데이터 배럴에 섞을 수 없다. `src/lib/realtime/**`와 대칭인 독립 계층. 클라이언트 팩터리 3개만 재사용하고 도메인 구현 딥 임포트는 막는다 |
| 8 | `src/lib/audit/**` | — | `@/lib/data/mock/*`, `@/lib/data/supabase/*`(단 `server`·`client`·`env` 3개는 예외 허용) | Task 038(18일차, BOARD) — 감사 로그·레이트 리밋은 zone 7과 같은 이유(CON-05·CON-06)로 데이터 배럴 밖에 있다. `audit_logs`·`handle_search_attempts` 둘 다 `anon`/`authenticated` 완전 거부 RLS라 service-role 클라이언트가 필요하다 |
| 4 | `src/components/**/*.tsx`(표현) | `src/components/ui/**`, `src/components/**/*Container.tsx` | `@/lib/data/*`, `@/lib/realtime/*`, Supabase 클라이언트 | D-030 ① — 표현 컴포넌트는 데이터를 props로만 받는다 |
| 5 | `src/components/ui/**/*.tsx`, `src/components/**/*Container.tsx` | — | Supabase 클라이언트, `@/lib/data/mock/*`·`@/lib/data/supabase/*`·`@/lib/realtime/mock`·`@/lib/realtime/broadcast`(딥 임포트) | D-030 ② — 컨테이너도 배럴(`@/lib/data`, `@/lib/realtime`)만 통해 접근한다 |
| 6 | 그 외 `src/**`(예: `app/`, `lib/actions`, `lib/utils.ts`, `hooks`, **`src/components/**`의 `.tsx`가 아닌 일반 TS 모듈** — 예: `components/shell/get-auth-session.ts`) | `src/lib/rules/**`·`src/lib/data/**`·`src/lib/realtime/**`·`src/lib/auth/**`·`src/lib/audit/**`(zone 1·2·3·7·8과 겹치지 않게), `src/components/**/*.tsx`(zone 4·5와 겹치지 않게), `lib/actions/check-handle-availability.ts`·`lib/actions/invite-crew-member.ts`(zone 6b로 이관) | Supabase 클라이언트, `@/lib/data/mock/*`·`@/lib/data/supabase/*`·`@/lib/realtime/mock`·`@/lib/realtime/broadcast`(딥 임포트), `@/lib/data`에서 `getProfileByHandle` named import(`noGetProfileByHandleFromBarrel`) | R-015 신호("컴포넌트 파일에서 Supabase 클라이언트를 직접 import") 예방을 전역 적용. `.ts` 파일은 D-030 ①의 표현/컨테이너 분리 대상이 아니므로 이 일반 규칙으로 떨어진다(3일차 프로브 검증 기록 참고). `getProfileByHandle` 제한은 I-074 — 허용된 두 진입점만 zone 6b로 예외 처리한다 |
| 6b | `lib/actions/check-handle-availability.ts`, `lib/actions/invite-crew-member.ts` | — | zone 6과 동일(Supabase 클라이언트, mock/realtime 딥 임포트) 단 `getProfileByHandle` 제한만 제외 | I-074(21일차) — `getProfileByHandle`(익명 오라클 위험)을 호출해도 되는 실제 두 소비자만 zone 6의 새 제한에서 뺀다 |

`src/lib/data/supabase/**`와 `src/lib/realtime/**`(구현체 파일)만 Supabase 클라이언트 import가 허용된다(zone 7·8은 클라이언트 팩터리 3종만 예외적으로 재사용한다).

---

## 남은 리스크·다음 회차로 넘길 사항

- **회차 운영 중 `docs/ISSUES.md`·`docs/prioritization-and-risks.md` 동시편집·번호(`I-*`/`D-*`)
  부여 규칙은 이 파일의 범위 밖이다.** 코드 디렉터리·명명 규약이 아니라 회차 운영 절차이므로
  `.claude/skills/team-day-runner/SKILL.md` **§0-1**이 단일 소스다(28일차, I-138·I-140). 여기에
  중복 등재하지 않는다.
- **파일명 케이스(kebab-case/PascalCase) 자동 검사는 아직 없다.** `eslint-plugin-unicorn`의 `filename-case`나 유사 플러그인이 필요한데 `package.json` 변경은 CREW 담당이라 이 Task에서는 추가하지 않았다. 명명 규약은 현재 **문서 + 코드 리뷰**로만 지켜진다. 새 devDependency가 필요하면 CREW와 조율해 별도 Task로 추가할 것을 제안한다.
- **`lib/realtime`의 구현체 파일명(`mock.ts`/`broadcast.ts`)은 이 Task에서 확정한 제안이다.** `src/lib/realtime/`(README.md만)까지는 이번 Task에서 스캐폴드했지만 실제 `index.ts`·`mock.ts`·`broadcast.ts`는 CORE의 Task 020A~020C(채팅, 9~13주차)에서 채운다. 이름이 달라지면 이 문서와 `eslint.config.mjs`의 딥 임포트 차단 패턴(`@/lib/realtime/mock`, `@/lib/realtime/broadcast`)을 함께 갱신해야 한다.
- **`lib/data`의 20개 엔티티를 `mock/`·`supabase/` 아래 파일 단위로 어떻게 나눌지(엔티티별 1파일 vs 도메인 묶음)는 Task 007이 정한다.** 이 문서는 두 최상위 디렉터리의 존재와 상호 비참조 규칙까지만 확정했다.
- **`src/lib/data/index.ts`(배럴)는 아직 존재하지 않는다.** 위 디렉터리 트리에 구체 파일명으로 적혀 있지만 실제로는 Task 007에서 만든다 — `lib/realtime/`의 `index.ts`·`mock.ts`·`broadcast.ts` 3파일과 같은 성격의 "아직 없음" 항목인데 최초 버전에서는 realtime 쪽만 고지하고 이쪽은 빠뜨렸었다(1일차 교차검증에서 DESIGN이 지적, 트리에 `[향후]` 표시로 정정). 이 배럴이 실제로 생기면 `mock/`·`supabase/`를 조립 import하는 코드가 되므로, **`eslint.config.mjs` zone 6의 `ignores`가 `src/lib/data/**` 전체(= 배럴 포함)를 제외하고 있다는 것을 Task 007 담당자가 알아야 한다** — 배럴이 `@/lib/data/mock/*`·`@/lib/data/supabase/*`를 import해도 zone 6에는 걸리지 않는다(zone 2·3은 여전히 mock↔supabase 상호 참조를 막는다). 1일차 교차검증에서 이 격리가 배럴 자체를 막고 있던 버그를 프로브로 확인·수정했다(아래 "ESLint 프로브 검증 기록" 참고).
- ESLint의 `no-restricted-imports`는 **정적 import 경로 문자열만** 검사한다. 동적 `import()`나 `require()` 우회, 혹은 배럴(`@/lib/data`) 내부에서의 재노출 실수는 걸러내지 못한다 — 리뷰에서 함께 확인해야 한다.
- ~~**`src/lib/crew-palette.ts`(DESIGN, 1일차에 이미 존재)가 이 규약과 위치가 어긋난다.**~~ **3일차(Task 009B)에 처리 완료.** CREW의 `hash(crewId) mod 12`(`crewColorIndex`)가 합류하면서 1일차 이월 결정을 실행했다: D-026 충돌 회피 판정 `resolveCrewColorCollision`은 `src/lib/rules/crew-color-hash.ts`로 이관했고(판정 로직이라 규약상 `lib/rules/` 몫), 팔레트 크기에 대한 나머지 연산 `normalizePaletteIndex`는 데이터 조회 함수 `getCrewColor`와 함께 `lib/crew-palette.ts`에 그대로 뒀다(데이터 모듈이 판정 모듈에 의존하는 방향을 피하기 위해 — 대신 `crew-color-hash.ts`가 `crew-palette.ts`에서 가져다 쓴다). 판단 근거 전문은 [`src/lib/rules/README.md`](../src/lib/rules/README.md)와 `crew-color-hash.ts`의 모듈 docstring에 있다.

### ESLint 프로브 검증 기록 (1일차 교차검증)

DESIGN이 지적한 "zone 6의 `ignores`가 `src/lib/data/mock/**`·`src/lib/data/supabase/**`만 제외하고 `src/lib/data/` 최상위(배럴)는 빼먹어, 배럴이 mock/supabase를 조립 import하는 순간 `noMockImpl`·`noSupabaseDataImpl`에 막힌다"는 지적을 실제 프로브 파일로 재현·수정 확인했다.

- **수정 전 재현**: `src/lib/data/index.ts`에 `@/lib/data/mock/thing`·`@/lib/data/supabase/thing`을 조립 import하는 코드를 만들면 두 줄 모두 `no-restricted-imports` 에러가 났다(배럴 자체가 원천 차단).
- **수정**: zone 6 `ignores`의 `"src/lib/data/mock/**"`·`"src/lib/data/supabase/**"` 두 줄을 `"src/lib/data/**"` 하나로 합쳐 `src/lib/realtime/**`(폴더 전체 제외)와 대칭을 맞췄다. mock↔supabase 상호 격리는 zone 2·3이 그대로 담당하므로 영향 없다.
- **수정 후 프로브 결과**(파일을 만들었다 지웠다 — 저장소에는 남기지 않음):
  - `lib/data/index.ts`가 `@/lib/data/mock/*`·`@/lib/data/supabase/*`를 조립 import → **에러 없음**(배럴 통과 확인).
  - `lib/data/mock/probe.ts`가 `@/lib/data/supabase/*`를 import → **여전히 에러**(mock↔supabase 격리 유지 확인).
  - `lib/data/supabase/probe.ts`가 `@/lib/data/mock/*`를 import → **여전히 에러**(격리 유지 확인).
  - `components/_probe/Probe.tsx`(표현, `*Container.tsx` 아님)가 `@/lib/data`를 import → **여전히 에러**(D-030 ① 유지 확인).
  - `components/_probe/ProbeContainer.tsx`가 `@/lib/data`(배럴)는 통과, `@/lib/data/mock/*`(딥 임포트)는 **여전히 에러**(D-030 ② "배럴만 허용" 유지 확인).
- **부수 수정**: 위 재현 과정에서 `noMockImpl`·`noSupabaseDataImpl`의 에러 메시지가 서로 바뀌어 있던 것도 함께 발견해 고쳤다(예: mock 디렉터리에서 supabase를 import했을 때 표시되는 문구가 "실데이터 구현은 Mock 구현을 참조하지 않는다"로 되어 있어 방향이 반대였다). 차단 대상(`group`)은 원래도 맞았으므로 기능적 오탐/누락은 없었고, 에러 메시지 문구만 방향에 맞게 정정했다.

### ESLint 프로브 검증 기록 (3일차, CREW 발견 → CORE 수정)

CREW가 DESIGN의 Task 011(`components/shell/`)을 검증하다 프로브로 실측한 구멍: zone 4·5는
`src/components/**/*.tsx`(또는 그 하위 패턴)만 매칭하는데, 옛 zone 6은 `ignores`에
`"src/components/**"`를 **확장자 제한 없이** 넣어 두었다. 그 결과 `src/components/` 아래
`.tsx`가 아닌 `.ts` 파일(당시 `auth-session.ts`·`get-auth-session.ts`·`nav-items.ts` 3개)이
zone 4·5·6 **어디에도 걸리지 않는 사각지대**였다 — 위반이 발견된 것은 아니고 강제 자체가
비어 있었다.

- **수정 전 재현**(CREW): `components/shell/_probe.ts`에 `@supabase/supabase-js` import →
  **에러 0건**. 같은 import를 `.tsx` 형제 파일이나 `src/lib/_probe.ts`에 넣으면 각각 에러
  2건 — 확장자 하나로 강제 여부가 갈렸다.
- **수정**: zone 6 `ignores`의 `"src/components/**"`를 `"src/components/**/*.tsx"`로 좁혔다.
  `.ts` 파일은 `<Name>.tsx`/`<Name>Container.tsx` 표현/컨테이너 분리(D-030 ①)의 대상이
  아니므로, `lib/actions`·`hooks`와 같은 "일반 TS 모듈" 취급(zone 6: Supabase 클라이언트·
  딥 임포트만 차단, `@/lib/data` 배럴은 허용)으로 떨어지는 것이 맞다고 판단했다 — 표현
  컴포넌트 수준의 전면 차단(zone 4)을 씌울 근거가 없다.
- **수정 후 프로브 결과**(파일을 만들었다 지웠다 — 저장소에는 남기지 않음):
  - `components/shell/_probe.ts`가 `@supabase/supabase-js`를 import → **에러 2건**(구멍 해소 확인).
  - `components/shell/_ProbePresentation.tsx`(표현, `*Container.tsx` 아님)가 `@/lib/data`를
    import → **여전히 에러**(zone 4 회귀 없음 확인).
  - `components/shell/_ProbeContainer.tsx`가 `@/lib/data`(배럴)는 통과, `@/lib/data/mock/*`
    (딥 임포트)는 **여전히 에러**(zone 5 회귀 없음 확인).
  - 기존 `auth-session.ts`·`get-auth-session.ts`·`nav-items.ts` 3개 파일 재검사 → **에러
    0건**(구멍이 있을 때부터 실제로는 금지 import를 하지 않고 있었다는 팀장 사전 확인과 일치,
    구멍을 막아도 새 위반이 튀어나오지 않음).
  - `npm run lint` 전체 재실행 → **0 에러·0 경고**(다른 파일에서 숨은 위반이 드러나지 않음).

## 리뷰 짝(DESIGN)이 볼 핵심 포인트

1. `eslint.config.mjs`의 6개 `files`/`ignores` 블록이 **서로 겹치지 않는지**(겹치면 flat config에서 나중 블록이 앞 블록의 같은 규칙을 통째로 덮어써 조용히 무력화된다) — 특히 `src/components/**` 관련 두 블록의 `ignores`.
2. 표현 컴포넌트 차단 대상에 `@/lib/data/*`뿐 아니라 `@/lib/realtime/*` 딥 임포트도 들어있는지 — D-030 ②가 ①만큼 새기 쉬운 지점이다.
3. `docs/CONVENTIONS.md`의 디렉터리 트리와 실제로 만든 빈 디렉터리(README.md 포함)가 **1:1로 일치하는지**.
4. ~~`src/lib/data/index.ts` 배럴이 zone 6에 막히는 문제~~ — **1일차 교차검증에서 DESIGN이 지적, 프로브로 재현·수정 확인 완료**("ESLint 프로브 검증 기록" 참고). 재검토 시 `src/lib/realtime/**`와 `src/lib/data/**`의 zone 6 `ignores`가 계속 대칭인지만 확인하면 된다.
4. ~~**`src/lib/crew-palette.ts`의 위치가 이 규약과 맞는지**~~ — **3일차 Task 009B에서 처리 완료**(위 "남은 리스크·다음 회차로 넘길 사항" 참고). 리뷰 시점에는 `lib/rules/crew-color-hash.ts`로 옮긴 판정 함수와 `lib/crew-palette.ts`에 남은 데이터·정규화 함수의 경계가 `lib/rules/README.md`의 근거와 일치하는지만 확인하면 된다.
