# 운영 기반 — 감사 로그·레이트 리밋·오류 추적 (Task 038)

- **일자**: 2026-07-25(18일차)
- **담당**: BOARD(B팀) · 리뷰 CORE(A팀)
- **참조**: NFR-015·016·028, **D-005**, **R-012**, `docs/decisions/write-path-realdata-032.md`
  (선행 산출 — 배럴 read/write 분리, `respond_meetup_attendance` RPC 패턴)

## 0. 범위

Task 038(2.0인일, S)의 세 축 — 감사 로그(NFR-015)·레이트 리밋(D-005·NFR-016)·오류 추적
(NFR-028) — 을 처리했다. 신설 경로는 `src/lib/audit/**`(전용 소유)이고, 기존 Server Action
파일(DESIGN 소유)에는 최소 라인만 삽입했다(§2·§6 "파일별 삽입 내역" 참고).

## 1. 감사 로그 (NFR-015)

### 1.1 실측 확인 — 테이블은 이미 있었다

`mcp__supabase__list_tables`로 먼저 확인한 결과 `public.audit_logs`가 Task 028(CORE)에서 이미
만들어져 있었고(`create_moderation_and_audit_tables` 마이그레이션), `anon`/`authenticated`
완전 거부 RLS도 Task 029B에서 이미 적용돼 있었다(`rls_notification_moderation_audit_policies`
마이그레이션, `audit_logs_no_client_access` 정책). `src/lib/types/moderation.types.ts`의
`AuditLog` 타입도 이미 있었다 — 지시대로 **신설하지 않고 재사용**했다.

### 1.2 쓰기 계층 — `src/lib/audit/audit-log.ts`

`audit_logs`가 완전 거부 RLS라 `src/lib/auth/lockout.ts`와 같은 패턴(service-role 클라이언트,
파일 밖으로 내보내지 않음)으로 `recordAuditLog(input)`을 만들었다. 실패해도 예외를 던지지
않고 `console.error`로만 남긴다 — 감사 로그 기록 실패가 임원 임명·투표 종료 같은 주 행위 자체를
막으면 관측성 기능이 핵심 기능을 잠그는 것이라 I-049(트리거③ try/catch 격리)와 같은 원칙을
따랐다. NFR-015가 요구하는 "100% 기록"에는 재시도 큐가 없어 이론상 못 미친다 — §5 "남은
리스크" 참고.

### 1.3 호출부 3곳 — DESIGN 소유 파일에 최소 삽입

NFR-015 대상 5행위(권한 변경·강퇴·해산·투표 종료·게시물 강제 삭제) 중 **강퇴·해산은 이
저장소에 아직 구현 자체가 없다**(`leave-crew.ts` docstring이 "크루 해산은 v0.2·후속 Task"라고
명시하고, `crew:remove_member` 권한 매트릭스 행은 있지만 그 행을 쓰는 Server Action이 없다 —
`grep` 확인). 없는 기능에 감사 로그를 미리 꽂을 수 없어 이 둘은 후속 Task 몫으로 남긴다. 실제로
연결한 3곳:

| 파일 | 행위 | 삽입 위치 |
| --- | --- | --- |
| `src/lib/actions/set-crew-member-role.ts` | 권한 변경(임원 임명·해임) | import 2줄(4·6행 근처) + `setCrewMembershipRole` 성공 직후 `recordAuditLog` 호출 7줄(73~80행 부근) |
| `src/lib/actions/poll-auto-close.ts` | 투표 종료 | import 1줄 + `decideAndClosePoll` 끝(기존 `return closePoll(...)`를 `const result = ...`로 바꾸고 `closedBy !== null`일 때만 `recordAuditLog` 호출, 9줄 순증) |
| `src/lib/actions/delete-post.ts` | 게시물 강제 삭제 | import 1줄 + `deletePost` 성공 후 `!isSelf && canDeleteAny.allowed`일 때만 `recordAuditLog` 호출 7줄 |

**`poll-auto-close.ts`의 트리거 구분**: `decideAndClosePoll(pollId, closedBy)`는 3개 종료
트리거(①기한 도래 ②조기 종료 ③미투표자 0명)가 공유하는 내부 헬퍼다. `cast-vote.ts`(트리거③)와
`close-poll.ts`의 시뮬레이터(트리거①)는 둘 다 `closedBy: null`로 호출한다 — 책임 소재가 있는
human actor가 없다. `closePollEarlyAction`(트리거②)만 `session.profileId`를 넘긴다. 그래서
`closedBy !== null`을 감사 로그 기록 조건으로 삼았다 — 시스템 자동 종료를 "행위자"로 잘못
기록하는 사고를 코드 구조로 막는다.

**`delete-post.ts`의 "강제" 판별**: 작성자 본인 삭제(`post:delete_own`)는 통상적 CRUD이지
권한 남용을 감사할 대상이 아니다. `!isSelf && canDeleteAny.allowed`(임원·오너 등이 타인 글을
지운 경우)만 기록한다.

**crewId 결손**: `poll-auto-close.ts`는 poll만 알고 crew를 모른다(post→crew 조인이 없다). 이
함수만 이 조인을 위해 추가 쿼리를 넣는 것은 "최소 삽입" 원칙과 어긋난다고 판단해 `crewId: null`로
남겼다 — `targetId`(pollId)로 추적은 여전히 가능하다. `set-crew-member-role.ts`·`delete-post.ts`는
호출부가 이미 `crewId`를 갖고 있어 문제가 없다.

### 1.4 실측 — 행위자·대상·시각이 실제로 남는가

`npm run dev`가 이번 회차 운영 규칙상 팀장 전용이라 실제 Server Action을 브라우저로 호출해
확인할 수 없었다. 대신 `recordAuditLog`가 실행하는 것과 **동일한 INSERT**를
`@supabase/supabase-js` 서비스 롤 클라이언트로 직접 재현해 실측했다(스크립트는 실측 후 삭제,
삽입한 행도 정리):

- `crew.staff_appointed`(crewId 있음)·`poll.closed_early`(crewId null)·`post.force_deleted`
  3건을 실제 테스트 계정 profileId(`30f44dd9-…`→`fb70ff1c-…`)로 삽입했다.
- `select actor_id, crew_id, action, target_id, created_at from audit_logs`로 조회한 결과
  **3건 모두 actor_id·crew_id(null 포함)·action·target_id·created_at이 정확히 기대값과
  일치**했다(타임스탬프는 자동 채번, 밀리초 단위로 순서대로 찍힘).
- `authenticated` 롤로 같은 테이블에 `SELECT`했을 때 0행(RLS가 조용히 필터), `INSERT` 시도는
  `new row violates row-level security policy` 예외로 거부됨을 `set local role
  authenticated`로 재현해 확인했다 — 클라이언트가 이 로그를 우회해 쓰거나 읽을 수 없다.
- 정리 후 3건 모두 삭제 확인(`audit_logs`는 애초에 0행이었다, `list_tables` 실측과 일치).

**이 실측이 커버하지 않는 것**: 실제 브라우저 → Server Action → `checkPermission` →
`setCrewMembershipRole`/`deletePost`/`decideAndClosePoll` → `recordAuditLog`로 이어지는 전체
호출 경로는 `npm run dev` 없이 검증할 수 없었다. INSERT 자체의 정확성과 RLS는 실측했지만,
"호출부 조건문(`closedBy !== null`, `!isSelf && canDeleteAny.allowed`)이 실제 요청에서 올바르게
평가되는가"는 `npx tsc --noEmit`(0 errors)로 타입 정합성만 확인했다 — 팀장의 다음 `npm run dev`
세션에서 왕복 확인을 권한다.

### 1.5 `audit_logs`를 지금 아무도 읽을 수 없는 것은 결함이 아니다(18일차 교차검증, CORE)

`audit_logs_no_client_access`가 `anon`/`authenticated` 양쪽 모두 완전 거부라 `service_role`/
`postgres` 외에는 지금 이 로그를 조회할 방법이 없다(§1.4 실측에서도 `authenticated` 롤로는
0행). CORE가 교차검증에서 이를 결함으로 잡지 않았다 — **NFR-015 원문(`requirements.md:1196`)이
요구하는 것은 "해당 행위 100% 기록"뿐이고, 그 로그를 화면에서 조회하는 기능은 요구사항 어디에도
없다.** 감사 로그 열람 UI는 관리자 콘솔(D-008, v0.2 대상)의 몫이라 v0.1 범위 밖이다 — **Task
042B(관리자 콘솔)가 이 로그를 보여줄 시점에 함께 읽기 RLS 정책을 추가한다.** 다음에 이 문서를
보는 사람이 "읽기 정책이 왜 없지"를 다시 조사하지 않도록 여기 남긴다.

## 2. 레이트 리밋 (D-005·NFR-016·R-012)

### 2.1 D-005 원문 확인

`docs/prioritization-and-risks.md` D-005: "계정당 **분당 20회** 레이트 리밋, 초과 시 429". 적용
대상은 **핸들 검색**(FR-006)뿐이다 — NFR-016의 나머지 세 리밋(로그인 5회/15분, 메시지 전송
30회/분, 게시글 작성 10회/시간) 중 로그인은 D-020 잠금(`evaluateLoginLockout`)이 이미 다른
판정 형태로 구현하고 있고, 메시지·게시글 리밋은 이번 Task 038 지시 범위(D-005·R-012 참조)
밖이라 손대지 않았다.

### 2.2 카운터 테이블 — `email_resend_attempts`를 선례로

지시대로 17일차 CREW의 `email_resend_attempts`(FR-001 E4 재발송 카운터) 형식을 그대로 따라
`handle_search_attempts` 테이블을 신설했다(`20260725072323_handle_search_attempts_rate_limit`
마이그레이션, 원격 `apply_migration` 적용 + 로컬 파일 동일 이름 커밋, I-051 대응). 차이점 하나
— `identifier`를 `email_resend_attempts`(text, 이메일)와 달리 **uuid + `profiles.id` FK**로
뒀다. 핸들 검색은 `search:by_handle` 매트릭스가 `guest: deny`라 항상 인증 세션이 있고, D-005가
"계정당"이라 명시해 이메일보다 profileId가 더 정확한 식별자이기 때문이다. RLS는
`email_resend_attempts`와 동일하게 `anon`/`authenticated` 완전 거부.

### 2.3 판정과 I/O 분리

`src/lib/auth/resend-attempts.ts` + `lib/rules/auth-credentials.ts`의
`evaluateResendCooldown` 3단 계약(이력 조회 → 순수 함수 판정 → 허용 시에만 기록)을 그대로
재사용했다:

- **I/O**: `src/lib/audit/rate-limit-store.ts` — `getRecentHandleSearchAttempts`/
  `recordHandleSearchAttempt`. Supabase 읽기·쓰기만 하고 판정하지 않는다.
- **판정**: `src/lib/rules/rate-limit.ts` — `evaluateFixedWindowRateLimit`(순수 함수, NFR-036).
  identifier를 모르고 이미 필터링된 `attempts` 배열만 받는다. **범용으로 설계했다** —
  `HANDLE_SEARCH_RATE_LIMIT`(20회/60초) 외에 다른 행위의 리밋도 같은 함수로 판정할 수 있다
  (다음 사람이 메시지·게시글 리밋을 추가할 때 재사용 가능).

### 2.4 호출부 — `search-user-by-handle.ts`(DESIGN 소유, 최소 삽입)

`isAuthenticated(session)`로 세션을 타입 내로잉한 뒤(레이트 리밋 카운터가 profileId를
요구하므로) `getRecentHandleSearchAttempts` → `evaluateFixedWindowRateLimit` →
(허용 시) `recordHandleSearchAttempt` 순으로 8줄을 삽입했다. import 2줄 포함 총 10줄 순증.
초과 시 `{ found: false, rateLimited: true, retryAfterSeconds }`를 반환한다.

**`HandleSearchResult` 타입 확장**(`src/lib/rules/handle-search.ts`): 기존
`{found:false}`(미존재·옵트아웃 동일 취급, R-012)에 `rateLimited?`·`retryAfterSeconds?`를
선택 필드로 얹었다 — R-012가 막는 것(다른 계정의 존재 여부 열거)과는 다른 축(자기 계정의
요청 빈도)이라 별도 필드로 얹어도 "미존재·옵트아웃 동일 경로" 불변식을 깨지 않는다.

**UI**(`src/components/profile/UserSearchField.tsx`): `result.rateLimited`일 때
`UserSearchResult`(빈 카드) 대신 `Alert(destructive)` + `strings.account.search.rateLimited`를
그린다 — `/sample`의 기존 429 정적 데모(`src/components/sample/sections/account.tsx`)가 이미
같은 문구·같은 `Alert` 조합을 쓰고 있어 시각적으로 일치한다. `InviteMemberDialog.tsx`는
`UserSearchField`를 그대로 재사용하므로 별도 수정 없이 같은 동작을 물려받는다.

### 2.5 실측 — 21번째 요청이 429를 받는가

`npm run dev` 없이 Server Action을 직접 호출할 수 없어, `rate-limit-store.ts`가 내부적으로
하는 것과 **동일한 쿼리**(`@supabase/supabase-js` 서비스 롤 클라이언트, 같은 테이블·같은
`select`/`order`/`limit`/`insert`)를 재현하는 스크립트로 실측했다(실측 후 스크립트·데이터
전부 삭제):

```
시도 #1~#20: allowed=true  (매 시도마다 실제 INSERT까지 수행)
시도 #21:    allowed=false retryAfterSeconds=60
기록된 행 수: 20 (기대: 20, 21번째는 기록되지 않음 — 확인)
차단된 시도 번호: 21 (기대: 21 — 확인)
정리 후 남은 행 수: 0
```

**21번째 시도가 정확히 차단되고, 거부된 시도는 카운터에 기록되지 않는다(허용된 시도만
기록하는 설계가 의도대로 동작).** 순수 함수 `evaluateFixedWindowRateLimit` 자체도 별도로
3케이스(20건 후 21번째 차단, 19건일 때 20번째 허용, 60초 경과 후 창 밖으로 전부 나가 허용)를
직접 실행해 확인했다.

**이 실측이 커버하지 않는 것**: `rate-limit-store.ts`는 `import "server-only"`를 쓰는데, 이
패키지는 **Next.js 빌드 파이프라인이 `node_modules/next/dist/compiled/server-only`로 별칭
처리해야만 resolve된다** — 순수 Node/`tsx`로는 `Cannot find module 'server-only'` 에러가
난다(이번 실측 중 새로 발견한 사실, 아래 §5에 기록). 그래서 실제 소스 파일을 직접 import하지
못하고 동일 쿼리를 재현하는 방식으로 우회했다 — DB 동작(RLS·카운팅 정확성)은 실측했지만
"`search-user-by-handle.ts` 안에서 세션 조회부터 이 카운터까지 실제로 연결되는가"는
`npx tsc --noEmit`(0 errors)로만 확인했다.

### 2.6 `profile_search` RPC 직접 호출은 이 레이트 리밋을 우회한다(18일차 교차검증 major, CORE 수정)

교차검증에서 CORE가 major로 잡았다: `handle_search_attempts` 카운팅은
**`searchUserByHandleAction`(Server Action) 안에만 있다.** `authenticated` 세션으로
`supabase.rpc('profile_search', { p_handle })`를 **PostgREST로 직접 호출**하면(Server Action을
거치지 않는 경로) 이 카운팅 자체가 실행되지 않아 R-012·D-005가 막으려는 핸들 열거가 그대로
뚫린다 — `close-poll.ts` docstring이 이미 경고한 "Server Action은 페이지를 거치지 않고 직접
호출될 수 있다"는 패턴과 같은 종류의 구멍이되, 이번엔 Server Action이 아니라 **그 아래 RPC
자체**가 노출 표면이라는 점이 다르다. **이 수정은 CORE에 배정됐다** — `private.profile_search`
SECURITY DEFINER + `public.profile_search` SECURITY INVOKER 얇은 래퍼(029B가 세운 2단 구조,
`docs/decisions/rls-policies-029b.md`)로 리밋을 RPC 레벨로 옮긴다. 이 앱 경로(Server Action)
자체는 정확히 구현됐고, RPC가 별도 진입점이라는 것을 발견하지 못한 것도 이번 Task 038의 범위
(앱 레이어) 밖이었다 — 그래서 이 결함은 BOARD가 아니라 CORE(RPC 소관) 몫으로 배정됐다.

**그 결과 리밋 규칙이 두 곳에 존재하게 된다.** 역할을 다음과 같이 나눈다 — SQL(RPC 내부의
`private.profile_search`)과 앱 레이어(`lib/rules/rate-limit.ts` +
`lib/audit/rate-limit-store.ts`, UX 담당: 429 안내 문구·`retryAfterSeconds` 표시)로.

> **정정(18일차, 팀장 재실측 — I-059 처리 중 이 절이 스스로 지목되어 발견)**: 이 절은
> 원래 여기서 "RPC를 우회할 방법이 없는 한 SQL 쪽 판정이 최종 결정권을 갖는다"고 적었다.
> **그 전제가 틀렸다는 것이 18일차 팀장 재실측으로 확인됐다(I-058).** 왜 그렇게 믿었는지
> 남겨 둔다 — "SQL 강제 경계"라는 결론은 "리밋을 어떻게 우회할 수 있는가"만 검토하고
> "**앱이 실제로 그 SQL 경로를 쓰는가**"는 검증하지 않은 채 내린 것이었다(CORE의 RPC
> 수정 자체는 정확했다 — 이 절이 CORE의 결과물을 잘못 일반화했을 뿐이다). 다음 사람이
> 같은 추론 실수를 반복하지 않도록 이 문단은 지우지 않고 아래에 정정 내용만 덧붙인다.
>
> **정정된 사실관계(상세·영향·후속은 `I-058`이 단일 소스 — 여기서 복제하지 않는다)**:
> - SQL 강제 경계는 **`profile_search` RPC를 실제로 호출하는 경로에 대해서만** 최종
>   경계다.
> - 앱의 실제 FR-006 검색 경로는 그 RPC를 **쓰지 않는다** — `search-user-by-handle.ts` →
>   `getProfileByHandle` → `public.profiles`를 `.select("*")`로 직접 조회
>   (`src/lib/data/supabase/profile.ts:48-57`). RPC를 경유하는 `searchProfilesByHandle`
>   (같은 파일 :67)은 소비자가 0건이다.
> - 게다가 `profiles_select_authenticated`(Task 029A, `qual=true`)가 인증 사용자 전체에게
>   `profiles`의 전 컬럼·전 행을 이미 열어 두고 있다(팀장 실측: 21행 전부 조회, 옵트아웃
>   1건 포함).
> - **따라서 지금 D-005 리밋의 실효 범위는 "Server Action 경로(이 §2 전체가 다루는 앱
>   UX·카운팅) + RPC 직접 호출 경로(CORE의 §2.6 원 서술 대상)"뿐이고, `profiles` 직접
>   조회는 어느 쪽으로도 막히지 않는다.** 이 갭의 수정은 I-058로 이월됐다 — 이 문서(Task
>   038)의 범위가 아니다.
> - "SQL이 막았는데 앱 레이어가 통과시키면 그건 앱 레이어의 버그"라는 원 문단의 마지막
>   문장은 **RPC를 경유하는 한정된 경로 안에서는 여전히 유효하다** — 다만 그 경로 자체가
>   앱의 실제 검색 경로가 아니므로 실무적 의미가 크지 않다는 것이 이번 정정의 요지다.
> - **두 곳(SQL·앱 레이어)의 숫자(계정당 분당 20회, 60초 윈도)를 같은 값으로 유지한다는
>   원칙은 정정 후에도 유효하다** — I-058이 해소돼 `profiles` 직접 조회까지 막히면 그
>   시점부터 이 대응관계가 실질적 의미를 갖는다.

### 2.7 카운터 정리 잡(18일차 교차검증 minor 1) — `purge_expired_rate_limit_counters`

교차검증에서 CORE가 `cron.job`을 실측해 `handle_search_attempts`(이 Task가 신설)뿐 아니라
`email_resend_attempts`·`auth_attempts`(둘 다 Task 030, CREW 소유)도 정리 잡이 없어 무한
증식함을 발견했다. CORE 판정대로 후자 둘은 이번 Task의 결함이 아니라 기존 패턴을 그대로
계승한 것이지만, **운영 기반(Task 038)이 정확히 이 문제를 다루는 자리**라 세 테이블을 한
잡으로 묶어 여기서 해소했다(`20260725074754_purge_expired_rate_limit_counters_job`
마이그레이션). **스키마는 바꾸지 않았다** — `email_resend_attempts`·`auth_attempts`는
CREW(Task 030) 소유라 컬럼·인덱스는 그대로 두고 정리 함수+잡만 추가했다.

**보존 기간 근거** — "리밋 윈도가 1분이므로 며칠씩 남길 이유가 없다"는 지적을 그대로
따라, 각 테이블의 실제 판정 윈도에 여유값을 곱해 정했다(며칠 단위가 아니라 시간·하루
단위):

| 테이블 | 판정 윈도(실제 사용처) | 보존 기간 | 여유 배율 |
| --- | --- | --- | --- |
| `handle_search_attempts` | 60초(D-005, `HANDLE_SEARCH_RATE_LIMIT`) | 1시간 | 60배 |
| `email_resend_attempts` | 1시간(FR-001 E4 "시간당 5회", `evaluateResendCooldown`) | 2시간 | 2배 |
| `auth_attempts` | 최근 10건 조회(`getRecentAuthAttempts`) + 15분 잠금(D-020) | 1일 | 활동이 뜸한 계정도 "최근 10건"이 15분보다 오래 걸쳐 쌓일 수 있어 가장 길게 잡음 + 지원팀이 무차별 대입 패턴을 되짚어볼 여지 |

Task 035·039와 같은 `SECURITY INVOKER` + `statement_timeout` 패턴을 따르되, **배치 루프는
두지 않았다** — 세 테이블 모두 리밋 윈도가 짧아 정상 운영 중 상시 소규모다(12개월 보존하는
`chat_messages`·30일 보존하는 `profiles`와는 데이터 규모 자체가 다르다). 매일 19:00 UTC(KST
04:00) 실행 — `purge_expired_chat_messages`(18:00 UTC)·`anonymize_expired_deactivated_profiles`
(18:30 UTC)와 겹치지 않게 30분 offset.

**실측(요청받은 a~d)**:

- **(a) `cron.job` 등록**: `select * from cron.job` 결과 `purge_expired_rate_limit_counters`가
  `jobid=3`, `schedule='0 19 * * *'`, `active=true`로 등록됨을 확인 — 기존
  `purge_expired_chat_messages`(jobid=1)·`anonymize_expired_deactivated_profiles`(jobid=2)와
  나란히 있다.
- **(b)·(c) 오래된 행 삭제 + 윈도 안 최신 행 보존**(`begin`…`rollback`, 세 테이블 각각 오래된
  행 1개 + 최근 행 1개씩 삽입 후 `purge_expired_rate_limit_counters()`를 직접 실행):

  | 테이블 | 삽입 전 | 삽입한 오래된 행 | 삽입한 최근 행 | 정리 후 |
  | --- | --- | --- | --- | --- |
  | `handle_search_attempts` | 2행 | now()-2시간 | now()-10초 | **1행**(최근 행만 생존) |
  | `email_resend_attempts` | 2행 | now()-3시간 | now()-5분 | **1행** |
  | `auth_attempts` | 2행 | now()-2일 | now()-5분 | **1행** |

  세 테이블 모두 오래된 행은 지워지고 **윈도 안의 최신 행은 그대로 남아** 리밋이 조용히
  초기화되는 우회가 없음을 확인했다. `rollback`으로 원상 복구(실제 시드 데이터는 건드리지
  않음 — 테스트 identifier로 삽입).
- **(d) `get_advisors(security)` 신규 0건**: 기존 WARN 1건(`auth_leaked_password_protection`,
  무관)만 있고 이번 마이그레이션발 신규 경고 없음.

## 3. 오류 추적 (NFR-028)

### 3.1 도입 수단 조사

후보를 셋 검토했다:

| 후보 | 장점 | 단점 |
| --- | --- | --- |
| **Sentry**(`@sentry/nextjs`) | Next.js 16 공식 지원(App Router·Turbopack 문서 존재), 클라이언트·서버·엣지 통합 캡처, `setUser`/`setTag`로 사용자·크루 컨텍스트를 붙이는 API가 NFR-028 요구사항과 1:1 대응, 무료 티어로 이 프로젝트 규모 충분 | 계정·DSN(외부 자격증명) 필요, 빌드 설정 변경(`instrumentation.ts` 등) 검증에 `npm run build` 필요 |
| Vercel 자체 로그·Analytics | 이미 배포 대상이면 추가 설정 0 | 사용자·크루 단위 태깅·검색 UX가 Sentry보다 약함, 이 저장소가 Vercel 배포를 확정했다는 근거를 찾지 못함(PRD·ROADMAP에 명시 없음) |
| 자체 구조화 로그만(도구 없음) | 외부 의존 0, 지금 당장 동작 | "추적 가능"은 만족하나 알림·이슈 그룹핑·트렌드가 없어 NFR-028의 정신(오류를 사람이 놓치지 않고 대응)에는 못 미침 |

**결정: Sentry를 도입 대상으로 확정**한다 — Next.js 통합 품질과 NFR-028의 "사용자·크루·요청
식별자" 요구가 Sentry의 컨텍스트 API와 가장 잘 맞는다. 다만 **계정·DSN이 없어 이번 회차에
실제 연결을 마칠 수 없다** — I-016(Resend SMTP, D-042로 해소)과 같은 성격의 외부 의존이라
추측으로 설정을 채우지 않고 `docs/ISSUES.md`(I-055)에 미결로 등재했다.

### 3.2 임시 구현 — `src/lib/audit/error-tracking.ts`

Sentry 연결 전까지 NFR-028의 측정 기준("오류 발생 시 추적 가능")을 만족시키는 최소 구현을
뒀다. `captureError(context)`가 `{message, requestId, userId, crewId, source, stack}`를
구조화 JSON으로 `console.error`한다 — 호스팅(Vercel) 로그 스트림은 이 JSON을 requestId·userId로
검색할 수 있다. **이 파일이 유일한 교체 지점**이다: DSN이 채워지면 `captureError` 본문만
`Sentry.captureException` 호출로 바꾸면 되고, 호출부는 손대지 않는다.

`requestId`는 Next.js 오류 경계가 제공하는 `error.digest`를 쓴다 — 이 앱에는 별도 요청 id
미들웨어가 없다(`proxy.ts`는 D-011로 범위 밖). digest가 없으면(개발 모드 등)
`crypto.randomUUID()`로 새로 만든다.

### 3.3 호출부 — 클라이언트 오류 경계 → 서버 브리지

`captureError`는 `"server-only"`라 클라이언트 컴포넌트(`error.tsx`·`global-error.tsx`, 둘 다
Task 014에서 만든 파일)가 직접 부를 수 없다. 새 Server Action
`src/lib/actions/report-client-error.ts`(신규 파일, DESIGN의 "기존 파일" 소유 범위 밖)를 다리로
뒀다 — 세션을 서버에서 다시 조회해 `userId`를 채운다(클라이언트가 크래시 시점에 들고 있는
세션 상태를 신뢰하지 않는다, `sanitizeRedirectTarget`의 "클라이언트 값 재검증" 원칙과 같은
결). `error.tsx`·`global-error.tsx`의 기존 `console.error(error)` 다음 줄에 fire-and-forget
호출을 3~5줄씩 추가했다.

## 4. 남은 리스크 (crewId 결손)

오류 경계(`error.tsx`·`global-error.tsx`)는 라우트 트리 밖에서 실행돼 크루 컨텍스트를 모른다
— `captureError`의 `crewId`는 항상 null로 남는다. 크루 스코프 오류(예: `/crews/[crewId]/...`
세그먼트 크래시)를 크루별로 집계하려면 세그먼트 `error.tsx`를 크루 라우트 아래 별도로 두고
`params.crewId`를 전달하는 구조가 필요한데, 이번 회차엔 크루 하위 세그먼트 전용
`error.tsx`가 없어(전역 `error.tsx` 하나가 전체를 커버) 범위 밖으로 남겼다. 후속 Task가
크루 스코프 세그먼트 오류 경계를 만들 때 함께 고려할 것.

## 5. 남은 리스크 (전반)

- **`server-only` 패키지는 `npm run dev`/`build` 안에서만 resolve된다** — 순수 Node 스크립트로
  `src/lib/audit/**`를 직접 import해 테스트할 수 없다(§2.5에서 발견, 우회 방법 기록). 이번
  회차 운영 규칙(build/dev 금지)과 결합해 **완전한 end-to-end 실측(브라우저 → Server Action →
  DB)은 다음 `npm run dev` 세션으로 이월**한다.
- **감사 로그 "100% 기록"에 못 미치는 잔여 위험**: `recordAuditLog` INSERT 실패 시 재시도
  큐 없이 로그만 남긴다(§1.2).
- **강퇴·해산 감사 로그는 그 기능 자체가 없어 호출부가 없다**(§1.3) — 후속 Task가 그 기능을
  만들 때 `recordAuditLog`를 재사용하면 된다.
- **메시지 전송·게시글 작성 레이트 리밋(NFR-016 나머지 두 항목)은 이번 범위 밖**이다 —
  `evaluateFixedWindowRateLimit`은 범용으로 설계해 뒀으니 다음 사람이 카운터 테이블만 추가하면
  재사용 가능하다.
- **오류 추적은 Sentry DSN 없이는 "임시 구현" 상태**다(I-055).
- **레이트 리밋 규칙이 두 곳(앱 레이어·SQL RPC)에 존재한다**(§2.6, 18일차 정정 포함) — 두
  값(20회/60초)이 미래에 한쪽만 바뀌면 조용히 어긋난다. 다음에 D-005 숫자를 바꾸는 사람은
  `lib/rules/rate-limit.ts`의 `HANDLE_SEARCH_RATE_LIMIT`과 `private.profile_search`(CORE
  소관) 양쪽을 함께 고친다. **다만 이 둘을 맞추는 것만으로는 D-005가 완결되지 않는다** —
  `profiles` 직접 조회 경로가 둘 다 우회하는 더 큰 갭이 있다(I-058, §2.6 정정 참고).

## 6. 실측 요약

- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: 0 errors, 0 warnings.
- `mcp__supabase__get_advisors(security)`: WARN 1건(`auth_leaked_password_protection`, 기존과
  동일 — 이번 마이그레이션들과 무관), 신규 경고 0건.
- 마이그레이션 2건 적용 + `supabase/migrations/`에 동일 파일 커밋(I-051 대응):
  `20260725072323_handle_search_attempts_rate_limit`,
  `20260725074754_purge_expired_rate_limit_counters_job`(18일차 교차검증 minor 1 후속).
- `database.types.ts` 재생성은 CREW(Task 039)가 같은 회차에 먼저 수행해 `handle_search_attempts`
  가 이미 반영돼 있다(파일 상단 주석 확인) — 중복 재생성하지 않았다. 두 번째 마이그레이션은
  테이블 스키마를 바꾸지 않아(함수·cron 잡만 추가) 재생성 대상이 아니다.
- 레이트 리밋 실측: §2.5 — 21번째 시도 정확히 차단, 20건만 기록, 정리 후 원상 복구.
- 감사 로그 실측: §1.4 — 3개 행위 INSERT 정확성·RLS 완전 거부 확인, 정리 후 원상 복구.
- 정리 잡 실측(교차검증 후속, §2.7): (a) `cron.job` 3건 나란히 등록 확인 (b)(c) 세 테이블
  모두 오래된 행 삭제·윈도 안 최신 행 보존 확인 (d) 신규 보안 경고 0건.
- `npm run build`·`npm run dev`는 실행하지 않았다(18일차 운영 규칙, 팀장 전용) — 팀장이 직접
  레이트 리밋 429 브라우저 왕복을 확인하기로 했다.
