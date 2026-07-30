# I-032 알파 상향 시각 톤 확인 (29일차)

28일차에 `focus-visible` 포커스 링 등 알파가 걸린 비텍스트 경계의 대비 미달을 알파 계수
조정으로 해소했다(라이트·다크 3.25~4.19:1, 팀장 독립 재계산과 소수점까지 일치해 확정). **이
문서는 그 수치를 다시 재지 않는다** — 확인할 것은 "링이 이전보다 진해 보이는가"라는 시각
인상뿐이다(28일차 §8 DESIGN 자신의 권고).

## 방법

- 격리된 dev 서버(`npm run dev`, 포트 3000) + Playwright(Chromium)로 `/sample`을 열었다.
- 라이트·다크 전환은 `ThemeProvider`(`src/components/theme/`)가 읽는
  `localStorage['mo_im-theme']`를 `light`/`dark`로 설정한 뒤 `location.reload()`로 전체
  리로드했다 — 해시만 바꾸는 `page.goto`(또는 이미 떠 있는 것과 **완전히 같은 URL**로의
  `goto`)는 같은 문서 내 네비게이션이라 React 상태가 리마운트되지 않아 테마·컴포넌트 상태가
  갱신되지 않는다는 것을 실측 중 두 번 확인했다(전체 리로드가 항상 필요).
- 포커스는 전부 **실제 키보드 Tab 이벤트**로 만들었다 — 마우스 클릭 직후 `Shift+Tab` →
  `Tab`으로 같은 요소에 되돌아오면(또는 클릭 없이 `element.focus()` 후 같은 왕복) 브라우저의
  `:focus-visible` 휴리스틱이 "키보드 입력"으로 간주해 실제 프로덕션에서 사용자가 보는 것과
  같은 링이 렌더된다. Toast의 액션 버튼은 클릭하면 핸들러가 실행돼 버리므로(닫힘 유발 가능)
  `element.focus()`로 클릭 없이 포커스만 준 뒤 같은 왕복으로 링을 띄웠다.
- 대상 5곳: `#primitives`의 기본(primary) 버튼·파괴적(destructive) 버튼, `#overlays`의
  Dialog "닫기" 버튼(오버레이 합성), `#overlays`의 Toast 액션 버튼(비오버레이 부유 표면),
  `#forms`의 Input 오류 상태(포커스 + `aria-invalid` 합성).
- **Toast 액션 버튼 노출을 위해 `ToastTriggerPreview.tsx`를 일시적으로 편집했다** — 원래
  데모 호출(`toast.show({ title, description })`)은 `actionLabel`/`onAction`을 주지 않아
  `ToastAction`이 아예 렌더되지 않는다(`ui/toast.tsx`의 조건부 렌더). 스크린샷 촬영 직후
  원문 그대로 되돌렸고 `git diff` 0으로 확인했다(아래 "확인하지 못한 것" 및 팀장 보고 참고).

## 결과

| 표면 | 분류 | 라이트 | 다크 |
| --- | --- | --- | --- |
| 기본 버튼 (`ring-ring/70`) | 원자 단독 | `light-button-primary.png` — 차분한 청회색 링, 뚜렷함 | `dark-button-primary.png` — 톤이 더 따뜻한(황갈) 링, 그래도 뚜렷함 |
| 파괴적 버튼 (`ring-destructive`) | 원자 단독 | `light-button-destructive.png` — 선명한 분홍/빨강 링 | `dark-button-destructive.png` — 선명한 빨강 링, 라이트와 인상 유사 |
| Dialog "닫기" | **오버레이 합성**(어두워진 배경 위) | `light-dialog-close.png` — 불투명 팝업 위 링 또렷 | `dark-dialog-close.png` — 어두운 백드롭 위에서도 황갈 톤 링이 육안으로 분명히 보임(확대 없이 원본 뷰포트 스크린샷) |
| Toast 액션 버튼 | **비오버레이 부유 표면**(백드롭 없이 살아있는 페이지 위) | `light-toast-action.png` — 회색 링 뚜렷 | `dark-toast-action.png` — 황갈 톤 링, 카드 배경과 분명히 구분됨 |
| Input 오류 (포커스+무효 합성) | 원자 단독(오류 상태) | `light-input-error.png` — 빨강 링 선명 | `dark-input-error.png` — 빨강 링 선명, 라이트와 인상 유사 |

**Dialog와 Toast를 같은 "오버레이 합성" 범주로 묶지 않는다** — `ToastViewport`(`ui/toast.tsx`)에는
배경을 어둡게 하는 백드롭 요소가 없다(콘텐츠 배경 토큰은 Dialog와 같은 `bg-popover
ring-1 ring-foreground/10`이지만, 어두워진 배경 위가 아니라 살아있는 페이지 위에 직접 뜬다).
Drawer(BottomSheet)는 별도로 확인하지 않았지만 `drawer.tsx`가 Dialog와 동일한 오버레이 구조
(`bg-black/10` + `backdrop-blur-xs`, 콘텐츠 `bg-popover ring-1 ring-foreground/10`)라 Dialog
확인으로 대표된다고 판단했다(코드 대조만, 실제 렌더는 미확인 — 아래 "확인하지 못한 것" 참고).

**판정**: 5곳 모두 라이트·다크 양쪽에서 링이 "무너지지 않고"(사라지거나 배경에 묻히지 않고)
한눈에 인지된다. 유일한 인상 차이는 **중립 링(`ring-ring`, 파괴적이 아닌 쪽)이 다크에서
라이트보다 더 따뜻한(황갈) 톤으로 보인다**는 것 — 이는 다크 테마의 배경 자체가 순수 검정이
아니라 따뜻한 잉크 톤이라 링 색과 배경이 상호작용한 결과로 보이며(토큰 색상값 자체는
28일차에 불변으로 확정됨, 알파만 조정), **톤이 "무너졌다"고 판단할 근거는 없다** — 링은
여전히 배경과 뚜렷이 구분되고 눈에 띈다. 별도 알파·색상 조정은 제안하지 않는다.

## 확인하지 못한 것

- Drawer(BottomSheet) 자체의 실제 렌더는 스크린샷을 뜨지 않았다 — 코드 구조 대조(위 문단)로
  Dialog와 동일 패턴임을 확인했을 뿐, 실측으로 대체한 것은 아니다.
- 4곳 외 나머지 인터랙티브 원자(28일차에 함께 조정된 11개 파일 중 일부)는 이번에 직접 보지
  않았다 — 대표 표면 5곳(버튼 2변형·오버레이 합성 1·비오버레이 부유 표면 1·폼 오류 합성)만
  봤다.
- 실기기·다른 브라우저 엔진(WebKit·Firefox)에서는 확인하지 않았다 — Chromium 단일 확인이다.
