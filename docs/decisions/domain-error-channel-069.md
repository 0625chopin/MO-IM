# 도메인 오류 채널 근본 해결(부분) — I-069 (20일차)

- **일자**: 2026-07-25(20일차)
- **담당**: DESIGN(B팀) — 팀장 추가 배정(로드맵 Task 아님)
- **참조**: `docs/ISSUES.md` **I-069**(원 이슈, 19일차 확정)· I-044(원 증상, 8일차)· D-039
  (크루원 게이트 레이아웃)· **D-040**(라우트 레벨 권한 거부 방식, 이번에 갱신)· D-030 ③
  (도메인 오류를 화면 상태로).
- **팀장 지시**: 19일차가 정리한 세 갈래(ⓐ `forbidden()`/`authInterrupts` experimental 부분
  도입 · ⓑ throw 지점 8곳 전량 값 반환 전환 · ⓒ 도달성 높은 곳만 우선 전환) 중 **ⓒ**를
  사용자 확인을 거쳐 확정했다. 이 문서는 ⓒ의 구현·검증 기록이다.

## 1. 문제 요약 (I-069 재정리)

프로덕션 빌드에서 Next.js는 서버 컴포넌트가 던진 예외의 `cause`를 클라이언트로 넘기지 않는다
(공식 보안 동작, `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
error.md:110-111`). 이 저장소의 `src/app/error.tsx`는 `error.cause.code`를 읽어
`RouteErrorBoundary`의 `kind`(forbidden·not_found·conflict 등)를 분류하는데, 프로덕션에서는
이 값이 항상 사라져 `forbidden`이어야 할 오류까지 전부 미분류(19일차부터 `unknown`)로
떨어진다. 19일차 BOARD가 실제 throw 지점을 전수 조사해 8곳·7개 파일을 확인했고, 도달
가능성으로 "높음/중간" 4곳과 "사실상 0"(방어적 코드) 4곳으로 나눴다(`docs/ISSUES.md` I-069
"영향 범위 인벤토리" 표가 단일 소스).

## 2. 채택한 해법 — 값 반환 + 표현 컴포넌트 직접 렌더 (도달성 높은 4곳만)

`cause` 직렬화에 의존하는 대신, 해당 지점이 **예외를 던지지 않고 `<RouteErrorBoundary
kind="forbidden" />`를 컴포넌트 트리에 값으로 직접 반환**하도록 바꿨다. `forbidden()`/
`authInterrupts`(대안 ⓐ)는 이 Next 버전에서 여전히 experimental/canary라(D-040 확인 사실,
바뀌지 않음) 도입하지 않았다.

### 전환한 4곳

| # | 파일 | 방식 |
| - | --- | --- |
| 1 | `src/app/(app)/crews/[crewId]/layout.tsx` | 활성 크루원이 아니면 `{children}` 대신 `<main>`으로 감싼 `<RouteErrorBoundary kind="forbidden" />`를 직접 렌더 |
| 2 | `src/components/meetup/MeetupDetailContainer.tsx` | 비소속 크루원이면 `<RouteErrorBoundary kind="forbidden" />`를 반환(`<main>`은 페이지가 이미 소유) |
| 3 | `src/components/crews/CrewSettingsContainer.tsx` | `crew:update_info` 거부 시 `<RouteErrorBoundary kind="forbidden" />`를 반환 |
| 4 | `src/components/board/PostWriteContainer.tsx` | `crew.status !== "active"`(해산된 크루) 분기만 반환으로 전환. 같은 파일의 `post:create` 거부 분기는 throw 유지(§4) |

(팀장 소환 프롬프트의 경로 `src/components/meetups/MeetupDetailContainer.tsx`는 오타다 —
실제 디렉터리는 `src/components/meetup/`, 단수형이다.)

### 레이아웃(#1)의 설계 판단 — "판정만 하고 자식에 넘기기"는 선택지가 아니었다

팀장이 지정한 설계 질문: 레이아웃이 직접 표현 컴포넌트를 렌더할지, 판정만 하고 자식에게
넘길지. 답은 **직접 렌더**이고, 근거는 이 레이아웃 자체의 기존 docstring이 이미 명시한
React Server Component의 제약이다 — **부모는 이미 렌더된 `children` 트리에 값을 나중에
꽂아 넣지 못한다.** 이 레이아웃이 19일차 `ArchivedCrewBanner`를 추가할 때 정확히 같은 이유로
"쓰기 차단은 각 쓰기 컨테이너가 개별적으로 `crew.status`를 확인한다"고 판단한 전례가 있다.
"판정 결과를 `children`에 넘겨 각 페이지·컨테이너가 다시 렌더 여부를 정한다"는 선택지가
있었다면, 그건 D-039가 막으려던 문제(컨테이너마다 반복하면 하나를 빠뜨린다, I-035)를
그대로 재현한다 — 그래서 유일한 방법은 레이아웃이 `children` 대신 표현 컴포넌트를 직접
렌더하는 것이다. `children`이 차지했을 `<main>` 랜드마크가 비므로 레이아웃이 대신
`<main>`을 연다(`app/not-found.tsx`와 같은 패턴 — 페이지가 없으므로 이 파일이 그 자리를
대신 채운다).

컨테이너 3곳(#2~#4)은 사정이 다르다 — 이미 페이지(`page.tsx`)가 `<main>`을 소유하고
컨테이너를 `<Suspense>`로 감싸 호출하는 얇은 껍데기이므로, 컨테이너는 그냥 다른 JSX를
반환하면 된다(`PostDetailContainer`가 삭제된 게시글에 `<PostDeletedNotice/>`를 반환하는
것과 같은 기존 패턴).

## 3. 트레이드오프 — 정직하게 기록한다

예외를 던지지 않으므로:

- **HTTP 응답이 500이 아니라 200이 된다.** I-044가 우려한 "500이 오류율 지표를 오염시킨다"
  (NFR-030 KPI 이벤트 수집)는 이 네 곳에서 해소된다 — 하지만 요구사항이 여러 곳에서 명시하는
  403 자체는 여전히 아니다. `PrivateCrewNotice`·소프트 404(I-052)와 같은 성격의 "정상 도달
  화면이 200으로 응답되는" 패턴에 합류할 뿐이다.
  - **어떤 요구사항이 걸리는지 정확히 인용한다(20일차, CORE 교차검증 지적 — 원래 이 문서에
    빠져 있었다).** 셋이다: **NFR-012**("권한 검사는 UI 숨김이 아니라 서버·RLS에서 이뤄진다
    ... 권한 없는 API 직접 호출 시 403/404"), **FR-011 예외 흐름 E1**("권한 없음 → 403
    화면"), **FR-012 AC4**("`public` 크루의 게시판 API, 비로그인 상태로 직접 호출, 401 또는
    403이 반환된다"). 이 셋은 문자 그대로 200을 허용하지 않는다 — 전환한 4곳은 이 세 요구를
    충족하지 못한 채로 남는다.
  - **이 미충족은 모르고 지나간 것이 아니라 프레임워크 제약 아래의 의식적 선택이다.** 문자
    그대로 403을 반환하려면 Next.js가 자체 오류 경계로 렌더하는 `forbidden()`(대안 ⓐ)이
    필요한데, 그 API는 이 Next 버전에서 여전히 `experimental`/`canary`이고(D-040 확인 사실,
    변하지 않았다) 그래서 도입을 보류했다(위 "채택한 해법" 참고) — 즉 "403을 낼 방법이
    있는데 안 썼다"가 아니라 "안정 API로 403을 내는 방법이 아직 없어, 문구 정확성(200이지만
    올바른 안내)과 상태 코드 정확성(403이지만 experimental API 리스크) 중 전자를 택했다"는
    뜻이다. 사용자가 승인한 방향이라 되돌리지 않는다 — 이 트레이드오프를 다음에 읽는 사람이
    "무지"와 "의식적 선택"을 구분할 수 있도록 여기 명시해 둔다.
- **`digest`가 없다.** `error.tsx`를 거치지 않으므로 재요청 상관 id가 없고, "다시 시도"
  버튼도 의미가 없어(재요청해도 결과가 같다) 넣지 않았다(`onRetry` 미지정).
- **`reportClientErrorAction`(NFR-028 오류 수집) telemetry가 없다.** 이 값 반환은 예외가
  아니라 정상적으로 도달하는 화면 상태로 재분류한 것이므로, `error.tsx`의 `useEffect`가
  하던 오류 리포팅이 이 네 곳에는 더 이상 없다 — 오분류 신호(I-069가 오염시켰던 바로 그
  telemetry)가 사라지는 것은 오히려 부수적 이득이다.

## 4. 그대로 둔 4곳 — 방어적 코드, 손대지 않았다

`BoardListContainer.tsx:34`(board:read)·`PostDetailContainer.tsx:31`(board:read)·
`PostWriteContainer.tsx:35`(post:create)·`MessageListContainer.tsx:35`(chat:send_message).
전부 `lib/rules/permission.ts`의 현재 권한 매트릭스에서 `crew_member` 이상 전원 `allow`이고,
`(app)/crews/[crewId]/layout.tsx`(D-039)가 이미 "크루원인가"를 걸렀으므로 이 분기가 실제로
타는 경로가 없다(19일차 인벤토리 #5~#8, "도달성 사실상 0"). 도달 불가능한 코드를 전환해도
프로덕션 실측으로 검증할 방법이 없어 이번 회차 범위(도달성 높은 4곳)에서 제외했다 — **이
파일들은 다른 팀(BOARD·CREW) 소유이기도 해서 이번 회차 파일 소유권 밖이다.** 향후 role
세분화로 이 권한들이 `crew_member` 전원 허용이 아니게 되면(예: `board:read`가 임원 이상으로
좁혀지는 경우) 재검토 대상이다 — `PostWriteContainer.tsx`에는 같은 파일 안에 전환한 분기와
안 한 분기가 공존하므로 이 판단을 파일 docstring에도 남겼다.

## 5. 프로덕션 빌드 브라우저 실측

`npm run build && PORT=3211 npm start`(3000·3210 포트 충돌 회피 — 19일차도 3210을 썼다).
빌드 중 다른 팀원이 작업 중이던 미추적 신규 파일
`src/lib/data/supabase/handle-availability-rate-limit.ts`(존재하지 않는 테이블 타입을
참조해 `tsc`를 막고 있었다 — 어느 소비자도 아직 import하지 않는 고립 파일임을 `grep`으로
확인)가 빌드를 막아, 검증 동안만 `/tmp`로 옮겼다가 빌드 직후 즉시 원위치했다. 이 파일은
"건드리지 말 것" 목록(레이트 리밋 카운터 계열)에 있어 내용은 전혀 고치지 않았다.

계정은 `docs/decisions/auth-integration-030.md` §6:

| # | 계정 | 경로 | 사전 조건(Supabase 실측) | 결과 |
| - | --- | --- | --- | --- |
| 1 | `0625chopin@gmail.com`(핸들 `chopin_0625`) | `/crews/863e8ff0-f2b0-4c8e-9e9b-19959f216ac4/board` | "홈쿠킹 클럽"(private) 비소속 | **"접근 권한이 없어요 / 이 크루의 크루원만 볼 수 있어요"** 정상 렌더, HTTP **200** |
| 3 | `chopin0625@gmail.com`(핸들 `chopin0625`) | `/crews/3f42fb27-5b87-4416-98ed-8dda64cb9141/settings` | "전시 투어 소셜"에서 role=`member`(staff 미만) | 동일 문구 정상 렌더, HTTP **200** |
| 4 | `chopin0625@gmail.com` | `/crews/c4283f8a-139c-4c69-ac4e-3c92e355e3bc/board/new` | 새로 만든 일회성 테스트 크루(§6-후속), 오너 본인이 실제 "크루 해산" 버튼으로 해산(커밋) | **"접근 권한이 없어요 / 이 크루의 크루원만 볼 수 있어요"** + `ArchivedCrewBanner`("해산된 크루예요") 정상 렌더, HTTP **200** — 20일차 재검증에서 확인 완료(아래 §6-후속) |
| 2 | `0625chopin@gmail.com` | `/meetups/f6799fac-5a4f-45a3-befe-49e0e6901ead` | 위와 같은 비소속 크루의 Meetup | **예상과 다름** — 아래 §6 |

## 6. 예상치 못한 발견 — `MeetupDetailContainer`(#2)의 재판정은 실제로 도달 불가능하다

비소속 크루의 Meetup에 접근하면 "접근 권한이 없어요"가 아니라 **"페이지를 찾을 수 없어요"
(404 문구, HTTP 200)**가 떴다. 원인을 Supabase RLS까지 추적했다:

```sql
-- meetups 테이블 SELECT 정책
USING (crew_id IN (
  SELECT cm.crew_id FROM crew_memberships cm
  WHERE cm.profile_id = auth.uid() AND cm.status = 'active'
))
```

`getMeetupById`(`src/lib/data/supabase/meetup.ts`)는 `createSupabaseServerClient()`(세션
RLS 적용, service-role 아님)로 조회하므로, 비소속자에게는 이 RLS가 행 자체를 0건으로
감춘다 — 컨테이너의 `if (!meetup) notFound()`가 이번에 값 반환으로 바꾼 크루원 재판정보다
**먼저** 실행돼 버려, 그 재판정 코드는 살아 있지만 프로덕션에서 실행되지 않는다.

대조: `getCrewById`(`src/lib/data/supabase/crew.ts`)는 17일차 private 크루 404 수정으로
원본 select가 0행이면 `crew_directory_summary` RPC(SECURITY DEFINER로 추정)로 한 번 더
확인하는 폴백이 있어, 비소속자에게도 최소 정보(이름 등)를 준다 — 그래서 레이아웃 게이트(#1)
는 크루를 찾은 뒤 멤버십만 별도로 거부해 정확히 의도대로 동작한다. **`meetups`에는 이런
폴백이 없다** — 이 비대칭이 #2가 헛도는 원인이다.

이건 이번 전환이 만든 회귀가 아니다 — 전환 전에도 `notFound()`가 먼저 실행됐으므로 원래
`throw new Error(..., {cause:{code:"forbidden"}})` 지점 자체가 이미 도달 불가능했다. 19일차
조사는 "throw → `classifyError` 오분류"라는 메커니즘만 검증했고, "RLS가 행 자체를 지운다"는
이 경로는 검토 대상이 아니었다. 값 반환으로의 전환 자체는 여전히 유효하고 해롭지 않다(만약
`getMeetupById`가 나중에 service-role 조회로 바뀌거나 RLS가 완화되면 이 분기가 실제로
도달한다) — 다만 **이 지점의 실사용자 도달성은 19일차 인벤토리가 기록한 "높음"이 아니라
"낮음/사실상 0"으로 재평가해야 한다.** `docs/ISSUES.md` I-069와 `docs/prioritization-and-
risks.md` D-040에도 같은 정정을 남겼다.

**프레임 정정(20일차, CORE 교차검증이 반증 — 최초 초안의 판단을 뒤집는다).** 최초 초안은
"이 404가 R-012(사용자 열거 방지) 관점에서 오히려 의도된 것일 수 있다"는 여지를 남겼는데,
이건 **틀린 프레임**이다. **FR-064 AC2가 문자 그대로 "Given 비소속 회원, When Meetup 상세
API 호출, Then 403이 반환된다"고 명시**하므로, 지금의 404는 승인된 대안이 아니라 **미해소
요구사항 위반**이다. R-012는 "핸들 검색이 사용자 열거·개인정보 노출 경로가 된다"
(`docs/prioritization-and-risks.md` R-012 원문)는 **검색·열거** 시나리오를 다루지, 이미
구체적인 리소스 id(meetupId)를 알고 있는 요청의 존재 노출 여부에는 적용 근거가 약하다 —
카테고리 오류였다. 이 오분류는 별도 이슈로 등재했다(`docs/ISSUES.md` **I-073**) — I-069의
각주로만 남기면 I-069가 (부분)해결로 닫힐 때 함께 묻혀 다음 회차가 놓치기 쉽다.

## 7. 검증

- `npx tsc --noEmit`: 0 errors(내 변경 파일 기준 — 위 §5의 격리된 미추적 파일 문제와 무관).
- `npm run lint`: 0 errors/경고.
- `npm run build`: 성공(§5 참고).
- 브라우저 실측: §5·§6.
- `/sample` 오류 섹션(`src/components/sample/sections/{errors,meetup,board}.tsx`) 문구를
  이번 전환에 맞춰 갱신 — 4곳은 프로덕션에서도 정확히 `forbidden`이 뜬다는 것, 나머지 4곳은
  여전히 `unknown`으로 떨어진다는 것을 구분해서 적었다.

## 8. 남은 리스크·다음 회차 이월

- **§6의 `meetups` RLS 비대칭은 FR-064 AC2 위반이며 별도 이슈(I-073)로 등재했다** —
  `getCrewById`처럼 RLS-폴백(0행 → SECURITY DEFINER 함수로 재확인)을 추가하는 것이 유력한
  해소 방향이지만, 이번 회차 판단 대상은 아니다(범위 밖, 설계 변경 필요). **20일차 정정**:
  최초 초안이 "R-012 관점에서 의도된 것일 수 있다"고 적었던 것은 틀린 프레임이었다(§6
  "프레임 정정" 참고) — 이건 승인된 설계가 아니라 미해소 결함이다.
- **archived 크루 분기(#4)는 20일차 재검증에서 런타임 확인을 마쳤다** — 새로 만든 일회성
  테스트 크루(§5-#4)에서 실제 "크루 해산" 버튼(`disband_crew` RPC, 커밋)으로 archived
  전이를 일으킨 뒤 `/board/new`에 접근해 "접근 권한이 없어요"가 HTTP 200으로 정상 렌더됨을
  확인했다. **주의**: `crews_guard_archived_immutable` 트리거(CORE, 20일차)가 archived를
  종착 상태로 강제해 되돌리기 UPDATE 자체가 막힌다 — 그래서 기존 공유 시드 크루가 아니라
  새 테스트 크루로만 검증했고, 그 테스트 크루는 이후에도 archived 상태로 남는다(의도된 잔존,
  삭제하지 않는다).
- **나머지 4곳(§4)은 throw 패턴 그대로다** — role 세분화가 생기기 전까지는 그대로 둔다는
  것이 이번 결정의 명시적 범위다.
- I-069는 "해결됨"으로 닫지 않았다 — 부분 해결로 상태를 갱신했다(`docs/ISSUES.md` 참고).
  I-073(Meetup 404/403 불일치)은 I-069와 별개로 열림 상태다 — I-069가 (부분)해결로 닫혀도
  I-073은 독립적으로 추적된다.
