# 인증 왕복 검증 — 18일차 미검증 4항목 (Task 배정, 19일차)

- **일자**: 2026-07-25(19일차)
- **담당**: DESIGN(B팀) — 팀장 추가 배정(로드맵 Task 아님). 이번 회차에 Playwright(브라우저)를
  쓰는 유일한 팀원(공유 브라우저 프로필 잠금 회피).
- **환경**: 프로덕션 서버 `http://localhost:3210`(팀장이 `npm run build` → `npm start`로 기동,
  본 세션은 `npm run dev`/`build`/`start`를 실행하지 않았다). Supabase 프로젝트 ref
  `damruradpliktkrlkakl`(D-037).
- **범위**: 18일차 워크로그가 "코드 확인까지만" 또는 "미검증"으로 남긴 4항목의 실제 클릭 왕복
  검증. **소스 코드는 수정하지 않았다** — 결함은 발견 시 보고만 한다(이번 회차 다른 3팀원이
  동시에 같은 저장소에서 작업 중).

## 0. 결론 먼저

| # | 항목 | 판정 | 비고 |
| --- | --- | --- | --- |
| 1 | 레이트 리밋 429 UI(`UserSearchField` Alert) | **PASS** | 21번째 검색에서 Alert 정상 렌더 |
| 2 | `requested` 대상 초대 차단 화면 문구 | **PASS** | 정확한 안내 문구 렌더 확인 |
| 3 | 탈퇴 → 복구 클릭 왕복 | **PASS**(핵심 흐름) — 단 **신규 결함 2건 발견**(I-060·I-061) | DB·라우팅은 정확, 헤더 표시만 오류 |
| 4 | 비밀번호 재설정 이메일 링크(I-057) | **여전히 검증 불가** — 결론 불변, 사유 재확인 | Gmail 수신함 접근 수단 없음 |

**19일차 재빌드 후 추가 검증(§9)**: ①②는 재확인 PASS(FR-006 검색 경로가 `profile_search`
RPC로 재배선된 뒤에도 정상 검색·레이트 리밋 둘 다 동작). **③(FR-013 AC2, I-067) FAIL** —
과거 Meetup이 "열람 전용"이 아니라 캘린더에서 완전히 사라짐(`listCrewsByProfile`의
`status='active'` 필터가 원인). **④에서 중대 신규 결함 발견** — 프로덕션 빌드에서
`error.cause`가 클라이언트로 전달되지 않아(추정, 서버 로그로 미확정) 도메인 오류
분류(`classifyError`)가 전부 "network"로 오분류되는 것으로 보인다(두 독립 코드 경로에서
재현). 상세는 §9.

브라우저 프로필 잠금은 **이번 회차에는 없었다** — `mcp__playwright__browser_navigate`가 즉시
성공했고, "Browser is already in use" 류 오류는 발생하지 않았다(18일차 이슈의 재발 없음).

**추가(팀장 09:00 긴급 통보 대응, §7 참고)**: CORE가 `profiles` RLS SELECT 정책을 좁힌 시각은
정확히 `2026-07-25 08:53:27 UTC`(마이그레이션 버전 타임스탬프로 확인)다. 항목①의 결정적
증거는 `08:50:40`, 항목②는 `08:52:36`에 확보돼 **둘 다 그 경계보다 먼저 끝났다** — 팀장의
"경계 이후 실행분만 무효" 규칙을 그대로 적용해도 ①②는 무효가 아니다. 근사치("09:00
무렵")를 정확한 값으로 교체한 것일 뿐 판정 자체(PASS)는 바뀌지 않았다. 상세 재구성은 §7.

## 1. 항목 1 — 레이트 리밋 429 UI (`UserSearchField`)

- **대상**: `src/components/profile/UserSearchField.tsx:94-99`(Alert 렌더),
  `src/lib/actions/search-user-by-handle.ts`(레이트 리밋 판정), `src/lib/rules/rate-limit.ts`
  (`HANDLE_SEARCH_RATE_LIMIT = { limit: 20, windowSeconds: 60 }`).
- **재현 절차**:
  1. `chopin0625@gmail.com`으로 로그인.
  2. `public.handle_search_attempts`에 같은 프로필 id로 `now()` 타임스탬프 20건을 SQL로
     선주입(초 단위 오프셋을 두면 클릭까지의 왕복 지연 동안 60초 윈도우 밖으로 밀려나는
     것을 1차 시도에서 실측 확인 — 그래서 전부 `now()` 동일 시각으로 재주입해 여유를 최대화했다).
  3. `/settings` → 사용자 검색 필드에 `chopin_0625` 입력 → "검색" 클릭(21번째 시도).
- **기대 동작**: `evaluateFixedWindowRateLimit`이 `allowed:false`를 반환 → 액션이
  `{ found:false, rateLimited:true }` 반환 → `UserSearchField`가 `Alert
  variant="destructive"` + `strings.account.search.rateLimited`("너무 많이 검색했어요. 잠시 후
  다시 시도해 주세요.") 렌더.
- **실제 동작**: 기대와 일치. 접근성 스냅샷에서 `alert [ref=f2e112]: 너무 많이 검색했어요.
  잠시 후 다시 시도해 주세요.` 확인.
- **증거**: 스크린샷 `/tmp/auth-roundtrip-019-screenshots/item1-ratelimit-alert.png`.
- **정리**: 테스트로 선주입한 20건 + 실제 검색 1건(총 21건)을 전부 삭제해 원 상태(0건)로
  복원. 이후 항목 2 검증 중 정상 사용(검색 1건, 08:52:32)이 자연 발생해 현재
  `handle_search_attempts`에는 그 1건만 남아 있다 — 정상 사용 흔적이라 되돌리지 않았다.

## 2. 항목 2 — `requested` 대상 초대 차단 화면 문구

- **대상**: `src/lib/rules/invite-eligibility.ts:54-57`(`already_requested` 판정),
  `src/lib/actions/invite-crew-member.ts:80-82`(에러 매핑),
  `src/lib/strings/ko.ts:359`(`"이미 가입 신청을 넣은 사용자예요 — 신청 탭에서 승인해
  주세요"`).
- **재현 절차**:
  1. `0625chopin@gmail.com`(핸들 `chopin_0625`)으로 로그인 → 크루 "강아지 산책 모임"
     (`crew_id=97082c1a-3c72-4dea-b05a-1b8cabf67c2f`, chopin0625이 staff로 있고 chopin_0625은
     무관계였던 크루를 사전에 SQL로 확인 후 선정) → "가입 신청" → 한 줄 인사 없이 "신청
     보내기" → `crew_memberships.status='requested'` 생성 확인(SQL).
  2. `chopin0625@gmail.com`으로 로그인 → 해당 크루 `/members` → "크루원 초대" → 핸들
     `chopin_0625` 검색 → 결과 카드의 "초대 보내기" 클릭.
- **기대 동작**: `evaluateInviteEligibility`가 `membership.status==='requested'`를 만나
  `{ eligible:false, reason:'already_requested' }` 반환 → 폼 상태의 `formError`에 해당 문구.
- **실제 동작**: 기대와 일치. `alert [ref=f6e152]: 이미 가입 신청을 넣은 사용자예요 — 신청
  탭에서 승인해 주세요` 렌더 확인. 같은 화면의 "대기 중" 탭에도 해당 신청이 반려/승인
  버튼과 함께 정상 노출됨을 함께 확인(부가 확인).
- **증거**: 스크린샷 `/tmp/auth-roundtrip-019-screenshots/item2-invite-requested-block.png`.
- **되돌린 것**: 검증을 위해 생성한 `join_requests` 1행(`id=09ba0892-...`)과
  `crew_memberships` 1행(`crew_id=97082c1a...`, `profile_id=fb70ff1c...`, `status=requested`)을
  SQL `DELETE`로 제거 — 원래 두 계정 사이에 이 크루에 대한 관계가 전혀 없던 상태로 복원.
  `crews` 테이블에 별도 `member_count` 같은 비정규화 카운터 컬럼이 없음을 확인해(스키마 조회)
  추가로 되돌릴 파생 값은 없다.

## 3. 항목 3 — 탈퇴 → 복구 클릭 왕복

- **계정 선정 이유**: `chopin0625@gmail.com`은 "주말 러닝 클럽"의 **오너**라 AC1(오너 크루
  보유 시 탈퇴 차단)에 걸린다(실제로 `/settings`에 "오너로 있는 크루가 있어요" 알림이 뜸,
  차단 자체도 정상 동작임을 부가 확인). 오너 크루가 없는 `0625chopin@gmail.com`
  (`chopin_0625`)으로 탈퇴·복구 전체 흐름을 진행했다.
- **재현 절차**:
  1. `/settings` → "계정 탈퇴" 섹션 → "탈퇴하기" → 다이얼로그에 비밀번호(`qwer1234`) 입력 →
     "탈퇴하기" 제출 → `/account/restore`로 즉시 redirect 확인(`deactivateAccountAction`의
     `redirect()`).
  2. 확인: `profiles.status='deactivated'`(SQL).
  3. `/login`으로 직접 이동 — **Supabase Auth 세션 쿠키 자체는 아직 유효**하지만
     `isAuthenticated(session)`이 `deactivated`를 `false`로 간주해(`get-auth-session.ts`)
     로그인 폼이 정상 렌더됨을 확인(리다이렉트 안 됨, 의도된 동작).
  4. 이메일+비밀번호로 재로그인 → **`/account/restore`로 자동 유도됨을 확인**(요청받은
     "재로그인 시 `/account/restore` 유도" 항목).
  5. "계정 복구하기" 클릭 → `/home`으로 redirect.
  6. 확인: `profiles.status='active'`, `deactivated_at=null`(SQL) — 정확히 탈퇴 전 상태로
     복원(부가 확인: `onboarding_completed_at`도 원래대로 `null` 유지, 이번 시나리오가 다른
     컬럼을 건드리지 않음).
- **핵심 판정**: **PASS** — RPC(`request_account_deactivation`·`restore_deactivated_account`)와
  라우팅(로그인 폼 우회 없음, 재로그인 시 유도, 복구 후 `/home` 도달)이 전부 기대대로
  동작했고 DB 상태도 정확히 원상 복구됐다.
- **신규 결함 2건**(코드는 고치지 않고 `docs/ISSUES.md`에 I-060·I-061로 등재, 상세는 해당
  항목 참고):
  - **I-060**: 탈퇴 유예 중에는 어느 페이지에서든 헤더 배너가 "연결에 문제가 있어요"(네트워크
    오류)로 잘못 뜬다 — `HeaderNav.tsx:86-88`이 `reason==='deactivated'`를 처리하지 않고
    `network` 문구로 낙하. 파일은 DESIGN(Task 011) 소유지만 원인은 CREW의 Task 039가 새
    `reason` 값을 추가하며 이 소비처를 갱신하지 않은 것 — **소관은 CREW로 지목**(파일
    소유자와 원인 제공자가 다른 경우라 팀장 판단 필요).
  - **I-061**: 복구 성공 직후(`/home` 첫 렌더)에는 본문은 인증된 데이터를 정확히 보여주는데
    헤더만 게스트 상태로 남는다 — `restore-account.ts:40`이 `redirect()` 전에 `refresh()`를
    호출하지 않아 라우터 캐시가 이전 헤더 세그먼트를 재사용하는 것으로 보인다. 수동 재이동
    (주소창 재입력)하면 즉시 정상화됨을 확인. **소관: CREW**(Task 039 파일 소유).
- **증거**: 스크린샷 `/tmp/auth-roundtrip-019-screenshots/item3-restore-page-initial.png`
  (탈퇴 직후 `/account/restore`, I-060 재현 화면 포함). 접근성 스냅샷 전문은 이 세션의
  Playwright 도구 응답에 남아 있다(파일로 저장하지 않음, 필요 시 재현 절차로 재확인 가능).
- **바꾼 실 계정 상태와 원복**: `0625chopin@gmail.com`(`fb70ff1c-3736-44ee-a4a3-96993a3c62ed`)의
  `profiles.status`를 `active → deactivated → active`로 왕복시켰다. **UI 자체의 정상 흐름으로
  원복됐다**(SQL로 강제 복구하지 않음) — 최종 확인된 값은 `status='active',
  deactivated_at=null`로 탈퇴 이전과 완전히 동일하다.

## 4. 항목 4 — 비밀번호 재설정 이메일 링크 왕복 (I-057)

- **재현 절차**: 로그아웃 상태에서 `/reset-password` → 이메일 `chopin0625@gmail.com` 입력 →
  "재설정 메일 보내기" 클릭.
- **UI 실제 동작**: AC1(계정 열거 방지) 그대로 "메일함을 확인해 주세요. 가입된 이메일이라면
  재설정 링크를 보내드렸어요." 동일 응답 표시(가입 여부와 무관하게 같은 문구) — 스크린샷
  `/tmp/auth-roundtrip-019-screenshots/item4-reset-password-sent.png`.
- **서버 측 접수 확인**: `mcp__supabase__get_logs(service:"auth")`(최근 24시간)에서
  `POST /recover` 200, `action:"user_recovery_requested"`,
  `actor_username:"chopin0625@gmail.com"`,
  `referer:"http://localhost:3210/reset-password/confirm"` 로그 확인 —
  **GoTrue가 재설정 요청 자체는 정상 접수**했음을 실측했다.
- **여전히 검증 불가한 것**: 이 API 로그에는 실제 발송된 메일의 본문·링크 형식이 담기지
  않는다. `smtp`·`mail`·`template`·`ConfirmationURL`·`token_hash` 키워드로 로그 전문(55,610자)을
  훑었지만 관련 항목이 전혀 없었다 — 즉 **로그만으로는 PKCE(`token_hash`+`type=recovery`)
  형식인지 구식 `ConfirmationURL`(암묵 흐름) 형식인지 판별 불가**하고, 메일이 실제로 배달됐는지
  조차 이 API 로그로는 알 수 없다. Supabase MCP 도구 목록(`apply_migration`·`execute_sql`·
  `get_advisors`·`get_logs`·`list_*`·`generate_typescript_types`·`search_docs` 등) 어디에도
  대시보드 이메일 템플릿을 읽는 도구가 없음을 재확인했다.
- **Gmail 수신함**: 이 세션에는 IMAP·웹메일 자동화 등 `chopin0625@gmail.com`의 실제 수신함을
  열어볼 수단이 없다. **팀장 지시대로 억지로 우회하지 않았다** — 이 사실 자체가 이번 회차의
  결론이다.
- **판정**: I-057 **결론 불변("열림", 미검증)** — 다만 "GoTrue 접수까지는 정상"이라는 한 단계
  추가 사실을 확보했다. `docs/ISSUES.md` I-057에 19일차 각주로 반영.

## 5. 검증 중 관찰한 저장소 상태(참고, 조치 불요)

18일차 교훈("검증 도중에도 파일이 바뀐다")대로 작업 중 `git status`를 재확인했다 — 본
세션이 시작하기 전부터/도중에 다른 3팀원이 `src/lib/data/supabase/{database.types.ts,
profile.ts}` 수정과 신규 마이그레이션 4건(RLS 축소·크루 해산 등)을 동시에 작업 중이었다.
**이 세션은 그 파일들을 읽거나 고치지 않았다** — 이번 보고의 코드 인용(HeaderNav.tsx,
restore-account.ts 등)은 모두 이 세션이 직접 `Read`한 시점의 실제 파일 내용이다.

## 7. 팀장 긴급 통보 대응 — RLS 정책 변경과 항목①②의 시점 검증

09:00 무렵 팀장이 "CORE가 `profiles_select_authenticated`를 `qual:true → id=(select
auth.uid())`로 좁혔고, `:3210`은 그 전 빌드라 지금부터 '낡은 앱 + 새 DB'다. 항목①②는 09:00
이후 실행했다면 오염됐을 수 있다"고 긴급 통보했다. **아래는 그 우려에 대한 정밀 시점
재구성이다 — 근사치("09:00 무렵")가 아니라 세 독립 시계열(마이그레이션 버전 타임스탬프,
Playwright 스냅샷 파일명의 UTC 타임스탬프, Postgres `now()` 재확인)을 대조한 결과다.**

### 7.1 정확한 경계 시점

`mcp__supabase__list_migrations`로 확인한 실제 값: 문제의 마이그레이션은
`20260725085327_profiles_narrow_select_policy_and_public_profile_rpcs` — 버전 접두사가
곧 적용 시각이다(Supabase MCP `apply_migration`은 호출 시각으로 버전을 생성하고 그 자리에서
동기 실행한다). **즉 실제 경계는 "09:00 무렵"이 아니라 `2026-07-25 08:53:27 UTC`다.**

### 7.2 항목①·②의 증거 캡처 시각

이 세션 내내 Postgres `now()`(예: `08:49:51`, `08:50:18`, `08:56:07` 등)와 Playwright 응답의
페이지 스냅샷 파일명 타임스탬프(`page-2026-07-25T08-50-40-711Z` 형식)가 하나의 UTC 시계로
일관되게 맞아떨어짐을 이번 세션 내내 반복 확인했다(§1·§3의 재현 절차에 실제로 찍힌 값들).
그 기록을 다시 대조하면:

| 항목 | 결정적 증거를 확보한 클릭 | 타임스탬프 | 경계(08:53:27) 대비 |
| --- | --- | --- | --- |
| ① 레이트 리밋 Alert | `/settings` "검색" 클릭(21번째) | **08:50:40** | 2분 47초 **전** |
| ② `already_requested` Alert | `/crews/.../members` "초대 보내기" 클릭 | **08:52:36** | 51초 **전** |

두 증거 모두 새 RLS 정책이 적용되기 **전**에 확보됐다. ②는 여유가 51초로 빠듯하지만, 그
사이에 있었던 것은 스냅샷 확인·스크린샷 저장 같은 도구 호출뿐 — 어떤 프로필 재조회도
없었다(다음 프로필 관련 조회는 항목③을 위해 08:53:57 이후 로그아웃부터다, 그리고 그건 전부
"본인 행" 조회라 애초에 이번 정책 변경과 무관하다, 팀장이 이미 확인한 대로).

### 7.3 판정 정정

**팀장의 "09:00 이후 실행했다면 무효" 규칙을 그대로 적용해도, 항목①②는 둘 다 그 규칙이
말하는 유효 구간(경계 이전) 안에 있다.** 정확한 경계(08:53:27)를 "09:00 무렵"이라는
근사치 대신 쓰면, ①②를 "환경 오염으로 무효"로 표기할 근거가 없다 — **§0·§1·§2의 PASS
판정을 그대로 유지한다.** 다만 팀장 지시대로 이 시점 재구성 자체를 숨기지 않고 남긴다
(18일차 "정정 이력을 지우지 않는다" 원칙) — 혹시 팀장이 관찰한 "09:00 무렵" 변경이 이
마이그레이션이 아닌 **다른** 변경(예: 뒤이은 `realtime_broadcast_triggers_033`
`08:54:43`·`crews_guard_owner_transfer_target_active` `08:54:54` 등, 전부 `profiles` SELECT
정책과는 무관한 크루·리얼타임 관련 마이그레이션이었다 — `list_migrations` 결과 확인)을
가리킨 것이라면 이 정정 자체가 틀렸을 수 있으므로, 아래 §7.4에 재확인을 요청한다.

### 7.4 항목③ 재점검 — "낡은 빌드 때문인지 실제 결함인지"

I-060(헤더 배너 오표시)·I-061(복구 후 헤더 stale) 둘 다 **오늘의 RLS 정책 변경과 무관하다**
— 근거: 두 결함 모두 `AuthSession.reason`(`"deactivated"` 여부)과 Next.js 라우터 캐시
동작에 관한 것이지 `profiles` 테이블의 행 가시성(RLS SELECT 범위)과는 관련이 없다. 원인
코드(`HeaderNav.tsx`·`restore-account.ts`)는 18일차 Task 039에서 이미 `:3210` 빌드에
포함돼 있었고, 오늘 CORE의 마이그레이션은 이 두 파일이 참조하는 어떤 값도 바꾸지 않았다.
**"낡은 빌드 vs 새 DB" 불일치로 오인할 소지가 없는, 독립적인 실제 결함으로 판단한다.**

## 8. 산출물

- 스크린샷 4장: `/tmp/auth-roundtrip-019-screenshots/`(레포 바깥 — 다른 팀원과의 파일 충돌을
  피하기 위해 레포 루트에 남기지 않았다). 필요 시 레포 안 위치로 옮겨 커밋할지는 팀장 판단.
- `docs/ISSUES.md`: I-057 19일차 각주 추가(상태 "열림" 유지), I-060·I-061 신규 등재(둘 다
  "열림", 소관 CREW로 지목).
- 소스 코드 변경 없음(`git diff` 대상 아님 — 위 §5의 변경분은 전부 다른 팀원 소관).

## 9. 재빌드 후 4항목 검증(19일차 착수 통보 대응)

팀장이 `npm run build`(라우트 25개 성공)로 재빌드하고 낡은 프로세스를 종료 후 재기동한
`http://localhost:3210`에서 진행했다. 서버·빌드는 여전히 팀장 전용 — 이 세션은 실행하지
않았다.

### 9.1 항목① 레이트 리밋 429 UI — 재확인 PASS

FR-006 검색 경로가 `getProfileByHandle` → `searchProfilesByHandle`(`profile_search` RPC 경유)로
재배선된 뒤의 동작을 확인했다.

- **정상 검색 먼저 확인**(팀장이 특히 강조한 "정상 검색이 깨지면 더 큰 결함"): `/settings`에서
  `chopin_0625` 검색 → "테스트계정2 / @chopin_0625" 정상 반환. RPC 경유로도 검색 자체는
  살아 있다.
- **레이트 리밋**: `handle_search_attempts`에 `chopin0625` 프로필 id로 `now()` 타임스탬프
  20건 선주입 → 21번째 검색(즉시 클릭) → `alert: 너무 많이 검색했어요. 잠시 후 다시
  시도해 주세요.` 렌더 확인(18일차와 동일 문구, 동일 메커니즘 — 앱 레이어
  `handle_search_attempts` 리밋은 그대로이고 `profile_search` RPC 자체 내장 리밋은 별개
  이중 방어로 공존).
- 증거: `/tmp/auth-roundtrip-019-screenshots/item1-ratelimit-rebuild.png`.
- 정리: 선주입 20건 전부 삭제, 잔여 0건 확인.

### 9.2 항목② `requested` 대상 초대 차단 — 재확인 PASS

handle→id 재해석이 service-role 경로로 바뀐 뒤에도 동일하게 재현했다 — `chopin_0625`가
"강아지 산책 모임"에 가입 신청(`requested`) → `chopin0625`가 같은 핸들로 초대 시도 →
`alert: 이미 가입 신청을 넣은 사용자예요 — 신청 탭에서 승인해 주세요` 렌더 확인. 문구·동작
18일차와 동일.

- 증거: `/tmp/auth-roundtrip-019-screenshots/item2-invite-block-rebuild.png`.
- 정리: `join_requests`·`crew_memberships` 테스트 행 삭제, 잔여 0건 확인.

### 9.3 항목③ FR-013 AC2(I-067 캘린더 부분) — **FAIL, 근본 원인 특정**

**셋업**: 일회용 private 크루("DESIGN 테스트 해산 크루(FR-013 AC2)", id
`dac44e36-d3f4-4874-8736-c4639d9cde77`, 오너 `chopin0625`) + 과거 Meetup 1건(2026-06-01)·
미래 Meetup 1건(2026-09-01), 각각 `posts`(`meetup_proposal`)→`polls`(`closed_passed`)→
`meetups`(`confirmed`) 체인으로 SQL 삽입. 해산 전 캘린더에서 두 바 모두 정상 노출 확인(베이스라인
스크린샷 `item3-calendar-future-before-disband.png`).

**해산**: `chopin0625`로 로그인 → 크루 설정 → "크루 해산" → 크루명 재입력 확인 → "해산하기"
클릭(화면 경로 그대로). DB 확인: `crews.status='archived'`, 미래 Meetup만 `cancelled`로
전이(과거는 `confirmed` 유지) — RPC 자체는 기대대로 정확히 동작했다.

**캘린더 재확인 — 가설과 다른 결과**:
- 9월(미래) 재방문: "미래 모임(검증용)" 바 사라짐 — **여기까지는 가설(§7 사전 분석)과 일치,
  PASS**.
- 6월(과거) 재방문: **"과거 모임(검증용)" 바도 함께 사라졌다** — 가설과 다르다. FR-013 AC2는
  "과거 항목은 열람 전용으로 남는다"를 요구하는데, 실제로는 **열람 전용이 아니라 완전히
  비가시화**됐다.
- 크루 필터 패널(`CrewFilterPanel`)에 이 크루 자체가 목록에 없다 — 다른 11개 크루만 체크박스로
  뜬다. 즉 크루 단위로 캘린더에서 통째로 사라진 것이지, Meetup 단위로 "취소 표시"된 게
  아니다.

**근본 원인**(코드 확인): `MonthCalendarContainer.tsx:60`이 `listCrewsByProfile(profileId)`로
"내 크루" 목록을 얻어 그 crew id 집합을 `listMeetupsByCrews`의 `crewIds`(§7에서 이미 인용한
그 파라미터)와 크루 필터 옵션 양쪽에 재사용하는데, `listCrewsByProfile`
(`src/lib/data/supabase/crew.ts:137-156`)이 `.eq("status","active")`로 **크루 자체를
필터링**한다 — meetup의 `status`가 아니라 **crew의 status**가 걸린다. 그 결과 archived
크루는 meetup 쿼리 대상에서 원천적으로 빠져, 과거 Meetup의 `status='confirmed'`가 살아
있어도 조회 자체가 안 된다. §7에서 세운 가설("바 렌더는 `meetup.status`만 본다")이 놓친
지점이다 — `listCrewsByProfile`은 홈 대시보드용으로는 맞는 필터(해산된 크루를 "내 크루"
목록에서 빼는 것 자체는 합리적)지만, **캘린더의 과거 이력 열람이라는 다른 요구사항에는
같은 필터를 그대로 쓰면 안 됐다.**

**판정**: I-067의 "캘린더 부분"을 **"미검증"에서 "확정 결함"으로 좁힌다** — CrewHomeContainer
부분(BOARD가 이미 확정)과 합쳐 I-067 전체가 이제 확정 결함이다. 상세는 `docs/ISSUES.md`
I-067에 이어서 기록했다.

- 증거: `item3-calendar-future-before-disband.png`(해산 전, 두 바 다 보임),
  `item3-calendar-future-after-disband.png`(해산 후 9월 — 미래 바만 사라진 정상 케이스).
  6월(과거) 화면은 "미래 모임" 검색과 같은 방식으로 `find` 결과 0건을 스냅샷 텍스트로
  기록(별도 스크린샷 없음 — 아무것도 안 뜨는 화면이라 캡처 의미가 낮았다).
- **정리**: 아래 §9.5.

### 9.4 항목④ ArchivedCrewBanner + 쓰기 차단 UX — 부분 PASS, **중대 신규 결함 발견**

**배너·레이아웃**: `/board`·`/chat` 둘 다 `ArchivedCrewBanner`("해산된 크루예요 — 이 크루는
해산되어 새 글 작성·채팅 전송이 제한됩니다. 기존 게시글·채팅 기록은 계속 열람할 수 있어요")가
정상 렌더됐고, `flex-1 min-h-0` 레이아웃이 깨지지 않았다(풀페이지 스크린샷으로 확인 — 겹침·
찌그러짐 없음). `/board`에는 과거·미래 두 게시글이 모두 정상 열람됐고(작성자 표기 포함),
"새 글쓰기" 버튼은 화면 어디에도 없었다(`find` 0건). `/chat`에는 Composer(입력창) 자체가
없었다 — BOARD의 "구조상 안전" 판단이 실제 렌더로도 맞았다.

증거: `item4-chat-archived-banner.png`(풀페이지).

**RLS 이중 확인 — PASS**: `service_role`이 아니라 `authenticated` role + 대상 크루 오너의
`auth.uid()`로 impersonate해 `posts`에 직접 INSERT를 시도했다 —
`42501: new row violates row-level security policy for table "posts"`로 거부 확인.
CORE의 "9/9 SQL 실측" 주장과 일치한다.

**중대 신규 결함(코드 확인 필요, 새 이슈로 등재)** — `/board/new`에 **직접 URL로 접근**하면
(버튼이 없어 정상 내비게이션으로는 도달 못 하지만, 팀장 지시대로 "UI를 우회"해 시도):
- **HTTP 500**이 뜬다(`PostWriteContainer.tsx:41-45`가 `throw new Error("해산된 크루에는
  글을 쓸 수 없다.", { cause: { code: "forbidden", ... } })`로 의도적으로 도메인 오류를
  던지는 지점 — 이 자체는 설계대로다).
- 그런데 화면에는 **`strings.error.forbidden`("접근 권한이 없어요")이 아니라
  `strings.error.network`("연결에 문제가 있어요 / 네트워크 상태를 확인하고 다시 시도해
  주세요")가 렌더됐다.**
- **독립 재현으로 원인을 좁혔다**: 이 앱 전체에서 가장 오래되고 이미 "정상 동작 확인됨"으로
  기록돼 있던 같은 패턴 — `(app)/crews/[crewId]/layout.tsx:80-82`의 D-039 비크루원 게이트
  (`cause: {code:"forbidden", message:"not_crew_member"}`, **`docs/ISSUES.md` I-044가
  7일차에 "화면은 요구사항대로다 — 접근 권한이 없어요가 정상 출력"이라고 명시적으로
  확인해 둔 바로 그 경로**) — 를 비소속 private 크루("심야 독서 모임")에 `chopin_0625`로
  직접 접근해 다시 재현했다. **똑같이 "연결에 문제가 있어요"로 렌더됐다**(다른 digest
  `1418416045`로 확인 — 캐시된 이전 오류가 아니라 새 발생).
- **근본 원인(높은 확신, 서버 콘솔 미접근으로 100% 확정은 아님)**: 브라우저 콘솔에 실제로
  뜨는 오류 텍스트 자체가 단서다 — `"Error: An error occurred in the Server Components
  render. The specific message is omitted in production builds to avoid leaking sensitive
  details."` 이건 Next.js가 **프로덕션 빌드에서 Server Component가 던진 오류를 클라이언트로
  넘길 때 상세를 제거하고 범용 오류로 치환**하는 공식 동작이다(`error.tsx`의 자체 docstring도
  "프로덕션에서는 error.message가 일반화된 문구로 대체되고 digest만 전달된다(NFR-014)"고
  이미 알고 있었다 — 다만 **`error.cause`까지 함께 사라진다는 것은 아무도 검증하지 않았다**).
  `src/app/error.tsx`의 `classifyError()`는 정확히 `error.cause.code`를 읽어 `forbidden`·
  `not_found`·`conflict`·`validation_failed`을 구분하는데, 프로덕션에서 `cause`가 살아남지
  못하면 이 분류가 항상 실패해 **`network`로만 떨어진다.** 두 개의 서로 다른 코드 경로
  (`PostWriteContainer`의 `crew_archived`, D-039 레이아웃의 `not_crew_member`)에서 같은
  증상이 재현됐다는 것이 이 가설의 강한 근거다.
- **왜 지금까지 안 걸렸나**: I-044(7일차)의 "정상 렌더 확인"은 **Mock 단계, `npm run dev`**
  에서 이뤄졌다 — 이 프로젝트에서 실제 `npm run build && npm start`(프로덕션 빌드) 기준으로
  이 특정 종류의 오류(서버 컴포넌트가 `cause`를 실어 던지는 케이스)를 브라우저로 검증한 것은
  이번이 사실상 처음이다(다른 검증도 대부분 dev 서버 제약·팀장 전용 빌드 때문에 못 했다는
  기록이 반복된다, 예: `crew-lifecycle-040.md` §7-6, `rls-policies-029b.md` §16.5).
  **dev와 prod가 이 지점에서 다르게 동작한다면, dev 기준 확인만으로는 이 결함을 원천적으로
  발견할 수 없었다.**
- **영향 범위(추정, 코드 전수 확인은 안 함)**: `cause:{code:...}` 패턴은 이 프로젝트 곳곳의
  Server Component가 도메인 오류(권한 없음·정원 마감 등)를 표현하는 표준 관례다
  (`docs/CONVENTIONS.md`가 언급하는 D-030 ③ "도메인 오류도 화면 상태로"의 핵심 메커니즘) —
  이 가설이 맞다면 **프로덕션에서는 이 메커니즘 전체가 무력화**돼 있고, 사용자는 항상
  "연결에 문제가 있어요"만 본다(정확한 사유 없이). HTTP 상태 코드 자체(500)는 의도대로
  나오므로 서버 로그·모니터링은 영향받지 않지만(I-044가 이미 지적한 "500 자체" 문제와는
  결이 다르다), **화면 UX와 사용자 안내는 광범위하게 부정확해진다.**
- **확정하지 못한 것**: 이 세션은 Next.js 서버(`npm start`)의 실제 stdout/stderr(digest
  `2416360409`·`1418416045`에 대응하는 서버 측 스택 트레이스)에 접근할 수 없다 — Supabase
  MCP `get_logs`는 Supabase 인프라(Postgres/GoTrue 등) 로그만 주고 Next.js 앱 서버 로그는
  주지 않는다. **팀장만 그 콘솔을 볼 수 있다** — 위 두 digest로 서버 콘솔을 대조하면 (a)
  의도한 `cause` throw가 맞는지 (b) `cause`가 실제로 사라지는지 정확히 확정할 수 있다.
  코드 레벨 근거(정확히 같은 스로우 패턴에서 재현·I-044의 대조·Next 공식 프로덕션 정화 동작)
  만으로는 "매우 유력"이지 "100% 확정"은 아니라고 정직하게 남긴다.
- **새 이슈로 등재**: `docs/ISSUES.md`에 신규 등재(등재 번호는 등재 직전 재확인). 코드는
  고치지 않았다 — 소관은 `error.tsx`/`RouteErrorBoundary`(Task 014 원 소유)와 이 메커니즘을
  쓰는 모든 컨테이너에 걸쳐 있어 팀장 판단이 필요하다.
- 증거: `item-critical-cause-stripped-forbidden.png`, 콘솔 오류 텍스트(위 인용), digest
  `2416360409`(`/board/new`)·`1418416045`(D-039 비크루원 게이트).

**부수 관찰(낮은 확신, 참고용)**: 로그아웃 직후 리다이렉트가 **직전 페이지가 에러 상태였을
때만** 일시적으로 HTTP 500을 보고한 것처럼 보였다(재현 2회, 둘 다 직전이 `/board/new` 또는
비크루원 게이트 500 화면 직후). 곧바로 새로고침하면 정상 200으로 돌아왔다 — 위 핵심 결함의
파생 증상일 가능성이 있으나 독립적으로 확정하지 못해 참고 수준으로만 남긴다. 별도로,
`/chat` 페이지 진입/로그아웃 시 콘솔에 `[notifications] realtime subscription error`가
반복 관찰됐다(BOARD의 Realtime 영역, 별개 사안 — 새 이슈 등재는 팀장 판단에 맡긴다, 이번
검증 범위 밖이라 깊이 파지 않았다).

### 9.5 항목③ 실 데이터 정리 — 완료, 잔여 0건

셋업한 크루(`dac44e36-d3f4-4874-8736-c4639d9cde77`)를 12단계 순서(§ 팀장 승인안, `audit_logs`
→ `notification_preferences`/`invitations`/`join_requests` → `meetup_attendances` →
`poll_votes`/`poll_eligible_voters` → `meetups` → (`comments`/`chat_messages` 존재 확인만,
둘 다 0건) → `polls` → `posts` → `boards`/`chat_rooms` → `crew_memberships` → `crews` →
`notifications`(payload 기반 위생 삭제))로 정리했다. **막힌 지점 없음** — RESTRICT로 중단된
단계가 하나도 없었다(순서를 미리 맞게 짠 덕분). 전 테이블 재조회로 각 단계마다 0건을
확인했고, 최종적으로 `chopin0625`의 활성 오너 크루가 정확히 "주말 러닝 클럽" 1개만 남음을
재확인했다(쿼리 결과 1행).

## 10. I-067 화면 최종 검증 — FR-013 AC2 판정(19일차, 두 번째 재빌드)

CREW의 `listCrewsByProfile` 확장 + DESIGN의 캘린더 4개 컴포넌트 수정을 포함한 재빌드
(`localhost:3210`)에서 진행했다. §9.3(첫 번째 재빌드, 수정 전)에서 FAIL로 확정했던 바로 그
증상을 같은 절차로 재현해 수정 후 결과를 대조했다.

### 10.1 셋업

일회용 private 크루("DESIGN 캘린더 재검증 크루(I-067)", `chopin0625` 오너) + Meetup 3건을
SQL로 구성했다 — §9.3보다 한 가지를 더했다(팀장이 명시적으로 요청한 "취소됨과 해산된 크루
배지가 함께 뜨는 경우"까지 검증하려고):

| Meetup | 날짜 | 해산 전 상태 | 해산 후 상태 | 검증 목적 |
| --- | --- | --- | --- | --- |
| 과거 모임(검증용) | 2026-06-05 | `confirmed` | `confirmed`(불변) | 과거 바가 그리드에 보이는지 |
| 과거+취소 모임(검증용) | 2026-06-10 | `cancelled`(해산 전에 이미 취소) | `cancelled`(불변) | `DayDetailPanel`에서 "취소됨"+"해산된 크루" 배지가 함께 뜨는지 |
| 미래 모임(검증용) | 2026-09-10 | `confirmed` | `cancelled`(해산 RPC가 전이) | 미래 바 숨김이 회귀하지 않는지 |

### 10.2 해산 → 확인 4항목 — 전부 PASS

화면에서 "크루 해산" → 크루명 재입력 확인 → "해산하기" 클릭. DB 확인:
`crews.status='archived'`, 세 Meetup 상태는 위 표의 "해산 후"와 정확히 일치.

1. **과거 Meetup 바가 격자에 보인다 — PASS.** 6월 캘린더에서 "DESIGN 캘린더 재검증
   크루(I-067) · 과거 모임(검증용)" 바가 6/5에 정상 렌더됐다(§9.3에서는 여기가 완전히
   사라졌었다 — 그 결함이 해소됐다). 증거:
   `/tmp/auth-roundtrip-019-screenshots/item067-past-bar-visible.png`.
2. **미래 Meetup 바는 여전히 사라진다 — PASS(회귀 없음).** 9월 캘린더에서 "미래 모임"
   텍스트가 `find`로 0건 — `events.push` 필터를 건드리지 않았다는 스스로의 확인이 실제
   렌더로도 맞았다. 증거: `item067-future-bar-hidden.png`.
3. **`DayDetailPanel` 배지 — PASS(단일·조합 둘 다).** 6/5(과거, 미확정 시각) 클릭 →
   "DESIGN 캘린더 재검증 크루(I-067) **해산된 크루** 과거 모임(검증용)" — 배지 단독 렌더
   확인(`item067-daydetail-archived-badge.png`). 6/10(과거+이미 취소) 날짜 셀 클릭(바가
   없는 날짜라 셀 자체를 클릭·FR-063 AC4 방식) → "**해산된 크루** **취소됨** 과거+취소
   모임(검증용)" — 두 배지가 배타적이지 않게 나란히 렌더됨을 팀장이 요청한 그대로 확인했다.
   증거: `item067-combined-badges.png`.
4. **크루 필터 — PASS(기본 체크·배지·dimmed 조합 셋 다).** 크루 필터 목록에 "DESIGN
   캘린더 재검증 크루(I-067)"가 **기본 체크 상태**로 남아 있고 옆에 "해산됨" 배지가
   붙어 있음을 접근성 스냅샷으로 확인했다(`checkbox [checked]` + `해산됨` 텍스트,
   `item067-daydetail-archived-badge.png`와 같은 스냅샷에서 부가 확인). 체크박스를 직접
   눌러 해제한 뒤 스크린샷으로 대조한 결과, **텍스트·점이 흐려지고(dimmed) "해산됨" 배지는
   그대로 남아** 두 신호가 동시에 존재함을 시각적으로 확인했다(설계한 그대로 — `dimmed`는
   선택 여부, `badge`는 크루 상태로 서로 독립). 증거:
   `item067-filter-dimmed-plus-badge.png`.

### 10.3 정리

12단계 순서 그대로 실행, **막힌 지점 없음**, 전 테이블 재조회로 잔여 0건 확인. `chopin0625`의
활성 오너 크루가 다시 정확히 "주말 러닝 클럽" 1개만 남음을 재확인했다.

### 10.4 FR-013 AC2 최종 판정

**"미래 Meetup 바가 사라지고 과거 항목은 열람 전용으로 남는다" — 캘린더 경로에서는 이제
화면으로 만족된다(PASS).** §9.3에서 확정했던 FAIL(과거 항목이 "열람 전용"이 아니라 완전히
비가시화되던 것)이 해소됐고, 회귀 위험으로 지목했던 미래 바 숨김도 그대로 유지됐다. 4개
확인 항목 전부 스크린샷·접근성 스냅샷으로 실증했다.

**남는 부분(AC2가 아니라 I-067이 원래 다루던 더 넓은 범위)**: `CrewHomeContainer`(크루 홈
화면 자체)는 이번 수정 대상이 아니었다 — BOARD가 이미 등록한 공통 `ArchivedCrewBanner`
(§9.4에서 `/board`·`/chat`에 정상 렌더 확인함)가 크루 홈에도 최소 요건(해산 사실 고지)은
채우지만, "크루 정보 수정 폼이 archived 상태에서도 그대로 노출되는가"(I-067 원문이 지적한
"최악의 경우") 같은 세부 렌더까지 이번에 다시 확인하지는 않았다 — 이번 회차 범위는 팀장이
명시적으로 캘린더로 좁혔다(이 문서 앞부분의 착수 통보). 그 부분이 여전히 남아 있다는 사실만
정직하게 남긴다.

**I-069(cause 소실) 관련**: 이번 라운드에서는 차단된 라우트에 직접 접근하지 않아 새 500·
digest가 발생하지 않았다 — 대조할 새 증거는 없다.
