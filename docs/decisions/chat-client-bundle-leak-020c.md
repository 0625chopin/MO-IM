# 채팅 클라이언트 번들 `@/lib/data` 누수 수정 (Task 020C 산출물 핫픽스)

- **일자**: 2026-07-25(17일차)
- **담당**: CORE(A팀)
- **참조**: D-030 ①(표현/컨테이너 분리), FR-052·FR-053, R-016, `docs/CONVENTIONS.md`(zone 4·5·6)
- **선행 산출물**: `src/components/chat/**`(Task 020C), `src/lib/data/supabase/board.ts`(Task 031, DESIGN), `src/components/shell/get-auth-session.ts`(Task 030, CREW)

## 0. 배경 — 팀장 실측

Task 031(DESIGN)이 `@/lib/data` 배럴의 읽기 경로를 Supabase 실데이터로 교체하면서 배럴이
`createSupabaseServerClient`(`next/headers` 사용, 서버 전용)를 물게 됐다. `npm run build`가
깨졌고, 클라이언트 번들 쪽 import 트레이스는 다음과 같았다:

```
Client Component Browser:
  ./src/lib/data/supabase/server.ts        ← next/headers
  → ./src/lib/data/supabase/board.ts
  → ./src/components/chat/resolve-post-link-card.ts   ← @/lib/data 배럴을 import
  → ./src/components/chat/message-view-models.ts      ← 위 파일을 top-level import
  → ./src/components/chat/MessageRoomContainer.tsx    ← "use client"
  → ./src/components/chat/MessageRoomContainer.tsx [Server Component]
  → ./src/components/chat/MessageListContainer.tsx [Server Component]
  → ./src/app/(app)/crews/[crewId]/chat/page.tsx
```

별개로 서버 컴포넌트 쪽 트레이스(`supabase/auth.ts → get-auth-session.ts → layout.tsx`)도 있었으나
그건 CREW 소관이라 이 문서는 다루지 않는다.

## 1. 근본 원인(직접 확인)

`src/components/chat/MessageRoomContainer.tsx`(`"use client"`)가 다음처럼 값 하나(`createOptimisticTimelineItem`)
와 타입 둘을 같은 모듈에서 가져왔다:

```ts
import {
  createOptimisticTimelineItem,
  type ChatTimelineItem,
  type MessageViewModel,
} from "@/components/chat/message-view-models";
```

`createOptimisticTimelineItem`이 **값 import**라서 `message-view-models.ts` 모듈 전체가 평가돼야
했다. 그런데 그 파일은 최상단에서 `resolvePostLinkCard`(`resolve-post-link-card.ts`)를 값으로
import했고, `resolvePostLinkCard`는 다시 `@/lib/data` 배럴에서 `getBoardById`·`getPollByPostId`·
`getPostById`·`getProfileById`를 값으로 import했다. 배럴이 순수 Mock이던 동안은 서버 전용 API가
없어 증상이 드러나지 않았을 뿐, `"use client"` 컴포넌트의 import 그래프가 데이터 접근 배럴을
끌어들이는 구조 자체는 Task 020C 때부터 이미 새고 있었다 — 정확히 D-030 ①("표현 컴포넌트는
데이터를 props로만 받는다")이 막으려던 상황이다.

`MessageBubble.tsx`·`MessageList.tsx`(둘 다 표현 컴포넌트, `MessageList.tsx`는 자체로도
`"use client"`)는 `message-view-models.ts`에서 `type { ChatTimelineItem }`만 가져와 이미
type-only import였다 — TypeScript가 컴파일 시 완전히 지우므로 이쪽은 애초에 문제가 없었다.
누수는 `MessageRoomContainer.tsx` 한 곳, `createOptimisticTimelineItem` 값 import 하나였다.

## 2. 고친 구조 — 파일 분리(대안 비교)

DESIGN이 권고한 방향("`message-view-models.ts`를 서버 전용 함수와 클라이언트 안전 함수로
분리")을 그대로 따랐다. 검토한 다른 대안과 비교:

- **대안 A(기각) — `MessageRoomContainer`가 `resolvePostLinkCard`를 아예 안 쓰도록 lazy/dynamic
  import로 바꾼다.** 값 import를 `await import(...)`로 바꾸면 번들러가 분리는 하지만, 클라이언트
  컴포넌트가 여전히 "서버 전용 코드를 참조할 수 있다"는 구조 자체는 남는다 — 실수로 다시 top-level
  import로 되돌리면 재발한다. D-030 ①이 요구하는 "표현 컴포넌트는 조인된 값만 props로 받는다"는
  성질을 파일 경계로 강제하지 못한다.
- **대안 B(기각) — `createOptimisticTimelineItem`을 `MessageRoomContainer.tsx` 안으로 인라인한다.**
  타입(`MessageViewModel`·`ChatTimelineItem`)은 여전히 같은 파일에서 가져와야 하므로 근본 원인이
  안 없어진다. 게다가 `MessageBubblePreview`·`ChatMessageListPreview`(`/sample`)도 이 함수를 쓰므로
  중복이 생긴다.
- **채택 — 클라이언트 안전 타입/순수 함수와 서버 전용 조인 함수를 파일 단위로 분리한다.** 데이터
  조회(`resolvePostLinkCard` 호출)는 이미 컨테이너(`MessageListContainer.tsx`, 서버 컴포넌트) 또는
  `"use server"` Server Action(`send-chat-message.ts`·`load-earlier-messages.ts`·
  `resync-chat-messages.ts`) 안에서만 일어나고 있었다 — `MessageRoomContainer`(클라이언트 컨테이너)는
  이미 조인된 `MessageViewModel[]`을 props로 받거나 Server Action 반환값으로만 받는다. 즉 조회·조인은
  이미 D-030 ①이 요구하는 자리에 있었고, 문제는 순전히 "타입 정의와 서버 전용 함수가 한 파일에
  같이 있었다"는 **파일 배치**였다. 파일을 쪼개는 것만으로 로직 변경 없이 해결된다 — 가장 작은
  변경으로 가장 정확히 원인에 대응한다.

### 파일 구조

- **`src/components/chat/message-view-models.ts`(클라이언트 안전, 유지)**: `MessageViewModel`·
  `ChatTimelineItem`·`MessageDeliveryStatus`·`OptimisticMessageInput` 타입, `MESSAGE_PAGE_SIZE`
  상수, `createOptimisticTimelineItem`(순수 함수) — `@/lib/data`를 직접이든 전이적이든 import하지
  않는다. 모듈 docstring에 이 성질을 명시했다(향후 이 파일에 추가되는 코드가 다시 데이터 계층을
  끌어들이지 않도록 하는 가드레일).
- **`src/components/chat/resolve-message-view-model.ts`(신규, 서버 전용)**: `toMessageViewModel`
  하나만 옮겼다 — `resolvePostLinkCard`(`@/lib/data` 조회)를 호출하는 유일한 함수다. `resolve-*.ts`
  명명은 같은 디렉터리의 `resolve-post-link-card.ts`·`resolve-chat-viewer.ts`와 같은 패턴(서버 전용
  조회·조인 헬퍼)을 따른다.

### 호출부 갱신(로직 변경 없음, import 경로만)

- `src/components/chat/MessageListContainer.tsx`(서버 컴포넌트)
- `src/lib/actions/send-chat-message.ts`(`"use server"`)
- `src/lib/actions/load-earlier-messages.ts`(`"use server"`)
- `src/lib/actions/resync-chat-messages.ts`(`"use server"`)

네 곳 모두 `toMessageViewModel`을 `resolve-message-view-model.ts`에서, `MessageViewModel` 타입은
그대로 `message-view-models.ts`에서 가져오도록 import 두 줄로 나눴다. 함수 시그니처·동작은
바뀌지 않았다.

## 3. FR-052·053 보안 성질 — 변경 없음(확인)

`resolvePostLinkCard`의 판정 로직(다른 크루 게시글이면 `forbidden`만 반환, 제목조차 내려주지
않음)은 그대로다 — 옮긴 것은 `toMessageViewModel`뿐이고, `resolvePostLinkCard` 자체와
`PostLinkCard.tsx`(표현 컴포넌트, `state: PostLinkCardViewModel`만 props로 받음)는 손대지 않았다.
판정은 여전히 서버 전용 `resolve-post-link-card.ts`에서만 일어난다.

## 4. 검증

- **`npx tsc --noEmit`**: 통과(에러 0건).
- **`npm run lint`**: 통과(위반 0건, `eslint.config.mjs` 미변경).
- **`npm run build`(`rm -rf .next` 후 재실행)**: 완전히 성공. `Compiled successfully` → 20개 라우트
  전부 정상 생성. **위 §0의 클라이언트 번들 트레이스가 사라졌다.** 별개였던 서버 컴포넌트 쪽
  트레이스(CREW 소관, `auth.ts → get-auth-session.ts → layout.tsx`)도 이 시점에는 더 이상
  재현되지 않았다 — CREW가 같은 회차에 그 경로를 이미 고쳤기 때문으로 보인다(이 문서 담당 범위
  밖이라 원인은 확인하지 않았다).
- **Playwright 실측**: `chopin0625@gmail.com`(실 테스트 계정, `docs/decisions/auth-integration-030.md`
  §6)으로 로그인 → `/crews/21fb8c31-4856-4f82-af00-8b6df5e34059/chat`(이 계정이 owner인 "주말 러닝
  클럽", `chat_messages`에 `post_link` 1건 시딩됨, `supabase/seed.sql`)으로 직접 이동 —
  `(app)/layout.tsx`는 인증만 요구하고 온보딩 완료를 요구하지 않아(`docs/prioritization-and-risks.md`
  대상 아님, 레이아웃 자체 docstring 확인) 온보딩 제출 막힘(I-046)과 무관하게 도달했다.
  `PostLinkCard`가 "자유글 / 주말 러닝 클럽 자유게시판 3번째 글 / 테스트계정1" 카드로 정상 렌더됐고,
  링크가 `getPostDetailHref` 형식(`/crews/{crewId}/board/{postId}`)으로 잡혔다. 콘솔 에러 0건
  (폰트 프리로드 경고 1건은 무관). 검증 후 개발 서버는 종료했다.
  - **주의**: 검증 중 포트 3000이 이미 다른 프로세스(다른 팀원의 개발 서버로 추정)에 점유돼 있어
    3001에서 띄웠고, 종료 시 `pkill -f "next dev"`를 써서 **포트 3000의 그 프로세스도 함께 죽었을
    수 있다.** 팀장에게 보고했다 — 다른 팀원이 개발 서버가 죽어 있으면 이 때문이다.

## 5. 전수 확인 — 다른 누수 없음

`grep -rln '"use client"' src/components`로 클라이언트 컴포넌트 전체(69개)를 뽑고,
`grep -rn '^import.*"@/lib/data"' src/components src/app`로 `@/lib/data` 배럴을 **값으로**
import하는 모든 파일을 대조했다. 겹치는 것은 없었다 — `PostActions.tsx`·`CrewFilterPanel.tsx`·
`RouteErrorBoundary.tsx`·`route-error-kind.ts`·`calendar/date-grid.ts` 등은 최초 grep에
걸렸지만 전부 **docstring 주석 안의 문자열**이거나(`@/lib/data`를 언급만 함) `import type`
(type-only, 컴파일 시 삭제)이라 실제 번들 누수가 아니었다. `@/lib/data/mock/**`·
`@/lib/data/supabase/**` 딥 임포트도 `src/components`·`src/app` 어디에도 없었다. **chat 외
다른 누수는 발견하지 못했다.**

## 6. ESLint 규칙의 구조적 한계(분석 — 규칙 변경은 하지 않음, 제안만)

`resolve-post-link-card.ts`·`message-view-models.ts`(수정 전)는 `.ts`(`.tsx` 아님)라
`eslint.config.mjs` zone 4(`src/components/**/*.tsx`, `ui/`·`*Container.tsx` 제외 — `noDataLayer`로
`@/lib/data` 전면 차단)·zone 5(`*Container.tsx`·`ui/**` — 배럴은 허용하되 mock/supabase 딥 임포트만
차단)에 걸리지 않는다. 둘 다 `*.tsx` 패턴만 매칭하기 때문이다. 그래서 zone 6(`src/**/*.{ts,tsx}`,
`src/lib/data/**` 등과 함께 `src/components/**/*.tsx`도 `ignores`에 있어 결과적으로 `.ts` 파일은
zone 6으로 떨어진다)이 적용되는데, zone 6은 "서버 컴포넌트·Server Action이 `@/lib/data` 배럴을
직접 호출할 수 있어야 한다"는 이유로 배럴 import를 **허용**한다.

즉 이번 사고는 규칙에 구멍이 있어서가 아니다 — **"zone 6은 배럴 import를 허용해야 한다"(서버
컴포넌트·Server Action이 그 배럴을 쓴다)와 "`"use client"` 컴포넌트의 import 그래프에는 배럴이
들어가면 안 된다"를 정적 파일 패턴 규칙 하나로 동시에 표현할 수 없는 구조적 한계다.** 어떤 `.ts`
파일이 서버 전용인지 클라이언트 전이 그래프에 들어가는지는 **누가 import하느냐**(런타임 그래프)에
달려 있지, 파일이 어디 있는지(정적 위치)만으로는 알 수 없다. `no-restricted-imports`는 파일별
규칙이라 이 구분을 표현할 수 없다.

**제안(적용하지 않음, 판단은 팀장 몫)**:

1. **`eslint-plugin-react-server-components`류의 "client-boundary" 규칙 도입.** 이런 플러그인은
   import 그래프를 추적해 `"use client"` 모듈에서 도달 가능한 서버 전용 import를 정적으로 잡아낸다
   — `no-restricted-imports`의 파일-패턴 한계를 넘는다. 다만 새 의존성 추가라 팀장 승인 사항이다.
2. **명명 규약으로 근사.** `resolve-*.ts`(서버 전용, `@/lib/data` 조회 가능)와 그 외 `.ts`(클라이언트
   그래프에 들어갈 수 있음, `@/lib/data` 금지)를 구분하고, zone 6을 둘로 쪼갠다 — 정적 규칙은 여전히
   "누가 import하느냐"를 모르지만, 최소한 "이 파일 자체가 데이터 계층을 값으로 import하면 안 된다"는
   더 좁은 zone을 `src/components/**/*.ts`(`resolve-*.ts` 제외)에 씌워 이번 사고의 재발은 막을 수
   있다. 다만 `resolve-*.ts`가 실수로 클라이언트 컴포넌트에서 import되는 경우(오늘 사고의 실제
   형태)는 여전히 못 잡는다 — 근본 해법은 1번이다.
3. **아무것도 안 한다(현행 유지).** 이번처럼 `npm run build`가 실패로 드러내 준다 — CI가 아직 없어서
   (CLAUDE.md "테스트 러너·포매터·CI는 아직 설정되어 있지 않다") 로컬에서 빌드를 안 돌리면 놓칠 수
   있다는 점이 리스크다.

## 7. 팀장 판정 — 세 제안 모두 기각, Next.js 공식 `server-only` 가드 채택 (17일차 후속)

위 §6의 제안 3가지를 팀장에게 그대로 전달했고, **셋 다 채택되지 않았다.** 대신 Next.js가 이런
경계를 위해 이미 제공하는 공식 기제 `import 'server-only'`를 쓰기로 판정됐다. 판정 근거와 경위를
남긴다 — 다음에 같은 논의가 반복되지 않게 하는 것이 이 절의 목적이다.

**근거(팀장이 직접 확인)**: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
555행이 "서버 전용 모듈 최상단에 `import 'server-only'`를 넣어 클라이언트 컴포넌트에서의 실수
사용을 막는다"고 명시하고, **577행이 "In Next.js, installing `server-only` or `client-only` is
*optional*"** 이라고 못박는다 — `node_modules/server-only` 패키지가 실제로 설치돼 있지 않아도
Next.js 번들러(Turbopack)가 이 특수 모듈 지정자를 자체 처리한다. **이것이 제안 1(외부 ESLint
client-boundary 플러그인 도입)을 대체한다** — 같은 문제("client 그래프에서 도달 가능한 서버 전용
import를 정적으로 잡는다")를 새 npm 의존성·설정 없이 프레임워크 내장 기능으로 푼다.

**제안 2(명명 규약으로 zone 6을 쪼갠다)가 기각된 이유**: DESIGN이 교차검증에서 독립적으로 같은
결론에 도달했다 — `no-restricted-imports`는 **직접 import만** 본다. 이번 사고의 실제 경로
(`MessageRoomContainer.tsx` → `message-view-models.ts` → `resolve-post-link-card.ts` →
`@/lib/data`)는 **2단 전이(轉移) import**였다. 명명 규약으로 `resolve-*.ts` zone을 새로 만들어도
그 규칙은 "`resolve-*.ts` 파일 자신이 `@/lib/data`를 import하는가"만 보지, "`resolve-*.ts`가
아닌 어떤 `.ts`가 가리키는 대상을 따라가면 결국 `resolve-*.ts`에 닿는가"는 보지 못한다 — 즉
전이 경로 앞단(`message-view-models.ts`처럼 `resolve-*.ts`를 부르기만 하는 파일)은 여전히
사각지대로 남는다. **비용을 들여 절반만 막고 "막았다"는 인상을 주는 것이 제안 2가 기각된
이유다.** `server-only`는 파일-패턴이 아니라 **모듈 자체에 "나는 서버에서만 평가돼야 한다"는
낙인을 찍고, 그 낙인이 몇 단을 거쳐 전이되든 번들러가 그래프 전체를 추적**하므로 이 한계가
없다 — §6의 원 진단("어떤 `.ts`가 서버 전용인지는 파일 위치가 아니라 누가 import하느냐(런타임
그래프)에 달려 있다")이 정확히 가리키던 해법이었다.

**제안 3(현행 유지)이 기각된 이유**: `npm run build`가 유일한 안전망이면 CI가 없는 이 저장소에서
로컬에 빌드를 안 돌리고 커밋하는 경로가 항상 남는다. `server-only`는 그 안전망을 **타입/번들
검사 시점으로 앞당긴다** — 여전히 `npm run build`가 최종 검증이라는 점은 같지만, 사각지대(전이
import)가 하나 줄어든다.

**적용 범위**: `src/components/chat/`의 서버 전용 헬퍼 3개(`resolve-post-link-card.ts`·
`resolve-chat-viewer.ts`·`resolve-message-view-model.ts`) 최상단에 `import "server-only";`를
추가했다. **`message-view-models.ts`에는 넣지 않았다** — 그 파일은 이번 핫픽스로 클라이언트
안전하게 분리한 파일이라(§1~§2) `server-only`를 넣으면 정확히 오늘 고친 것이 다시 깨진다. 같은
원칙으로 DESIGN은 `src/lib/data/supabase/*`, CREW는 `src/lib/auth/*`에 각자 적용한다(이 문서의
범위 밖).

**검증**: `npx tsc --noEmit`·`npm run lint` 통과(0 에러 — `server-only`의 타입 선언은 `next`
패키지가 번들해 제공하므로 별도 `@types` 설치가 필요 없었다). `npm run build`는 이번 회차부터
팀장 전용(I-048, WSL Turbopack 캐시 동시 실행 충돌)이라 CORE가 직접 돌리지 않았다 — 가드 추가로
아직 발견되지 않은 client 그래프 누수가 새로 드러날 경우 그 결과는 팀장 실행분을 기다린다.
