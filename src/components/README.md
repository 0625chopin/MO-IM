# `src/components/`

- **`ui/`**: shadcn/ui 원시 컴포넌트. CREW 담당(`components.json`과 함께 관리).
- **`<domain>/`**: 도메인별 컴포넌트(예: `crews/`, `polls/`, `chat/`, `calendar/`). FR 단위로
  구현을 시작하는 팀원이 그때 만든다 — 이 Task에서는 예시 없이 규칙만 정한다.
  - `<Name>.tsx`: **표현** 컴포넌트. 데이터를 props로만 받는다. `@/lib/data`·`@/lib/realtime`·
    Supabase 클라이언트를 import하지 않는다(D-030 ①, `eslint.config.mjs` zone 4로 강제).
  - `<Name>Container.tsx`: **컨테이너** 컴포넌트. 데이터 조회·구독을 소유하고 표현 컴포넌트에
    props로 내려준다. `@/lib/data`·`@/lib/realtime` 배럴은 쓸 수 있지만 구현체(`mock/`·
    `supabase/`·`mock.ts`·`broadcast.ts`)를 직접 import하지 않는다(zone 5로 강제).

새 컴포넌트를 만들 때마다 `src/app/sample/page.tsx` 쇼케이스에 등록하고, **기본·로딩·빈·오류**
4상태를 토글로 노출한다(`CLAUDE.md` Mock First 개발, D-030 ③ — "오류"에 RLS 403·정원 마감·동시
수정 충돌 같은 도메인 오류를 포함).

자세한 배치 원칙과 ESLint 경계 규칙 표는 [`docs/CONVENTIONS.md`](../../docs/CONVENTIONS.md) 참고.

---

## 원자 인벤토리 (Task 013)

원자 15종(NFR-017·018·020·021·022·027, CON-09) 현황이다. **구현**은 전부 `ui/`에 있고, 새 UI
요소는 직접 짜기 전에 `shadcn` MCP 레지스트리에서 먼저 찾았다(팀장 지시 준수) — 레지스트리에
없던 것(Toast·ErrorState)만 이미 설치된 `@base-ui/react` 프리미티브 위에 손으로 얹었다.

| 원자 | 구현 파일 | `/sample` 등록 | 비고 |
| --- | --- | --- | --- |
| Button | `ui/button.tsx` | `primitives` 섹션 | Task 011 이전부터 존재 |
| Input | `ui/input.tsx` | `forms` 섹션 | shadcn 레지스트리(`base-nova` 스타일 → `@base-ui/react/input`) |
| Select | `ui/select.tsx` | `forms` 섹션 | 〃 (`@base-ui/react/select`) |
| Checkbox | `ui/checkbox.tsx` | `forms` 섹션 | 〃 (`@base-ui/react/checkbox`), 히트 영역 `after:-inset-*`로 확장 |
| Radio | `ui/radio-group.tsx` | `forms` 섹션 | 〃 (`@base-ui/react/radio`·`radio-group`) |
| Badge | `ui/badge.tsx` | `primitives` 섹션 | Task 011 이전부터 존재 |
| Avatar | `ui/avatar.tsx` | `primitives` 섹션 | 〃 |
| Card | `ui/card.tsx` | `primitives` 섹션 | 〃 |
| Dialog | `ui/dialog.tsx` | `overlays` 섹션 | `@base-ui/react/dialog` — 포커스 트랩·Esc·복귀 포커스는 프리미티브 기본 제공 |
| BottomSheet | `ui/drawer.tsx` | `overlays` 섹션 | `@base-ui/react/drawer`(`swipeDirection="down"`) — 포커스 트랩·복귀 포커스 근거는 Dialog와 별도 표에서 확인했다(아래 "키보드" 항목 참고) |
| Tabs | `ui/tabs.tsx` | `primitives` 섹션(신규 항목) | 디자인 개편에서 이미 `StatePreview`의 상태 토글로 쓰이고 있었으나 원자 자체로는 미등록이었다 — 이번에 등록만 추가 |
| Toast | `ui/toast.tsx` | `overlays` 섹션 | 레지스트리에 base-nova용 항목이 없어(있는 건 `next-themes` 의존 `sonner`뿐) `@base-ui/react/toast` 위에 직접 스타일링. `<Toaster />`를 루트 레이아웃(`src/app/layout.tsx`)에 한 번 배치해 앱 전역에서 `toast.show(...)`로 쓸 수 있다 |
| Skeleton | `ui/skeleton.tsx` | `primitives` 섹션 | Task 011 이전부터 존재 |
| EmptyState | `ui/empty.tsx` | `primitives` 섹션 | 〃 |
| ErrorState | `ui/error-state.tsx` | `primitives` 섹션(신규 항목) | 레지스트리의 `alert`(`role="alert"`) 위에 아이콘 + 재시도 버튼을 얹었다. **전체 화면** 오류(`components/errors/RouteErrorBoundary.tsx`, `/sample`의 "오류 경계" 섹션)와 다른 컴포넌트다 — 이건 카드·패널 한 칸이 실패했을 때 쓰는 인라인 오류다 |

`Field`(`ui/field.tsx`)·`Label`(`ui/label.tsx`)·`Alert`(`ui/alert.tsx`)는 15종에 포함되지 않지만
위 원자들을 올바르게 배선(라벨 연결·오류 안내)하는 데 필요해 함께 설치했다.

**D-029 점검**: 레지스트리에서 받은 파일 중 `field.tsx`(`FieldError`)와 `drawer.tsx`(`Drawer`의
컨텍스트 값)에 근거 없는 `useMemo`가 있어 제거했다 — 배열 몇 개를 훑거나 객체 리터럴 하나를
만드는 순수 계산에 훅을 쓸 측정 근거가 없었다(React Compiler가 컴포넌트 자체는 이미
메모이즈한다). 나머지 신규 파일(`input`·`textarea`·`select`·`checkbox`·`radio-group`·`dialog`·
`toast`·`error-state`·`alert`·`label`)에는 `useMemo`/`useCallback`/`memo`가 없다.

### 접근성 확인 결과

- **키보드(NFR-020)**: Dialog·Drawer는 열리면 포커스가 안으로 이동하고 Tab/Shift+Tab이 내부에서
  순환하며, Esc·바깥 클릭이 닫고, 닫히면 포커스가 트리거로 돌아온다 — 전부 Base UI 프리미티브
  기본 동작이다. **Dialog와 Drawer는 같은 모달 계열이라는 이유로 근거를 묶지 않고, 각자
  문서에서 따로 확인했다**(둘을 같은 문장으로 뭉치면 Drawer 쪽 근거가 Dialog 인용에 얹혀가는
  유추가 된다 — Task 013 교차검증 CREW-2에서 실제로 걸렸던 지점이다):
  - Dialog — `docs/react/components/dialog.md`: "Focus moves inside the dialog when it opens.
    Tab and Shift+Tab loop within, and Esc requests close." / "returns focus back where it
    started when closed."
  - Drawer — `docs/react/components/drawer.md`의 **서로 다른 표 두 개**: `### Popup` 표의
    `finalFocus` — "Move focus based on the default behavior (trigger or previously focused
    element)."(Default 컬럼이 `-`라 "이게 기본 동작이다"는 문서 인용이 아니라 `drawer.tsx`가
    `finalFocus`를 넘기지 않을 때 `DrawerPopup.js`가 `undefined`를 내부 포커스 매니저로 그대로
    전달하는 코드에 근거한 추정이다), `### Root` 표의 `modal`(기본값 `true`) — "focus is
    trapped, document page scroll is locked". 상세 인용은
    `src/components/sample/sections/overlays.tsx` 상단 주석 참고.
  - 이 파일들은 그 위에 트리거·제목·버튼 배치만 조립했고, 포커스 관리 코드를 직접 작성하지
    않았다 — 직접 짰다면 그게 "나중에 넣기 어려운 구조"가 됐을 것이다.
  - Select·RadioGroup·Tabs도 각각 WAI-ARIA listbox·radiogroup·tablist 패턴(화살표 키 이동,
    roving tabindex)을 프리미티브가 제공한다.
- **터치 대상 24×24(NFR-027)**: Button/Input/Select 트리거는 기본 높이가 32px(`h-8`)로 이미
  넘는다. Checkbox·Radio는 시각 크기가 16px(`size-4`)이지만 `after:-inset-x-3 after:-inset-y-2`
  의사요소로 히트 영역을 약 40×32px까지 넓힌다(shadcn 레지스트리 기본값, 이 회차에서 검증만
  했다). Dialog·Drawer·Toast의 닫기 버튼은 `size="icon-sm"`(28px)를 쓴다.
- **대비(NFR-018)**: 이번에 추가한 원자는 새 색을 들이지 않고 개편에서 이미 검증된 토큰만
  참조한다 — 본문·라벨은 `--foreground`/`--muted-foreground`, 오류는 `--destructive`(라이트
  11.66:1 — 32일차 I-029 L 이동 후 수치, 이 문서 작성 당시엔 6.15였다), 포커스 링은
  `--ring`(라이트 7.43:1, `docs/design/design-language.md` §5). Toast의
  `destructive` variant도 같은 `--destructive` 토큰을 재사용한다.
  **28일차(I-032) 후속 — 위 수치는 전부 토큰의 불투명 대비값이고, 실제 유틸리티 클래스는
  링·일부 다크 보더에 알파를 걸어 렌더한다는 것이 합성 렌더 실측(격리 Chromium)에서
  드러났다.** `focus-visible:ring-ring/50`(앱 전역 표준 포커스 링)이 실제로는 라이트 2.29:1·
  다크 2.70:1로 3:1 미달이었고, `aria-invalid` 링·일부 다크 보더도 마찬가지였다. 알파 계수를
  올려(`ring-ring/70`, `ring-destructive/60`·`/65`, 다크 보더는 불투명 복귀 등) 재실측 결과
  전부 3:1 이상(3.25~4.19)으로 충족을 확인했다 — 색상 토큰 자체는 바꾸지 않았다. 전체 수치·
  방법론은 `docs/decisions/composite-render-contrast-i032.md`.
- **동적 변경 안내(NFR-021)**: `FieldError`·`ErrorState`(`ui/error-state.tsx`)는 `role="alert"`라
  나타나는 즉시 보조기술에 안내된다. Toast는 Base UI의 `priority`가 aria-live 강도를 결정하며,
  이 프로젝트에서는 `variant: "destructive"`일 때만 `priority: "high"`(assertive)를 주고
  나머지는 `low`(polite)로 고정했다(`ui/toast.tsx`의 `show()`) — "파괴적 알림만 assertive"라는
  지시를 호출부가 아니라 이 한 곳에서 강제한다.
- **라이트·다크(NFR-022)**: 새 토큰을 추가하지 않았으므로 `globals.css`의 `.dark`/`@media` 동기화
  대상이 아니다. **28일차(I-032)에 격리 Chromium으로 폼 오류 상태·Dialog/Drawer·Toast 3종
  합성 상태를 라이트·다크 양쪽 실측 완료** — 위 "대비" 항목의 알파 조정과 함께
  `docs/decisions/composite-render-contrast-i032.md`에 6조합 실측 결과표가 있다. 19개 페이지
  전수 시각 회귀는 이번 회차 범위 밖이며 Task 024(접근성 QA 패스)로 넘긴다.
