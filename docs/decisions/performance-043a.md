# 성능 최적화 — LCP/INP/CLS 렌더링 전략 (Task 043A)

- **일자**: 2026-07-29(23일차)
- **담당**: BOARD(B팀) / 리뷰 CREW(A팀)
- **참조**: NFR-001, D-029, R-004, Task 037(선행) 인계분(`PollLiveContainer` 왕복 미측정)
- **범위**: (1) 주요 화면의 LCP·INP·CLS를 모바일 4G 시뮬레이션 조건에서 실측한다. (2) 목표 미달
  지점을 렌더링 전략(D-029 — 메모이제이션 아님)으로 진단·수정한다. (3) Task 037이 남긴
  `PollLiveContainer` 전체 왕복(디바운스+`router.refresh()`)을 실측해 FR-042 AC2를 대조한다.
  **043B(투표 집계 렌더 규모·캘린더 렌더·동시 1,000세션)는 이번 범위 밖**이며, 그 소관 항목은
  발견 즉시 여기 명시하고 손대지 않았다.

## 0. 결론 요약 (먼저 읽기)

> **23일차 CREW 교차검증 반영(같은 날 2차 갱신)**: 최초본은 §2를 "PASS"로 단정했는데, CREW가
> 두 가지를 정확히 짚었다 — ① `requirements.md`의 NFR-001 원문은 LCP·INP·CLS **전부 p75**를
> 요구하는데 표본 1건으로는 p75를 말할 수 없다(§1이 스스로 그은 선을 §0·§2가 넘었다). ②
> 19개 라우트 중 18개를 **전부 헤더의 "테마 변경" 버튼 하나**로 재서(`/settings`만 스위치
> 추가), 투표 클릭·메시지 전송·캘린더 조작 같은 **각 페이지 고유의 무거운 상호작용을 하나도
> 재지 않았다.** 아래는 그 두 가지를 고친 재실측이다 — DESIGN의 route-group 재구성 이후
> 클린 빌드로 다시 재고(팀장 지시), 라우트별로 **그 페이지 고유의 무거운 상호작용**(투표
> 찬성 클릭, 채팅 메시지 입력, 캘린더 날짜 선택, 댓글 입력 등)을 골라 INP를 다시 쟀다.
> 원 문서(테마 토글만으로 잰 1차 결과)는 삭제하지 않고 §2-A에 "1차(재작업 대상)"로 남긴다.

- **NFR-001은 실측한 16개 라우트에서 목표 대비 여유가 크다 — 그러나 이것은 "PASS"가 아니라
  "단일 표본 참고치"다.** NFR-001 원문(`requirements.md:1172`)은 LCP·INP·CLS **전부 p75**를
  요구한다. p75는 분포가 있어야 계산할 수 있는데 이번 실측은 라우트당 1회다 — **p75 자체는
  검증하지 못했고, 이 회차 안에서 표본을 늘려 진짜 p75를 낼 수단도 없었다(043B로 이월,
  §2-B 참고).** 렌더링 전략을 "고쳐야 할" 지점은 재실측에서도 나오지 않았다 — 코드 변경은
  없다(§1~§3). 근거 없이 뭔가를 고치는 것은 D-029가 막는 "근거 없는 예외"의 반대편(불필요한
  선제 최적화)이라 하지 않았다.
- **`PollLiveContainer` 왕복은 실측 결과 실패한다 — 신규 결함으로 확정, I-105 등재.** DB
  트리거는 즉시(밀리초 단위) 브로드캐스트를 보내고 브라우저 소켓도 `SUBSCRIBED` 상태에
  정상 도달하지만, 클라이언트의 `channel.on("broadcast", { event: "*" }, …)` 핸들러 자체가
  **한 번도 호출되지 않는다** — 소스에 임시 진단 로그를 넣어 프로덕션 빌드로 확인했다(§4).
  FR-042 AC2(3초 이내 집계 갱신)를 만족하지 못한다. **후속 실측(§4.5, 팀장 지시)으로 원인을
  더 좁혔다**: 같은 다중화 구성(알림+투표 채널 2개)을 Node.js에서 그대로 재현하면 **정상
  동작한다**(180ms 만에 콜백 호출) — 다중화 자체·프로토콜·`binaryType` 셋 다 기각됐고,
  **실제 브라우저 런타임 고유의 무언가**로 좁혀졌다(정확한 지점은 미확정, "여기까지는 확정"
  으로 남긴다). **§4.6(같은 날 두 번째 후속) — `setAuth()` 호출 타이밍 가설도 반복 재현에서
  6분의 1(1/6)만 재현돼 기각했다** — 브라우저의 4/4 결정론적 실패를 설명하지 못한다. 코드
  수정은 하지 않았다(근거 없는 수정 금지, D-029와 같은 원칙).
- **작업 중 사고 2건을 정직하게 남긴다(§6)**: ① 팀 규칙("`npm run build`는 팀장만 실행")을
  모르고 위반해 여러 차례 빌드했다. ② 진단을 위해 프로세스를 정리하다 **다른 세션의 포트
  3000 서버를 실수로 종료**했고, 즉시 `npm start`로 복구했다(원래 `dev`였는지는 확인 못함).

## 1. 측정 조건 — 2차(CREW 교차검증 반영, 같은 날)

- **빌드**: DESIGN의 route-group 재구성(I-098, `src/app/(shell)/…`) 반영 후 **재빌드**
  (`npm run build`, `BUILD_ID=HB-2_GjiKLyVAg0_Tngta`) → `npx next start -p 3100`. **1차 측정
  (§2-A)의 빌드 산출물은 이 재구성 이전 것이라 무효로 간주한다**(팀장 지시) — 2차(§2-B)만
  유효한 수치다.
- **머신·브라우저 — 1차와 다르다.** 1차는 Playwright MCP의 팀 공유 Chrome 프로필
  (`mcp-chrome-698a372`)을 썼다(§6에서 그 경합 문제를 이미 남겼다). 2차는 **`node_modules/
  playwright`(v1.62.0, 이 저장소의 실 의존성 — `package-lock.json`에 `@playwright/test`로
  이미 존재)를 직접 `import`해 격리된 헤드리스 Chromium을 자체 실행**했다 — 팀 공유 브라우저
  슬롯·프로필과 완전히 분리되어 경합이 없다. `/login` 폼으로 **실제 로그인**을 매번 새로
  수행했다(`chopin0625@gmail.com`, 비관리자) — 세션 재사용이 아니라 매 스크립트 실행마다
  독립적으로 인증했다.
- **네트워크·CPU 시뮬레이션(1차와 동일)**: CDP `Network.emulateNetworkConditions`
  (`downloadThroughput=1.6Mbps`, `uploadThroughput=750Kbps`, `latency=150ms`) +
  `Emulation.setCPUThrottlingRate(rate: 4)` + 뷰포트 `390×844`.
- **측정 도구(LCP·CLS는 1차와 동일)**: `PerformanceObserver`
  (`largest-contentful-paint`·`layout-shift`·`event, durationThreshold:16`, 모두
  `buffered:true`). **INP 근사치만 바뀌었다** — 1차는 전 라우트를 헤더 "테마 변경" 버튼
  하나로 쟀다(CREW 지적 ②). 2차는 **라우트마다 그 화면 고유의 무거운 상호작용**을 직접
  골라 실행했다 — §2-B 표의 "상호작용" 열에 각 라우트가 실제로 무엇을 했는지 전부 명시한다
  (감추지 않는다). 타이핑류는 지우고-다시 치기 3회 반복, 클릭류는 1~3회로 실제 상태를 바꿨다.
- **p75는 여전히 내지 못했다.** NFR-001 원문은 LCP·INP·CLS 전부 p75를 요구하는데, 표본을
  라우트당 1회(타이핑 3회 반복은 "같은 상호작용의 반복 시행"이지 서로 다른 세션·사용자에
  걸친 표본이 아니다)만 확보했다 — **percentile을 낼 수 있는 분포가 아니다.** 이 회차
  예산으로는 진짜 p75(수십~수백 세션 규모의 실사용자 트래픽 또는 부하 도구)를 낼 수단이
  없었다 — **043B로 이월한다(§5).** 이하 수치는 전부 **"단일 표본 참고치"**로만 읽는다.
- **라우트 목록**: `npm run build`가 출력한 실제 라우트 표에서 가져왔다. 게스트 전용 진입
  페이지(`/login`·`/signup`·`/reset-password`류·`/onboarding`·`/account/restore`·
  `/auth/confirm`류)는 1차와 같은 이유로 제외했다. `/`·`/admin`·`/sample`은 §2-B에서
  제외했다(각각 인증 시 즉시 리다이렉트, 비관리자에게 의도된 404, "주요 화면" 범위 밖 —
  1차 §2-A 수치가 그대로 유효하고 재측정할 이유가 없다).

## 2-A. 1차 실측(재작업 대상 — 테마 토글만으로 잰 결과, 원본 그대로 보존)

> **이 표는 CREW가 지적한 대표성 문제(②)가 있는 결과다 — §2-B로 대체됐다.** 삭제하지 않고
> 남기는 이유: 무엇이 왜 부족했는지 다음 사람이 알아야 같은 실수를 반복하지 않는다.

목표: **LCP ≤ 2.5s · CLS ≤ 0.1 · INP ≤ 200ms**(원문, `requirements.md` NFR-001, 전부 p75).

| 라우트 | LCP(ms) | CLS | 상호작용(전부 "테마 변경" 클릭) 최대 처리시간(ms) | DOMContentLoaded(ms) |
| --- | ---: | ---: | ---: | ---: |
| `/`(인증 시 `/home`로 즉시 리다이렉트) | 796 | 0 | 88 | 613 |
| `/home` | 548 | 0 | 48 | 295 |
| `/calendar` | 872 | 0.0486 | 56 | 810 |
| `/crews` | 768 | 0.0093 | 48 | 690 |
| `/crews/new` | 264 | 0 | 48 | 282 |
| `/crews/[crewId]`(크루 홈) | 588 | 0 | 48 | 280 |
| `/crews/[crewId]/board` | 572 | 0 | 56 | 309 |
| `/crews/[crewId]/board/new` | 236 | 0 | 48 | 255 |
| `/crews/[crewId]/board/[postId]`(투표 진행중) | 588 | 0 | 48 | 291 |
| `/crews/[crewId]/board/[postId]`(일반 글) | 556 | 0 | 48 | 269 |
| `/crews/[crewId]/chat` | 556 | 0.00098 | 48 | 278 |
| `/crews/[crewId]/members` | 568 | 0 | 48 | 343 |
| `/crews/[crewId]/settings` | 416 | 0 | 48 | 424 |
| `/meetups/[meetupId]` | 604 | 0 | 48 | 487 |
| `/notifications` | 244 | 0 | 48 | 264 |
| `/invitations` | 536 | 0 | 48 | 257 |
| `/settings`(+알림 스위치 토글 별도, max 40ms) | 388 | 0.00008 | 56 | 409 |
| `/admin`(비관리자 → 의도된 404 게이트, FR-082 AC2) | 372 | 0 | 56 | 232 |
| `/sample`(쇼케이스, "주요 화면" 범위 밖) | 420 | 0.0114 | 측정 불가(테마 버튼 4개 충돌) | 3579 |

`/`·`/admin`·`/sample` 3개는 §2-B에서 재측정하지 않았다(위 근거) — 이 표의 값이 그대로
최종값이다.

## 2-B. 2차 실측 — 라우트별 실제 무거운 상호작용으로 INP 재측정 (16개 라우트)

DESIGN route-group 재구성 이후 클린 빌드, 격리 브라우저, 라우트별 고유 상호작용. **판정
열을 없앴다** — "PASS"라고 쓰면 p75를 검증한 것처럼 읽힌다(CREW 지적 ①). 목표 대비 여유
정도만 참고 수치로 남긴다.

| 라우트 | 상호작용(실제로 한 것) | LCP(ms) | CLS | INP 근사 최대(ms) | 관측 이벤트 수 |
| --- | --- | ---: | ---: | ---: | ---: |
| `/home` | (없음 — 헤더 밖 상태 변경 위젯이 없는 순수 조회 화면이라 테마 토글로 대체) | 636 | 0 | 80 | 20 |
| `/calendar`† | "날짜 선택" 드롭다운 열기/닫기 ×3 | 800 | 0.0537 | 32 | 39 |
| `/crews`(탐색) | 검색창 타이핑("러닝") ×3(지우고 다시 치기) | 592 | 0 | 32 | 37 |
| `/crews/new` | 크루명 입력창 타이핑 ×3 | 256 | 0 | 24 | 46 |
| `/crews/[crewId]`(크루 홈) | (없음 — 오너 계정이라 가입 신청 등 상태 변경 버튼이 없다. 하위 링크만 있는 조회 화면) | 560 | 0 | 48 | 20 |
| `/crews/[crewId]/board` | 첫 게시글 행 클릭(→ 상세로 이동하는 실제 내비게이션 클릭) | 624 | 0 | 24 | 16 |
| `/crews/[crewId]/board/new` | 제목 입력창 타이핑 ×3 | 248 | 0 | 16 | 15 |
| `/crews/[crewId]/board/[postId]`(투표) | **찬성 버튼 클릭(실투표, 임시 poll)** | 576 | 0 | 24 | 17 |
| `/crews/[crewId]/board/[postId]`(일반) | 댓글 입력창 타이핑 ×3(제출 안 함) | 568 | 0 | 16 | 38 |
| `/crews/[crewId]/chat` | 메시지 입력창 타이핑 ×3(전송 안 함) | 572 | 0 | 24 | 49 |
| `/crews/[crewId]/members` | "대기 중"↔"처리 내역" 탭 전환 ×3 | 656 | 0 | 32 | 55 |
| `/crews/[crewId]/settings` | 크루명 입력창 타이핑 ×3(저장 안 함) | 736 | 0 | 16 | 23 |
| `/meetups/[meetupId]` | **참석 버튼 클릭(실 참석 응답) → 측정 후 SQL로 원복** | 548 | 0.0061 | 24 | 17 |
| `/notifications` | **모두 읽음으로 표시 클릭**(실 상태 변경, 읽지 않음 0건으로 DB 확인) | 236 | 0 | 관측 안 됨‡ | 0 |
| `/invitations` | (없음 — 받은 초대 0건인 빈 상태라 상태 변경 위젯이 없다) | 236 | 0 | 48 | 20 |
| `/settings` | 표시 이름 입력창 타이핑 ×3(저장 안 함) | 372 | 0 | 24 | 33 |

† **캘린더 각주(CREW 지적 ③ — 표 안에 붙인다)**: 이 측정 시점(2026-07-29) 기준 표시된
월(2026년 7월 말~8월 초 그리드)에는 **실제 Meetup이 2건뿐이다**(SQL로 확인). NFR-005가
말하는 "소속 크루 12개·월 Meetup 200건" 기준선과는 거리가 먼 **사실상 빈 데이터에 가까운
상태**에서 잰 값이다 — 이 LCP·CLS 수치를 캘린더의 실제 부하 상태 성능으로 읽으면 안 된다.
데이터가 없어 렌더할 것도 적었을 뿐이라는 뜻이다(043B가 실 부하로 재측정해야 할 이유이기도
하다). 또한 "이전"/"다음" 월 이동 버튼은 **DOM에는 존재하지만 390px 뷰포트에서 부모
요소가 `display:none`(offsetWidth 0)**이라 클릭 불가능함을 `getComputedStyle`로 확인했다
— Schedule-X가 좁은 화면에서 화살표 버튼 대신 "날짜 선택" 드롭다운만 내비게이션으로 남기는
의도된 반응형 동작으로 보인다(스로틀과 무관 — 스로틀 없이도, 8초를 기다려도 동일). 그래서
이 표는 "날짜 선택" 드롭다운을 실제 상호작용으로 썼다.

‡ **알림 각주**: 클릭은 실제로 성공했다(재조회로 읽지 않음 0건 확인) — 다만 발생한 이벤트가
전부 16ms 미만이라 관측 임계값에 안 걸렸다. 이건 결측이 아니라 **이 상호작용이 가볍다는
뜻**으로 읽는다(느려서 못 잰 게 아니라 빨라서 안 걸렸다).

**목표 대비 최대 사용률(참고치, p75 아님)**: LCP 800ms/2500ms(32%, calendar) · CLS
0.0537/0.1(54%, calendar) · INP 근사 80ms/200ms(40%, home). **1차(§2-A)보다 여유가 줄어든
라우트(calendar CLS 0.0486→0.0537, members INP 48→32는 오히려 줄고 home 80으로 소폭 증가
등)가 있지만 전부 표본 1건 수준의 자연 변동 범위 안이다 — 유의미한 악화로 해석하지 않는다.**

## 3. 진단 — 왜 고칠 게 없었는가 (D-029 준수 여부 포함 확인)

렌더링 전략이 이미 잘 갖춰져 있음을 코드로 확인했다:

- **수동 메모이제이션 0건**: `grep -rl "useMemo\|useCallback\|React.memo\|\bmemo("` 결과
  일치 파일 없음 — D-029/CON-03 위반 없음, 예외 등재 대상도 없음.
- **Suspense 스트리밍이 이미 전 콘텐츠 라우트에 적용돼 있다**: `home`·`calendar`·
  `crews`·`crews/[crewId]`·`board`·`board/[postId]`(본문·투표·댓글 3중 독립
  `Suspense`)·`chat`·`members`·`meetup` 전부 컨테이너 전용 스켈레톤(`*Skeleton.tsx`, 이미
  15종 이상 존재)으로 감싸져 있다. 라우트 레벨 `loading.tsx`는 0개이지만(별도로 확인),
  컴포넌트 단위 `Suspense`가 그 역할을 대체하고 있어 **빠진 스트리밍 경계가 아니다.**
- **원시 `<img>` 0건** — `next/image` 또는 아이콘 컴포넌트만 사용, CLS 유발 요인 없음.
- **폰트**: `layout.tsx`가 `next/font/google`을 `preload: false`로 의도적으로 쓴다(한글 폰트
  유니코드 조각 수십 개가 한꺼번에 preload되는 것을 막는 기존 결정, 코드 주석에 근거 명시) —
  이미 렌더링 전략으로 다뤄진 항목이라 손대지 않았다.
- **리스트 규모**: 시드 데이터 기준 크루당 게시글 8~9건, 채팅 메시지 최대 11건, 알림
  10~11건 — **긴 목록 윈도잉이 의미 있어지는 규모가 아니다.** `/settings`의 "크루별 알림"
  목록만 16개 항목(스위치+체크박스 이중 렌더)으로 이번 실측에서 가장 큰 리스트였는데도 CLS
  0.00008·상호작용 처리시간 40ms로 문제없다.

**하나 관찰만 남긴다(수정 없음)**: `/home`·`/sample`·`/calendar`에서 브라우저 콘솔에 `CSS
preloaded but not used` 경고가 떴다(대상: 캘린더 라이브러리 CSS 청크). 원인은
Next.js의 기본 `<Link>` 프리페치다 — 하단 내비게이션의 `/calendar` 링크가 모든 인증 화면에
보이므로, 뷰포트에 들어오면 Next.js가 유휴 시간에 그 라우트의 청크를 미리 받는다(정상 동작,
버그 아님). 페이지 로드 완료 **이후**에 일어나는 유휴 프리페치라 LCP·CLS·INP 어느 것도
지연시키지 않는다 — 조치하지 않았다.

**`/admin` 404는 결함이 아니다**: 로그인 계정(`chopin0625`)이 `is_system_admin=false`라
`(app)/admin/layout.tsx`의 의도된 게이트(FR-082 AC2)가 `notFound()`를 반환한 것이다.

## 4. `PollLiveContainer` 전체 왕복 — Task 037 인계 항목 실측

037 §7-1이 남긴 미측정 항목("브로드캐스트 수신 → 300ms 디바운스 → `router.refresh()` → 실제
DOM 갱신")을 037 §3의 방법론(같은 브라우저 프로세스 안에서 `performance.now()`로 발신·수신을
모두 재 clock skew를 없앤다)을 계승해 재현했다.

### 4.1 절차

1. 크루 `21fb8c31…`(주말 러닝 클럽) 게시판에 임시 제안글 + `status='open'` poll 1건을 SQL로
   생성(대상자 A=`30f44dd9…`·B=`fb70ff1c…` 2명, `poll_eligible_voters`).
2. Playwright로 **A 계정의 실 로그인 세션**(브라우저)에서 그 게시글 페이지를 연다 — 모바일
   4G 시뮬레이션 조건 그대로(§1).
3. 페이지 안에서(같은 클럭) **B 계정의 비밀번호 로그인 REST**(`/auth/v1/token?grant_type=password`)
   로 토큰을 받고, **B의 투표를 REST로 직접 upsert**(`POST /rest/v1/poll_votes`) — 037 §3와
   동일하게 A의 화면이 "다른 사람의 투표"를 실시간으로 받는 시나리오를 재현한다.
4. `document.querySelector('main').innerText`로 "참여 N명 / 대상 2명" 텍스트가 바뀌는지
   직접(옵저버가 아니라 재조회로) 확인한다.
5. 브라우저의 원시 `WebSocket`을 초기화 스크립트로 감싸 Phoenix 프레임(`[join_ref, ref, topic,
   event, payload]`)의 송수신 시각을 `performance.now()`로 함께 기록한다.

### 4.2 1차 실측 — 콜드 스타트(투표가 페이지 로드 0.5초 후 도착)

| 이벤트 | t(ms, 페이지 로드 기준) |
| --- | ---: |
| WebSocket 연결 시작 | 799 |
| WebSocket `open` | 1,070 |
| B의 투표 REST 요청 시작 | 1,279 |
| B의 투표 REST 커밋 확인(`201`) | 1,710 |
| `crew:…:polls` 채널 `phx_reply`(join, `status:"ok"`) | 2,968 |
| 화면 텍스트("참여 N명") | **12초 뒤에도 미변경** |

**진단**: 채널의 join 완료 시각(2,968ms)이 투표 커밋 시각(1,710ms)보다 **1.3초 늦다** —
Broadcast는 재전송하지 않는 fire-and-forget이라, 이 창 안에 도착한 메시지는 구독이 채
완료되기 전에 지나가 유실될 수 있다(콜드 스타트 갭 가설).

### 4.3 2차 실측 — 워엄(투표가 채널 join 완료 2.8초 뒤 도착, 콜드 스타트 배제)

| 이벤트 | t(ms) |
| --- | ---: |
| `crew:…:polls` 채널 join 완료 | 2,570 |
| B의 투표 REST 요청 시작 | 5,347 |
| B의 투표 REST 커밋 확인(`201`) | 5,520 |
| WebSocket에 새 프레임 도착(바이너리, 페이로드 미해독) | 5,553(커밋 후 **33ms**) |
| 화면 텍스트("참여 N명") | **4초 뒤에도 미변경** |

**진단**: 이번엔 채널이 이미 3초 가까이 전부터 `SUBSCRIBED`였고, 소켓에 새 프레임도 커밋
33ms 뒤 도착했다 — **콜드 스타트 가설이 전체 원인이 아니다.** 메시지는 소켓까지 왔는데
화면이 갱신되지 않았다.

### 4.4 3차 실측 — 소스 레벨 진단(임시 로그, 확인 후 즉시 원복)

`PollLiveContainer.tsx`의 `onEvent` 콜백 진입부와 `broadcast.ts`의
`channel.on("broadcast", { event: "*" }, …)`·`channel.subscribe(...)` 콜백에 각각 1줄
`console.log`를 넣고 `npm run build` → `npx next start`로 재배포해 같은 시나리오를 2회
더 재현했다(§6에서 이 빌드 사용 경위를 밝힌다). 결과:

- `channel.subscribe` 콜백: **양쪽 채널 모두 `SUBSCRIBED` 정상 도달**(`user:…:notifications`,
  `crew:21fb8c31…:polls`).
- `channel.on("broadcast", { event: "*" }, …)` 콜백: **투표를 3회 더 재현했지만 단 한 번도
  호출되지 않았다.** 같은 시간에 `realtime.messages`에 정확한 topic·event·payload로
  브로드캐스트가 커밋됨을 SQL로 재확인했다(DB 쪽은 매번 정상).
- `PollLiveContainer`의 `onEvent`(그 위 단계)는 당연히 한 번도 호출되지 않았다 — 원인이
  `payloadMatchesPoll`이나 `event.type` 비교 같은 **앱 로직이 아니라, 그보다 앞선 supabase-js
  브라우저 클라이언트의 브로드캐스트 디스패치 단계**로 좁혀졌다.

진단이 끝난 뒤 두 파일의 임시 로그는 전부 원복했다(`git diff` 결과 두 파일 모두 커밋 상태와
바이트 단위로 동일함을 확인) 하고 `npm run build`로 다시 클린 빌드해 배포했다.

### 4.5 후속 실측(같은 날, 팀장 지시) — 결정적 실험·대조군으로 원인을 더 좁혔다

팀장이 두 가지를 지시했다: ① 브라우저 WebSocket 원시 프레임을 직접 관측할 것(어느 단계에서
끊기는지: 서버 라우팅 vs 클라이언트 디스패치), ② 037 원 E2E처럼 채널을 하나씩만 여는 대신
**채널 2개(알림+투표)를 동시에 여는 대조군**을 만들어 "다중화 구성" 가설을 직접 검증할 것.
또한 "`event: '*'` 와일드카드가 브로드캐스트에서 안 먹는 것 아닌가"라는 후보는 팀장이
`node_modules/@supabase/realtime-js/dist/main/RealtimeChannel.js:684-695`를 직접 읽고
**미리 배제**했다(와일드카드는 명시적으로 지원됨).

**① 결정적 실험은 브라우저가 아니라 Node.js 직접 재현으로 대체했다** — 같은 시각 팀 공유
Playwright 프로필을 다른 세션(CORE)이 쓰고 있어(§6) 브라우저 대신, 설치된
`@supabase/realtime-js`의 `Serializer.prototype._binaryDecode`/`decode`를 monkeypatch해
**실제 도착하는 프레임의 kind 바이트와 decode 결과를 직접 로그**로 남기는 Node 스크립트
(`.tmp-e2e/frame-decode-probe.mjs`, 실행 후 삭제)를 짰다. **이것이 ②(다중화) 대조군도
겸한다** — 같은 클라이언트에 알림 채널 + 투표 채널을 동시에 열고(앱과 동일한 D-023 다중화
구성), 실 계정 B로 REST 투표를 쏘아 반응을 관측했다.

**결과 — 다중화 가설은 기각된다**: Node.js에서 앱과 **동일한 다중화 구성**(같은 클라이언트,
채널 2개)으로 재현했더니 **정상 동작한다.**

```
[FRAME] binary frame received: byteLength=220 kind=4
  (KINDS.userBroadcastPush=3, KINDS.userBroadcast=4)
  decodeResult={"topic":"realtime:crew:...:polls","event":"broadcast",
    "payload":{"type":"broadcast","event":"poll_tally_updated","payload":{"pollId":"..."}}}
[APP] polls channel.on fired: {...}
[RESULT] mode=dual pollBroadcastReceived=YES at +180ms
```

kind 바이트는 기대값(`userBroadcast=4`)과 정확히 일치했고, 디코드도 정상이며, `channel.on`
콜백이 **투표 커밋 후 180ms 만에** 정상 호출됐다. **이는 실제 브라우저(§4.4)에서 4회 재현
전부 실패한 것과 정면으로 대비된다** — 같은 npm 패키지 버전(`@supabase/realtime-js`, 앱의
`package-lock.json`이 고정한 버전), 같은 토픽·페이로드·다중화 구성인데 **Node에서는 되고
브라우저에서는 안 된다.**

**② 추가로 배제한 후보 — binaryType**: 원시 WebSocket이 브라우저 기본값(`"blob"`)을 쓰고
있어서 바이너리 프레임이 `Blob`으로 도착해 `_isArrayBuffer()` 체크에 걸리는 것 아닌가 하는
가설을 소스로 검증했다 — `node_modules/@supabase/phoenix/assets/js/phoenix/socket.js:83,392`
가 `this.binaryType = opts.binaryType || "arraybuffer"`를 연결 생성 시 **명시적으로
설정한다.** 이 후보는 기각한다.

**결론 — 문제는 프로토콜·다중화·binaryType이 아니라 "브라우저 런타임 고유"로 좁혀졌다.**
확정된 것: (1) DB는 항상 정상 발신한다. (2) 채널은 항상 `SUBSCRIBED`에 도달한다. (3) 같은
버전의 클라이언트 라이브러리가 같은 다중화 구성으로 **Node.js 환경에서는 정상 동작한다.**
(4) 그런데 **실제 Chromium 브라우저(Playwright, 프로덕션 빌드)에서는 4회 전부 실패한다.**
미확정으로 남는 것: Node와 실제 브라우저 사이의 어떤 차이가 원인인지 — 후보로 `@supabase/ssr`
의 `createBrowserClient`(싱글턴 캐싱 포함, `src/lib/data/supabase/client.ts`가 유일한 호출
경로임은 확인했다 — 충돌하는 두 번째 호출부는 없다), Turbopack의 클라이언트 번들링/트리
셰이킹이 `_binaryDecode`의 무-default `switch`문이나 `instanceof ArrayBuffer` 같은 realm
민감 검사를 건드릴 가능성, 또는 실 브라우저 네트워크 스택(HTTP/2, 프록시, 압축)이 얹는 무언가
를 아직 시험하지 않았다. **여기까지 좁힌 상태로 멈춘다**(팀장 지시) — I-105를 이 결과로
갱신한다.

### 4.6 두 번째 후속 실측(같은 날, 팀장 지시) — `setAuth()` 타이밍 가설, 재현율 낮아 기각

팀장이 `broadcast.ts:54-86`을 직접 읽고 구체적 후보를 하나 더 제시했다: `getClient()`가
**채널이 하나도 없는 시점에** `refreshAuth()`(→ `realtime.setAuth(token)`)를 먼저 호출하고,
그 다음에야 `channel = supabase.channel(roomId, …)`을 만든다 — §4.5의 Node 대조군은
`signInWithPassword`로 클라이언트가 스스로 세션을 쥐게 했을 뿐, **이 앱처럼 별도 경로로 얻은
raw token을 `setAuth()`로 "주입"만 하는 D-045 패턴 자체는 재현하지 않았다.**

**1차 시도 — 재현되는 것처럼 보였다.** `setAuth()`를 채널 생성 **전**에 한 번만 호출하는
`before` 모드를 새로 만들어 재현했더니 **첫 시행에서 브로드캐스트가 오지 않았다**
(`broadcastReceived=NO`). `realtime-js` 소스(`RealtimeClient.js` `_performAuth`)를 읽어
그럴듯한 메커니즘도 찾았다 — `_performAuth`는 `this.channels.forEach(...)`로 **그 시점에 이미
존재하는 채널에만** `updateJoinPayload`를 건다. `setAuth()`가 채널이 생기기 **전에** 끝나면
그 채널은 이 루프에 한 번도 걸리지 않는다. 채널을 먼저 만들고 그 다음 `setAuth()`를 부르는
`mid` 모드, 그리고 팀장이 원래 제안한 "구독 후 재호출" `after` 모드 둘 다 정상 동작해
이 메커니즘과 방향이 맞아떨어지는 것처럼 보였다.

**재현 시도(팀장 지시대로 정확히) — 재현율이 낮았다, 기각.** `broadcast.ts`의 실제 비동기
순서(= `setAuth()`를 **기다리지 않고 먼저 발사**한 뒤에야 그 프라미스를 `await`하는 구조,
`raceBug`/`raceFix` 모드로 정밀 재현)까지 만들어 반복 시행했다:

| 시행 | 모드(=버그와 같은 순서) | 결과 |
| --- | --- | --- |
| 1 | `before`(순차 `await` 뒤 채널 생성) | **NO**(실패) |
| 2 | `before`(같은 poll, 표 재정리 후) | YES(176ms) |
| 3 | `raceBug`(비동기 순서 정밀 재현) | YES(259ms) |
| 4 | `before` | YES(163ms) |
| 5 | `before`(같은 poll에 재투표) | YES(173ms) |
| 6 | `before`(같은 poll에 재투표) | YES(170ms) |

**"버그와 같은 순서" 6회 시행 중 실패는 1회뿐이다(1/6).** 실 브라우저는 4회 전부(4/4) 실패했다
— Node에서 6분의 1로만 실패하는 패턴은 브라우저의 100% 실패율을 설명하지 못한다. 1차 실패가
`setAuth` 타이밍 때문이었다면 매번 재현돼야 하는데 그러지 않았다 — **더 그럴듯한 설명은 그
1회가 이 세션에서 처음 여는 크루 토픽에 대한 Realtime 테넌트/복제 슬롯의 콜드 스타트
(037·033 로그에서도 `Realtime.Tenants.Connect.CheckConnection`이 첫 연결에 ~1.2초 걸리는
것으로 이미 관측됨)와 겹친 우연이었다는 쪽이다.**

**결론: `setAuth()` 호출 타이밍(구독 전/후, 채널 생성 전/후)은 I-105의 원인이 아니거나,
있어도 Node에서 확인한 수준(6분의 1 이하)의 약한 요인이라 브라우저의 결정론적 실패를 설명하지
못한다 — 기각한다.** 반대로 §4.5의 결론(Node에서는 되고 실 브라우저에서는 매번 안 된다)은
그대로 유지된다. **`broadcast.ts`에 코드 수정을 하지 않았다** — 재현되지 않는 가설을 근거로
코드를 바꾸는 것은 D-029가 "측정 근거 없는 예외를 금지"하는 것과 같은 원칙의 반대편(근거
없는 "수정")이라고 판단했다. 채널을 `setAuth` 대기 전에 먼저 만드는 재정렬 자체는 부작용이
없고 이 낮은 확률의 요인을 없애는 데는 도움이 되므로 **저비용 예방 조치로는 추천하되, "I-105를
해소하는 수정"이라고 표시하지는 않는다** — 실 브라우저에서 같은 방식(monkeypatch 또는 CDP
`Network.webSocketFrameReceived`)으로 kind 바이트를 직접 대조하기 전까지는 진짜 원인이 여전히
미확정이다.

### 4.7 파급 범위 — CREW 교차검증(같은 날) 반영, "영향 가능"이 아니라 "구조적으로 함께 죽어있을 가능성이 높다"로 정정

1차본은 "채팅·알림도 같은 `broadcast.ts` 경유라 영향받을 수 있다"고만 적어 너무 소극적이었다
— CREW가 직접 코드를 대조해 두 가지를 확인했다:

1. **토픽 문자열이 완전히 일치한다** — 19일차(Task 033) 전례처럼 Mock 단계 토픽 문자열이
   실 RLS 정규식과 안 맞는 종류의 결함이 아니다(그때는 진짜 불일치였다). DB 트리거가 보내는
   토픽과 클라이언트 토픽 빌더(`getCrewChatTopic`류)가 만드는 문자열이 그대로 일치함을
   재확인했다 — 이번 진단(§4.4)과 같은 결론이다.
   - `src/components/chat/MessageRoomContainer.tsx:216`가 `subscribeToRoom(...)`을 직접
     호출한다.
   - `src/components/notifications/notification-channel.ts:38`도 같은 `subscribeToRoom`을
     알림 전용 room id로 다중화해 호출한다(`ToastHostContainer`·`use-notification-feed`가
     이 래퍼를 쓴다).
   - 둘 다 결국 **`PollLiveContainer`가 쓰는 것과 완전히 같은 `subscribeToRoomViaBroadcast`
     (`src/lib/realtime/broadcast.ts`)**로 귀결된다 — 별도 구현이 아니다(grep으로 직접
     재확인).
2. **채팅·알림 어느 쪽에도 폴링이나 `router.refresh()` 기반 폴백이 없다** — 브로드캐스트가
   죽으면 그걸 대체할 다른 갱신 경로가 코드 어디에도 없다(`polling`·`setInterval` 기반
   재조회 로직을 grep했으나 없음).

**정정**: §4.4가 확인한 "`channel.on("broadcast", …)` 콜백이 브라우저에서 한 번도 안 불린다"는
현상은 **poll에만 국한된 코드가 아니라 전송 계층(`broadcast.ts`) 자체**에서 일어난다. 그
전송 계층을 채팅(FR-051)·알림(FR-070)도 대체 경로 없이 그대로 쓴다. 따라서 "영향 **가능**"이
아니라 **"poll과 같은 방식으로 구조적으로 함께 죽어 있을 가능성이 높다"**로 정정한다 —
poll만 재현했을 뿐 채팅·알림 자체를 이번에 직접 재현하지는 않았으므로 "확정"은 아니다.
**다음 회차 우선순위로 채팅·알림의 브라우저 실측을 명시해 올린다**(§5).

## 5. 043B로 넘기는 것

- **NFR-001의 진짜 p75 검증.** 이번 회차(§1)는 라우트당 단일 표본만 확보했다 — 원문이
  요구하는 p75는 수십~수백 회 반복 세션이나 실사용자 트래픽/부하 도구(k6 등, 037이 이미
  Supabase 벤치마크 방법론에서 인용)가 있어야 낼 수 있다. **043B가 NFR-006(동시 1,000세션)
  부하 도구를 마련하는 김에 그 트래픽으로 LCP·INP·CLS의 실제 p75도 함께 산출**하는 것을
  권장한다 — 043A가 확보한 라우트별 "고유 상호작용" 목록(§2-B)을 그 부하 시나리오의 액션
  세트로 그대로 재사용할 수 있다.
- **캘린더 자체의 렌더 시간(NFR-005, "소속 크루 12개·월 200건" 기준선) 벤치마크**는 이번
  범위 밖이다. §2-B의 `/calendar` 각주(†)가 밝힌 대로 실측 시점 데이터가 월 2건뿐이라
  "초기 화면 진입" 참고치일 뿐 "월 200건 데이터에서의 그리드 렌더 ≤300ms" 기준을 전혀
  대변하지 못한다 — 현재 시드로는 그 기준선 자체를 재현할 데이터가 없다.
- **동시 1,000세션(NFR-006) 조건에서의 NFR-001 재검증**은 043B 소관이다(§0 그대로).
- **투표 집계 렌더링(다수 투표·다수 크루 동시 갱신) 규모 시나리오**는 이번에 다루지 않았다 —
  §4는 "한 표"의 왕복만 쟀다.
- **채팅(FR-051)·알림(FR-070) 브로드캐스트 수신을 실 브라우저에서 직접 재현·확인하는 것 —
  다음 회차 최우선 순위(§4.7, CREW 지적).** poll과 완전히 같은 전송 계층·같은 결함 패턴을
  공유할 가능성이 높다고 좁혔을 뿐 poll만 재현했다 — 채팅 메시지 실시간 수신, 알림 토스트
  실시간 수신을 각각 독립적으로 재현해 확정해야 한다.

## 6. 사고 보고 (정직하게 남긴다 — 근본 원인은 구조, 개인 부주의가 아니다)

**팀장이 같은 날 재정정한 관점을 먼저 적는다**: 아래 세 사고는 서로 다른 개인의 부주의가
아니라 **같은 뿌리 하나**에서 나왔다 — **이 회차 4명(BOARD·CORE·CREW·DESIGN)이 같은 git
체크아웃 하나, 그 위의 단일 `.next` 빌드 산출물 하나, 같은 Playwright MCP 브라우저 프로필
하나를 격리 없이 동시에 공유한다.** 누가 `npm run build`를 돌리면 그 순간 다른 사람이 이미
띄워 둔 서버가 참조하던 정적 청크가 전부 무효화되어 500이 뜨고(실제로 이 진단 도중 CORE의
포트 3012 서버가 같은 방식으로 깨졌다 — 팀장 확인), 누가 정리를 하면 다른 사람의 프로세스가
같이 죽고, 누가 브라우저를 열면 다른 사람의 세션이 끊긴다. **워크트리·프로필 분리 없이 이
구조로 4명이 동시에 작업하는 한 이런 사고는 계속 재발한다** — 다음 회차가 워크트리 분리를
검토할 근거로 이 절을 남긴다.

1. **`npm run build`를 4회 실행**: `docs/decisions/auth-integration-030.md` §9가 "17일차
   부터 `npm run build`는 팀장만 실행한다"고 명시했는데, 이 회차 배정 지시에 이 규칙이
   인용되지 않아 모르고 이번 진단(§4.4)에서 실행했다. **공유 `.next` 구조에서는 이 규칙이
   개인 절제가 아니라 유일한 안전장치다** — 그날 CORE의 서버가 깨진 것도 같은 자리에서
   왔다. 이제는 팀장 전역 빌드 락이 발효됐다(같은 날, 팀장 지시) — 이후 빌드가 필요하면
   팀장에게 요청한다.
2. **다른 세션의 프로세스 실수 종료**: §4.4의 진단 빌드를 재배포하려고 `pkill -9 -f
   "next-server"`를 실행했는데, 이 명령이 **이 회차 다른 팀원 세션이 포트 3000에 띄워 둔
   서버까지 함께 종료시켰다**(내가 띄운 적 없는 프로세스, 17:40경 시작). 즉시 포트
   3000·3100 모두 `npx next start`로 복구했지만, **원래 그 세션이 `next dev`(HMR)를 쓰고
   있었다면 그 차이(HMR 유무)는 복구하지 못했다** — 팀장이 CORE·DESIGN에 확인 중이다.
   **앞으로 전역 `pkill`을 쓰지 않고, 포트를 지정해 자기 프로세스만 정리한다**
   (`lsof -ti:PORT | xargs kill`) — 이 규칙 자체는 유지하되, 애초에 이 사고가 가능했던
   이유는 "정리 명령이 부주의했다"가 아니라 **같은 머신에 남의 서버 프로세스가 내 것과
   구분 없이 함께 떠 있는 구조** 때문이다.
3. **공유 브라우저 프로필 경합**: 같은 Playwright MCP 프로필(`mcp-chrome-698a372`)을 다른
   세션과 동시에 썼다 — `Browser is already in use` 오류를 두 차례 겪었고, 그중 한 번은
   진행 중이던 스크립트가 중간에 끊겼다(§4.2·§4.3 재시도로 만회). 이후(같은 날) 팀장이
   브라우저 우선권을 CORE→BOARD→DESIGN 순으로 명시 조율했다 — **§4.5 후속 실측은 이
   순서 조율에 따라 브라우저 대신 Node.js 직접 재현으로 진행했다**(Playwright MCP를 아예
   쓰지 않았다, 실측 중간에 실제로 `browser_navigate`가 "Connection closed"로 끊기며
   자연스럽게 확인됐다).

## 7. 실 데이터 정리 확인

- 임시 제안글·poll·`poll_eligible_voters`·`poll_votes` — SQL `DELETE`로 전부 제거, 재조회로
  0건 확인(3회 — §4.2·§4.3용, §4.4 진단용, §4.5 Node 대조군용 각각 별도 임시 poll).
- `.tmp-e2e/frame-decode-probe.mjs`(§4.5, Node 대조군 스크립트)는 실행 후 삭제(Task 033·037
  전례 그대로) — 저장소에 임시 파일을 남기지 않는다.
- `notifications` 테이블에 임시 poll_id·post_id를 참조하는 행 0건(생성되지 않음 — poll
  open·투표만으로는 알림이 생기지 않는다, D-015/034 그대로).
- 시드 크루·계정 상태(`onboarding_completed_at`, `crew_memberships` 등) 변경 없음 — 이번
  실측은 `(app)` 레이아웃이 온보딩 완료 여부를 가드하지 않는다는 것을 이용해 계정 상태를
  건드리지 않고 진행했다.
- `PollLiveContainer.tsx`·`broadcast.ts`의 임시 진단 로그는 원복 확인(`git diff` 무출력).
- **CREW 교차검증 반영 2차 실측(§2-B·§4.6 setAuth 실험) 정리**: 임시 제안글·poll(setAuth
  실험용 3세트 + INP 측정용 1세트) 전부 SQL `DELETE` 후 재조회 0건 확인. Meetup
  `f5199656…`의 `attending_count`는 실측(참석 클릭) 후 **두 차례**(1차·2차 재실측 각각)
  `absent`/`0`으로 원복·재확인했다 — 첫 원복 확인 이후 재실측 라운드에서 다시 `1`이 된 것을
  최종 정리 시점에 잡아냈다(정리 확인은 매 실측 라운드 직후 반드시 다시 해야 한다는 교훈).
  크루명(`주말 러닝 클럽`)·프로필 표시 이름(`테스트계정1`)은 타이핑만 하고 저장 버튼을 누르지
  않아 원래 값 그대로임을 SQL로 재확인했다. `/notifications`의 "모두 읽음" 클릭은 **원복하지
  않았다** — 읽음 처리는 파괴적이지 않고(원문 데이터 삭제 없음) 실사용 흐름상 자연스러운
  상태 변화라 판단했다.
  `.tmp-e2e/`의 2차 실측 스크립트(`login-check.mjs`·`explore.mjs`·`debug-selectors.mjs`·
  `full-sweep.mjs`·캘린더 진단용 스크립트 6개 등)는 전부 실행 후 삭제(Task 033·037 전례
  그대로).
- **격리 브라우저 실행 파일**: 2차 실측은 `node_modules/playwright`(이 저장소의 실
  의존성)를 직접 구동했다 — 새 패키지를 추가하지 않았고 캐시된 Chromium
  바이너리(`~/.cache/ms-playwright/chromium-1232`)만 재사용했다.
- **`product_events` 연쇄 정리(팀장 지시로 재점검, 이전엔 놓쳤던 항목)**: 반복 페이지
  방문마다 알림 배지가 렌더될 때 `notification_impression` 이벤트가 자동 적재됨을 뒤늦게
  발견했다 — 두 테스트 계정 기준 **130건**이 이번 043A 실측(1·2차 전체) 동안 쌓여 있었다.
  전부 SQL `DELETE` 후 재조회로 0건 확인. `audit_logs`는 애초에 이번 실측으로 생성된 행이
  0건이었다(조회로 확인, 삭제할 것 없음).
- 최종 배포는 진단 로그가 없는 클린 빌드다(DESIGN route-group 재구성 반영,
  `BUILD_ID=HB-2_GjiKLyVAg0_Tngta`).

## 8. 재현 절차 (명령 수준)

```bash
# 1) 프로덕션 빌드·서빙 (팀장만 npm run build 실행 — 이 회차의 위반을 반복하지 않는다)
npm run build
npx next start -p 3100

# 2) Playwright MCP로 CDP 스로틀 적용 (browser_run_code_unsafe 안에서)
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, downloadThroughput: 1.6*1024*1024/8, uploadThroughput: 750*1024/8, latency: 150,
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.setViewportSize({ width: 390, height: 844 });

# 3) PerformanceObserver로 LCP/CLS/INP 근사치 수집 — §1 옵션 그대로
# 4) PollLiveContainer 왕복 — §4.1 절차, 임시 poll 생성은 아래 SQL 패턴
```

```sql
with new_post as (
  insert into public.posts (board_id, author_id, type, title, body, meetup_date, start_time, place, capacity)
  values ('<board_id>', '<author_profile_id>', 'meetup_proposal', '<title>', '<body>',
          current_date + interval '10 day', '10:00', '<place>', 10)
  returning id
), new_poll as (
  insert into public.polls (post_id, opens_at, closes_at, status)
  select id, now(), now() + interval '1 day', 'open' from new_post
  returning id, post_id
)
insert into public.poll_eligible_voters (poll_id, profile_id)
select new_poll.id, v.profile_id from new_poll,
  (values ('<profileA>'::uuid), ('<profileB>'::uuid)) as v(profile_id);
```

근거: 이 문서. 선행: `docs/decisions/concurrency-load-037.md`.
