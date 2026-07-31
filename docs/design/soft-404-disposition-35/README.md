# I-052 · 인증 보호 라우트 소프트 404(HTTP 200) 처분안 조사 (35일차, DESIGN)

배정 근거: `docs/design/unexplored-followups-index/README.md` §2 랭킹 3위("설계 결정(D-040)
자체가 8일차부터 보류 상태로 방치돼 있다"). 이 문서는 처분안 작성을 위한 조사 기록이다 —
**처분안 자체(번호 없음)는 `docs/DECISIONS.draft.DESIGN.md`에 있다.** 코드 수정은 하지
않았다(팀장 승인 전 범위 밖, 배정 지시 준수).

## 0. 요약(TL;DR)

- **D-040이 보류한 이유 3가지 중 "이유 3"(v0.1 Mock 단계라 사용자·운영 영향 없음)은 더 이상
  유효하지 않다.** D-040 스스로 "Task 029A(RLS)·031(읽기 경로 실데이터 교체) 착수 전에
  재검토한다"고 명시했는데(`docs/ISSUES.md` I-044 상태 줄), 두 Task 모두 이미 끝났다 —
  I-052 자체가 바로 Task 031 프로덕션 빌드 검증 중 발견됐다(17일차). 재검토 트리거가 성립한
  지 18일이 지나도록 아무도 재검토하지 않은 것이 이번 배정 근거 그 자체다.
- **"이유 1"(experimental/canary API 리스크)은 오늘(35일차) `node_modules/next/dist/docs/`
  원문 재확인 결과 여전히 유효하다** — `forbidden`/`unauthorized`는 `version: experimental`,
  `authInterrupts`는 `version: canary`로 Next 16.2.11(설치된 버전과 동일)에 그대로 남아 있다.
  I-044가 요청한 "stable 승격 여부 재확인"에 대한 답은 **"승격 안 됨"**이다.
- **부수 발견(§3)이 이번 조사에서 가장 중요하다**: D-040이 승인한 "throw + `error.tsx` →
  HTTP 500 수용"이라는 현재 상태 서술 자체가 이미 낡았다. 20일차(I-069) 이후 도달성이 높은
  forbidden 지점 4곳(`CrewMemberGateLayout`·`CrewSettingsContainer`·`MeetupDetailContainer`·
  `PostWriteContainer`의 해산 크루 분기)은 throw를 던지지 않고 `RouteErrorBoundary`를
  **값으로 직접 반환**하도록 이미 바뀌어 있다 — 이 경로들은 HTTP 500이 아니라 **200**을
  낸다. 즉 D-040이 "수용한다"고 승인한 500은 이제 도달성이 "사실상 0"인 방어적 코드
  4곳에서만 실제로 발생하고, 사용자가 매일 마주치는 지점들은 이미 I-052와 **같은 패턴**
  (본문은 맞는데 상태만 200)으로 조용히 수렴해 있다. 문서(D-040)와 코드가 어긋난 상태다.
- **HTTP 상태 코드는 라우트마다 다르다 — 균일하지 않다.** 팀장이 35일차에 인증 세션으로
  10개 URL을 프로덕션 빌드에서 실측(§5.2, `HEAD=b14b594` + 워킹트리 dirty 기준)한 결과,
  "조상 `<Suspense>` 없음 → 진짜 404" 가설로 지목한 3곳(`/crews/[id]/board`·`/admin`·
  `/crews/[id]/board/new`)은 전부 적중했다. 다만 실제 소프트 200으로 남은 곳은 **10곳 중
  3곳**(`/crews/[crewId]` 자신·`/meetups/[id]`·`/meetups/[id]/reschedule`)뿐이었다 —
  `/board`·`/board/[postId]`·`/chat`·`/members`·`/settings`는 전부 진짜 404였다. **이유는
  가설이 틀려서가 아니라 §2 표가 서로 다른 5개 `notFound()` 호출 지점(컨테이너 자체 것)을
  "미확정"으로 잘못 묶었기 때문이다** — 존재하지 않는 크루 ID로 접근하면 그 5곳에 도달하기
  전에 상위 크루원 게이트 레이아웃의 `notFound()`가 항상 먼저 가로챈다(§5.2에서 이 착오를
  직접 정정한다). 원 제보(I-052, `/crews/[존재안함]`)가 실측한 지점은 여전히 **예외적으로
  `<Suspense>`가 있는 라우트**였다는 결론은 유효하다 — 다만 문제 규모는 처음 가정보다 훨씬
  작다.
- **권고(상세는 §6-§7, 35일차 실측 반영해 갱신)**: 후보 ①(현행 유지)을 기본으로 하되,
  **"현행"의 정의 자체를 D-040 당시 상태가 아니라 지금 상태로 갱신**한다. 소프트 200은
  이제 3개 라우트로 범위가 좁혀졌으므로 (c) 혼합안의 처분 대상·비용을 구체적으로 다시
  적는다. `proxy.ts` 전면 도입(후보 ②의 유일한 완화책)은 D-011 범위 밖이라 이번에도
  채택하지 않는다. `/admin`은 실측으로 진짜 404가 확인돼 AC2(경로 존재 비노출)가 상태
  코드 레벨까지 이미 충족됐다 — 별도 조치 불필요.
- **크루 ID 열거(재식별) 표면 — 팀장 질문 5에 대한 답(§8, 3차에 걸친 실측 + 코드 판정)**:
  `/crews/[crewId]`(크루 홈)·`/meetups/[id]`는 존재하지 않는 크루와 존재하는 비공개 크루
  (비소속)가 **둘 다 200**이라 상태 코드로는 구분되지 않는다(코드 100% 확정, §8.1).
  **반대로 `/crews/[id]/board`(및 형제 라우트 5개)는 leak이 확정됐다** — `public`(2차
  실측)·`private`+`active`(**3차 실측, 계정 전환으로 확보한 비소속 표본**) 둘 다 실측으로
  404 vs 200 구분을 확인했다. **`private`+`archived`만 예외로 leak이 없다고 예상되지만
  이 DB에 표본이 0건이라 미실측** — 코드 판정(`getCrewById`의 RPC 가드)과 CORE의 32일차
  I-148 실측(간접)에만 의존한다. (B)류(저위험, D-048 전례 적용) 팀장 승인 완료, 재검토
  조건 명시(§8.4).

---

## 1. D-040이 왜 보류됐는가 — 원문과 유효성 재검토

### 1.1 원문(그대로 옮김)

`docs/prioritization-and-risks.md` 822~862행, **D-040 · 라우트 레벨 권한 거부는 당분간
`error.tsx` + HTTP 500을 유지한다(`forbidden()`/`authInterrupts` 도입 보류)**:

> **확인한 사실**: `forbidden()`/`unauthorized()`는 이 Next 버전에 실제로 존재하지만, 세 문서
> 모두 frontmatter에 `version: experimental`(함수·file convention 문서)과 `version: canary`
> (`authInterrupts` 설정 문서)를 명시한다 — **`next.config.ts`의 `experimental.authInterrupts`
> 플래그 없이는 호출 자체가 안 되고, 그 플래그를 켜는 순간 이 API 표면 전체가 안정 API가
> 아니라는 경고를 문서가 스스로 달고 있다.**
>
> **결정**: 지금은 **후보 ①(현행 유지)** — `error.tsx` + `classifyError` +
> `RouteErrorBoundary(kind="forbidden")` 조합을 그대로 두고, v0.1 Mock 단계에서는 HTTP 500을
> 수용 가능한 상태로 문서화한다.
> - **이유 1(실험적 API 리스크)**: canary/experimental 태그가 붙은 API를 프로젝트 전역 오류
>   처리 방식으로 채택하면, 이후 Next 버전이 이 표면을 바꿀 때 전면 재작업 대상이 된다.
> - **이유 2(부분 도입이 오히려 더 나쁘다)**: 같은 종류의 오류가 두 가지 다른 메커니즘으로
>   갈라져 렌더되는 결과가 된다.
> - **이유 3(지금 당장 사용자·운영 영향이 없다)**: v0.1은 Mock 단계라 실제 크롤러·모니터링·
>   RLS 403이 아직 없다 — 상태 코드 정합성이 실제로 문제가 되는 시점은 **Task 029A(RLS)·
>   031(읽기 경로 실데이터 교체) 이후**다.

같은 결정의 원 이슈 `docs/ISSUES.md` 886~888행, **I-044**의 상태 줄(그대로 옮김):

> **상태**: 결정됨(보류) — **D-040**(8일차, CREW)이 후보 ①을 채택했다. […] **HTTP 상태
> 자체는 고치지 않았으므로 관측·실데이터 단계의 후속 과제(아래)는 유효하다** — Task
> 029A(RLS 정책)·031(읽기 경로 교체) 착수 전에 Next 버전의 `forbidden()`/`unauthorized()`
> stable 승격 여부를 다시 확인해 재검토한다.

**인용 검증 메모**: 배정 지시가 "D-040 자체가 8일차부터 보류"라고 적었는데, D-040 결정문
본문의 `일자` 필드는 `2026-07-24`(결정자 CREW)로만 돼 있고 "8일차"라는 표현은 D-040 본문에는
없다 — 이 표현은 **I-044의 상태 줄**(위 인용)에만 있다. 즉 "8일차"는 D-040을 낳은 원 이슈
I-044가 스스로를 가리키는 값이고, 이번 조사의 배정 근거 문서(§2-3 랭킹)도 이 값을 그대로
가져온 것으로 보인다 — 두 문서가 일치하므로 오인용은 아니지만, 출처는 D-040 본문이 아니라
I-044라는 점을 밝혀 둔다.

### 1.2 세 이유의 유효성 — 오늘(35일차) 재검토

| 이유 | D-040 당시 근거 | 지금(35일차) 재검토 | 유효성 |
| --- | --- | --- | --- |
| ① 실험적 API 리스크 | `forbidden`/`unauthorized`/`authInterrupts`가 experimental/canary | §4에서 `node_modules/next/dist/docs/` 원문 재확인 — **동일 버전(16.2.11)에서 태그 변화 없음** | **유효 — 재확인으로 강화됨** |
| ② 부분 도입 비일관 | 같은 종류 오류가 두 메커니즘으로 갈라짐 | §3에서 확인 — **이미 실제로 갈라져 있다**(D-039 게이트 등 4곳은 값 반환, 나머지 4곳은 throw). 다만 이 갈림은 `forbidden()` 도입 때문이 아니라 I-069(프로덕션 `cause` 직렬화 문제) 대응 때문에 생겼다 | **원 논리는 유효하지만 전제(현재는 단일 메커니즘)가 이미 깨졌다 — D-040 갱신 필요** |
| ③ 지금 당장 영향 없음(Mock 단계) | Task 029A·031 이전이라 크롤러·모니터링·RLS 403 없음 | **Task 029A·031 모두 완료(각 21일차 이전, 17일차)**. I-052 자체가 031 프로덕션 검증 중 발견됨. 관측(NFR-028, Sentry)은 아직 DSN 미발급으로 미완결(I-055, C류)이라 "지표 오염"의 실질 피해는 여전히 낮지만, "영향 없음"이라는 전제 자체는 더 이상 사실이 아니다 | **무효 — D-040이 스스로 정한 재검토 조건이 이미 성립했다** |

**결론**: 이유 ①은 오늘도 그대로 서 있어 "실험적 API 채택"이라는 결론까지 뒤집을 근거는
없다. 그러나 이유 ③이 무효화됐고 이유 ②의 전제(단일 메커니즘)가 깨졌으므로, **"현행 유지"
자체가 아니라 "현행 유지의 근거 문서(D-040)가 지금 상태를 서술하지 못하고 있다"는 것이
이번 조사의 핵심 결함**이다. 결정 자체를 뒤집을 근거는 부족하지만, 결정문은 갱신돼야 한다.

---

## 2. 보호 라우트 전수 목록 — `notFound()`/`forbidden` 지점과 스트리밍 경계

`grep -rn "notFound(" src/app src/components`(전수, 주석 인용 제외)를 세는 방법부터 밝힌다
— **파일 단위로 세면 11개**(레이아웃 2개 + 컨테이너 9개), **개별 실행문 단위로 세면 14곳**
(레이아웃 2개 파일은 각 1회, 컨테이너 9개 파일 중 3개(`CrewMembersContainer`·
`MeetupDetailContainer`·`MeetupRescheduleContainer`)는 각 2회씩 던져 9+3=12회). **아래 표는
파일도 실행문도 아니라 "서로 다른 트리거 조건" 단위로 12행이다** — 같은 파일 안에서도
트리거 조건이 다르면 별도 행으로 나눴고(`CrewMembersContainer`의 "크루 없음"과 "미인증
방어"는 #8·#9로 분리), 조건이 사실상 같으면 한 행에 합쳤다(`MeetupDetailContainer`·
`MeetupRescheduleContainer`의 각 2개 분기는 둘 다 "meetup 없음"이라 #11·#12 하나씩으로
합침) — 그래서 "11개 파일"·"14개 실행문"·"12개 표 행" 세 숫자가 전부 정확하면서도 서로
다르다(35일차 CORE 교차검증이 이 불일치를 지적해 세는 방법을 명시했다). 각 지점이
**HTTP 200(소프트) vs 진짜 404**로
갈리는 조건은 Next.js 공식 문서(§4.2)가 명시한 한 가지 규칙뿐이다: **응답이 스트리밍을
시작한 뒤에 `notFound()`가 던져지면 상태는 200으로 고정된다. 스트리밍은 `<Suspense>`
폴백이 렌더되거나 그 경계 아래에서 컴포넌트가 suspend할 때 시작된다.** 이 프로젝트에는
`loading.tsx` 파일이 한 곳도 없으므로(전수 확인, `find src/app -iname "loading*"` 0건),
스트리밍 여부는 **그 라우트의 `page.tsx`(또는 그 조상)가 명시적으로 `<Suspense>`를
쓰는가**로만 결정된다.

| # | 파일:행 | 트리거 | 직계 `page.tsx`의 `<Suspense>` | 조상 레이아웃의 `<Suspense>` | HTTP 상태(35일차 실측 반영, §5.2) |
| - | --- | --- | --- | --- | --- |
| 1 | `CrewHomeContainer.tsx:69` | `/crews/[crewId]`, 크루 없음 | **있음**(`(shell)/crews/[crewId]/page.tsx:19`) | 없음(이 라우트는 `(app)` 밖) | **200 — 실측 확정**(17일차 팀장, I-052 원 제보 / 35일차 팀장 재실측으로 재현) |
| 2 | `(app)/crews/[crewId]/layout.tsx:111` | `/crews/[id]/{board,chat,members,settings,board/new,board/[postId]}` **공통 상위 게이트**, 크루 없음 | 해당 없음(레이아웃 자신이 던짐 — 자식 `page.tsx`는 아예 렌더되지 않는다) | **없음**(`(shell)/layout.tsx`·`(app)/layout.tsx` 인증 통과 분기 둘 다 `<Suspense>` 미사용) | **404 — 실측 확정**(35일차 팀장, `/board`·`/board/new` 응답으로 확인). 아래 #4·#5·#7·#8·#10이 이 게이트 **뒤에** 있다는 것이 이번 실측의 핵심 정정이다(§5.2) |
| 3 | `(app)/admin/layout.tsx:36` | `/admin`, 비관리자 | 해당 없음(레이아웃 자신이 던짐) | **없음**(#2와 동일 구조) | **404 — 실측 확정**(35일차 팀장) — AC2가 상태 코드까지 이미 충족됨(§7) |
| 4 | `BoardListContainer.tsx:39` | `/crews/[id]/board`, **board만 없음(크루는 있음)** | 있음(`board/page.tsx:24`) | — | **도달 불가능 확정(구조적, §5.2 근거)** — 존재하지 않는 크루 ID로는 이 지점에 절대 도달하지 못한다(#2가 항상 먼저 가로챔). "board 있는 크루인데 board 행만 없음"이라는 시나리오는 `boards.crew_id unique`+`trg_crews_provision_owner_bootstrap`(크루 생성 시 board·chat_room을 예외 없이 함께 만드는 트리거)+client INSERT/DELETE 권한 REVOKE(마이그레이션 3건 인용, §5.2)로 **스키마 자체가 불가능하게 만든다** — 실측 대상 자체가 없다 |
| 5 | `PostDetailContainer.tsx:25` | `/crews/[id]/board/[postId]`, **board만 없음** | 있음(`board/[postId]/page.tsx:38`) | — | #4와 동일 근거로 **도달 불가능 확정**(게시글 자체가 없는 경우는 이 `notFound()`가 아니라 `PostDeletedNotice` 값-반환이 처리한다 — 별개 분기, §5.2) |
| 6 | `PostWriteContainer.tsx:45` | `/crews/[id]/board/new`, **board만 없음** | **없음**(`board/new/page.tsx`는 `<Suspense>` 없이 `PostWriteContainer`를 직접 렌더) | 없음 | **도달 불가능 확정** — 35일차 실측의 `/board/new` 404는 이 지점이 아니라 #2(크루 자체가 없음)가 먼저 가로챈 결과였다(§5.2). 이 지점 고유의 "크루는 있는데 board만 없음" 시나리오는 #4와 같은 근거로 스키마상 발생 불가능 |
| 7 | `MessageListContainer.tsx:38` | `/crews/[id]/chat`, **채팅방만 없음** | 있음(`chat/page.tsx:19`) | — | #4와 동일 근거로 **도달 불가능 확정** |
| 8 | `CrewMembersContainer.tsx:70` | `/crews/[id]/members`, **크루 없음(재확인, #2와 중복)** | 있음(`members/page.tsx:13`) | — | **404 — 실측 확정, 단 이 지점 자체가 아니라 #2가 낸 결과**(§5.2) — #2가 이미 크루 존재를 보장한 뒤라 이 재확인은 정상 경로에서 도달하지 않는 방어적 코드다(#9와 같은 성격) |
| 9 | `CrewMembersContainer.tsx:77` | 동일 라우트, 미인증 세션(방어적 분기) | 있음 | — | 방어적 코드, 정상 경로에서 도달하지 않음(주석 확인 — `(app)` 레이아웃이 이미 걸러 둠) |
| 10 | `CrewSettingsContainer.tsx:82` | `/crews/[id]/settings`, **크루 없음(재확인, #2와 중복)** | 있음(`settings/page.tsx:13`) | — | #8과 동일 — **404는 실측됐으나 이 지점 자체는 방어적 코드**(§5.2) |
| 11 | `MeetupDetailContainer.tsx:81,86` | `/meetups/[id]`, meetup 없음(2개 분기, **상위 게이트 레이아웃 없음**) | 있음(`meetups/[meetupId]/page.tsx:19`) | — | **200 — 실측 확정**(35일차 팀장) |
| 12 | `MeetupRescheduleContainer.tsx:54,59` | `/meetups/[id]/reschedule`, meetup 없음(2개 분기, 상위 게이트 없음) | 있음(`reschedule/page.tsx:19`) | — | **200 — 실측 확정**(35일차 팀장) |

**읽는 법(35일차 갱신)**: #1·#2·#3·#11·#12는 실측 확정. #8·#10은 "그 URL의 응답"은 실측됐지만
(404), **실제로 그 상태를 만든 것은 #2**이지 이 행이 나열하는 `notFound()` 자신이 아니다 —
크루가 존재하지 않으면 #2가 항상 먼저 실행을 가로채 #4·#5·#6·#7·#8·#10은 전부 미도달이다.
#4·#5·#6·#7은 스키마·트리거·권한(마이그레이션 3건, §5.2)로 **도달 자체가 구조적으로
불가능함이 확정**됐다 — "board/chat이 크루 존재 시점에 자동 프로비저닝된다"는 추정이 아니라
`trg_crews_provision_owner_bootstrap` 트리거 정의와 `crew_id unique` 제약을 직접 읽어 확인한
사실이다. §5-§6이 이 표를 반영해 갱신됐다.

`forbidden` 값-반환 지점(스트리밍과 무관하게 **항상 200**, §3에서 별도로 다룸)과 여전히
`throw`하는 지점(항상 500, 도달성 사실상 0)은 이 표에 넣지 않았다 — 둘 다 스트리밍 조건에
좌우되지 않아 §2의 질문(스트리밍 시점이 상태를 가르는가) 대상이 아니기 때문이다.

---

## 3. 부수 발견 — D-040이 승인한 "500 수용"은 이미 소수파다

`grep -rn "cause: {" src/`(전수)로 현재 남아 있는 throw 지점을 다시 세었다:

| 파일:행 | 트리거 | 20일차(I-069) 이후 상태 | 도달성(19일차 인벤토리, `prioritization-and-risks.md` 2410~2431행 표 인용) |
| --- | --- | --- | --- |
| `(app)/crews/[crewId]/layout.tsx` | 크루원 아님(D-039 게이트) | **값 반환으로 전환됨**(`CrewMemberGateLayout` 118행, `RouteErrorBoundary` 직접 렌더, 트레이드오프 docstring은 87행) → **HTTP 200** | 높음 |
| `MeetupDetailContainer.tsx` | 비크루원의 Meetup 접근 | **값 반환**(91행, 전환 경위 docstring 41행) → **HTTP 200** | 높음 |
| `CrewSettingsContainer.tsx` | 임원 미만의 설정 접근 | **값 반환**(90행) → **HTTP 200** | 높음 |
| `PostWriteContainer.tsx` | 해산된 크루의 글쓰기 | **값 반환**(57~58행) → **HTTP 200** | 중간 |
| `BoardListContainer.tsx:46` | `board:read` 거부 | throw 유지 → HTTP 500 | **사실상 0**(`board:read`는 crew_member 이상 전원 allow, D-039가 이미 크루원 여부를 걸러 이 분기가 탈 매트릭스 조건이 없음) |
| `PostDetailContainer.tsx:32` | `board:read` 거부 | throw 유지 → HTTP 500 | **사실상 0**(동일 이유) |
| `MessageListContainer.tsx:45` | `chat:send_message` 거부 | throw 유지 → HTTP 500 | **사실상 0**(동일 이유) |
| `PostWriteContainer.tsx:52` | `post:create` 거부 | throw 유지 → HTTP 500 | **사실상 0**(동일 이유) |

**해석**: D-040은 "라우트 레벨 권한 거부는 `error.tsx`+500을 수용한다"고 승인했지만, 지금
그 500을 실제로 내는 4곳은 전부 현재 권한 매트릭스로는 **도달 불가능한 방어적 코드**다.
사용자가 실제로 부딪히는 4곳(D-039 게이트·Meetup 상세·크루 설정·해산 크루 글쓰기)은
20일차(I-069, "프로덕션에서 Next.js가 서버 컴포넌트 예외의 `cause`를 클라이언트로 넘기지
않는다"는 별개 문제 대응 과정)에 이미 값 반환으로 조용히 전환되어 **I-052와 똑같은
패턴**(본문은 요구사항대로인데 HTTP 상태만 200)으로 수렴해 있다. `CrewMemberGateLayout.tsx`
87~92행 docstring이 이미 이 사실을 스스로 기록하고 있다:

> **트레이드오프(정직하게 기록)**: 예외를 던지지 않으므로 HTTP 응답이 500이 아니라 **200**이다.
> […] I-044가 우려한 "500이 오류율 지표를 오염시킨다"는 이 네 곳에서는 해소되지만, 요구사항이
> 명시하는 403 자체는 여전히 아니다(200) — `docs/prioritization-and-risks.md` D-040 갱신
> 이력과 `docs/decisions/domain-error-channel-069.md` 참고.

즉 **코드는 이미 D-040 갱신을 기다리고 있다고 스스로 적어 뒀는데, `prioritization-and-risks.md`
D-040 본문은 8일차(I-044 기준) 그대로다.** 이번 조사가 그 갱신 요청에 응답한다.

---

## 4. Next.js 16 API 재확인 — 원문 인용(추측하지 않음)

설치된 버전: `node_modules/next/package.json` → `"version": "16.2.11"`(프로젝트가 참조하는
버전과 동일).

### 4.1 `forbidden()`/`unauthorized()`/`authInterrupts` — 여전히 실험적

- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/forbidden.md` 1~4행:
  frontmatter `version: experimental`.
- `.../04-functions/unauthorized.md` 1~4행: frontmatter `version: experimental`.
- `.../03-file-conventions/forbidden.md`·`unauthorized.md`: 특수 파일(`forbidden.tsx`/
  `unauthorized.tsx`)도 각각 `version: experimental`.
- `.../05-config/01-next-config-js/authInterrupts.md` 1~4행: frontmatter `version: canary`,
  본문 13행 "While these functions are experimental, you must enable the `authInterrupts`
  option […] to use them".
- `forbidden.md` 168~172행 Version History: `v15.1.0`에 도입된 뒤 이 문서 트리 안에서
  stable 승격 이력이 없다(표에 항목이 하나뿐).

**결론**: I-044가 요청한 "029A·031 착수 전 재확인"에 지금 답한다 — **여전히 experimental/
canary다.** D-040 이유 ①은 오늘도 그대로 유효하다.

### 4.2 `notFound()`/`not-found.tsx` — 소프트 404는 문서화된 설계, 새 완화책은 없음

- `.../03-file-conventions/not-found.md` 13행: "Next.js will return a `200` HTTP status
  code for streamed responses, and `404` for non-streamed responses" — I-052가 이미 인용한
  문장과 동일, 이번 버전에서도 변화 없음.
- `.../03-file-conventions/loading.md` "Status Codes" 절(약 103~116행): "If you need a 404
  status, for compliance or analytics, ensure the resource exists before the response body
  is streamed […] You can run this check in `proxy` to rewrite missing slugs to a not-found
  route, or produce a 404 response. Keep proxy checks fast, and avoid fetching full content
  there." 그리고 접힌 상세("When is the response body streamed?"): "**Place `notFound()`
  before those boundaries and before any `await` that may suspend.**" — 이 마지막 문장이
  §2의 표를 만든 근거다: `<Suspense>` 경계가 없는 지점에 놓인 `notFound()`(§2의 #2·#3·#6)는
  문서가 말하는 "스트리밍 전"에 해당할 가능성이 구조적으로 높다.
- 완화책은 여전히 `proxy`뿐이고, `proxy.ts`는 D-011로 v0.1 범위 밖이다(변화 없음, I-052가
  이미 도달한 결론과 동일).

### 4.3 `global-not-found.js`(experimental) — 이미 도입돼 있으나 이 문제와 무관

`.../03-file-conventions/not-found.md` 45~70행이 설명하는 이 파일은 **"그 어떤 라우트도
매칭되지 않았을 때"**(라우팅 단계에서 아예 실패하는 진짜 오타 URL)만을 위한 것이고,
`next.config.ts`가 이미 `experimental.globalNotFound: true`로 켜 둔 상태다(I-098, 23일차,
복수 루트 레이아웃 문제 대응). `src/app/global-not-found.tsx` 자신의 docstring(41~43행)이
이미 명시한다: `notFound()`를 명시적으로 호출하는 기존 코드(`CrewHomeContainer` 등)는 이
파일이 아니라 자신이 속한 세그먼트의 `not-found.tsx`를 그대로 탄다. **이 실험적 플래그는
I-052가 다루는 문제(존재하지 않는 *리소스*, 라우트는 매칭됨)를 해결하지 않는다** — 별개
문제(존재하지 않는 *URL*)를 위한 것이다. 혼동 방지로 명시해 둔다.

---

## 5. 확정 vs 미확정 — 정직하게 분리(35일차 실측 이후 최종본)

**확정(실측, 두 회차에 걸쳐)**:
- `/crews/[존재하지 않는 crewId]` → **HTTP 200**, 본문은 404 UI(17일차 팀장 원 제보, 35일차
  팀장 재실측으로 재현·확정, `HEAD=b14b594`+dirty 기준).
- `/crews/[없음]/{board,board/new,board/[postId],chat,members,settings}` → **HTTP 404**
  (35일차 팀장 실측) — 단, 실제로 이 상태를 낸 것은 각 URL의 개별 지점이 아니라 공통 상위
  게이트 `(app)/crews/[crewId]/layout.tsx:111` 하나다(§5.2.2).
- `/admin`(비관리자) → **HTTP 404**(35일차 팀장 실측).
- `/meetups/[없음]`·`/meetups/[없음]/reschedule` → **HTTP 200**(35일차 팀장 실측).

**확정(코드 100%, 실측 불필요 — 특수 API를 전혀 안 쓰므로 스트리밍 여부와 무관)**:
- `forbidden` 값-반환 4곳(§3) → 항상 **HTTP 200**(정상 렌더 성공 응답이라 상태를 바꿀
  메커니즘 자체가 없다).
- 여전히 throw하는 4곳(§3) → 항상 **HTTP 500**(I-044가 이미 프로덕션에서 실측 확인한
  메커니즘). 단 도달성이 사실상 0이라 실사용자 영향은 없다.

**실측 대상 자체가 없는 것으로 확정(§5.2.2)**: `BoardListContainer.tsx:39`·
`PostDetailContainer.tsx:25`·`PostWriteContainer.tsx:45`·`MessageListContainer.tsx:38`
(전부 "크루는 있는데 board/chat만 없음"이라는 시나리오)의 HTTP 상태는 실측되지 않았고,
**실측할 필요도 없다** — 마이그레이션 3건(`boards`/`chat_rooms`의 `crew_id unique` 제약,
`trg_crews_provision_owner_bootstrap` 트리거, client INSERT/DELETE REVOKE)을 직접 열어
이 시나리오 자체가 스키마상 발생 불가능함을 확정했다(추정이 아니다, §5.2.2).

**결론**: 소프트 200으로 실제 확정된 라우트는 **3개**(`/crews/[crewId]`·`/meetups/[id]`·
`/meetups/[id]/reschedule`)뿐이다. §6·§7이 이 규모를 기준으로 처분안을 다시 산정한다.

---

## 5.1 자기 재검증 — "조상 `<Suspense>` 없음" 판정을 세그먼트 전 경로로 다시 확인(35일차, 팀장 지시)

§2·§5의 판정("`<Suspense>` 조상이 없다")을 파일 하나만 보고 내리지 않았는지 재점검하라는
지시를 받았다. 스트리밍 경계는 ① 같은/상위 세그먼트의 `loading.tsx`(암묵적 `<Suspense>`),
② 명시적 `<Suspense>` 태그, ③ 병렬 라우트·`template.tsx` 경계, ④ 컨테이너 내부의 중첩
`<Suspense>` 넷 중 어디서도 생길 수 있다 — 넷 다 이 절에서 확인한다.

### 5.1.0 저장소 전체 전제 조건(공통, 모든 라우트에 적용)

```
find src -iname "loading.tsx" -o -iname "loading.jsx" -o -iname "loading.js"   → 0건
find src -iname "template.tsx"                                                  → 0건
find src -type d -name "@*"（병렬 라우트 폴더 컨벤션）                          → 0건
next.config.ts                                                                  → `experimental`에
  `globalNotFound`만 있음(I-098). `dynamicIO`·`ppr`·`cacheComponents` 등 스트리밍 트리거
  조건을 바꾸는 실험 플래그는 없음(원문 전체 인용은 §4.3).
src/app/*/generateMetadata 사용                                                 → 0건(전수
  `grep -rln "generateMetadata" src/app` 재확인, `(shell)/layout.tsx`는 정적
  `export const metadata` 객체만 씀 — 비동기 메타데이터 스트리밍 분기 없음)
```

**의미**: ①(암묵적 `loading.tsx` 경계)과 ③(병렬 라우트/템플릿 경계)은 이 저장소 전체에
**하나도 존재하지 않는다** — 개별 라우트마다 다시 확인할 필요 없이 전수로 제외된다. 남는
변수는 ②(명시적 `<Suspense>` 태그)와 ④(컨테이너 내부 중첩)뿐이다. 또한 이 프로젝트에는
`src/app/layout.tsx`(단일 진짜 루트)가 **없다** — I-098로 `(shell)`·`sample` 두 루트
레이아웃으로 갈라져 있으므로, "루트까지"는 각 트리 자신의 루트(`(shell)/layout.tsx`)까지를
말한다.

### 5.1.1 근거 A — `(app)/crews/[crewId]/layout.tsx:111`(크루 없음 게이트, board/chat/members/settings 공통)

| 세그먼트(루트→리프) | 파일 | `loading.tsx` 형제 | `<Suspense>` 사용 | 비고 |
| --- | --- | --- | --- | --- |
| 1(루트) | `src/app/(shell)/layout.tsx` | 없음 | **없음**(`grep -n "Suspense"` 0건, 직접 확인) | `getAuthSession()`만 await, 스트리밍 트리거 없음 |
| 2 | `src/app/(shell)/(app)/layout.tsx` | 없음 | 있음 — **단 미인증 분기(59~62행)에서만**. 이 라우트는 인증을 요구하는 게이트라 언제나 66행 `return <>{children}</>;`(무경계) 분기를 탄다 | 이 파일이 이번 재검증의 유일한 함정 지점이었다 — "이 파일에 Suspense가 있다"까지만 보면 오판한다 |
| 3 | `src/app/(shell)/(app)/crews/layout.tsx` | — | — | **파일 자체가 존재하지 않음**(`find`로 5개 `layout.tsx` 전수 확인, 이 경로는 그 안에 없음) — 중간 레이아웃 없음 |
| 4(리프, notFound 호출부) | `src/app/(shell)/(app)/crews/[crewId]/layout.tsx` | 없음 | **없음**(`grep -n "Suspense"` 0건, 파일 임포트 목록에 `react`의 `Suspense` 없음) | 111행 `notFound()`가 이 파일 함수 본문에서 직접 던져짐 |

**결론**: 루트부터 리프까지 4개 계층 전부 `<Suspense>` 경계 0건. "조상 없음" 판정 유지.

### 5.1.2 근거 B — `(app)/admin/layout.tsx:36`(비관리자 게이트)

| 세그먼트 | 파일 | `loading.tsx` 형제 | `<Suspense>` 사용 | 비고 |
| --- | --- | --- | --- | --- |
| 1(루트) | `src/app/(shell)/layout.tsx` | 없음 | 없음 | A와 동일 |
| 2 | `src/app/(shell)/(app)/layout.tsx` | 없음 | 미인증 분기만(A와 동일 이유로 무관) | 이 게이트도 `isAuthenticated` 통과 후에만 도달(36행 앞의 `if (!isAuthenticated(session)) return null;`) |
| 3(리프, notFound 호출부) | `src/app/(shell)/(app)/admin/layout.tsx` | 없음 | **없음**(파일 임포트에 `Suspense` 없음, 직접 확인) | 36행 `notFound()`가 직접 던져짐 |

**결론**: 3개 계층 전부 0건. "조상 없음" 판정 유지.

### 5.1.3 근거 C — `PostWriteContainer.tsx:45`(board 없음, `/crews/[id]/board/new`)

| 세그먼트 | 파일 | `loading.tsx` 형제 | `<Suspense>` 사용 | 비고 |
| --- | --- | --- | --- | --- |
| 1(루트) | `src/app/(shell)/layout.tsx` | 없음 | 없음 | A와 동일 |
| 2 | `src/app/(shell)/(app)/layout.tsx` | 없음 | 미인증 분기만(무관) | 동일 이유 |
| 3 | `src/app/(shell)/(app)/crews/[crewId]/layout.tsx` | 없음 | **없음** | 이 지점에서는 크루가 존재하고 크루원이라 이 게이트를 **통과**해 `children`을 렌더한다(§5.1.1의 리프 파일과 같은 파일이지만 여기서는 통과 경로) — 통과해도 이 파일 자체에 경계가 없으므로 무관 |
| 4 | `src/app/(shell)/(app)/crews/[crewId]/board/layout.tsx` | — | — | **파일 자체가 존재하지 않음**(위와 같은 이유로 확인) |
| 5(리프, `page.tsx`) | `src/app/(shell)/(app)/crews/[crewId]/board/new/page.tsx` | 없음 | **없음** — `<PostWriteContainer crewId={crewId} />`를 `<Suspense>` 없이 직접 렌더(파일 전문 확인, `Suspense` import 자체가 없다) | 형제 라우트(`board/page.tsx`·`board/[postId]/page.tsx` 등)와 유일하게 다른 지점 — 이미 별도 이슈로 등재함(`docs/ISSUES.draft.DESIGN.md`) |
| 6(컴포넌트 내부) | `src/components/board/PostWriteContainer.tsx` | 해당 없음(컴포넌트, 라우트 세그먼트 아님) | **없음** — 함수 본문 최상단에서 `if (!board) { notFound(); }`가 어떤 JSX·`<Suspense>`보다 먼저 실행됨 | ④(컨테이너 내부 중첩) 가능성도 이 지점에서 배제됨 |

**결론**: 6개 계층 전부 0건. "조상 없음" 판정 유지 — 오히려 형제 라우트들과 비교해 이 라우트가
`<Suspense>`가 빠진 유일한 지점이라는 §2·이슈 등재 내용도 이번 재검증으로 다시 확인됐다.

### 5.1.4 원 제보 지점(확정 200) — `CrewHomeContainer`, `/crews/[crewId]`(경계 출처 특정)

| 세그먼트 | 파일 | `loading.tsx` 형제 | `<Suspense>` 사용 | 비고 |
| --- | --- | --- | --- | --- |
| 1(루트) | `src/app/(shell)/layout.tsx` | 없음 | **없음** | 이 라우트는 `(app)` 밖이라 `(app)/layout.tsx` 자체가 조상 경로에 없다(D-007·D-030 ④ — 게스트도 공개 크루 소개는 볼 수 있어야 하므로 인증 게이트 트리 밖에 둔 것, `CrewHomeContainer.tsx` docstring 재확인) |
| 2 | `src/app/(shell)/crews/layout.tsx` | — | — | **파일 자체가 존재하지 않음**(확인) |
| 3(리프, `page.tsx`) | `src/app/(shell)/crews/[crewId]/page.tsx` | 없음 | **있음 — `<Suspense fallback={<CrewHomeSkeleton />}>`가 19~21행에서 `<CrewHomeContainer crewId={crewId} />`를 직접 감싼다**(파일 전문 재확인) | **경계의 유일한 출처가 바로 이 한 줄이다** — 상위 어디에서도 상속되지 않았고, 이 파일이 스스로 만든 명시적 경계다 |

**결론**: 경계 출처가 정확히 한 곳(`(shell)/crews/[crewId]/page.tsx:19`)으로 특정된다. **다른
8행(라우트 단위로는 7개 — #8·#9는 둘 다 `/members` 한 라우트의 서로 다른 트리거일 뿐이라
같은 라우트로 겹친다)**(§2 표의 "있음" 판정 지점 중 #1 자신을 뺀 나머지, 예: `board/
page.tsx:24`의 `<BoardListContainer>` 감싸기 등 — 35일차 CORE 교차검증이 원래 서술("다른
9개 라우트")의 계산 오류를 지적해 정정했다)도 전부 이 사례와 같은 패턴 — **각 `page.tsx`가
자기 컨테이너를 직접 `<Suspense>`로 감싸는 것 외에 다른 경계 출처가 없다**(§5.1.0에서 이미
`loading.tsx`·병렬 라우트를 저장소
전체에서 배제했으므로, 남는 경우의 수는 "그 `page.tsx`가 직접 감쌌는가" 하나뿐이다).

### 5.1.5 재검증 결론

네 가지 위험 요인(①암묵적 `loading.tsx` ②상위 세그먼트 누락 확인 ③병렬 라우트/템플릿
④컨테이너 내부 중첩) 전부를 확인했고, **§2·§5의 원 판정이 그대로 유지된다**:
- 근거 A·B·C(조상 `<Suspense>` 없음, 미확정) — 루트부터 리프까지 전 계층 0건 재확인.
- 근거 D(원 제보, 확정 200) — 경계 출처가 `(shell)/crews/[crewId]/page.tsx:19` 한 곳으로
  명확히 특정됨.

**이 재검증이 못 하는 것**: 위 표는 Next.js가 공식 문서에 적은 "무엇이 스트리밍을 시작시키는가"
규칙(§4.2 인용)을 소스 코드에 기계적으로 대조한 것이다 — Next.js 내부 구현이 문서에 없는
추가 조건으로 스트리밍을 시작시킬 가능성(예: 프레임워크가 루트 레이아웃 자체를 별도로
버퍼링하는 내부 최적화 등)까지는 이 방법으로 배제할 수 없다. 그래서 이 절은 "가설이 코드
구조와 일관된다"까지만 말하고, 최종 확인은 여전히 팀장의 실측(§5의 3개 URL)에 맡긴다 — 만약
실측이 이 가설과 다르게 나오면(예: A·B·C도 200으로 나오면) 원인은 이 절이 다루지 않은
Next.js 내부 동작 쪽에 있다는 뜻이고, 그 경우 다음 조사는 "표에 없는 다섯 번째 스트리밍
트리거가 있는가"부터 시작해야 한다.

---

## 5.2 실측 결과 대조(35일차, 팀장) — 가설 검증과 §2 표 오류 정정

**측정 기준**: `HEAD=b14b594` + 워킹트리 dirty(팀장 지시 규율, 34일차 CORE 색인에 요구한
것과 동일 — `git rev-parse --short HEAD`로 이 문서 갱신 시점에도 `b14b594`임을 재확인함).
클린 빌드(`rm -rf .next && npm run build`, exit 0) → `npm start` → **Playwright 인증
세션에서 같은 오리진 `fetch`로 상태 코드를 직접 읽음**(브라우저 렌더 표시가 아니라 응답
자체). 세션 계정 `chopin0625@gmail.com`(`id=30f44dd9-…`), `/admin` 조건 확인을 위해
`is_system_admin=false`를 DB로 사전 확인. **비인증 상태의 동일 URL은 전부 200이었다** —
인증 게이트에서 먼저 막혀 `notFound()` 자체에 도달하지 못하기 때문이며, 이는 이 문서가
줄곧 전제한 "인증 세션" 조건이 실측에도 그대로 적용됐어야 한다는 것을 재확인해 줄 뿐 §2·
§5의 판정을 바꾸지 않는다.

### 5.2.1 실측값

| URL(전부 인증 세션, 존재하지 않는 UUID) | HTTP | §2 대응 행 |
| --- | --- | --- |
| `/crews/[없음]` | **200** | #1(원 제보 재현) |
| `/crews/[없음]/board` | **404** | #2(§5.2.2에서 정정) |
| `/crews/[없음]/board/new` | **404** | #2(§5.2.2에서 정정) |
| `/crews/[없음]/board/[postId]` | **404** | #2(§5.2.2에서 정정) |
| `/crews/[없음]/chat` | **404** | #2(§5.2.2에서 정정) |
| `/crews/[없음]/members` | **404** | #2(§5.2.2에서 정정) |
| `/crews/[없음]/settings` | **404** | #2(§5.2.2에서 정정) |
| `/admin`(비관리자) | **404** | #3 |
| `/meetups/[없음]` | **200** | #11 |
| `/meetups/[없음]/reschedule` | **200** | #12 |

### 5.2.2 §2 표의 오류 — 왜 "5곳 반증"이 아니라 "표 설계 오류"인가

10개 URL 중 6개(`/board`·`/board/new`·`/board/[postId]`·`/chat`·`/members`·`/settings`)가
전부 **같은 상위 게이트**(`(app)/crews/[crewId]/layout.tsx:111`, §2 #2)를 공유한다 —
레이아웃은 모든 하위 라우트 요청마다 반드시 먼저 실행되고, 그 111행 `const crew = await
getCrewById(crewId); if (!crew) { notFound(); }`가 크루 미존재를 이미 잡아 **자식 `page.tsx`
자체를 렌더하지 않는다.** 즉 존재하지 않는 크루 ID로 이 6개 URL에 접근하면, §2가 #4·#5·
#6·#7·#8·#10으로 나열한 **컨테이너 자신의** `notFound()`(`BoardListContainer.tsx:39` 등)는
**단 한 번도 실행되지 않는다** — 도달하기 전에 #2가 이미 요청을 끝낸다.

**정정**: 원래 §2 표는 이 6곳을 "각자 독립적으로 테스트 가능한 소프트 200 후보"로 묶었는데,
이는 착오였다 — #8(`CrewMembersContainer.tsx:70`)·#10(`CrewSettingsContainer.tsx:82`)의
"크루 없음" 재확인은 **#9(`CrewMembersContainer.tsx:77`의 미인증 방어 분기)와 정확히 같은
성격의 방어적 중복 코드**다(#2가 이미 보장한 것을 다시 확인). 이걸 #9에는 이미 "방어적
코드, 도달하지 않음"으로 정확히 표시해 놓고 #8·#10에는 같은 판정을 적용하지 않은 것이
이번 §2 표의 실제 오류다 — Suspense 인과 모델 자체가 틀린 게 아니라, **표에 오른 12곳 중
6곳이 서로 다른 지점이 아니라 "크루가 없을 때 항상 #2가 먼저 이긴다"는 하나의 사실의
여섯 가지 겉모습**이었다는 것을 놓쳤다. `PostDetailContainer.tsx:25`(#5)·
`MessageListContainer.tsx:38`(#7)·`BoardListContainer.tsx:39`(#4)도 같은 조건(`getBoardByCrewId`/
`getChatRoomByCrewId`가 crewId 기준으로 null 반환)이라 크루가 없으면 이 지점들도 원천적으로
같은 이유로 미도달이다.

**팀장의 대안 가설("레이아웃이 던지면 404, 페이지 내부 컨테이너가 던지면 200")과의 관계**:
이 10개 데이터로는 **이 가설과 §2의 Suspense 가설이 서로 구별되지 않는다** — 이 저장소에서
"레이아웃이 던짐"과 "조상에 `<Suspense>`가 없음"이 예외 없이 같이 일어나기 때문이다(§5.1이
이미 전수 확인: 5개 `layout.tsx` 중 어느 것도 `<Suspense>`로 `children`을 감싸지 않는다).
두 가설을 실제로 갈라 볼 수 있는 유일한 반례 후보는 "레이아웃 게이트를 이미 통과한 뒤,
컨테이너 자신의 `notFound()`가 `<Suspense>`로 감싸인 채로 실행되는 경우"인데 — 그게 바로
§2 #4·#5·#6·#7의 원래 시나리오(크루는 있는데 board/chat만 없음)다. **팀장 지시로 "~로
보인다"를 근거로 남기지 않고 마이그레이션·트리거 정의를 직접 열어 확정했다**(추정이
아니라 확인된 사실, 세 개 독립 소스 대조):
- `supabase/migrations/20260724234220_create_board_post_comment_tables.sql:7` —
  `boards.crew_id uuid not null unique references public.crews (id) on delete restrict`.
  `20260724234305_create_chat_tables.sql:9`도 `chat_rooms.crew_id`에 동일한
  `not null unique` 제약 — **DDL 자체가 Board·ChatRoom을 Crew와 1:1로 강제한다.**
- `supabase/migrations/20260725004924_rls_fix_crew_membership_recursion.sql:97~120` —
  `crews_provision_owner_bootstrap()` 함수(`security definer`)가 `crews` 테이블
  `AFTER INSERT` 트리거(`trg_crews_provision_owner_bootstrap`)로 실행되며, 본문
  107~108행이 `insert into public.boards (crew_id) values (new.id); insert into
  public.chat_rooms (crew_id) values (new.id);`를 **크루 생성 시 예외 없이** 수행한다.
- `supabase/migrations/20260729093340_cleanup_revoke_insert_boards_chat_rooms_dead_surface.sql`
  — "정당한 생성 경로는 `trg_crews_provision_owner_bootstrap` 하나뿐"이라고 명시하며
  `boards`·`chat_rooms`에 대한 client `INSERT` 권한을 `anon`·`authenticated` 양쪽에서
  전부 `REVOKE`했다 — client가 board/chat_room을 별도로 만들거나 지울 경로 자체가 없다.
  (`on delete restrict` 제약상 DELETE 경로도 없다.)

세 소스가 일치한다 — **"크루는 있는데 board/chat만 없다"는 상태는 이 스키마에서 구조적으로
불가능하다(확인된 사실, 추정 아님).** 따라서 §2 #4·#5·#6·#7은 "도달성 미검증"이 아니라
**"도달 자체가 구조적으로 불가능한 방어적 코드"로 확정한다.** 이 확정으로 §2 #4·#5·#6·#7과
팀장의 대안 가설 사이의 "유일한 반례 후보"였던 시나리오가 **이 코드베이스에 실제로 존재하지
않는다는 것도 확정됐다** — 두 가설은 현재 코드로는 원리적으로 구별 불가능하다(가정이 아니라
결론). 이 조사가 §4.2에서 인용한 Next.js 공식 문서 규칙(스트리밍 여부)이 근본 메커니즘이라는
판단은 유지하되, "레이아웃이 던지면 404"는 **이 저장소에서 그 근본 메커니즘과 항상 일치하는,
더 기억하기 쉬운 운영 규칙(proxy indicator)**으로 함께 채택할 것을 제안한다 — 다음
담당자에게는 "Suspense를 확인하라"보다 "이 `notFound()`가 레이아웃에서 나오는가 페이지
컨테이너에서 나오는가를 먼저 보라"는 쪽이 실수하기 더 어렵다.

**§2 표를 위와 같이 갱신했다** — #4·#5·#6·#7은 "도달 불가능 확정(구조적)", #8·#10은 "404는
실측됐지만 그 지점 자체가 아니라 #2의 결과"로 재분류.

### 5.2.3 남는 문제 규모

소프트 200으로 **실제로 확정된 라우트는 3개뿐이다**: `/crews/[crewId]`(크루 홈, 원 제보)·
`/meetups/[id]`·`/meetups/[id]/reschedule`. 이 셋의 공통점은 **상위에 크루원 게이트 같은
레이아웃이 없다**는 것이다 — 크루 홈은 `(app)` 밖(D-007, 게스트도 봐야 함)이라 게이트
자체가 없고, meetup 계열은 리소스 ID 기준 최상위 경로(R-016)라 크루 하위 트리 밖에 있다.
§6·§7을 이 3곳 기준으로 다시 쓴다.

---

## 6. 처분안 3안 비교(35일차 실측 반영 — 대상 축소: 소프트 200은 3개 라우트뿐)

### (a) 현행 유지 + 사유 명문화(D-040을 갱신만 하고 정책은 바꾸지 않음)

- **내용**: `throw+error.tsx`(도달성 0에 가까운 4곳)와 `notFound()`/값 반환(사실상 전부)
  조합을 그대로 두되, D-040 본문을 지금 상태(§3)로 갱신하고 §5의 확정 결과(소프트 200은
  `/crews/[crewId]`·`/meetups/[id]`·`/meetups/[id]/reschedule` 3곳뿐)를 명문화한다.
- **모니터링 영향**: Sentry가 아직 미연결(I-055)이라 지금 당장 오류율 지표 오염은 없다.
  다만 §3에서 확인했듯 도달성 높은 forbidden 4곳은 이미 500이 아니라 200이므로, "500이
  지표를 오염시킨다"는 I-044의 원래 우려 자체가 이 네 곳에서는 **이미 저절로 해소돼 있다**
  — 남은 위험은 그 반대(진짜 오류가 아닌데 200으로 잡혀 오류율 지표에서 누락되는 것)다.
- **검색엔진 영향**: `notFound()` 경로는 `noindex` 메타가 자동 주입되므로(§4.2) 소프트
  200이어도 색인 오염은 없다. `forbidden` 값-반환 경로는 `noindex`가 없다 — 비공개 콘텐츠가
  검색엔진에 200으로 노출·색인될 수 있다는 뜻이나, 크루/모임 상세 URL은 애초에 사이트맵·
  내부 링크로 광고되지 않고 D-030 ④(인증 경계)로 로그인 없이는 애초에 다른 화면이 보이므로
  실질 색인 리스크는 낮다고 판단한다(단, 확정 판단은 아니다 — robots 정책 감사는 이번
  조사 범위 밖).
- **API 소비자 영향**: 상태 코드로 분기하는 클라이언트(향후 공개 API가 생기면)는 200 본문을
  파싱해야만 오류를 알 수 있다 — v0.1은 공개 API가 없어 지금은 이론적 리스크다.
- **재식별 표면**: §4.3에서 확인했듯 `notFound()`류는 body가 항상 동일한 404 UI라 존재
  여부를 안 드러낸다(200이든 404든 body가 같아 무해). `forbidden` 값-반환류는 body가
  "이 크루의 크루원만 볼 수 있어요" 등 **크루가 존재한다는 사실 자체는 이미 드러낸다** —
  다만 이건 D-007이 애초에 의도한 동작이다("private 크루는 URL을 알아도 크루명까지는
  보인다"). 즉 이 안은 재식별 표면을 새로 만들지도 줄이지도 않는다.
- **`/sample` 4상태 영향**: 없음 — 문구·컴포넌트를 바꾸지 않는다.
- **비용**: 낮음(문서만 갱신).

### (b) `notFound()` 전 구간을 실제 404로 강제 전환

- **내용**: `proxy.ts`에서 라우트별로 리소스 존재를 스트리밍 전에 확인해 없으면 즉시 404
  응답을 만든다(§4.2 문서가 권고하는 유일한 방법).
- **`proxy.ts` 경로**: D-011이 "`proxy.ts`는 v0.1 범위 밖"이라고 이미 확정했다 — 이 안을
  채택하려면 **D-011부터 재검토**해야 한다(I-052 원문도 이미 이 순서를 지적했다). 대상이
  3곳뿐이라도 `proxy.ts` 자체를 새로 만드는 비용은 대상 개수와 무관하게 고정비다.
- **모니터링·검색엔진·API 소비자 영향**: 전부 개선된다(진짜 404가 나가므로) — 다만 대상이
  3곳뿐이라 §6(a)가 이미 지적한 "지금도 낮은 리스크"라는 평가와 겹쳐 이득의 절대량이 작다.
- **재식별 표면**: §8에서 분리해 상세히 다룬다 — `proxy` 도입은 크루 홈(`/crews/[crewId]`)의
  "존재 안 함 vs 존재하지만 비공개"를 상태 코드로 구분할지 새로 결정해야 하고, 그 결정에
  따라 §8.2가 이미 확인한 "`/board` 등은 이미 구분되고 있다"는 사실과의 일관성도 함께
  따져야 한다.
- **비용**: 높음(D-011 재검토 + `proxy.ts` 신규 구현), 단 라우트별 존재 확인 로직 이관 자체는
  대상이 3곳으로 줄어 이전 추정보다 작다.

### (c) 대상이 확정된 혼합안 — 3개 라우트에 한해 개별 판단

**35일차 CORE 교차검증 정정**: 이 절의 원래 초안은 진짜 404를 얻는 방법을 "`<Suspense>`
완전 제거(스켈레톤 전면 포기)" 하나로만 제시하는 **잘못된 이분법**이었다 — §4.2가 직접
인용한 Next.js 공식 문구("Place `notFound()` before those boundaries and before any
`await` that may suspend")는 **제3의 패턴**을 가리킨다: `page.tsx`가 `<Suspense>`를 열기
**전에** 가벼운 존재 확인만 하고, 없으면 그 자리에서 `notFound()`(스트리밍 시작 전이라 진짜
404), 있으면 그대로 `<Suspense><Container /></Suspense>`를 렌더해 **스켈레톤을 그대로
유지**한다. 대가는 "찾은" 경우에 한해 존재 확인 조회가 1회 중복되는 것뿐이다(컨테이너가
어차피 다시 조회하므로). 아래를 이 패턴("가드-후-Suspense")까지 포함해 다시 쓴다.

- **세부안 (c-1) — 3곳 각각을 "이 정도는 감수한다"고 문서화만 한다.** 비용 0, 상태는 그대로
  소프트 200.
- **세부안 (c-2) — `<Suspense>` 완전 제거.** 로딩 스켈레톤 3종
  (`CrewHomeSkeleton`·`MeetupDetailSkeleton`·`MeetupRescheduleSkeleton`)을 전부 포기해야
  한다 — Mock First가 요구하는 로딩 상태(`/sample` 4상태 중 하나)를 이 3개 화면에서 없애는
  것이라 CLAUDE.md 요구와 부딪힌다. **비추천.**
- **세부안 (c-3, 신규) — 가드-후-Suspense.** `page.tsx`에서 `<Suspense>` 진입 전에
  `getCrewById`/`getMeetupById`를 한 번 더 호출해 존재를 확인하고, 없으면 즉시
  `notFound()`(진짜 404), 있으면 기존과 동일하게 `<Suspense><Container /></Suspense>`를
  렌더한다. **스켈레톤이 그대로 유지되면서 진짜 404를 얻는다** — Mock First 4상태 원칙과
  충돌하지 않는다. 비용은 "찾은" 경로에서만 발생하는 조회 1회 중복(3개 라우트 각각
  `getCrewById`/`getMeetupById` 두 번 호출 — `page.tsx`에서 존재 확인용, 컨테이너에서
  본 데이터 조회용). 소규모 리팩터(컨테이너가 이미 조회한 값을 `page.tsx`로 끌어올려
  props로 내려주는 방식)로 이 중복도 없앨 수 있으나 그건 표현/컨테이너 분리(D-030 ①)
  경계를 다시 그어야 해 별도 논의가 필요하다.
- **장점(공통)**: 처음 §6 초안이 "미확정 다수"를 전제로 산정한 비용보다 **훨씬 저렴하다** —
  실측 결과 대상이 3개로 좁혀졌으므로 "라우트마다 다른 처리"에 따르는 국지적 비일관 비용도
  3곳으로 한정된다. `admin`·크루 하위 게이트는 이미 요구사항을 상태 코드까지 만족하므로
  더 손댈 이유가 없다는 것도 §5.2가 명확히 확정했다.
- **단점(공통)**: 3곳 모두 "리소스 자체가 리소스 ID만으로 최상위에서 조회되는 라우트"(크루
  홈은 `(app)` 밖, meetup은 크루 하위 트리 밖)라는 공통점이 있다 — 즉 이 3곳에 개별
  대응을 적용해도 **같은 패턴의 라우트가 나중에 또 추가되면(예: 향후 새로운 최상위 리소스
  타입) 다시 같은 문제가 반복된다.** 근본 해결은 결국 (b)의 `proxy.ts`뿐이라는 사실은
  바뀌지 않는다 — (c)는 "지금 아는 3곳만" 땜질하는 안이다.
- **보류 판정과 그 정확한 근거(팀장 지시, §7에서 최종 채택) — 비용 재산정과 무관하게
  유지된다**: (c-1)·(c-2)·(c-3) **어느 세부안을 골라도** 보류하는 이유는 "비용이 높아서"가
  아니다(특히 (c-3)은 비용이 조회 1회 중복뿐이다) — **§8.1이 코드로 확정했듯 이 3개
  라우트는 존재 여부와 무관하게 항상 200이라 크루/모임 ID 열거 표면 자체가 없다.** 즉
  소프트 200을 진짜 404로 바꿔도 없어지는 위험이 없다(원래도 새는 정보가 없었다) — 대가가
  스켈레톤 전면 포기((c-2))든 조회 1회 중복((c-3))이든, 그 대가에 대응하는 **안전 이득이
  0**이라는 사실은 바뀌지 않는다. **이 3곳이 §8.2·§8.4의 6개 라우트(열거 표면 있음, 이미
  (B)류로 등재)와 처지가 다르다는 것이 (c) 보류의 정확한 이유**이고, 다음 재검토 조건은
  "이 3곳에 status-code 기반 API 소비자가 생기거나, noindex 완화책이 더 이상 충분하지
  않다고 판단될 때"이지 "열거 표면이 새로 생겼을 때"가 아니다(그건 §8.2/§8.4의 재검토
  조건). **다음에 이 처분을 다시 여는 사람에게**: 비용이 낮다는 이유로 (c-3)을 채택하고
  싶다면, 그건 "열거 표면 방어"가 아니라 "SEO/모니터링 정확도" 같은 다른 근거로 정당화해야
  한다 — 이 문서가 이미 열거 표면 근거로는 그 정당화가 성립하지 않음을 확정했다.

---

## 7. 권고(35일차 실측 반영 — 최종)

**(a) 현행 유지 + 사유 명문화**를 권고한다. (c)는 "3곳에 한해 검토는 해 보되, 지금 당장
착수할 정도로 이득이 크지는 않다"는 참고 자료로 남기고 채택하지 않는다.

- **(b)는 여전히 채택하지 않는다** — D-011 재검토·`proxy.ts` 신설 비용은 대상이 3곳으로
  줄어도 고정비(새 인프라 계층 하나)라 줄지 않고, 그 대가로 얻는 이득은 §4.2가 이미 확인한
  완화책(`noindex` 자동 주입)으로 검색엔진 영향이 상당 부분 흡수돼 있어 크지 않다. (b)는
  §8.1이 확인한 "크루 홈은 지금 열거 표면이 없다"는 상태를 새로 만들 결정을 요구하는 것도
  부담이다.
- **(c)는 보류한다(팀장 확정) — 정확한 근거는 "이득이 작아 보여서"·"비용이 커서"가 아니라
  §8.1이 코드로 확정한 사실이다: 소프트 200 3곳(`/crews/[crewId]`·`/meetups/[id]`·
  `/meetups/[id]/reschedule`)은 존재 여부와 무관하게 항상 200이라 애초에 크루/모임 ID
  열거 표면이 없다.** §8.2·§8.4의 6개 라우트와 달리 이 3곳은 "새는 정보"가 없으므로,
  진짜 404로 바꿔도 없어지는 위험이 없다 — **35일차 CORE 교차검증으로 (c)의 세부안 중
  (c-3, "가드-후-Suspense")은 대가가 스켈레톤 전면 포기가 아니라 조회 1회 중복뿐임이
  밝혀졌지만(§6(c) 갱신), 대가가 낮아져도 대응하는 안전 이득이 0이라는 결론은 바뀌지
  않는다** — 비용 재산정이 이 판정을 흔들지 못한다. **재검토 조건**: 이 3곳에 상태 코드로
  분기하는 API 소비자가 생기거나, `noindex` 자동 주입(§4.2)만으로는 검색엔진 영향이
  부족하다고 판단될 때 — "열거 표면이 새로 생겼을 때"는 이 3곳의 재검토 조건이 아니다
  (그건 §8.2/§8.4의 조건이고, 이 3곳엔 원래 해당하지 않는다).
- **D-040 결정문 자체는 갱신이 필요**하다(§1.2·§3) — 이유 ①은 유지, 이유 ②·③의 서술을
  지금 상태로 고치고, "현재 500을 실제로 내는 지점은 도달성 0인 4곳뿐"이라는 §3의 사실과
  "소프트 200은 3곳뿐"이라는 §5.2.3의 사실을 함께 반영해야 다음 담당자가 이 코드베이스
  전체가 여전히 낡은 상태라는 오해로 시간을 쓰지 않는다.
- **`admin` 게이트(AC2 "경로 존재 비노출")는 이미 요구사항을 상태 코드 레벨까지 만족한다**
  (§5.2.1 실측 확정) — 별도 조치 불필요. I-052의 우선순위 판단(§2 랭킹 3위, "8일차부터
  방치")도 "방치된 것은 결정 문서뿐, 코드 다수는 이미 저절로 좋아지는 방향으로 진화했다"로
  결론이 확정됐다(가설이 아니라 실측으로).
- **새로 확정된 것 — §8의 크루 ID 열거 표면은 이번 처분안 범위에 포함하지 않는다.**
  `/board` 등 6개 URL이 "존재 안 함"(404)과 "존재하지만 비소속"(200)을 상태 코드로 구분하게
  된 것은 I-069(20일차)의 부수 효과이지 이번 조사가 만든 변화가 아니다 — 이 결정(D-040
  갱신안)의 범위는 I-052(소프트 404)이지 이 열거 표면(별도 성격의 리스크)이 아니므로, 이
  발견은 결정에 포함하지 않고 새 이슈로만 등재한다(§8.4, `docs/ISSUES.draft.DESIGN.md`).

---

## 8. 크루 ID 열거(재식별) 표면 판정 — 팀장 질문 5에 대한 답

팀장 질문: "존재하는 크루(비소속)와 존재하지 않는 크루의 상태 코드가 둘 다 200이면 노출
없음, 갈리면 열거 표면이다 — 판정 기준을 세워 달라." 판정 기준은 단순하다: **그 라우트가
"존재/부재"를 가르는 두 경로 각각에서 어떤 API를 호출하는가**를 코드로 대조하면 된다.
`notFound()`(스트리밍 여부에 좌우, §4.2)든 `forbidden` 값-반환(스트리밍과 무관하게 항상
200, §3·§5)이든 **호출 여부와 종류 자체가 코드에 고정돼 있어, 두 경로가 같은 상태를 내는지는
라이브 서버 없이 코드만으로 판정 가능하다**(단, `notFound()`가 낀 경로는 실측으로 그 경로의
실제 값을 먼저 확정해 둬야 한다 — 이미 §5.2가 그 값을 확정해 뒀다).

### 8.1 `/crews/[crewId]`(크루 홈) — 열거 표면 없음, 코드 100% 확정(실측 불필요)

`CrewHomeContainer.tsx`(67~101행)를 직접 대조했다:
- **존재하지 않는 크루** → `getCrewById`가 `null` → `notFound()`(69행) → §5.2.1 실측 확정
  **200**.
- **존재하는 private 크루, 비소속** → `getCrewById`가 **null이 아니다**. `src/lib/data/
  supabase/crew.ts:105~117`을 직접 읽어 확인했다 — direct select가 RLS로 0행이면 `crew_
  directory_summary` RPC로 폴백해 private 크루라도 `status==='active'`인 한 최소 정보(이름·
  visibility 등)를 돌려준다(이 폴백의 `status` 불변식은 31~32일차에 이미 실측 검증된 사실,
  같은 파일 129~145행 docstring). 따라서 `crew`가 truthy가 되어 `notFound()`를 타지 않고,
  99~100행 `if (crew.visibility === "private") return <PrivateCrewNotice .../>;`로 떨어진다
  — **값 반환, API 호출 없음, 스트리밍 여부와 무관하게 항상 200**(§3·§5가 이미 확립한
  "값-반환은 100% 확정" 규칙과 동일 근거).
- **양쪽 다 200이므로 상태 코드만으로는 "이 크루 ID가 존재하는지" 구분이 안 된다** — I-052
  원문이 이미 지적한 "결함의 반대 효과"(우연한 열거 방어)가 그대로 유지된다.
- `/meetups/[id]`도 같은 구조다: 존재하지 않으면 `notFound()`(§5.2.1 실측 **200**), 존재하지만
  비소속이면 `MeetupDetailContainer.tsx:91`의 `forbidden` 값-반환(**항상 200**, §3과 동일
  근거) — **역시 열거 표면 없음, 코드 확정.**
- **추가 실측이 필요 없다** — 두 항 다 이미 확정된 사실(§5.2.1 실측값 + §3의 값-반환 규칙)의
  재조합이라 새 URL 쌍을 요청하지 않는다. 다만 팀장이 벨트-앤-서스펜더스로 한 번 더 확인하고
  싶다면 아래 쌍이면 충분하다:
  ```
  GET /crews/{실제 존재하는 private 크루 ID, 세션 계정이 비소속}   (인증 세션) → 200 예상
  GET /crews/00000000-0000-0000-0000-000000000001                  (인증 세션, 이미 실측) → 200
  ```

### 8.2 `/crews/[id]/board`(및 형제 5개) — 열거 표면 있음, 팀장 실측으로 확정

**팀장 2차 실측(35일차, `HEAD=b14b594`+dirty, 인증 세션 `chopin0625@gmail.com`/
`30f44dd9-…`, 같은 오리진 `fetch`)**:

| 케이스 | URL | HTTP | 본문 |
| --- | --- | --- | --- |
| 존재 X | `/crews/0000…0001` | 200 | "페이지를 찾을 수 없어요" |
| 존재 O · 비소속(public·archived) | `/crews/2724533e…` | 200 | 공개 미리보기로 추정 |
| 존재 O · 소속(대조군) | `/crews/21fb8c31…` | 200 | 정상 |
| 존재 X | `/crews/0000…0001/board` | **404** | — |
| **존재 O · 비소속(public·archived)** | `/crews/2724533e…/board` | **200** | "접근 권한이 없어요 / 이 크루의 크루원만 볼 수 있어요" |
| 존재 O · 비소속 | `/crews/2724533e…/members` | 200 | forbidden 계열로 추정 |

**표본 한계(팀장이 명시, 그대로 옮김)**: 이 세션 계정은 archived 픽스처 크루
(`2724533e…`, **public·archived**) 하나를 뺀 모든 크루의 활성 멤버다 — DB로 확인됨.
**private 비소속 표본은 존재하지 않는다.**

- 코드로 이미 예측했던 값(§5.2.1의 8.2 이전 버전)과 정확히 일치한다 — `/board`는 존재 X에서
  404, 존재 O·비소속에서 200. **두 값이 다르므로 상태 코드만으로 "이 크루 ID가 존재하는가"가
  새어 나간다.** `/board`·`/board/new`·`/board/[postId]`·`/chat`·`/members`·`/settings`
  전부 같은 상위 게이트(`(app)/crews/[crewId]/layout.tsx`)를 공유하므로(§5.2.2) 6개 URL
  모두 같은 표면을 갖는다 — `/members`도 실측으로 재확인됨.
- **이것이 I-069(20일차)에 새로 생긴 변화인지**: I-069 이전엔 이 forbidden 분기가
  throw+500이었다(§3) — 그때도 404 vs 500으로 이미 상태 코드로 구분 가능했다. 즉 이 열거
  표면은 이번 조사나 I-069가 새로 만든 것이 아니라, 크루원 게이트 레이아웃이 처음 생긴
  D-039(Task 016B) 시점부터 구조적으로 있었을 가능성이 높다 — 지금까지 아무도 이 각도로
  살펴본 적이 없어(I-052 원문은 `/crews/[crewId]` 하나만 다뤘다) 이번에 처음 표면화됐다.

### 8.3 `visibility`/`status`별 일반화 — private+active는 실측 확정, private+archived는 코드 판정(표본 0건)

**35일차 3차 실측(팀장)으로 private+active 행이 추정에서 실측으로 승격됐다** — 아래는 그
경위와 최종 표다. 먼저 코드 판정 근거: `(app)/crews/[crewId]/layout.tsx`(D-039 게이트,
108~112행)와 `getCrewById`(`src/lib/data/supabase/crew.ts:105~146`)를 대조하면, **게이트
자신은 `visibility`를 전혀 보지 않는다** — 111행 `if (!crew) { notFound(); }`은 `crew`가
`null`인지만 본다. 실제 분기는 게이트가 아니라 **`getCrewById`가 언제 `null`을 반환하는가**
에 달려 있고, 이건 `visibility`×`status` 조합에 따라 갈린다(경로 분석 자체는 코드로 확정
가능, 실제 상태 코드는 아래 실측으로 확인).

**3차 실측 조건**: 계정을 `0625chopin@gmail.com`(handle `chopin_0625`, `fb70ff1c-…`)으로
전환했다 — 직전 세션 계정(`chopin0625`)은 archived 픽스처 크루 하나를 뺀 모든 크루의
활성 멤버라 private 비소속 표본이 없었기 때문이다. 같은 빌드(`HEAD=b14b594`+dirty), 같은
오리진 `fetch`.

**오염 배제(팀장이 먼저 확인)**: 이 계정은 `is_system_admin=true`라 관리자 우회 가능성을
먼저 배제해야 했다 — `crews_select_authenticated` 정책 정의를 직접 조회한 결과 `(visibility
='public') OR (owner_id=auth.uid()) OR (id IN 활성 멤버십)`이라 **`is_system_admin`을
전혀 보지 않는다.** 즉 시스템 관리자여도 private 비소속 크루는 direct select에서 안 보여
이 실측은 오염되지 않았다.

| 케이스 | URL | HTTP | 본문 길이 |
| --- | --- | --- | --- |
| private+active 비소속(심야 독서 모임) | `/crews/32aca4a8…/board` | **200** | 46733 |
| private+active 비소속(홈쿠킹 클럽) | `/crews/863e8ff0…/board` | **200** | 46733 |
| private+active 비소속, 크루 홈 | `/crews/32aca4a8…` | **200** | 40585 |
| 존재하지 않는 크루(대조군) | `/crews/0000…0001/board` | **404** | 27362 |

두 private 크루의 본문 길이가 바이트까지 동일(46733)한 것도 같은 forbidden UI가 렌더된다는
방증이다.

| `visibility` | `status` | `getCrewById` 경로 | 결과 | `/board` 상태 |
| --- | --- | --- | --- | --- |
| `public` | 아무 값(active/archived) | RLS `crews_select_authenticated`가 멤버십 무관하게 direct select 항상 허용(`CrewHomeContainer.tsx` 58~64행 docstring이 이미 명시) → **항상 non-null** | 게이트 통과 → forbidden 값-반환 | **200 — 실측 확정**(35일차 2차, `2724533e…`) |
| `private` | `active` | direct select는 RLS로 0행(비소속) → `crew_directory_summary` RPC 폴백 → 이 RPC는 `status==='active'`일 때만 1행을 준다(`crew.ts` 129~138행 docstring, `pg_get_functiondef`로 배포본 직접 확인한 근거) → **non-null** | 게이트 통과 → forbidden 값-반환 | **200 — 실측 확정**(35일차 3차, 위 표) |
| `private` | `archived` | direct select 0행, RPC도 `status<>'active'`라 0행(같은 가드) → **null**(코드 판정) | 게이트 자신의 `notFound()`(111행, `<Suspense>` 조상 없음, §5.1.1) | **404로 예상 — 코드 판정, 표본 0건(미실측)** |

**private+archived 행은 "확인했다"가 아니라 "표본 부재로 직접 실측하지 못했다"로 정확히
적는다(팀장 지시)** — 근거는 두 가지 **간접** 소스뿐이다: ① 위 코드 판정(`crew.ts`
129~138행 RPC 가드 정의) ② CORE가 32일차 I-148 재검증에서 `begin…rollback`으로 확인한
사실 — private+archived 임시 크루에서 `select count(*) from crews`(direct select)와
`select count(*) from crew_directory_summary(...)`(RPC)가 **둘 다 0건**임을 직접 확인했다
(`crew.ts` 138~146행 인용, 소비자 함수는 `evaluateInvitationResponseEligibility`로 달랐지만
`getCrewById` 자체를 검증한 것이라 이 게이트에도 적용된다). **이 DB에 private+archived
크루 자체가 0건**이라 35일차 3차 실측으로도 이 행을 직접 잴 수 없었다 — 두 간접 소스가
일치한다는 것과 실측으로 확인했다는 것은 다른 확신 수준이므로 구분해서 적는다.

**일반화 결론**:
- **`public`(모든 status) + `private`+`active`** → **실측으로 확정된 leak**(404 vs 200).
  일반적인 비공개 크루는 대부분 `active` 상태일 것이므로(archived는 생애주기 말단 상태),
  이 leak은 실무적으로 **private 크루 전반에 적용된다**고 봐야 한다.
- **`private`+`archived`만 예외** — 코드 판정으로는 leak이 없다(존재해도 404, "존재하지
  않음"과 구분 불가). **이 행만은 표본 부재로 미실측**이라는 것을 (B)류 등급 판정에 반영한다
  (§8.4) — 확인 안 된 예외에 등급 판정을 전부 기대지 않는다. 이건 보호가 아니라
  **비일관**이다 — 왜 하필 이 조합만 다르게 취급되는지 설계 의도가 문서화된 적이 없다
  (`getCrewById`의 RPC 가드는 I-148 문맥에서 "거짓 active를 주지 않기 위한" 목적으로
  만들어졌지 열거 방어 목적이 아니다 — 부수 효과다).

### 8.4 심각도 판정 및 이슈 등재 여부

**판정**: **(B)류(저위험, 기록만)로 등재**한다 — (A)급으로 올리지 않는다.
- **팀장 근거대로 정보 유출은 없다** — 본문은 항상 forbidden UI뿐이고 크루 콘텐츠(게시글·
  채팅·멤버 명단)는 노출되지 않는다.
- **크루 ID는 128비트 UUID라 무차별 대입 스캔이 비현실적**이다 — 이 채널이 위험해지려면
  공격자가 **이미 crewId를 다른 경로(핸들 링크 공유·초대 URL 등)로 확보한 상태**여야 한다.
  그 조건에서 얻는 추가 정보는 "이 크루가 지금도 존재하는가"뿐이다.
- **다만 R-012가 명문화한 원칙("미존재·옵트아웃 응답을 구분 불가능하게")과 같은 결의
  문제이므로 등급을 (B)에 그대로 두지 않고 근거를 남긴다** — R-012 자체는 핸들 검색
  전용이라 이 항목이 R-012를 직접 위반하는 것은 아니지만(별도 표면), 같은 설계 원칙이
  적용되는 사안이라는 점은 이슈 본문에 명시한다.
- **선례 인용(35일차 CORE 교차검증이 지적 — 원래 초안은 이 판단을 인용 없이 재발명했다)**:
  `docs/prioritization-and-risks.md` **D-048**(21일차, CORE, I-073 처리)이 **정확히 같은
  범주의 질문**을 이미 판정해 뒀다 — Meetup 상세(`/meetups/[id]`)에서 "이미 아는 리소스
  id로 존재를 확인할 수 있는 것이 R-012 위반인가"를 검토하며 다음과 같이 결론냈다(그대로
  옮김): "R-012 원문은 '핸들 검색으로 회원 목록을 사전 대입해 열거'하는 시나리오를 다룬다
  — 검색·나열을 통해 **모르는** 대상을 찾아내는 능력을 막는 것이 목적이다. 이 사안은
  호출자가 **이미 구체적인 리소스 id를 안다는 전제**에서 그 리소스의 존재 여부를 확인하는
  것으로, R-012가 막으려는 '열거'와는 범주가 다르다(카테고리 오류) — id는
  `gen_random_uuid()` 128비트 무작위값이라 URL을 이미 손에 넣은 경우에만 의미가 있는
  조회다." **이번 §8.2의 판단은 D-048과 완전히 같은 논증 구조**(이미 아는 crewId의 존재
  확인 ≠ R-012형 열거)이므로, 위 (B) 등급 판정은 새 논증이 아니라 **D-048 전례를 크루
  ID(`/board` 계열)에 그대로 적용한 것**이다 — 이 인용이 없으면 같은 판단을 근거 없이
  재발명한 것처럼 읽힌다.
- **크루 홈(`/crews/[crewId]`)은 leak이 없는데 그 하위 라우트(`/board` 등)만 leak이 있는
  비일관**도 함께 기록한다 — 사용자가 URL 하나로 "이 크루가 있는지"를 알아내려면
  `/crews/[id]`가 아니라 `/crews/[id]/board`를 시도해야 한다는 뜻이라, 이 비일관 자체가
  다음에 크루 홈 라우트를 고칠 때(예: 후보 (b) 채택 시) 함께 참고해야 할 사실이다.

**등급을 (B)로 닫되, 팀장이 요구한 재검토 조건을 명시한다(그렇지 않으면 (B)가 아니라
방치다)**: 아래 둘 중 하나라도 성립하면 즉시 등급을 재평가한다.
1. **크루 초대 링크가 외부(카카오톡·문자 등)에 공유되는 기능이 새로 생긴다** — 지금은
   초대가 앱 내부 알림/화면으로만 전달돼(FR-020) crewId가 앱 밖으로 노출될 표면이 제한적
   이지만, 외부 공유 기능이 생기면 "이미 crewId를 확보한 공격자"라는 전제 자체가 훨씬
   쉽게 성립한다.
2. **crewId가 UUID가 아닌 추측 가능한 식별자(슬러그·순번 등)로 바뀐다** — 지금 이 판정의
   "무차별 대입 비현실적"이라는 근거(128비트 UUID)가 정확히 이 사실에 의존한다. 식별자
   체계가 바뀌면 이 근거부터 다시 세워야 한다.

등재는 `docs/ISSUES.draft.DESIGN.md`에 반영했다(§ 아래 "이슈" 절 참고, 위 8.3의
`visibility`/`status` 표와 위 재검토 조건을 그대로 옮겼다).

### 8.5 추가 실측 — private+active는 완료, private+archived는 표본 자체가 없어 종결

**private+active 실측은 35일차 3차(팀장)로 완료됐다** — §8.3 표에 반영. **private+archived는
DB에 해당 조합 표본이 0건이라 이 회차에서는 물리적으로 실측할 수 없었다**(팀장 확인) —
이 문서가 요청할 수 있는 것은 "새 픽스처를 만들어 달라"뿐인데, 그건 테스트 데이터 생성이라
팀장 판단 영역이고 이번 배정(I-052 처분안 조사) 범위를 넘는다고 판단해 요청하지 않는다.
서버는 이 실측(3차)을 끝으로 내려갔다 — 더 요청할 것은 없다.

---

## 9. 남은 리스크

- **§2 #4·#5·#6·#7("크루는 있는데 board/chat만 없음")은 이번에 마이그레이션 3건(§5.2)을
  직접 열어 "도달 불가능"을 확정했다 — 더 이상 추정이 아니다.** 다만 이 확정은 **지금
  스키마·트리거를 전제로 한다** — 다음에 누가 `trg_crews_provision_owner_bootstrap`을
  바꾸거나 `boards`/`chat_rooms`의 `crew_id unique` 제약을 완화하면(예: 크루당 여러
  게시판을 허용하는 기능이 생기면) 이 확정이 조용히 깨질 수 있다 — 그 변경을 하는 사람이
  이 문서를 다시 봐야 한다는 뜻이다.
- **Suspense 스트리밍 경계 가설(§2·§4.2)은 35일차 실측으로 3곳(레이아웃 게이트·`/admin`)
  에서 적중이 확인됐지만, 이 프로젝트의 Next.js 16.2.11 특정 빌드 동작에 근거한다는 전제는
  그대로다** — Next.js 마이너 업데이트로 스트리밍 트리거 조건이 바뀌면(예: PPR·Cache
  Components가 기본값이 되면) 이 표는 재검증이 필요하다.
- **Sentry(I-055, NFR-028)가 아직 미연결**이라 "모니터링 영향" 절(§6)이 전부 이론적
  판단이다 — DSN이 발급되면 실제 오류율 지표에서 200/404/500 분포를 관측해 이 문서의
  추정을 검증할 수 있다.
- **§8.2의 크루 ID 열거 표면은 심각도 판정만 했을 뿐 처분을 결정하지 않았다** — 이번 조사
  범위(I-052)를 넘는다고 판단해 `docs/ISSUES.draft.DESIGN.md`에 새 이슈로만 남겼다. 다음
  담당자가 이 이슈를 트리아지하지 않으면 계속 열린 채로 남는다.
- **`global-not-found.js`(I-098) 담당자 소유권**: 이번 조사로 이 실험적 플래그가 I-052와
  무관함을 확인했지만(§4.3), 두 기능(전역 404 vs 세그먼트 404)이 이름이 비슷해 다음
  담당자가 다시 혼동할 여지가 있다 — `global-not-found.tsx`·`not-found.tsx` 양쪽
  docstring이 이미 서로를 가리키고 있어 추가 조치는 하지 않았다.
