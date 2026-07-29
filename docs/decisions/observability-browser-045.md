# Task 045 · 관측과 브라우저 지원 (NFR-030 · 040 · 041)

- **일자**: 2026-07-29 (22일차)
- **담당**: DESIGN
- **의존**: Task 036(완료, 21일차) — 그때 실측한 계정·크루·절차를 재사용했다
- **리뷰 짝**: CREW(A팀, `docs/ROADMAP/team/02.DESIGN.md` Task 045 항목 명시)

## 0. 요약

NFR-030(KPI 산출용 이벤트 수집)·NFR-040(최신 2개 메이저 브라우저 지원)·NFR-041(JS 비활성
명시적 비지원)을 처리했다. 핵심 결정은 세 가지다.

1. **KPI-1~5 중 새 이벤트가 실제로 필요한 것은 3개뿐**이다(§1). KPI-1·2는 이미 있는 상태
   전이 타임스탬프로 산출 가능하고, KPI-4는 `join_requests`에 없던 컬럼(`decided_at`) 하나만
   추가하면 된다. **KPI-3·5만 DB 어디에도 원천이 없어 새 이벤트 인프라(`product_events`
   테이블)가 필요했다.**
2. **`product_events`는 `audit_logs`(Task 038)와 다른 신뢰 모델을 쓴다** — 감사 로그는
   service-role 전용 쓰기 + 클라이언트 완전 거부인 반면, 이 테이블은 **self-service INSERT**
   (`actor_id=auth.uid()`)다(§2). 이 차이 자체가 이번 Task의 "새 인프라를 끌어올지" 판단의
   핵심이었다 — 외부 SaaS(Vercel Analytics·PostHog)는 도입하지 않았다(§4).
3. **NFR-040은 Tailwind v4의 CSS 기능 최저 버전이 실질적 기준**이다(§5) — Next.js 16의
   기본 브라우저리스트(Chrome/Edge/Firefox 111+, Safari 16.4+)보다 Tailwind v4가 더 엄격하다
   (Firefox 128+). **팀장 지시로 재시도해 실 Chromium 브라우저 검증을 완료했고, 그 과정에서
   MAJOR 결함 2건을 새로 발견했다**(§5.4·5.6, `docs/ISSUES.md` **I-098·I-099**) — `/sample`의
   폭 토글(768/1280/전체)과 앱 셸의 헤더↔탭바 데스크톱 전환이 day 21의 모바일 프레임 도입
   이후로 조용히 무력화돼 있었다. 둘 다 같은 원인(`globals.css`의 `@custom-variant md
   (@container appframe ...)`가 `AppShell`의 430px 캡과 맞물린 것)이고, **아무도 실 브라우저로
   확인한 적이 없어 지금까지 발견되지 않았다.**

산출물 파일 목록은 §7.

---

## 1. NFR-030 — KPI별 원천 이벤트 매핑

`docs/requirements/requirements.md` 1행(49~54행) 정의를 그대로 기준으로 삼았다.

| KPI | 정의 | 원천 | 새 이벤트 필요? |
| --- | --- | --- | --- |
| KPI-1 | 크루 중 30일 내 Meetup 1건 이상 가결 비율 | `crews.created_at` + `meetups.created_at`/`crew_id`(Meetup은 poll이 `passed`로 판정될 때만 `finalize_closed_poll` 트리거가 생성한다, D-054) | **아니오** — 이미 존재 |
| KPI-2 | 투표 참여율(투표 수/대상자 수) | `poll_votes` 행 수 / `poll_eligible_voters` 행 수(둘 다 poll당 스냅샷) | **아니오** — 이미 존재 |
| KPI-3 | 투표 종료 알림 클릭률 | 알림 "노출"·"클릭" — 둘 다 DB에 없다(`notifications.read_at`은 "읽음 처리"이지 "클릭"이 아니고, "노출"은 아예 없다) | **예** — `product_events`(`notification_impression`·`notification_click`) |
| KPI-4 | 가입 신청 후 72시간 내 승인·반려 처리율 | `join_requests.created_at`(있음) vs 처리 시각(**없었다** — `decided_by`만 있고 시각이 없다) | **부분** — 새 이벤트가 아니라 **컬럼 하나**(`decided_at`)로 해결(§3) |
| KPI-5 | 크루 검색 → 가입 신청 전환율 | 검색 세션(DB에 전혀 없음, `/crews` 검색은 URL searchParams로만 구현) vs 가입 신청(`join_requests` 이미 있음) | **예** — `product_events`(`crew_search`) |
| KPI-6 | `/sample` 등록 커버율 | 코드 정적 대조(별도 인프라 불필요, 이번 Task 범위 아님) | 해당 없음 |

**같은 사실을 두 곳에 중복 기록하지 않는다**는 원칙(I-071/D-054가 이미 세운 교훈)을 그대로
따랐다 — KPI-1·2를 위해 별도 이벤트 로그를 새로 만들었다면 크루·투표 테이블의 기존 타임스탬프와
사실이 중복돼, 나중에 둘이 어긋나는 새로운 결함군(I-071류)을 스스로 만드는 셈이었다. KPI-4도
같은 이유로 "이벤트 로그 행"이 아니라 **엔티티 자신의 속성**(컬럼)으로 풀었다 — "언제
승인/반려됐는가"는 `join_requests`라는 엔티티의 생애주기 속성이지, 별도로 관측되는 "행동"이
아니라고 판단했다.

## 2. `audit_logs` vs `product_events` — 왜 다른 인프라인가

`src/lib/audit/audit-log.ts`(Task 038)의 `recordAuditLog`는 이미 있었다. 이번 Task 배정
메시지가 "KPI 이벤트가 감사 로그와 무엇이 다른지부터 정리하라"고 요구해서 먼저 대조했다.

| | `audit_logs` | `product_events`(신설) |
| --- | --- | --- |
| 무엇을 기록하는가 | 권한 변경·강퇴·해산·투표 종료·강제 삭제 — **관리 행위**(NFR-015) | 검색·알림 노출·알림 클릭 — **평범한 사용자 자신의 행동**(NFR-030) |
| 누가 쓰는가 | service-role 클라이언트(`SUPABASE_SERVICE_ROLE_KEY`), RLS를 완전히 우회 | 호출자 자신의 인증 세션(`createSupabaseServerClient`, 쿠키 기반), RLS가 실제로 걸린다 |
| RLS 모델 | anon/authenticated **완전 거부**(읽기·쓰기 전부) | authenticated의 **자기 행 INSERT만 허용**(`actor_id=auth.uid()`), 그 외 전부 거부 |
| 왜 이렇게 다른가 | 행위자가 신뢰된 역할(임원 이상)이거나, 시스템이 대신 기록해야 신뢰할 수 있다 — 본인이 자기 행위를 스스로 감사하면 감사가 아니다 | 행위자 자신이 "내가 방금 검색했다"고 기록하는 것은 위조해도 잃을 게 없다(과장된 통계 조작 정도) — 굳이 service-role을 거칠 이유가 없고, 거치면 매 검색·매 알림 클릭마다 서버 액션이 service-role 클라이언트를 새로 만드는 비용만 는다 |
| 읽기(집계) 화면 | 없음(v0.1) | 없음(v0.1) — 둘 다 "쓰기까지"가 이번 범위다 |

**결론**: 새 SaaS(Vercel Analytics·PostHog 등)를 붙이지 않았다. 이미 Supabase에 자체 적재할
인프라(RLS·트리거 패턴)가 성숙해 있고, 이 프로젝트가 반복해 온 "새 의존성은 근거가 있을 때만"
원칙(D-052가 이번 회차 바로 전에 vitest 미도입을 이런 이유로 결정했다)과 같은 판단이다.
외부 SaaS를 검토는 했다 — 기각 사유:

- **Vercel Analytics**: 페이지뷰·Web Vitals 중심이라 KPI-3·5가 요구하는 "이 사용자의 이 검색이
  이 가입 신청으로 이어졌는가" 같은 **사용자 단위 퍼널**을 계약(schema)으로 표현할 수 없다.
  이벤트에 임의 속성을 붙이는 유료 티어가 필요하다.
- **PostHog(self-host 또는 cloud)**: 퍼널 기능은 맞지만, 이 프로젝트는 아직 실사용자가 0명
  (v0.1, 시드 데이터뿐)이라 별도 프로젝트·키·SDK를 지금 도입하면 "도구가 있다"는 착시만 남기고
  (§6.2의 vitest 논의와 같은 우려), 무엇보다 **actor_id를 자체 `profiles.id`와 맞춰야 하는데
  RLS 경계를 벗어난 제3자 SaaS로 사용자 식별자를 보내는 것 자체가 개인정보 처리방침(NFR-031·033
  이 이미 신경 쓰는 영역)과 별도 검토가 필요한 결정**이라 이번 회차 안에 끝낼 수 있는 규모가
  아니었다.

## 3. `join_requests.decided_at` — 마이그레이션과 검증

`join_requests`에는 `decided_by`(누가)만 있고 **언제**가 없었다. 마이그레이션
`20260729075002_kpi_045_join_requests_decided_at.sql`:

- `decided_at timestamptz null` 컬럼 추가.
- `BEFORE UPDATE` 트리거 `join_requests_stamp_decided_at`: `old.status='pending' AND
  new.status IN ('approved','rejected') AND new.decided_at IS NULL`일 때만 `now()`로 채운다.
- **앱 레이어(`decide-join-request.ts`)는 이 컬럼을 전혀 쓰지 않는다** — I-071/D-054의 "같은
  사실을 TS·SQL 두 곳에 두지 않는다" 원칙을 그대로 따랐다. 처리 시각은 상태 전이의 부수 효과이지
  비즈니스 판단이 아니므로, 어느 경로(현재 앱 코드/향후 admin 콘솔/service-role 스크립트)로
  전이가 일어나든 DB가 스스로 보증한다.

**실측(`begin`…`rollback` 및 트랜잭션 내 순수 검증, 실 DB)**:

1. pending→approved 전이 → `decided_at` 자동 채움 확인(트리거 정상 동작).
2. pending→withdrawn(자진 철회) → `decided_at`이 **채워지지 않음** 확인 — KPI-4는 "임원 처리"만
   재는 지표라 자진 철회를 처리 시각으로 셀 이유가 없다는 설계 의도와 일치.
3. (실수 기록) 첫 실측 시도에서 트랜잭션 래핑 없이 실 INSERT를 실행해 `join_requests`에 테스트
   행이 실제로 커밋된 사고가 있었다 — **즉시 발견해 `DELETE ... WHERE id=...`로 제거**했고,
   연쇄로 `crew_memberships`에 부수 효과가 생기지 않았음을 재조회로 확인했다(`join_requests`
   INSERT에는 자동 프로비저닝 트리거가 없다는 기존 문서화와 일치). 이 사고 자체를 숨기지 않고
   여기 남긴다 — 21일차 팀장 지시("실측하지 않은 것을 확인했다고 쓰지 마라")의 반대쪽 교훈,
   즉 "실측 중 사고도 정직하게 남긴다"를 지킨다.

`src/lib/types/join-request.types.ts`에 `decidedAt: string | null` 추가, `mappers.ts`의
`toJoinRequest`가 `row.decided_at`을 그대로 옮긴다. Mock 쪽(`lib/data/mock/**`)은 Task 032부터
배럴에서 빠져 실제로 소비되지 않지만, 같은 프로젝트의 TS 타입 검사 대상이라 `decidedAt` 누락
4곳(`fixtures.ts`·`join-request.ts`·`generate-crews.ts` 3곳)을 채워 `tsc --noEmit` 통과를
유지했다.

**정정(같은 날, CREW 교차검증 → I-100, MAJOR)**: 위 트리거가 `new.decided_at is null`일
때만 채우는 조건이라 "기본값 채우기"에 그쳤고, D-054가 이미 확립한 "클라이언트가 뭘 보내든
무시하고 덮어쓴다" 방어가 아니었다 — self-service·staff 양쪽 다 UPDATE 요청에 `decided_at`
값을 직접 실어 보내면(REST 직접 호출) 그 위조값이 그대로 저장됐다(실측: 자진 철회 +
`2020-01-01` 위조, staff 정당 승인 + `2019-01-01` 위조, 둘 다 위조값 그대로 저장됨).
**팀장이 배정 메시지에서 미리 경고한 바로 그 결함 형태**("앱 레이어만 막고 DB가 독립으로
강제하지 않는다")가 이번 Task의 내 작업에서도 재발했다는 뜻이다. CREW가 찾은 즉시 같은
회차에 수정했다 — `pending→approved/rejected` 전이는 조건 없이 항상 `now()`로 덮어쓰고,
그 외 전이는 `old` 값으로 고정한다(D-054 패턴 재사용, 마이그레이션
`major_fix_join_requests_decided_at_client_forgery`). 재검증 3건(위조 시나리오 2건 + 정상
처리 회귀 1건) 전부 기대와 일치 확인. 상세는 `docs/ISSUES.md` **I-100**, "교차검증(CREW,
22일차)" §2가 원 발견 기록의 SSOT다.

## 4. `product_events` — 스키마·RLS·실측

마이그레이션 `20260729075023_kpi_045_product_events.sql`.

```
product_events (
  id uuid pk,
  actor_id uuid not null references profiles(id),
  event_type text check in ('crew_search','notification_impression','notification_click'),
  payload jsonb not null default '{}',
  occurred_at timestamptz not null default now()
)
```

- RLS: `product_events_insert_self` — `for insert to authenticated with check
  (actor_id = auth.uid())`. UPDATE/DELETE 정책은 두지 않는다(`poll_votes`의 `choice`/
  `voted_at`과 같은 이유 — 이벤트 로그는 추가 후 불변이어야 로그로서 의미가 있다).
- **이 프로젝트의 새 테이블은 기본적으로 anon/authenticated에 ALL 권한이 GRANT된다**(I-090이
  이미 실측한 프로젝트 전역 기본 권한 설정) — RLS만 믿지 않고 `revoke all ... from anon`·
  `revoke select, update, delete ... from authenticated`를 명시했다. 실측으로 확인(아래).

### 4.1 RLS·GRANT 실측 (전부 `begin`…`rollback`, `chopin0625`/`chopin_0625` 실 프로필로 신원 전환)

| # | 시나리오 | 기대 | 실측 결과 |
| --- | --- | --- | --- |
| 1 | authenticated가 본인 `actor_id`로 INSERT | 성공 | **성공** |
| 2 | authenticated가 **남의** `actor_id`로 INSERT(위조 시도) | 차단 | **차단**("new row violates row-level security policy") |
| 3 | authenticated가 SELECT(본인 것 포함 전체) | 차단(권한 없음, 화면이 없어 읽을 이유가 없다) | **차단**("permission denied for table product_events") |
| 4 | authenticated가 본인 행 UPDATE 시도 | 차단(불변) | **차단**("permission denied for table product_events") |
| 5 | anon INSERT 시도 | 차단 | **차단** |
| 6 | anon SELECT 시도 | 차단 | **차단** |

6개 시나리오 전부 기대와 일치 — **자신의 이벤트만 쓸 수 있고, 남의 것을 조작하거나 자신의
것조차 다시 읽을 수 없다.** 21일차 교훈("앱 레이어만 막고 DB가 독립으로 강제하지 않는다"는
패턴)을 그대로 적용해 앱 코드가 아니라 SQL로 직접 확인했다.

### 4.2 계측 지점

세 이벤트 모두 **`lib/data/supabase/product-event.ts`의 `recordProductEvent`**(단일 쓰기
함수, 쿠키 기반 `createSupabaseServerClient` — service-role이 아니다) 하나를 거친다.

- **`crew_search`**(KPI-5 분모): `CrewSearchBar.handleSubmit`(클라이언트)이 실제 키워드 제출
  (FR-014 E2, 2자 이상 검증 통과)시에만 새 Server Action `recordCrewSearchEventAction`을
  fire-and-forget으로 부른다. 카테고리 토글만 바꾸는 `handleCategoryChange`는 "검색"이 아니라
  "필터"라 여기서 부르지 않는다.
  - **게스트(anon) 검색은 기록하지 않는다** — RLS가 `auth.uid()` 없는 세션의 INSERT를 원천
    차단하기도 하지만, 더 근본적으로 **이 KPI의 분자(가입 신청)가 로그인을 요구**해 게스트
    단독 검색은 이 전환 퍼널에 애초에 기여할 수 없다. 로그인 안 한 방문자의 검색 세션을
    분모에 넣지 않는 것은 누락이 아니라 의도된 스코프다.
- **`notification_impression`**(KPI-3 분모): `NotificationList`(표현 컴포넌트, D-030 ①)가
  마운트될 때(+`notifications` 배열이 바뀔 때) 아직 기록하지 않은 id만 걸러 `onImpression`
  콜백을 부른다(`useRef<Set<Id>>`로 컴포넌트 인스턴스 생애주기 동안 중복 억제). `NotificationBell`
  의 팝오버는 Base UI 기본 동작상 **닫히면 내용이 언마운트**되므로, 벨을 다시 열 때마다 이
  컴포넌트가 새로 마운트돼 "다시 노출됨"이 다시 기록된다 — 의도된 동작이다(노출은 평생 1회가
  아니라 매번 셀 수 있는 행동이라고 판단했다). `/notifications` 페이지도 같은 컴포넌트를 쓴다.
- **`notification_click`**(KPI-3 분자): `useNotificationFeed.markRead`가 읽음 처리와 별개로
  클릭 시점의 알림 유형을 조회해 기록한다.
- 유형은 **10종 전부** 기록하고 `poll_closed`로 좁히지 않았다 — KPI-3 산출 시
  `payload->>'type'='poll_closed'`로 필터링하면 되고, 지금 좁히면 다른 알림 유형의 클릭률이
  나중에 필요할 때 이벤트를 다시 심어야 한다.

### 4.3 알려진 측정 한계 (정직하게 남긴다)

- **벨 팝오버 노출과 클릭이 같은 지점(`NotificationList`)에서 나온다**는 것은 장점이지만,
  **`/notifications` 페이지 마운트와 벨 팝오버 오픈을 구분하지 않는다** — KPI-3 집계 시
  "어느 진입점에서 클릭됐는지"는 알 수 없다(필요해지면 `payload`에 `surface: "bell" |
  "center"` 필드를 추가하는 것으로 확장 가능하나, 이번 회차엔 넣지 않았다).
- **집계·대시보드는 이번 범위 밖이다.** `product_events`는 v0.1에 조회 화면이 없고
  anon/authenticated `SELECT` 권한 자체가 없다 — 실제 KPI 수치 산출은 service_role 경로(다음
  회차 과제)가 필요하다. NFR-030의 측정 기준("지표별 원천 이벤트 정의 존재")은 이벤트가
  **존재**하는 것까지이지 대시보드가 아니다.
- **실사용자 트래픽이 아직 0이다**(v0.1, 시드 데이터뿐) — 위 계측 지점은 코드 경로로만
  확인했고 실사용 규모에서의 볼륨·정확도는 검증하지 못했다(당연히 미확인).

## 5. NFR-040 — 최신 2개 메이저 브라우저 지원

### 5.1 이 앱의 실제 최저 기준은 Next.js가 아니라 Tailwind v4다

- `package.json`에 `browserslist` 커스텀 설정 없음(확인) → Next.js 16 기본값 적용:
  Chrome/Edge/Firefox **111+**, Safari **16.4+**(`node_modules/next/dist/docs/
  03-architecture/supported-browsers.md`).
- 그런데 `src/app/globals.css`가 `oklch()`(107회) · `color-mix(in oklab, ...)`(다크모드
  틴트·크루 팔레트 확정성 표현에 사용) · `@container`(앱 프레임·`/sample` 반응형 전부)를
  전면적으로 쓴다 — 이건 Tailwind v4의 핵심 기능이 요구하는 CSS라, Tailwind 공식 문서
  (tailwindcss.com/docs/compatibility, 2026-07-29 확인)가 명시한 **Chrome 111 · Safari
  16.4 · Firefox 128**이 이 앱의 실질적 최저 지원선이다 — Next의 111(Firefox)보다 Tailwind가
  17버전 더 엄격하다. 즉 **"이 앱이 실제로 켜지는 최저 버전"을 결정하는 것은 Next가 아니라
  Tailwind CSS 출력**이다.
- 오늘(2026-07-29) 기준 안정 버전은 Chrome 151·Firefox 153·Edge 150·Safari 26(WebSearch로
  확인) — Tailwind의 최저선(Chrome 111/Firefox 128/Safari 16.4)은 "최신 2개 메이저"보다
  한참 아래이므로, **에버그린(자동 업데이트) 브라우저 사용자에게는 NFR-040이 요구하는 지원
  범위가 구조적으로 이미 충족된다.** 실제 위험은 자동 업데이트가 없는 기기(오래된 iOS 기기의
  iOS Safari 등)뿐이다.

### 5.2 실측한 것

- `npm run build`(Turbopack) — **성공**. TypeScript 검사 통과, 21개 라우트 전부 정상 생성.
- `npm start`(프로덕션 빌드, 팀장의 `npm run dev`와 별도 포트 3231)를 띄우고 `curl`로
  9개 라우트(`/`·`/sample`·`/login`·`/crews`·`/calendar`·`/home`·`/notifications`·
  `/settings`·`/invitations`) 전부 200 확인, 구형 Safari 16.4·Firefox 128 User-Agent
  스푸핑으로도 동일하게 200(서버가 UA 기반으로 다르게 응답하지 않음, 당연하지만 확인).
- 작업 종료 후 **`npm start` 프로세스를 종료**했다(팀장 운영 규칙).

### 5.3 실 브라우저 재검증 (팀장 지시로 재시도, 접근 재개 경위)

최초 작성 시점에는 공유 Playwright MCP 브라우저 인스턴스가 비-isolated 모드라 세션 내내(약
10분·8회 재시도) 다른 팀원의 동시 작업과 충돌해(`Error: Browser is already in use for
/home/cho/.cache/ms-playwright-mcp/mcp-chrome-698a372`) 인터랙티브 검증을 못 했다고 §5.3에
적었다. **팀장이 다른 팀원들의 브라우저 사용이 끝났음을 확인하고 재시도를 지시**했다 —
재시도 시점에도 여전히 충돌했으나, 원인이 **아무도 안 쓰는데 정리되지 않은 잔여 Chrome
프로세스**(같은 프로필 디렉터리를 물고 있던 좀비 인스턴스, PID 확인 후 직접 종료)였다 —
그것만 정리하니 즉시 새 브라우저를 띄울 수 있었다. 이후 Chromium 계열 1종으로 아래 4개
항목을 실제로 검증했다(우선순위는 팀장 지시 순서). **WebKit(Safari 대응)은 이 MCP 서버
설정이 Chrome 채널 고정이라 이번에도 확인하지 못했다** — 순수 미확인으로 남긴다.

### 5.4 컨테이너 쿼리 폭 토글 — **MAJOR 결함 발견(I-098)**

`/sample`의 "컨테이너 쿼리" 섹션에서 `PreviewFrame`의 폭 토글(360/768/1280/전체)을 실제로
클릭해 `grid-template-columns`를 측정했다.

| 토글 | 기대 | 실측 |
| --- | --- | --- |
| 360 | 1열(`@sm` 미달) | **1열**, `326px` — PASS |
| 1280 | 3열(`@lg` 임계값 32rem=512px 초과) | **2열**, `175px 175px`(합 ~350px) — **FAIL** |
| 전체 | 3열 이상 여유 | **2열**, 동일하게 ~396px — **FAIL** |

원인을 조상 체인 실측(`getBoundingClientRect`+`getComputedStyle`)으로 추적: `/sample`도
다른 모든 라우트와 같은 `AppShell`(day 21, 모바일 프레임)에 감싸이고, 그 루트 `div`가
`max-w-app`(430px)로 폭을 하드캡한다. `PreviewFrame`이 내부적으로 1280px를 요청해도 조상이
430px를 넘겨주지 않으니 실제 렌더 폭은 항상 ~394~430px에 머문다. **768·1280·전체 세 토글이
사실상 구분되지 않는다** — `/sample`이 "테스트 러너 없는 프로젝트의 유일한 회귀 확인
지점"(R-002·CON-09)이라는 점에서 이번 회차 최대 발견으로 판단한다. 상세·후속 제안은
`docs/ISSUES.md` **I-098**.

### 5.5 라이트/다크 전환 — PASS(문제 없음)

`document.documentElement.classList`로 `.dark` 토글을 직접 조작해 확인 — `--background`는
라이트 `lab(100% 0 0)`(흰색)/다크 `lab(2.75% 0 0)`(거의 검정)로 정상 전환됐고, `--crew-1`은
라이트·다크 양쪽에서 **동일하게 `#939300`** — D-026이 명시한 "크루 팔레트는 라이트·다크
단일값" 전제가 실 렌더에서도 유지됨을 확인했다.

### 5.6 앱 셸 헤더↔탭바 전환 — **MAJOR 결함 발견(I-099)**

`/crews`(실 제품 라우트, `/sample` 아님)에서 브라우저 창 자체를 390px → 1024px → 1280px로
세 번 리사이즈하며 `header nav`·`MobileTabBar`의 `computed display`를 측정했다.

| 뷰포트 | `header nav` 기대 | `header nav` 실측 | `MobileTabBar` 기대 | `MobileTabBar` 실측 |
| --- | --- | --- | --- | --- |
| 390px | `none`(모바일) | `none` — PASS | `flex`(모바일) | `flex` — PASS |
| 1024px | `flex`(데스크톱, `md` 이상) | `none` — **FAIL** | `hidden`(데스크톱) | `flex` — **FAIL** |
| 1280px | `flex`(데스크톱) | `none` — **FAIL** | `hidden`(데스크톱) | `flex` — **FAIL** |

1280px 스크린샷(임시 저장, 저장소에는 커밋하지 않음)으로 시각 확인: 데스크톱 전체 폭에서도
헤더에는 로고만 있고, 크루 탐색·홈·계정 진입점은 화면 하단 고정 탭바(게스트 4항목)로만
노출된다. 화면 좌우로 빈 캔버스가 넓게 남는다 — "모바일 프레임을 중앙에 고정"이라는 시각
의도 자체는 맞게 작동하지만, `AppShell.tsx`의 docstring이 NFR-026을 인용하며 명시한
"데스크톱은 `HeaderNav` 인라인 링크, 모바일은 하단 탭바"라는 **전환 자체가 어떤 폭에서도
일어나지 않는다.** 원인은 §5.4와 같다 — `globals.css`의 `@custom-variant md (@container
appframe (min-width: 48rem))`가 `md:` 전체를 프레임(430px 캡) 기준으로 재정의해, `HeaderNav`·
`MobileTabBar`가 그 프레임의 직계 자손인 한 `md:`가 영원히 켜지지 않는다. 21일차에 "로그아웃
버튼이 `hidden md:flex` 탓에 안 보이던" 결함이 컴포넌트 교체(일관성 확보)로만 봉합되고
**근본 원인은 그대로 남아 있었다**는 것을 이번에 확인했다. 상세·후속 제안은
`docs/ISSUES.md` **I-099**.

### 5.7 부수 발견 — `curl` 스모크 중 찾은 것 (I-095)

NFR-040 스모크 테스트 도중, 미인증 상태(쿠키 없는 `curl`, 즉 게스트)로 `(app)` 보호 라우트
(`/calendar`·`/home`·`/notifications`·`/settings`·`/invitations`)에 접근하면 **HTTP 200**과
함께 화면 자체는 "로그인이 필요합니다 / 로그인 화면으로 이동" 문구가 정확히 뜨지만(데이터
유출 없음, 확인함), 서버 콘솔에 `assertAuthenticatedSession: (app) 레이아웃의 인증 가드를
통과했는데 세션이 미인증 상태다 — 레이아웃 가드가 깨졌다는 뜻이다`라는 예외가 매번 로깅됐다.
**이 동작은 내가 오늘 바꾼 어떤 코드와도 무관하다** — 같은 요청을 팀장이 띄워 둔 기존
`npm run dev`(포트 3000, 내가 손대지 않음)에도 그대로 재현되어, 오늘 발생한 회귀가 아니라
기존부터 있던 동작임을 확인했다. 화면은 정확해 사용자 영향은 없어 보이지만(I-044와 같은
성격 — "화면은 맞고 상태 코드/로그만 이상하다"), 원인은 조사하지 않았다(레이아웃 가드
코드는 CORE 소관, D-039). 상세는 `docs/ISSUES.md` I-095.

### 5.8 여전히 미확인으로 남긴 것

- **WebKit(Safari 대응)·Firefox 실 렌더링** — 이 세션의 Playwright MCP가 Chrome 채널
  고정이라 확인하지 못했다. §5.1의 Tailwind v4 최저선 분석으로 근사할 뿐이다.
- **iOS Safari·Android Chrome 실기기(또는 에뮬레이터)** — 확인 수단이 없다.
- **콘솔 오류**: `/sample`·`/crews` 2개 라우트에서 확인(0 에러, preload 관련 경미한 warning
  1건 — 리소스 프리로드가 몇 초 안에 안 쓰였다는 흔한 Next.js 노이즈, 앱 로직과 무관해
  이슈로 등재하지 않았다). 나머지 라우트(로그인 후 화면들)는 실 계정 로그인까지는 이번에
  하지 않아 미확인이다.

## 6. NFR-041 — JavaScript 비활성 환경 비지원

**구현은 산출물이 아니다** — 배정 메시지의 지시대로 코드(`<noscript>` 등)를 추가하지
않았다. 근거:

- `requirements.md`가 이미 "JavaScript 비활성 환경은 지원 대상이 아니다(명시적 비지원)"로
  명문화했고, `docs/prioritization-and-risks.md` 6.1절이 이미 **W등급·차기**로 분류해 뒀다
  (근거: "실시간 채팅·투표가 핵심이므로 비활성 환경 지원은 제품 목적과 양립하지 않는다").
  즉 **요구사항 문서 자체가 이미 명시**하고 있었다 — 이번 Task가 처음 발견한 사실이 아니다.
- 이번 Task가 실제로 보탠 것은 **"이 결정을 다시 뒤집지 않는다"는 종결 확인**이다.
  `src/app/`에 `<noscript>` 태그가 없음을 확인했고(grep), 이것이 실수로 빠뜨린 것이 아니라
  **의도적으로 만들지 않은 것**임을 이번 기회에 D-\*로 명문화했다(§6.3의 D-060) — 다음
  사람이 "왜 noscript 안내가 없지?"라고 궁금해할 때 근거 없이 재조사하지 않도록.
- `<noscript>` 안내 문구 자체를 넣는 방안도 검토했으나(사용자에게 "JS가 필요합니다"라고
  알려주는 것은 지원이 아니라 예의에 가깝다는 반론이 있을 수 있다), **배정 메시지가 "구현이
  아니라 명시가 산출물"이라고 명시적으로 못 박아 이번 회차엔 만들지 않았다** — 필요하다고
  판단되면 별도 결정으로 다시 논의할 사안이지 이번 Task의 범위가 아니라고 봤다.

## 7. 산출물 파일 목록

**DB (Supabase, `apply_migration` 즉시 로컬 동기화 완료)**

- `supabase/migrations/20260729075002_kpi_045_join_requests_decided_at.sql`
- `supabase/migrations/20260729075023_kpi_045_product_events.sql`
- `supabase/migrations/20260729083543_major_fix_join_requests_decided_at_client_forgery.sql`
  (I-100, CREW 교차검증이 찾은 위조 가능성 핫픽스)

**타입**

- `src/lib/types/product-event.types.ts`(신규) — `ProductEventType`·`ProductEvent`·
  `RecordProductEventInput`
- `src/lib/types/index.ts` — 배럴 등록
- `src/lib/types/join-request.types.ts` — `decidedAt` 필드 추가

**데이터 레이어**

- `src/lib/data/supabase/product-event.ts`(신규) — `recordProductEvent`
- `src/lib/data/supabase/mappers.ts` — `toJoinRequest`에 `decidedAt` 매핑 추가
- `src/lib/data/supabase/database.types.ts` — 재생성(product_events·join_requests.decided_at
  반영, 동시 작업 중이던 다른 팀원의 스키마 변경분도 함께 포함된 최신 스냅샷)
- `src/lib/data/index.ts` — `./supabase/product-event` 배럴 등록
- `src/lib/data/mock/fixtures.ts`·`src/lib/data/mock/join-request.ts`·
  `src/lib/data/mock/seed/generate-crews.ts` — `decidedAt` 필드 추가(타입 오류 수정, 배럴엔
  미노출)

**Server Actions**

- `src/lib/actions/record-crew-search-event.ts`(신규)
- `src/lib/actions/record-notification-impression.ts`(신규)
- `src/lib/actions/record-notification-click.ts`(신규)

**컴포넌트(기존 컴포넌트 확장 — 새 컴포넌트 아님, §8 참고)**

- `src/components/crews/CrewSearchBar.tsx` — 검색 제출 시 이벤트 기록 호출 추가
- `src/components/notifications/NotificationList.tsx` — `onImpression` prop + 마운트 이펙트
- `src/components/notifications/NotificationBell.tsx` — `onImpression` prop 전달
- `src/components/notifications/NotificationBellContainer.tsx` — `recordImpressions` 연결
- `src/components/notifications/NotificationCenterListContainer.tsx` — `recordImpressions` 연결
- `src/components/notifications/use-notification-feed.ts` — `recordImpressions`·클릭 기록 추가

**문서**

- 이 문서
- `docs/ISSUES.md` I-095·I-098·I-099·I-100(신규)
- `docs/prioritization-and-risks.md` D-058·D-059(정정)·D-060(신규)

## 8. `/sample` 등록 판단

**등록하지 않았다.** 이번 Task는 **새 컴포넌트를 만들지 않았다** — 기존 컴포넌트
(`CrewSearchBar`·`NotificationList`·`NotificationBell`·두 컨테이너)에 선택적(optional)
콜백 prop을 추가해 관측 이벤트를 흘려보내는 배선만 더했을 뿐, 화면에 보이는 마크업이나 상태는
하나도 바뀌지 않았다(4상태 중 어느 것도 새로 생기지 않았다). CLAUDE.md/CONVENTIONS.md의
등록 규칙은 "컴포넌트를 새로 만들 때마다" 기준이라, 기존 컴포넌트의 비가시적 배선 추가는
해당하지 않는다고 판단했다.

## 9. 다음 회차로 넘길 것

- **I-098·I-099 수정 방향 결정 — 다음 회차 최우선.** `/sample` 폭 토글 무력화와 앱 셸
  헤더↔탭바 미전환은 둘 다 day-21 모바일 프레임 도입의 부수효과이고, 수정은 CORE(원
  구현자)와의 조율이 필요하다 — 이번 회차엔 확인만 하고 고치지 않았다.
- **I-095 원인 조사** — `(app)` 레이아웃 가드 관련(D-039 소관, CORE).
- **CREW가 인접 발견한 `meetups` INSERT RLS 미확인 건**(교차검증 §3) — `meetups_insert_
  proposal_author_or_staff`가 `poll.status='closed_passed'`를 확인하지 않는 것으로 보인다는
  지적. Task 045 범위 밖이라 깊이 확인하지 않았다 — 사실이면 가짜 Meetup 생성 경로가 될 수
  있어 다음 회차가 먼저 확인해야 한다(등재 여부는 팀장 판단).
- **WebKit(Safari)·Firefox 실 렌더링, iOS/Android 실기기** — 이번 회차에도 확인 수단이
  없었다(§5.8).
- **`product_events` 집계 경로** — service_role 기반 KPI 산출 쿼리/배치는 이번 범위 밖.
  실사용자가 생기면(v1.0) 그때 첫 집계를 시도해 보는 것을 제안한다.
- **알림 노출 서페이스 구분**(`payload.surface`) — 필요해지면 스키마 변경 없이
  `notification_impression`/`notification_click`의 `payload`에 필드만 추가하면 된다.

## 교차검증 (CREW, 22일차)

리뷰 짝으로서 4개 항목을 독립 재현했다. 21일차 교훈("REST 직접 호출로 확인해라", "'실증했다'가
'충분히 실증했다'는 아니다")에 따라 SQL 시뮬레이션(`begin`…`rollback`, `set_config`+`set local
role`로 신원 전환)으로 직접 재현했고, DESIGN의 보고를 그대로 믿지 않았다.

### 1. `product_events` self-service INSERT — I-091 기준으로 "위험 낮음" 판정이 맞는가 — **PASS, 단서 있음**

`pg_trigger`로 직접 확인 — `product_events`에 걸린 트리거는 **0건**이다(다운스트림 캐스케이드
없음, I-091의 심각도 기준 미충족 = 저위험). DESIGN의 "위조해도 잃을 게 없다" 판정은 `invitations`
(내가 실측한 캐스케이드 있는 사례, I-093)·`polls`(I-089)와 달리 **정확하다** — 다른 테이블·다른
사용자에게 영향이 없다. 다만 `notification_preferences`("본인에게만 영향, 영구적 무해")와
완전히 같은 급은 아니라는 단서를 남긴다 — `product_events`는 **집계 지표(KPI-3·5)의 원천**이라
v0.2 이후 대시보드가 생기면 위조된 행이 조직 차원의 지표를 왜곡할 수 있다(개인에게 무해해도
집계에는 무해하지 않다). 지금은 읽는 사람이 없어(v0.1, SELECT 권한 자체가 없음) 실질 위험이
0이지만, 이 무해함은 "지금 안 읽는다"는 시한부 조건에 기댄 것이다 — 나중에 `product_events`
집계 쿼리를 만드는 사람은 위조 가능성(예: 봇이 `crew_search` 이벤트를 대량 생성해 KPI-5 분모를
부풀리는 등)을 감안해야 한다는 점을 D-058에 한 줄 남기는 것을 제안한다.

### 2. `join_requests.decided_at` — 기존 RLS·트리거와 충돌하는가 — **FAIL(실측으로 확인, 신규 발견)**

컬럼 자체가 상태 전이(I-085의 `status` 값 제한)를 우회하는 새 경로를 만들지는 않는다 — 확인
결과 `join_requests_update_requester_or_staff`의 `WITH CHECK`(`status='withdrawn'`만 self-service
허용)는 그대로다. **그런데 `decided_at` 컬럼 자체는 self-service·staff 양쪽 다 임의 값으로
위조할 수 있다.** 원인: `join_requests_stamp_decided_at` 트리거가 `new.decided_at is null`일
때만 `now()`로 채운다 — 즉 **클라이언트가 이미 값을 채워 보내면 트리거가 손대지 않고 그 값이
그대로 저장된다.** D-059가 "DB가 스스로 보증한다"고 쓴 것과 반대로, **트리거는 "기본값을
채워주는 것"이지 "클라이언트 주장을 무시하고 재계산하는" D-054/D-055식 방어가 아니다.**

**실측 2건 (둘 다 `begin`…`rollback`, 새 join_request 행 생성 후 롤백)**:

| # | 시나리오 | 결과 |
| --- | --- | --- |
| 1 | requester 본인이 self-service `withdrawn` 전이 + `decided_at='2020-01-01'` 동시 전송 | **성공** — 저장된 `decided_at`이 `2020-01-01`(위조값) 그대로 |
| 2 | staff가 정당하게 `approved` 처리 + `decided_at='2019-01-01'` 동시 전송 | **성공** — 저장된 `decided_at`이 `2019-01-01`(위조값) 그대로, `decided_by`는 정상 |

**영향**: I-091 기준(다운스트림 트리거 캐스케이드)으로는 낮음 — `decided_at`을 소비하는 다른
트리거나 테이블이 없어 캐스케이드는 없다. 그러나 **1번과 같은 이유(집계 지표 오염 가능성)로
KPI-4("가입 신청 후 72시간 내 처리율")를 위조할 수 있다** — 특히 `decided_at`을 아주 이른
시각으로 위조하면 실제로는 72시간을 넘겨 처리된 건도 "72시간 내 처리"로 집계될 수 있다.
"앱 레이어가 이 컬럼을 쓰지 않으니 DB가 보증한다"는 D-059의 전제가 **REST 직접 호출 앞에서는
성립하지 않는다** — 정확히 I-091이 정식화한 패턴("self-service/신뢰된 역할의 쓰기 분기가
새 컬럼값을 제한하는지는 제각각")의 새 사례다. 수정은 하지 않았다(범위는 검증까지) — 제안하는
해법은 D-054의 "덮어쓰기" 패턴 재사용: 트리거를 `new.decided_at is null` 조건 없이 **항상**
전이 시각으로 덮어쓰도록 바꾸면(클라이언트가 뭘 보내든 무시) 막힌다.

### 3. KPI-1·2 SQL 산출 가능성 — **PASS(직접 SQL로 실행해 확인)**

주장만 있고 쿼리가 없다는 지적에 따라 직접 실행했다:

- **KPI-1**(크루 중 30일 내 Meetup 1건 이상 가결 비율): `crews.created_at`+`meetups.created_at`
  만으로 계산 — 실행 결과 `total_crews=13, crews_with_meetup_30d=12, pct=92.3%`. 쿼리·데이터
  둘 다 실제로 작동한다.
- **KPI-2**(투표 참여율): poll별 `poll_votes`/`poll_eligible_voters` 카운트 비율 — 10개 poll
  샘플에 대해 실제로 계산됨(80~100% 분포).
- **단서(Task 045 범위 밖의 인접 발견)**: KPI-1이 "meetups 행 존재 = 가결된 제안"으로 등치하는
  전제를 확인하려고 `meetups_insert_proposal_author_or_staff` RLS를 봤는데, **이 정책이
  `poll.status='closed_passed'`를 확인하지 않는다** — 제안자 본인 또는 staff/owner이기만 하면
  poll이 아직 `open`이거나 `closed_rejected`여도 REST로 `meetups`를 직접 INSERT할 길이 RLS
  수준에서 막혀 있지 않아 보인다(트리거로 막는지는 확인하지 않았다 — Task 045 범위가 아니라
  깊이 파지 않았다). 사실이면 KPI-1의 "meetups 존재=가결"이라는 암묵 전제가 깨질 수 있고,
  더 심각하게는 가짜 Meetup을 만들 수 있다는 뜻이라 **별도 확인이 필요해 보인다** — 등재
  여부는 팀장 판단에 맡긴다.

### 4. `product_events` RLS 6종 — **PASS(독립 재현, 완전 일치)**

동일한 6개 시나리오를 SQL 시뮬레이션으로 재현 — self INSERT 성공, 타인 `actor_id` 위조 차단,
authenticated SELECT/UPDATE 차단, anon INSERT/SELECT 차단. **6/6 DESIGN의 보고와 정확히 일치**.

### 요약

| # | 항목 | 판정 |
| --- | --- | --- |
| 1 | product_events self-service 위험도 | PASS(단서: 집계 오염 가능성은 v0.2 이후 과제) |
| 2 | join_requests.decided_at 충돌 여부 | **FAIL — 신규 발견, 위조 가능** |
| 3 | KPI-1·2 SQL 실행 가능성 | PASS(직접 실행 확인) + 인접 발견(meetups INSERT RLS) |
| 4 | product_events RLS 6종 재현 | PASS(완전 일치) |

등재는 하지 않았다 — 번호는 팀장이 배정.
