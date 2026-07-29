# 25일차 — AppShell 높이 체인(I-118·I-122) 정밀 시각 회귀검증

**작업자**: DESIGN · **일자**: 2026-07-29(25일차) · **배정**: 팀장(CORE 리뷰 짝, 24일차에
CORE 스스로 "19라우트 × 라이트/다크 × 3뷰포트 회귀 검증이 필요해 별도 회차가 적절하다"고
미뤄 둔 바로 그 검증)

이 문서는 `docs/decisions/appshell-height-chain-118-122.md`(CORE, 원 수정·1차 스모크)의
**짝 문서**다. **CORE 문서는 고치지 않았다** — 원 수정 근거·1차 스모크(19라우트 200/렌더/
콘솔0, 채팅방 실측)는 그 문서가 단일 소스이고, 이 문서는 거기서 명시적으로 "DESIGN
교차검증 몫"으로 남긴 **정밀 시각 회귀**만 다룬다.

**결론: fail 0건.** 아래 근거로 판정한다.

---

## 1. 검증 대상과 위험 가설

CORE의 변경은 3곳이다(원문 그대로 인용):

- `src/app/(shell)/layout.tsx` — `<body>` `min-h-full` → `h-full`
- `src/components/shell/AppShell.tsx` — 루트 `div` `min-h-full` → `h-full`, `#main-content`
  래퍼에 `min-h-0` 추가
- `overflow`는 어디도 바꾸지 않았다

**위험 가설**: `min-height`는 하한만 정해 자손이 아무리 길어도 상한이 없다 — 콘텐츠가
얼마나 길든 그 부모가 "부족한 만큼 그냥 늘어난다." `height`(확정값)는 다르다 — **상한을
만든다.** 콘텐츠가 그 확정 높이보다 길면, 자손 어딘가에 `overflow: hidden`이 있으면
잘리고, 없으면 박스 밖으로 흘러넘친다(overflow 자체를 바꾸지 않았다는 CORE의 주장이
맞다면 후자라 실제로는 "안 잘리고 문서가 계속 자라야" 정상이다 — 그 주장 자체를 실측으로
검증하는 것이 이 문서의 목적이다).

**왜 스모크(200 응답·렌더 여부·콘솔 에러 0)로는 이 위험이 안 잡히는가**: 콘텐츠가 잘려도
HTTP 상태 코드는 그대로 200이고, 렌더 자체는 "된다"(DOM에 존재한다 — 다만 뷰포트/조상
박스 밖으로 잘려 안 보일 뿐이다), 콘솔에도 아무 에러가 안 남는다. **클리핑은 순수하게
레이아웃 문제라 JS 예외를 던지지 않는다** — 그래서 CORE의 1차 스모크(19라우트 200/콘솔0)가
이 위험을 원천적으로 못 잡는 것이 아니라, **애초에 그 스모크가 잡도록 설계되지 않은
위험**이다. 시각적으로 픽셀을 보거나, 스크롤 도달성을 좌표로 재는 것만이 이 위험을 잡는다.

---

## 2. 방법론 — 왜 스크린샷 육안 대조가 아니라 수치를 택했는가

스크린샷은 "그 순간 그 크기로는 안 잘렸다"만 보여준다. 이 프로젝트처럼 콘텐츠 길이가
가변적인 화면(댓글 수·신고 대기열 크기·초대장 수)에서는 **스크린샷 1장이 다른 콘텐츠
길이에서도 안전하다는 것을 보증하지 못한다** — 24일차 FR-055 오판정("짧은 방에서만
성립한 판정")이 정확히 이 함정이었다(같은 함정을 이번 회차에도 피하려고 §5에서 의도적으로
"가장 긴 페이지"를 만들어 재현했다).

그래서 세 가지 **수치** 판정을 우선했다:

1. **`reachedScrollTop === maxPossibleScrollTop`**(`maxPossibleScrollTop = documentScrollHeight
   - innerHeight`) — `window.scrollTo(0, documentScrollHeight)`를 호출한 뒤 실제로 그
   지점까지 스크롤됐는지를 좌표로 확인한다. 이 값이 어긋나면 "스크롤이 중간에 막혔다"(문서
   자체가 예상보다 짧게 클리핑됐거나, 스크롤 컨테이너가 의도치 않게 생겨 문서 스크롤을
   가로챘다)는 뜻이다.
2. **마지막 콘텐츠 요소의 `getBoundingClientRect().bottom`이 스크롤 후 뷰포트 안**
   (`0 <= bottom <= innerHeight`, ±2px 오차 허용) — 문서 `scrollHeight`가 맞아도 마지막
   요소 자체가 어딘가에 잘려 있으면(예: 부모 박스가 `overflow:hidden`인데 문서 스크롤
   계산에는 안 잡히는 기묘한 경우) 이 값이 벗어난다. **"스크롤은 되는데 잘려 있다"는
   시나리오는 1번만으로는 못 잡고 이 값이 잡는다.**
3. **`document.scrollingElement.scrollWidth > innerWidth`(가로 스크롤)** — 높이 체인
   변경이 폭 계산에 부수효과를 낼 가능성(예: 스크롤바 유무로 인한 폭 재계산)을 배제한다.

세 값 전부 원시 좌표/불리언이라 재현 가능하고, 다음 회차가 같은 스크립트를 그대로
재실행해 회귀 여부를 자동으로 비교할 수 있다 — 스크린샷은 그 자체로는 diff가 안 된다.
**다만 수치만으로는 "왜" 잘렸는지, 시각적으로 무엇이 이상한지는 안 보이므로**, I-098·
I-104처럼 이미 알려진 시각 회귀 후보와 가장 긴 페이지(§5.3)에는 스크린샷을 보완으로
남겼다(§7 파일 목록).

---

## 3. 원시 수치 표 — 1차(6라우트 × 3뷰포트, 라이트)

`chopin0625@gmail.com` 로그인, `window.scrollTo(0, docH)` 후 측정. `reached=max`는
`reachedScrollTop === maxPossibleScrollTop`을 뜻한다.

| 라우트 | 뷰포트 | docH | innerH | reached/max | reached=max | lastEl.bottom | 가시성 | 가로스크롤 |
| --- | --- | ---: | ---: | --- | :-: | ---: | :-: | :-: |
| /home | 360×800 | 800 | 800 | 0/0 | ✅ | 594 | ✅ | ❌ |
| /crews | 360×800 | 2291 | 800 | 1491/1491 | ✅ | 784 | ✅ | ❌ |
| /settings | 360×800 | 2979 | 800 | 2179/2179 | ✅ | 800 | ✅ | ❌ |
| /calendar | 360×800 | 1062 | 800 | 262/262 | ✅ | 800 | ✅ | ❌ |
| /notifications | 360×800 | 849 | 800 | 49/49 | ✅ | 784 | ✅ | ❌ |
| /invitations | 360×800 | 800 | 800 | 0/0 | ✅ | 243 | ✅ | ❌ |
| /home | 768×1024 | 1024 | 1024 | 0/0 | ✅ | 594 | ✅ | ❌ |
| /crews | 768×1024 | 1447 | 1024 | 423/423 | ✅ | 1008 | ✅ | ❌ |
| /settings | 768×1024 | 2919 | 1024 | 1895/1895 | ✅ | 1024 | ✅ | ❌ |
| /calendar | 768×1024 | 1202 | 1024 | 178/178 | ✅ | 1024 | ✅ | ❌ |
| /notifications | 768×1024 | 1024 | 1024 | 0/0 | ✅ | 833 | ✅ | ❌ |
| /invitations | 768×1024 | 1024 | 1024 | 0/0 | ✅ | 223 | ✅ | ❌ |
| /home | 1280×800 | 800 | 800 | 0/0 | ✅ | 594 | ✅ | ❌ |
| /crews | 1280×800 | 1447 | 800 | 647/647 | ✅ | 784 | ✅ | ❌ |
| /settings | 1280×800 | 2919 | 800 | 2119/2119 | ✅ | 800 | ✅ | ❌ |
| /calendar | 1280×800 | 1042 | 800 | 242/242 | ✅ | 800 | ✅ | ❌ |
| /notifications | 1280×800 | 849 | 800 | 49/49 | ✅ | 784 | ✅ | ❌ |
| /invitations | 1280×800 | 800 | 800 | 0/0 | ✅ | 223 | ✅ | ❌ |

**18/18 전부 일치, 18/18 전부 가시, 18/18 가로스크롤 없음.**

다크모드 재확인(3조합, 표본): `/crews` 360×800(docH=2291)·1280×800(docH=1447)·
`/settings` 360×800(docH=2979) — **라이트와 완전히 동일한 docH·도달성.** 테마는 색
토큰만 바꾸고 레이아웃에 관여하지 않는다는 예상과 일치한다(`ThemeProvider`가 `<html>`
클래스만 토글, 치수 관련 CSS 없음).

### I-099(헤더↔탭바) — 3뷰포트

`/crews`, `chopin0625` 로그인:

| 뷰포트 | `header nav` display | 탭바 display | 탭바 position | 프레임 폭 |
| --- | --- | --- | --- | --- |
| 360×800 | none | flex | fixed | 360 |
| 768×1024 | none | flex | fixed | 430 |
| 1280×800 | none | flex | fixed | 430 |

D-066("항상 모바일 폭 프레임, 탭바만 노출")과 3/3 일치 — 재발 없음.

---

## 4. I-098 — `/sample` `PreviewFrame` 폭 토글 (AppShell 데모)

가장 의심했던 지점: `shell.tsx`의 AppShell 데모가 `PreviewFrame height={360}`(고정 px +
`overflow-hidden`)을 쓴다 — `h-full`이 이 안에서 제대로 채워지는지가 관건이었다.

**폭 토글 클릭 → 프레임 실측 폭**:

| 토글 | 실측 `width` | 실측 `height` |
| --- | ---: | ---: |
| 360 | 360 | 360 |
| 768 | 768 | 360 |
| 1280 | 1280 | 360 |
| 전체 | 1352 | 360 |

**4개 값이 전부 다르다** — 재발했다면(I-098이 다시 뚫렸다면) 전부 같은 폭(~394~430px)에
수렴했을 것이다(23일차 원 결함의 증상, `docs/ISSUES.md` I-098 참고). 폭이 서로 다르다는
것 자체가 반증 조건을 통과한 근거다.

**AppShell 데모 내부 높이 채움 확인**(`h-full` 체인이 PreviewFrame 안에서도 무너지지
않는지):

```json
{"previewBoxHeight":360,"appShellRootHeight":360,"tabbarFound":true,
 "tabbarBottom":729.5625,"previewBoxBottom":730.5625}
```

`appShellRootHeight`(360)이 `previewBoxHeight`(360)와 **정확히 일치** — 상한(`h-full`)이
부모의 확정 높이(PreviewFrame의 inline `style.height`)를 정확히 물려받았다. 탭바
`bottom`(729.56)과 프레임 `bottom`(730.56)의 차이는 약 1px로 — `fixed` 탭바가
`transform` 컨테이닝 블록 트릭(`PreviewFrame` 자체 docstring이 설명하는 그 트릭)으로
프레임 밑단에 정확히 붙어 있다(잘려서 프레임 밖으로 나가지도, 안쪽에 붕 떠 있지도 않다).

4상태 토글(기본/로딩/빈 상태/오류)도 AppShell 항목에서 전부 클릭 성공, 렌더 에러 텍스트
0건. 스크린샷(`shell-section-after-states.png`, §7)으로 "오류" 상태 + "전체" 폭에서
배너·로고·콘텐츠·탭바 4항목 전부 육안으로도 잘림 없음을 확인했다.

---

## 5. 보완 실측 — 팀장 지정 고위험 3곳(2026-07-29, 25일차)

1차 6라우트의 최댓값은 `/settings`의 docH 2979였다. 이 셋은 **그 최댓값을 넘어서는
콘텐츠 축**(댓글·참석자·신고 대기열)이라 별도로 재현했다.

### 5.1 `/crews/{id}/board/[postId]` — 댓글 35개 (최우선, 이번 회차 최장 페이지)

BOARD가 같은 날 이 화면(`PostDetail`·`CommentItem`)에 신고 진입점을 추가하고 있어, "화면에
신고 버튼이 보이는 것"은 오늘 정상이다(CORE 회귀와 무관, 팀장이 사전 고지).

| 뷰포트 | docH | innerH | reached/max | reached=max | lastEl.bottom | 가시성 | 가로스크롤 |
| --- | ---: | ---: | --- | :-: | ---: | :-: | :-: |
| 360×800 | **5849** | 800 | 5049/5049 | ✅ | 784 | ✅ | ❌ |
| 768×1024 | 5235 | 1024 | 4211/4211 | ✅ | 1008 | ✅ | ❌ |
| 1280×800 | 5235 | 800 | 4435/4435 | ✅ | 784 | ✅ | ❌ |

**docH=5849는 1차 6라우트 최댓값(2979)의 거의 두 배다.** DOM에서 삽입한 댓글 마커
문자열(`[QA-TEMP-COMMENT-25]`) 출현 횟수를 셌더니 **35/35 전부 렌더** — "스크롤은
끝까지 되는데 뒤쪽 댓글 몇 개가 가상화·클리핑으로 안 그려졌다"는 가능성까지 닫았다.

### 5.2 `/meetups/[meetupId]` — 참석자 3구분(attending/absent/무응답)

"알고리즘 스터디" 5회차 모임(이 세션 seed 데이터에서 가장 인원이 많은 크루, 5명)에
참석 응답 4건(attending 3·absent 1, 나머지 1명은 의도적으로 무응답 상태로 남김 —
3구분 전부 채우기 위해)을 채워 재현.

| 뷰포트 | docH | innerH | reached/max | lastEl.bottom | 가시성 | 가로스크롤 |
| --- | ---: | ---: | --- | ---: | :-: | :-: |
| 360×800 | 800 | 800 | 0/0 | 783 | ✅ | ❌ |
| 768×1024 | 1024 | 1024 | 0/0 | 783 | ✅ | ❌ |
| 1280×800 | 800 | 800 | 0/0 | 783 | ✅ | ❌ |

**짧다고 그냥 넘기지 않는다 — 왜 짧은지를 데이터 구조로 설명한다.** 참석자 목록의
길이는 크루 멤버 수에 의해 구조적으로 상한이 걸린다(FR-068 참석자 3구분 목록은 크루
전체 멤버를 대상으로 하고, 이 seed 데이터의 최대 크루 인원이 5명이다) — 즉 이 축은
게시판 댓글처럼 무한히 길어질 수 있는 축이 아니라, **이 세션의 데이터로는 구조적으로
1차 6라우트의 최댓값(2979)에 도달할 수 없다.** 클리핑 위험 자체가 낮다는 뜻이지 검증을
안 했다는 뜻이 아니다 — 짧은 상태에서도 도달성·가시성·가로스크롤 3종은 위와 같이
전부 정상이었다.

### 5.3 `/admin` — 관리자 계정, 임시 신고 8건

24일차 FR-055가 "짧은 방에서만 성립한 판정"으로 뒤집힌 전례가 있어, **신고 0건인 채로
관리자 화면을 보고 "짧아서 안전하다"고 판정하지 않았다** — 임시 신고 8건을 채워 긴
상태를 인위적으로 만든 뒤 쟀다. `0625chopin@gmail.com`(`is_system_admin=true`) 로그인.

| 뷰포트 | docH | innerH | reached/max | lastEl.bottom | 가시성 | 가로스크롤 |
| --- | ---: | ---: | --- | ---: | :-: | :-: |
| 360×800 | 2437 | 800 | 1637/1637 | 784 | ✅ | ❌ |
| 768×1024 | 2437 | 1024 | 1413/1413 | 1008 | ✅ | ❌ |
| 1280×800 | 2437 | 800 | 1637/1637 | 784 | ✅ | ❌ |

DOM에서 신고 마커(`[QA-TEMP-REPORT-25]`) 출현 횟수 **8/8 전부 렌더**. 스크린샷
(`admin-with-reports-360.png`, §7)으로 카드가 잘리거나 탭바와 겹치지 않음을 육안
확인 — 25일차 오전에 내가 고친 `AdminReportsContainer`(I-115)와 CORE의 높이 체인
변경이 같은 화면에서 겹치는 유일한 지점인데, 상호작용 문제는 없었다.

---

## 6. 재현 절차

### 6.1 임시 데이터 — 마커 규칙과 원복

전부 `[QA-TEMP-*-25]` 접두 마커를 본문/사유에 심어 grep으로 정확히 찾아 지울 수 있게
했다(24일차 이전부터 이 저장소가 써 온 관례와 동일). SQL은 Supabase MCP
`execute_sql`로 직접 실행했다(RLS 우회, `postgres`/서비스 role) — 브라우저로 하나씩
입력하는 대신 대량 생성·정리가 필요해서다.

```sql
-- 댓글 35개 (게시글 1f26f55a-71a8-495c-b07c-3680100861ab)
insert into public.comments (post_id, author_id, body)
select '1f26f55a-71a8-495c-b07c-3680100861ab', '30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a',
  '[QA-TEMP-COMMENT-25] AppShell 높이 체인 회귀검증용 임시 댓글 ' || gs || '번째'
from generate_series(1, 35) gs;

-- 참석 응답 4건 (Meetup 0a0f19cf-7dc0-4709-bace-f4a6941492df, "알고리즘 스터디" 5명 크루)
insert into public.meetup_attendances (meetup_id, profile_id, status) values
  ('0a0f19cf-…','20a56163-…','attending'),
  ('0a0f19cf-…','f1692173-…','attending'),
  ('0a0f19cf-…','c64e5973-…','absent'),
  ('0a0f19cf-…','30f44dd9-…','attending');
  -- 5번째 멤버(chopin_0625)는 의도적으로 무응답 상태로 남김 — 3구분 전부 채우기 위해

-- 신고 8건 (서로 다른 게시글 8개 대상)
insert into public.reports (reporter_id, target_type, target_id, reason, status)
select '30f44dd9-…', 'post', pid, '[QA-TEMP-REPORT-25] AppShell 회귀검증용 임시 신고', 'pending'
from (values ('e2736eb9-…'::uuid), ('1f26f55a-…'::uuid), /* … 8개 */) as t(pid);

-- 정리(회차 종료 시 실행, 마커로 정확히 대상만 지움)
delete from public.comments where body like '[QA-TEMP-COMMENT-25]%';
delete from public.meetup_attendances where meetup_id='0a0f19cf-…'
  and profile_id in ('20a56163-…','f1692173-…','c64e5973-…','30f44dd9-…');
delete from public.reports where reason like '[QA-TEMP-REPORT-25]%';
```

원복 확인(정리 직후 재조회): `leftover_comments=0`·`leftover_attendance=0`·
`leftover_reports=0`, 원 게시글 댓글 수 0(시작 전과 동일), Task 036 테스트 크루
(`729ced18-2016-459a-94c3-e7959dfe808c`)는 `status='active'` 그대로(건드리지 않음).

### 6.2 격리 Chromium 구동 (MCP 공유 세션 우회)

BOARD가 같은 날 먼저 겪고 우회한 방식(Task 033·037 전례)을 그대로 썼다 —
`node_modules/playwright`로 시스템 Chrome을 **완전히 새 임시 프로필**로 직접 띄운다.
MCP `browser_*` 툴의 공유 프로필(`~/.cache/ms-playwright-mcp/mcp-chrome-*`)과 겹치지
않아 다른 세션과 경합하지 않는다:

```js
import { chromium } from "<repo>/node_modules/playwright/index.mjs";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/opt/google/chrome/chrome", // MCP가 쓰는 것과 같은 바이너리,
                                                 // 프로필만 별도(기본값 = 매번 새 임시 디렉터리)
  args: ["--no-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
const page = await context.newPage();

// 로그인
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByRole("textbox", { name: "이메일" }).fill("chopin0625@gmail.com");
await page.getByRole("textbox", { name: "비밀번호" }).fill("qwer1234");
await page.getByRole("button", { name: "로그인" }).click();
await page.waitForURL(/\/home/, { timeout: 15000 }).catch(() => {});

// 도달성·가시성·가로스크롤 3종 판정
const metrics = await page.evaluate(() => {
  const doc = document.scrollingElement;
  const docH = doc.scrollHeight;
  window.scrollTo(0, docH);
  const main = document.querySelector("main") || document.body;
  const rect = (main.lastElementChild || main).getBoundingClientRect();
  return {
    documentScrollHeight: docH,
    innerHeight: window.innerHeight,
    reachedScrollTop: doc.scrollTop,
    maxPossibleScrollTop: docH - window.innerHeight,
    lastElementBottom: rect.bottom,
    lastElementVisibleAfterScroll: rect.bottom <= window.innerHeight + 2 && rect.bottom >= -2,
    hasHorizontalOverflow: doc.scrollWidth > window.innerWidth + 1,
  };
});

await browser.close(); // 임시 프로필이라 이걸로 완전히 정리된다(디스크에 남기지 않음)
```

**주의**: `node_modules/playwright`가 기대하는 `chromium_headless_shell` 바이너리가
이 환경엔 없어(`~/.cache/ms-playwright`에 `chromium-1228`/`1232`만 있고 `1234`가
없음) `chromium.launch()` 기본 실행 파일 탐색이 실패한다 — `executablePath`로 시스템
Chrome(`/opt/google/chrome/chrome`, MCP도 쓰는 그 바이너리)을 직접 지정해야 뜬다.

다크모드는 UI 클릭 대신 `localStorage.setItem("mo_im-theme", "dark")` 후 새로고침으로
강제했다(`THEME_STORAGE_KEY`, `src/components/theme/theme-config.ts`) — `ThemeProvider`가
mount 시 이 값을 읽어 `<html>` 클래스를 즉시 반영한다.

### 6.3 오늘 겪은 브라우저 봉쇄와 진단 — 다음 사람이 15분을 아끼도록

**증상**: MCP `browser_navigate` 등 모든 `browser_*` 호출이
`Error: Browser is already in use for /home/cho/.cache/ms-playwright-mcp/mcp-chrome-*,
use --isolated to run multiple instances of the same browser`로 계속 실패했다(15분
넘게, 8회 이상 재시도).

**섣부른 결론에 빠지지 않은 지점**: 처음엔 Chrome 자체의 `SingletonLock`(프로필
디렉터리 안의 심볼릭 링크, PID를 가리킴) 파일이 원인이라고 가정했다. 그런데 그 파일이
**10초 이상 안정적으로 사라진 것을 스크립트로 직접 확인한 직후에도** 같은 오류가
그대로 재현됐다 — 즉 **파일 락 상태와 실제 오류 발생 여부에 상관관계가 없었다.**

```bash
# 락 파일 상태 직접 확인(반례를 만든 스크립트)
until [ ! -e ~/.cache/ms-playwright-mcp/mcp-chrome-*/SingletonLock ]; do sleep 4; done
sleep 3  # 안정성 재확인
[ ! -e ~/.cache/ms-playwright-mcp/mcp-chrome-*/SingletonLock ] && echo "FREE — 그래도 재시도는 실패했다"
```

**결론(추정, 완전히 확정하지는 않음)**: Chrome 프로세스 자체의 파일 락이 아니라 **다른
세션의 playwright-mcp 서버 프로세스가 CDP(Chrome DevTools Protocol) 연결을 붙잡고
있는 것**으로 보인다 — 그 세션이 `browser_close`를 호출하거나 프로세스가 끝나야 풀린다.
여러 세션이 같은 `.mcp.json`(`playwright` 서버, `--browser chrome`, `--isolated` 옵션
없음)을 공유해 전부 같은 프로필(`mcp-chrome-*`)로 수렴하는 것이 근본 원인이다.

**우회(이번에 실제로 통했다)**: §6.2의 격리 Chromium 직접 구동 — MCP 서버·공유 프로필을
아예 거치지 않으므로 다른 세션과 절대 경합하지 않는다. **다음에 같은 오류를 만나면
`browser_*` MCP 툴을 기다리지 말고 바로 이 방식으로 전환할 것**을 권한다(BOARD가 같은
날 먼저 검증한 방법이기도 하다, Task 033·037 전례).

**하지 않은 것**: 다른 세션의 Chrome 프로세스를 강제 종료(`kill`)하지 않았다 — 23일차
I-098 해소 기록에 "공유 디렉터리 재빌드 과정에서 다른 팀원 서버 프로세스가 내려간"
사고 전례가 있어, 확실히 내 것이 아닌 프로세스를 죽이는 위험을 감수하지 않았다.

---

## 7. 산출물

- 이 문서.
- 스크린샷(휘발성 임시 디렉터리, 이 세션 종료 시 사라짐 — 재현이 필요하면 §6.2 스크립트를
  다시 돌려 새로 생성한다): `shell-section-after-states.png`(I-098, "오류" 상태 + "전체"
  폭), `sample-board.png`·`sample-admin.png`·`sample-auth.png`(§4 4상태 토글 표본),
  `dark-crews-360.png`·`dark-crews-1280.png`·`dark-settings-360.png`(다크모드 표본),
  `admin-with-reports-360.png`(§5.3).
- **재현 스크립트 자체는 파일로 남기지 않는다**(24일차 운영 규칙 — 임시 산출물은
  리포지터리 밖 scratchpad에서만 다루고, 재현 가치가 있는 것은 이 문서에 스니펫으로
  옮긴다). §6.2가 그대로 재실행 가능한 형태다.
- DB 임시 데이터: 전부 원복(§6.1 마지막 확인 결과 참고). 새 마이그레이션 없음(이번
  작업은 검증이지 스키마 변경이 아니다).

---

## 8. 4층 분류 — 무엇을 어떻게 확인했는가 (누락 없이)

**① 구조적으로 배제한 것(코드 근거, 브라우저 실측 안 함)**

- `CrewFilterPanel`의 `overflow-y-auto`는 `max-h-56`(자체 고정 높이, rem 단위) 안에
  있어 셸 높이 체인과 무관 — `grep`으로 확인.
- `DayDetailPanel`/`Drawer`(`ui/drawer.tsx`)는 `position:fixed` + `100dvh` 기반
  (`--drawer-content-max-height: calc(100dvh - 6rem)`) — Portal 렌더링이라 셸의 DOM
  트리 자체에 속하지 않는다.
- `Dialog`(`ui/dialog.tsx`)도 `fixed` + 뷰포트 기준 좌표(`top-1/2 left-1/2`)이고,
  **이 저장소에 `DialogContent`와 `overflow-y-auto`/`max-h-[`를 함께 쓰는 컴포넌트가
  0건**이다(`grep` 전수 확인) — 애초에 내부 스크롤 패턴 자체가 없다.
- `src/app/sample/layout.tsx`는 `(shell)/layout.tsx`와 별개인 독립 루트 레이아웃
  (Next 16 복수 루트 레이아웃, I-098 해소가 만든 구조)이라 자기 자신의 `<body>
  min-h-full>`을 그대로 쓴다 — CORE의 body 변경 영향권 밖.

**② 수치로 실측한 것(전부 PASS)** — §3·§4·§5 표 전체(1차 18조합 + I-098 4조합 +
보완 9조합 = 31개 수치 판정 지점, 전부 도달성·가시성·가로스크롤 이상 없음).

**③ 표본만 본 것**

- `/sample` 4상태 토글 — "앱 셸"(AppShell) 항목은 전수, `board`·`admin`·`auth` 3개
  섹션은 스크린샷 표본(`scrollIntoView`가 정확히 의도한 720/720/680px 데모 패널이
  아니라 근처 섹션에 걸렸을 가능성이 있다 — 완전히 그 특정 패널만 겨냥한 확인은 아니다).
- 다크모드 — 3조합만(`/crews` 360·1280, `/settings` 360). 라이트를 우선했다.

**④ 아예 안 본 것**

- CORE가 이미 1차 스모크(200/렌더/콘솔0)를 마친 10라우트 — `/`·`/login`·`/signup`·
  `/crews/{id}`·`/crews/{id}/board`·`/crews/{id}/settings`·`/crews/{id}/chat`·
  `/crews/{id}/members`·`/crews/new`·`/admin`(게스트/비관리자 케이스만). 오늘 내가
  재검증한 것은 관리자 케이스(§5.3)뿐이다.
- `/crews/{id}/board/new`·`/onboarding`·`/account/restore`·`/auth/confirm*`·
  `/reset-password*` — 팀장 판단(짧은 폼 위주 화면)에 따라 범위에서 제외했다.
- `/sample` 나머지 30개 섹션(총 33개 중 3개만 표본) — 팀장 지시로 하지 않았다("비용
  대비 얻는 게 적다").
- 모달·시트 내부 스크롤의 **브라우저 실측** — ①의 코드 근거("애초에 내부 스크롤 쓰는
  Dialog가 0건")로 대체했다. 실제로 클릭해서 열어 보지는 않았다.
