# 25일차 — AppShell 높이 체인 근본 수정 (I-118 · I-122 해소)

**작업자**: CORE · **일자**: 2026-07-29(25일차) · **배정 근거**: 팀장 — v0.1 로드맵 Task 0건,
24일차에 "19개 페이지 × 라이트/다크 × 3뷰포트 회귀 검증이 필요해 별도 회차가 적절하다"고 미룬
`AppShell.tsx` 높이 제약 수정을 이번 회차에 처리한다. 원 구현자(CORE, day-21)가 직접 진다.

## 0. 요약

`AppShell.tsx`(21일차 CORE 구현) 루트 `div`의 `min-h-full`이 상한 없는 최소 높이만 보장해,
자손(`MessageList.tsx`의 `overflow-y-auto` 컨테이너)이 실제로 clip되는 박스를 어디서도 얻지
못했다 — 그 결과 (I-118) 채팅 목록이 내부 스크롤 대신 페이지 전체를 늘려 문서 스크롤을
유발했고, (I-122) 하단 sentinel `IntersectionObserver`가 클리핑되지 않는 `root`를 받아 마운트
즉시·레이아웃 재계산마다 오탐 교차해 FR-055 AC2("최신까지 스크롤 → 읽음 지점 갱신")를 실질적으로
깨뜨렸다. 두 이슈는 같은 뿌리라 한 번에 고쳤다.

**수정**: `min-h-full` → `h-full`(정의된 높이)로 체인 세 지점을 함께 고치고, `flex-1`만으로는
부족한 지점에 `min-h-0`을 추가했다. `overflow`는 어디서도 `hidden`/`auto`로 바꾸지 않았다 —
그래서 채팅 외 18개 라우트는 오늘과 동일하게 문서 전체가 스크롤된다(아래 4절 실측).

## 1. 원인

CSS 백분율 높이는 조상이 "확정된 높이"(정의된 값 — 상한이 있는 값)일 때만 확정값으로
전파된다. `min-height`는 하한만 정할 뿐 확정 높이가 아니다 — 자손의 `height: 100%`가 이를
참조하면 스펙상 `auto`로 무너진다. 개편 전 체인:

| 요소 | 파일 | 개편 전 | 문제 |
| --- | --- | --- | --- |
| `<html>` | `(shell)/layout.tsx` | `h-full` | 이미 확정 높이(뷰포트 기준 특례) — 문제 없음 |
| `<body>` | `(shell)/layout.tsx` 104행 | `min-h-full` | 확정 높이 아님 — 여기서 체인이 끊김 |
| `AppShell` 루트 `div` | `AppShell.tsx` 75행 | `min-h-full` | 위가 이미 끊겼으므로 의미 없이 반복 |
| `#main-content` 래�퍼 `div` | `AppShell.tsx` 96~99행 | `flex flex-1 flex-col`(`min-h-0` 없음) | flex 아이템의 기본 최소 높이가 `auto`(콘텐츠 크기)라, 체인이 확정돼도 콘텐츠가 배분량보다 길면 다시 늘어남 |
| `<main>`(채팅 페이지) | `crews/[crewId]/chat/page.tsx` 20행 | `min-h-0 flex-1 flex-col` | **이미 맞게 짜여 있었다** — 원인이 아니다 |
| `MessageRoomContainer` 루트 | `MessageRoomContainer.tsx` 414행 | `flex min-h-0 flex-1 flex-col` | **이미 맞게 짜여 있었다** |
| `MessageList` 스크롤 컨테이너 | `MessageList.tsx` 235행 | `min-h-0 flex-1 overflow-y-auto` | **이미 맞게 짜여 있었다 — 다만 위 세 곳이 끊겨 있어 확정 높이를 받지 못했다** |

즉 채팅 쪽 컴포넌트(`MessageList`·`MessageRoomContainer`·chat `page.tsx`)는 애초에 올바르게
`min-h-0 flex-1 overflow-y-auto` 패턴으로 짜여 있었다 — 결함은 오직 그 위 셸 계층(`body`·
`AppShell` 루트)에 있었다.

## 2. 수정

- `src/app/(shell)/layout.tsx` 104행: `<body className="min-h-full flex flex-col">` →
  `<body className="h-full flex flex-col">`
- `src/components/shell/AppShell.tsx` 75행: 루트 `div`의 `min-h-full` → `h-full`
- `src/components/shell/AppShell.tsx` 96~99행: `#main-content` 래퍼에 `min-h-0` 추가
  (`flex flex-1 flex-col` → `flex min-h-0 flex-1 flex-col`)

`html`은 이미 `h-full`이었으므로 손대지 않았다. `overflow`는 어느 지점에서도 `hidden`이나
`auto`로 바꾸지 않았다 — body에 `overflow: hidden`을 주면(전파 규칙상 뷰포트까지 스크롤이
막힌다) 채팅 외 18개 라우트가 전부 문서 스크롤에 의존하고 있어(아래 4절) 그 라우트들의 콘텐츠가
전부 잘려 보이는 훨씬 큰 회귀가 났을 것이다 — 이번 수정은 **오직 명시적으로 `min-h-0 flex-1
overflow-y-auto`를 선언한 후손(채팅 트리)만** 확정 높이를 받아 자체 스크롤 컨테이너가 되고,
그 선언이 없는 다른 라우트는 예전처럼 문서가 스크롤된다.

## 3. 실측 — I-118 · I-122 (프로덕션 빌드, `npx next start -p 3244`, 412×915, Chromium)

로그인 계정: `chopin0625@gmail.com`(owner, 방 `b89069ce-…`에 기존 읽음 행 있음) ·
`0625chopin@gmail.com`(handle `chopin_0625`, 이 방에 읽음 행 없음 — I-122 24일차 실측과 동일
조건). 임시 메시지 40건(`client_key like 'core-i118i122-%'`)을 방 `b89069ce-…`(주말 러닝
클럽)에 SQL로 추가해 총 51건으로 만들어 컨테이너를 화면 밖까지 늘렸다. 스크립트는
`chromium`(Playwright, `node_modules` 직접 사용, 격리된 프로세스)로 실행했다 — 세션 시각은
스크립트 로그 순서 그대로다.

### 3.1 음성 대조 — 짧은 방(11건, 미패딩)

```json
{"windowScrollY":0,"documentScrollHeight":915,"innerHeight":915,"messageCountInDom":11,
 "clippingScrollContainerCount":1,
 "clippingContainer":{"scrollHeight":820,"clientHeight":660,"scrollTop":160}}
```

`documentScrollHeight === innerHeight`(915) — 페이지 자체는 스크롤되지 않는다.
`clippingScrollContainerCount === 1` — `MessageList` 컨테이너가 실제로 클리핑하는 스크롤
컨테이너가 됐다(개편 전엔 `docs/ISSUES.md` I-118 실측대로 **0개**였다). 짧은 방도 헤더·탭바가
고정된 채 메시지 영역만 스크롤되는 게 확인됐다 — I-118 §2가 지적한 "앱처럼 안 보인다"는
부수 효과도 함께 없어졌다.

### 3.2 양성 대조 — 긴 방(51건), 앵커 없이 최초 진입(정상 "최하단 점프" 경로)

| 시점 | `windowScrollY` | 컨테이너 `scrollTop` | DB `last_read_at` |
| --- | --- | --- | --- |
| 진입 전 | — | — | `null`(읽음 행 없음, 확인됨) |
| 마운트 0ms | 0 | 0 | `null` |
| +1500ms(스크립트가 스크롤 조작 안 함) | 0 | 3600(=scrollHeight−clientHeight, 자동 최하단 도달) | `2026-07-29T13:49:53.695+00` |
| +4500ms | 0 | 3600 | `2026-07-29T13:49:53.695+00`(불변) |
| 수동 휠 스크롤 후 | 0 | 3600 | `2026-07-29T13:49:53.695+00`(불변) |

이 경로는 `chat-scroll-storage`에 저장된 앵커가 없는 "최초 진입" 케이스라, `MessageList.tsx`
100~116행의 설계대로 `el.scrollTop = el.scrollHeight`로 **컴포넌트 자신이** 즉시 최하단까지
스크롤한다 — 이건 FR-051 AC3가 요구하는 정상 동작이고 `onReachLatest` 독스트링도 이 경로에서
한 번 호출되는 걸 명시적으로 허용한다. 그래서 이 케이스만으로는 "마운트만으로 읽음 처리"와
"정상적으로 최신에 도달해서 읽음 처리"를 구분하지 못한다 — 아래 3.3이 그 구분을 만든다.

### 3.3 엄밀 대조 — 중간 지점으로 복원(최하단 아님), 실제 스크롤 전후 대조

같은 방·같은 계정, 읽음 행을 다시 지운 뒤 `sessionStorage`에 `chat-scroll-storage` 앵커를
미리 심어(상세 페이지에서 돌아오는 FR-053 AC2 시나리오 재현) 목록 **중간**의 패딩 메시지로
복원되게 했다:

| 시점 | `windowScrollY` | `documentScrollHeight` | 컨테이너 `scrollTop` (최하단은 3600) | DB `last_read_at` |
| --- | --- | --- | --- | --- |
| 리셋 직후 | — | — | — | `null` |
| 앵커 복원 +1200ms | 0 | 915(=innerHeight) | **608**(중간) | **`null`** |
| +4200ms(스크롤 안 함) | 0 | 915 | 608 | **`null`**(불변 — 개편 전이었다면 마운트만으로 이미 갱신됐을 지점) |
| 실제 휠 스크롤로 하단 도달 | 0 | 915 | **3600**(최하단) | `2026-07-29T13:51:15.571+00`(**여기서 처음** 갱신) |

이것이 I-122의 핵심 반증이다 — **컨테이너가 최하단이 아닌 중간 지점에 있는 동안은 몇 초를
기다려도 읽음 지점이 갱신되지 않고, 사용자가 실제로 끝까지 스크롤한 순간에만 갱신된다.**
개편 전(24일차 실측, `docs/ISSUES.md` I-122)에는 컨테이너가 전혀 클리핑하지 않아
`getBoundingClientRect().top`이 5,153px(뷰포트 915px 밖)이어도 sentinel이 마운트 즉시 "교차
중"으로 잡혔다 — 그 결함이 사라졌다.

`windowScrollY`는 세 시나리오 전부 시종일관 **0**, `documentScrollHeight`도 **915(=`innerHeight`)로
고정** — 채팅 페이지에서는 문서가 전혀 스크롤되지 않고 오직 `MessageList` 내부 `scrollTop`만
움직인다는 것을 직접 확인했다.

### 3.4 FR-053 AC2 부수 확인 — 앵커 저장(스크롤 리스너)도 되살아났다

I-118 §"영향 1"이 남긴 우려("컨테이너 자체가 스크롤되지 않으므로 앵커 저장 리스너가 사실상
발화하지 않을 가능성")도 함께 확인했다. 짧은 방(11건, DB 변경 없음)에서 자연 오버플로(약
160px)만으로 위로 스크롤하자:

- 스크롤 전 `sessionStorage` 앵커: `6c286969-e397-40bc-ad23-877f849201d9`
- 위로 스크롤(`scrollTop → 0`) 후: `546627d4-bf51-41cd-a537-00e4498ae06b`(다른 메시지로 갱신됨)

컨테이너의 `'scroll'` 이벤트가 이제 실제로 발화해 `chat-scroll-storage.ts`의
`saveScrollAnchor`가 갱신된다 — FR-053 AC2도 이번 수정으로 함께 되살아났다(별도 코드 변경
없이, 순수하게 높이 체인이 확정된 결과). 3.3의 "중간 지점 복원" 자체도 이 메커니즘이 정상
작동한다는 재확인이다.

### 3.5 보완 — top sentinel(위로 이어 로드, FR-051 AC3)도 같은 메커니즘으로 정상 확인 (팀장 지시, 25일차 2차)

`MessageList.tsx` 195~203행의 위쪽 sentinel도 195행에서 `root: scrollRef.current`를 똑같이
쓴다. "같은 원인을 공유하니 아마 같이 고쳐졌을 것"이라는 추정만으로 1차 보고를 냈다가 팀장이
반려했다 — 24일차에 정확히 그런 추정("충족")이 두 번 뒤집힌 전례가 있어서다. 원시값으로
재확인했다.

**환경 교정**: 최초 시도는 팀원 공용 `next dev`(3050)를 그대로 재사용했으나(팀장 "이미 떠
있으면 죽이지 말고 붙여 쓰라"), 테스트 도중 다른 팀원의 파일 저장으로 Fast Refresh가 실행되는
로그(`[HMR] connected`, `[Fast Refresh] rebuilding`)가 찍히면서 결과가 실행마다 달라지는
잡음이 나왔다(로드된 메시지 수·순서가 매 실행 다르게 관측됨). 원인이 내 수정인지 HMR 잡음인지
구분할 수 없어, **격리된 프로덕션 빌드(`npx next start -p 3246`, 나만 쓰는 포트, 다른 팀원
서버는 손대지 않음)로 바꿔 재실측**했다 — 아래 수치는 전부 이 격리 환경 값이다.

방 `b89069ce-…`에 임시 메시지 100건을 추가해(`client_key like 'core-i051-top-%'`) 총 111건
(`MESSAGE_PAGE_SIZE=50` 초과 → `hasMore=true`)으로 만들고, `chopin0625@gmail.com`으로 최초
진입(앵커 없음 → 자동 최하단 정착)했다:

| 시점 | `messageCountInDom` | `scrollTop` | `scrollHeight` | 이 구간 POST(서버 액션) 수 |
| --- | --- | --- | --- | --- |
| 마운트+정착(+1000ms, 최하단) | 50 | 2800(=scrollHeight−clientHeight) | 3460 | — |
| **음성 대조**: +4000ms, 스크롤 안 함 | 50(불변) | 2800(불변) | 3460(불변) | **0** |
| **양성 대조**: 컨테이너 위로 스크롤(마우스 휠, 맨 위까지) +1500ms | **111**(전체 로드됨) | 0(맨 위) | 7620 | **2**(50건씩 두 배치 — 남은 61건을 채우려면 2회 필요, 정확히 일치) |
| +4500ms 추가 대기 | 111(불변) | 0(불변) | 7620(불변) | — |

응답 본문에서 서버 액션이 실제 이전 메시지 데이터(`items: [...]`)를 반환한 것도 확인했고,
콘솔 에러·Next.js 오류 오버레이 모두 없음. **음성 대조(스크롤 안 함 → 0건 로드)와 양성
대조(위로 스크롤 → 정확히 남은 만큼 로드, 최종 DOM 개수가 DB 총량 111과 정확히 일치) 둘 다
원시값으로 확인됐다** — top sentinel도 스크롤 없이는 발화하지 않고, 실제 스크롤에만 반응한다.

**"수정 전" 대조는 하지 못했다** — `git stash`는 다른 팀원이 같은 워킹트리에서 동시 작업 중이라
지침대로 쓰지 않았고, 대안으로 `git worktree add`(공용 트리 비파괴)로 개편 전 커밋
(`930d946`, day-24 tip)을 격리 검토하려 했으나 Turbopack이 워크트리 밖(`/mnt/e/.../node_modules`)
심링크를 거부해(`Symlink ... points out of the filesystem root`) 빌드가 안 됐고, `node_modules`
전체 복사(578MB)는 이번 보완의 비용 대비 낮은 가치로 판단해 포기했다(워크트리는 정리함,
`git worktree list`로 원래 상태 확인). **판정은 수정 후 상태에 대해서만 내린다**: 위 표가
직접적인 증거이고, 메커니즘상 근거도 있다 — top sentinel은 bottom sentinel과 똑같이
`{ root: scrollRef.current }`를 쓰므로, 개편 전 컨테이너가 전혀 클리핑하지 않던 상태
(I-118·I-122 3.2·3.3의 실측, `scrollHeight === clientHeight`)에서는 root의 바운딩 박스가
전체 문서 콘텐츠 높이를 덮어 top sentinel도 마운트 즉시 "교차 중"으로 잡혔을 것으로 추정된다
— 다만 이건 **추정이지 실측이 아니다**, 그렇게 명시해 남긴다.

### 3.6 정리(테스트 데이터 원복, 두 차례 종합)

```
-- 1차(bottom sentinel, I-118/I-122 본 실측)
delete from chat_messages where room_id='b89069ce-…' and client_key like 'core-i118i122-%';  -- 40건 삭제
delete from chat_room_reads where room_id='b89069ce-…' and profile_id='fb70ff1c-…'(chopin_0625);

-- 2차(top sentinel 보완, 팀장 지시)
delete from chat_messages where room_id='b89069ce-…' and client_key like 'core-i051-top-%';  -- 100건 삭제
-- chopin0625가 패딩된 방에 실제로 진입해 최하단에 정착하며 last_read_at이 정당하게 전진했다 —
-- 원래 기준값(11:28:44.601+00)으로 되돌림(테스트 흔적을 남기지 않기 위함, 아래 확인).
update chat_room_reads set last_read_at='2026-07-29 11:28:44.601+00'
  where room_id='b89069ce-…' and profile_id='30f44dd9-…'(chopin0625);
```

재조회 확인: `msg_count=11`(시작 전과 동일), `chopin0625`의 기존 읽음 행 `last_read_at=
2026-07-29 11:28:44.601+00` 불변(I-122 24일차 기록과 일치), `chopin_0625`의 테스트용 읽음 행
0건(깨끗이 삭제됨).

### 3.7 BOARD 변경(`MessageBubble.tsx`, I-117) 반영 후 재확인 (팀장 지시, 25일차 3차)

BOARD가 같은 파일 트리에서 `MessageBubble.tsx`에 신고 아이콘(`ReportDialog
triggerVariant="icon"`)을 상대 메시지에 추가했다 — 항목 높이·구조 변화가 §3.3의 엄밀 대조
결과를 깨뜨리지 않는지 같은 시나리오로 재실행했다(격리 프로덕션 빌드, 방 `b89069ce-…`에
임시 40건 재패딩 → 총 51건, `chopin_0625`로 중간 앵커 복원):

| 시점 | `scrollTop`(최하단 3600) | `windowScrollY` | DB `last_read_at` |
| --- | --- | --- | --- |
| 중간 앵커 복원 +1200ms | **608**(§3.3과 완전히 동일) | 0 | `null` |
| +4200ms, 스크롤 안 함 | 608 | 0 | `null`(불변) |
| 실제 하단 스크롤 후 | **3600**(§3.3과 완전히 동일) | 0 | `2026-07-29T14:26:48.328+00`(여기서 처음 갱신) |

`scrollTop`이 608→3600으로 §3.3과 **자릿수까지 동일하게** 재현됐다 — BOARD의 변경이 높이
계산에 아무 영향을 주지 않았다는 뜻이다. 부가 확인: `document.querySelectorAll('button
[aria-label="신고"]')`가 45개 관측돼(상대 메시지에만 붙는다, `!isOwn`) 신고 아이콘 자체가
정상 렌더되고 있음도 같이 확인했다. `data-message-id`는 두 루트 모두 그대로라 앵커 복원
(608로 정확히 착지)도 영향 없음. 테스트 데이터(임시 40건·읽음 행) 원복 확인.

## 4. 19라우트 1차 회귀 스모크 (라이트·다크, 412×915)

정밀 회귀는 DESIGN 교차검증 몫이다 — 여기서는 콘솔/페이지 에러와 "다른 라우트는 여전히 문서
스크롤에 의존하는가"만 확인했다. `chopin0625` 로그인, 아래 라우트를 라이트·다크 각각 방문:

`/`·`/login`·`/signup`·`/home`·`/crews`·`/crews/{id}`·`/crews/{id}/chat`·`/crews/{id}/board`·
`/crews/{id}/members`·`/crews/{id}/settings`·`/crews/new`·`/calendar`·`/notifications`·
`/invitations`·`/settings`·`/admin`

전부 `header`·하단 탭바 렌더 확인, 콘솔 에러 0건(`/admin`의 404는 `chopin0625`가
`is_system_admin`이 아니라 `(app)/admin/layout.tsx` 게이트가 의도적으로 막은 것 — 이번 수정과
무관, `AdminReportsPage` 독스트링 참고). 콘텐츠가 뷰포트보다 긴 라우트는 여전히 문서 전체가
자란다 — 예: `/crews`(`documentScrollHeight=2559`)·`/settings`(2919)·`/crews/{id}/board`
(1488)·`/calendar`(1131)·`/crews/{id}/settings`(1046) — 전부 `innerHeight=915`보다 크게
나와 **문서 스크롤이 여전히 살아 있음**을 확인했다(3절이 확인한 "채팅만 내부 스크롤, 나머지는
그대로"라는 설계 의도와 일치). 짧은 라우트(`/`·`/login`·`/home`·`/crews/{id}` 등)는
`documentScrollHeight === innerHeight`로 정확히 들어맞았다.

라이트/다크 전환은 `<html>` 클래스(`light`/`dark`)가 두 테마 모두에서 정상 반영됨을
`documentElement.className`으로 확인했다(스크린샷 단위 육안 대조는 하지 않았다 — 그건
DESIGN 교차검증 범위로 남긴다).

## 5. 검증

- `npx tsc --noEmit` 클린.
- `npm run lint`(터치한 파일 포함) 클린.
- `flock /tmp/mo_im_build.lock -c "npm run build"` 성공, 21개 라우트 전부 정상 생성.
- `npm test`는 이번 변경(레이아웃 CSS 클래스)과 무관해 별도로 돌리지 않았다 — 대상 3개
  순수 함수 모듈(`quorum.ts`·`poll-decision.ts`·`poll-eligibility.ts`)은 손대지 않았다.

## 6. 남은 리스크 · 다음 회차로 넘기는 것

- **top sentinel(위로 이어 로드, FR-051 AC3)은 25일차 2차 보완에서 원시값으로 확인 완료**
  (§3.5) — 음성 대조(스크롤 없이 4초, 0건 로드)·양성 대조(위로 스크롤, 2회에 걸쳐 남은
  61건 전부 로드, 최종 DOM 개수 111이 DB 총량과 정확히 일치) 둘 다 통과. 다만 "개편 전
  상태"와의 직접 대조는 하지 못했다(`git worktree`로 시도했으나 Turbopack이 워크트리 밖
  `node_modules` 심링크를 거부해 빌드 불가, 578MB 전체 복사는 비용 대비 낮은 가치로
  포기) — 판정은 수정 후 상태의 실측만 근거로 한다.
- **DESIGN 교차검증(정밀 회귀)이 아직이다** — 이 문서 4절은 콘솔 에러·문서 스크롤 여부만
  보는 1차 스모크다. 실제 시각 회귀(레이아웃 깨짐 스크린샷 비교)는 하지 않았다.
- **`/sample`은 가볍게만 확인했다** — `/sample`은 `AppShell`을 `showSkipLink=false`로 여러 번
  데모 렌더하는 별도 루트 레이아웃(`sample/layout.tsx`, 자기 `<body>`가 따로 있어
  `(shell)/layout.tsx`의 `body` 변경 영향을 받지 않는다)이다. `AppShell.tsx` 자체 변경(루트
  `div` `h-full`·`#main-content` `min-h-0`)은 `/sample`에도 적용되므로 1280×900에서 로드해
  200·콘솔 에러 0건·`h1`/`h2` 33개(쇼케이스 섹션 전부) 정상 렌더를 확인했다 — 다만 각 데모
  인스턴스가 실제로 내부 스크롤 데모(있다면)까지 의도대로 보이는지 항목별 시각 대조는
  하지 않았다. 정밀 확인은 다음에 `/sample`을 만지는 사람 몫으로 남긴다.
