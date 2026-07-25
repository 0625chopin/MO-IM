# 18일차 작업 로그 (2026-07-25)

## 회차 요약

- 활성 팀원: **4명 전원**. 구현은 DESIGN(032)·BOARD(038)·CREW(039), CORE는 담당 Task가 없어(유일한 잔여 044가 036 의존) **리뷰 짝 역할로만** 투입했다 — 그런데 검증 과정에서 발견한 결함 3건이 자기 소관 SQL 객체(029A/029B 산출물)라 실제로는 구현까지 했다.
- 이번 회차 배치 근거: 완료 집합 {Task 001~031 전량 · 035} 기준으로 의존·선행 대기가 모두 풀린 미완료 Task는 **032**(DESIGN)·**038**(BOARD)·**039**(CREW) 3건이었다. 배치 안에 선후가 있었다 — **032가 `src/lib/actions/**` 전량과 `src/lib/data/**` 쓰기 경로를 실 Supabase로 교체**하므로, 감사 로그 훅을 권한 행위 액션에 꽂아야 하는 038과 탈퇴 쓰기 경로를 신설해야 하는 039는 그 위에 얹힌다. 17일차에 세운 운영 규칙(파일 소유권 사전 확정)에 따라 **032 단독 선행 → 038·039 병렬**로 릴레이했다.
- 결과: **완료 Task 3건(032 · 038 · 039)**. 교차검증 이슈 **major 6 · minor 7 발견, 전건 해소**. `docs/ISSUES.md` 신규 등재 **6건**(I-054~I-059). 결정 신규 **1건**(D-044). 마이그레이션 **15건** 적용. 전체 테스트 3/3 통과(3회 실행) + 프로덕션 서버 런타임 확인.
- **이번 회차의 성격**: Mock 쓰기가 실 DB 쓰기로 바뀌면서 **"비즈니스 규칙이 앱 레이어에만 있고 DB에는 없다"는 구조적 문제가 다섯 번 드러났다.** Mock 단계에서는 앱 레이어가 유일한 경로였으므로 이 문제가 존재할 수 없었다 — 실데이터 전환이 처음으로 그것을 노출한 것이다. 자세히는 아래 "이번 회차가 드러낸 구조적 문제" 절.

## 팀원별 완료 내역

### DESIGN (02.DESIGN.md)

- 완료 Task: **032 · 쓰기 경로 Server Action 교체와 정원 동시성**
- 산출물:
  - 마이그레이션 6건 — `20260725064528_profiles_add_onboarding_completed_at` · `20260725064550_crew_memberships_extend_self_service_join_request_transitions` · `20260725064611_respond_meetup_attendance_function` · `20260725080100_respond_meetup_attendance_function_fix_permission_check` · `20260725080200_..._v2` · `20260725080300_profiles_backfill_onboarding_completed_at_for_seed`
  - 쓰기 구현 — `src/lib/data/supabase/{profile,meetup,join-request,invitation,crew,poll,board,chat,notification}.ts` 9개 도메인, `src/lib/data/index.ts` 배럴을 supabase 전용으로 단순화(**mock 재노출 완전 제거**)
  - Server Action 수정 — `signup.ts`·`complete-onboarding.ts`·`cast-vote.ts`·`invite-crew-member.ts`·`request-join-crew.ts`·`respond-to-invitation.ts`·`decide-join-request.ts`·`withdraw-join-request.ts`·`respond-meetup-attendance.ts`
  - 타입·규칙 — `profile.types.ts`(`onboardingCompletedAt`)·`meetup.types.ts`(`AttendanceJoinResult`에 `"forbidden"`)·`mappers.ts`·`invite-eligibility.ts`·`strings/ko.ts`·`database.types.ts` 재생성
  - 삭제 — `src/components/shell/onboarding-flag-cookie.ts`(I-046 임시 대응이 정식 컬럼으로 대체됨)
  - `docs/decisions/write-path-realdata-032.md`
- 실측 수치: **정원 1 남은 Meetup에 병렬 2요청 → 정확히 1건 `{ok:true, changed:true}` / 1건 `{ok:false, reason:'full'}`**, 실패 요청은 `meetup_attendances`에 행을 남기지 않음(RPC 단일 트랜잭션 실증). 단일 세션 롤백으로 5개 시나리오(정원마감·이탈·멱등이탈·자리생김후참석·카운터반영) 추가 확인. 수정 후 재실측: 비소속자 호출 `full`→**`forbidden`**, 강퇴 후 `absent` 42501 예외→**`forbidden`**(예외 소멸), 정상 경로 4개 회귀 없음, 백필 19/2.
- 비고:
  - **17일차 인계 3건 중 2건 해소, 1건은 이미 해소돼 있었다.** I-046(`createProfile`에 `id` 없어 `/signup` 신규 가입자가 로그인해도 게스트 취급되던 FR-001 단절) 해소 — service-role로 프로필을 만들고 `onboarding_completed_at` 컬럼을 신설해 보조 쿠키를 없앴다. I-049(`cast-vote.ts` 트리거③ 미포장) 해소. **D-007 private 부분노출 회귀는 17일차에 이미 해소돼 있었다** — 팀장이 배정 지시문에 넣은 정보가 최신이 아니었고, DESIGN이 코드를 확인해 재작업 없이 넘겼다(팀장 지시 오류).
  - **`meetup_attendances_pkey`가 Task 028에 이미 자연복합 PK로 있어** FR-067 E2 멱등성은 신규 제약 없이 충족됐다 — DESIGN의 마이그레이션 목록에 `unique(meetup_id, profile_id)`가 없는 것이 정상이라는 것을 CORE가 `pg_constraint` 실측으로 확정했다.
  - **1차 수정의 결함을 스스로 발견해 v2를 냈다**: 크루 소속 검사를 추가했더니 `meetups` SELECT가 크루원 전용 RLS라 crew_id를 못 구해 `forbidden` 대신 `not_found`가 나왔고, `private.get_meetup_crew_id`(SECURITY DEFINER) 헬퍼를 신설해 해소했다.
  - 신규 미결 **I-054**: `createJoinRequest`·`createPoll`이 여러 PostgREST 호출로 나뉘어 진짜 트랜잭션이 아니다(두 번째 호출 실패 시 부분 상태). `respondAttendance`·`createCrew`는 RPC/트리거로 이미 원자적이라 해당 없음.

### BOARD (04.BOARD.md)

- 완료 Task: **038 · 운영 기반 (감사 로그·레이트 리밋·오류 추적)**
- 산출물:
  - 신설 — `src/lib/audit/{audit-log,rate-limit-store,error-tracking}.ts` + `README.md`, `src/lib/rules/rate-limit.ts`(`evaluateFixedWindowRateLimit` 순수 함수), `src/lib/actions/report-client-error.ts`
  - 마이그레이션 2건 — `20260725072323_handle_search_attempts_rate_limit` · `20260725074754_purge_expired_rate_limit_counters_job`
  - 수정 — `eslint.config.mjs`(**zone 8** 신설, zone 7과 대칭 + zone 6 ignores), `set-crew-member-role.ts`·`poll-auto-close.ts`·`delete-post.ts`·`search-user-by-handle.ts`(최소 삽입), `handle-search.ts`(`rateLimited`·`retryAfterSeconds`), `UserSearchField.tsx`, `error.tsx`·`global-error.tsx`, `sample/sections/account.tsx`, `strings/ko.ts`
  - `docs/decisions/ops-foundation-038.md`
- 실측 수치: 핸들 검색 **20회 `allowed:true`(매회 실제 INSERT) / 21번째 `allowed:false, retryAfterSeconds:60`**, 기록 20행(21번째 미기록). 감사 로그 3종(`crew.staff_appointed`·`poll.closed_early`·`post.force_deleted`) INSERT 후 actor_id·crew_id·action·target_id·created_at 전부 기대값 일치, `set local role authenticated`로 SELECT 0행·INSERT 거부 재현. 정리 잡: 3테이블 각각 "오래된 행 1 + 윈도 안 최신 행 1" → 정리 후 **오래된 행만 삭제되고 최신 행 보존**(리밋 초기화 우회 없음).
- 비고:
  - **NFR-028은 미완결**이다. Sentry(`@sentry/nextjs`)를 도입 대상으로 확정했으나 계정·DSN이 없어 `console.error` 구조화 로그(requestId=`error.digest`·userId=세션)로 임시 대체했다(**I-055**). DSN이 채워지면 `error-tracking.ts` 본문 하나만 교체하면 되도록 설계했다.
  - 감사 로그 강퇴·해산 훅은 **그 기능 자체가 미구현**(`crew:remove_member` 권한 행은 있으나 호출부 없음)이라 걸 곳이 없었다 — Task 040 몫.
  - 보존 기간에 근거를 붙였다: `handle_search_attempts` 1시간(윈도 60초×60) / `email_resend_attempts` 2시간(윈도 1시간×2) / `auth_attempts` 1일(최근 10건 평가 + 지원 추적 여지).
  - **자기 결정 문서의 전제 붕괴를 스스로 발견해 정정했다** — §2.6의 "RPC를 우회할 방법이 없는 한 SQL이 최종 경계"가 I-058로 무너진다는 것을 I-059 등재 중 발견해 보고했고, 팀장 승인 후 원 서술을 지우지 않고 정정 이력으로 남겼다.

### CREW (03.CREW.md)

- 완료 Task: **039 · 계정 생애주기 (FR-003, FR-005)**
- 산출물:
  - 마이그레이션 4건 — `20260725072719_profiles_add_deactivation_grace_period` · `20260725072822_account_deactivation_restore_functions` · `20260725072923_anonymize_expired_deactivated_profiles_job` · `20260725075355_fix_anonymize_job_issue_reference`
  - Server Action 4개 — `request-password-reset.ts`·`confirm-password-reset.ts`·`deactivate-account.ts`·`restore-account.ts`
  - 라우트 — `src/app/auth/confirm/route.ts`(Supabase PKCE `token_hash`+`type`), `/auth/confirm-error`
  - 페이지 3종 — `/reset-password`·`/reset-password/confirm`·`/account/restore`
  - 컴포넌트 7개 — `Request/ConfirmPasswordResetForm`+`Container`, `RestoreAccountForm`+`Container`, `AccountWithdrawSection`
  - 수정 — `src/lib/auth/{session,index}.ts`(함수 8개), `auth-credentials.ts`, `get-auth-session.ts`·`auth-session.ts`(`deactivated` reason), `(app)/layout.tsx`, `LoginForm.tsx`, `AccountSettingsContainer.tsx`, `handle-search.ts`, `mock/{fixtures,profile,seed/generate-profiles}.ts`, `strings/ko.ts`, `sample/sections/{auth,account}.tsx`
  - `docs/decisions/account-lifecycle-039.md`, 신규 결정 **D-044**
- 실측 수치: 익명화(`begin`…`rollback`, 시드 계정) — `handle='withdrawn-f1692173'` · `display_name='탈퇴한 사용자'` · `avatar_url`/`bio`=null · `status='withdrawn'` · `anonymized_at` 기록, `auth.users`는 `email='withdrawn+<uuid>@anonymized.invalid'` · `banned_until='infinity'`. NFR-031 경계: **29일 → `purged_count=0` / 31일 → `1`**. FR-005 AC1: 활성 오너 크루 보유 시 `{ok:false, reason:'owns_active_crew'}`. 시드 21건 전부 `active`로 원상 복구 확인.
- 비고:
  - **D-010 익명화 범위가 `profiles` 한 테이블로 충분하다는 주장을 DESIGN이 독립 검증했다** — `profiles`를 FK 참조하는 **19개 테이블 전체**와 `mappers.ts` 전량을 대조해 작성자 표기를 복제한 테이블 **0건**을 확인했고, `notifications.payload`(jsonb)는 ID·열거값뿐, `audit_logs`엔 JSON 페이로드 컬럼 자체가 없다. 이 Task의 성패를 가르는 판단이었다.
  - **FR-003 비밀번호 재설정은 코드·SQL 계약까지 완성됐으나 이메일 링크 왕복은 미검증**이다 — 대시보드의 "Reset Password" 템플릿이 `token_hash`+`type=recovery` 형식인지 MCP로 확인할 방법이 없어 **I-057**로 등재했다.
  - 신규 미결 **I-056**: 탈퇴 파기가 `auth.users`를 Admin API가 아니라 직접 SQL로 수정하고 `auth.identities`의 이메일은 미갱신이다(`banned_until`로 로그인만 차단). D-010 문언 기준 부분 미준수이며, 그래서 "파기했다"가 아니라 "앱 관리 정보는 파기, GoTrue 내부 identity는 무효화"로 서술을 고쳤다.
  - `/auth/confirm` 신설이 FR-001 결손을 해소했다는 초기 주장은 **철회했다** — `auth-integration-030.md` 27~30행 원문이 "메일 링크 확인은 Supabase 표준 동작이라 별도 구현 불필요"이고 17일차의 실제 한계는 `createProfile` id 미전달(I-046)이었다. 라우트 자체의 기술적 정확성은 PASS로 유지된다.

### CORE (01.CORE.md) — 담당 Task 없음, 리뷰 짝 + 자기 소관 SQL 수정

- 완료 Task: **없음**(유일한 잔여 044가 Task 036 의존이라 미개시). 대신 Task 032·038 교차검증과 재검증, 그리고 검증에서 드러난 **자기 소관 SQL 객체 결함 3건 수정**.
- 산출물:
  - 마이그레이션 3건 — `20260725073513_crew_memberships_block_removed_self_reapply` · `20260725075129_profile_search_enforce_rate_limit_in_rpc` · `20260725075458_invitations_block_requested_target_at_rls`
  - `docs/decisions/rls-policies-029b.md` §14·§15 추가, `docs/ISSUES.md` I-058 등재
- 실측 수치:
  - 강퇴자 self 재신청 차단 — 강퇴 본인의 `removed→requested` self-PATCH **거부**(`unsupported self-service membership transition`), 오너 `removed→active` 해제 **성공**, `declined`·`rejected`·`left` 자진 재신청 **회귀 없음**.
  - `profile_search` 리밋 — `authenticated`로 21회 직접 호출 시 **21번째 정확히 예외**, 1~20회 정상·반환 3필드, 부분 일치 0건(정확 일치 유지), `anon` EXECUTE 없음.
  - `invitations` WITH CHECK — `requested` 대상 직접 INSERT **거부**, 비멤버 초대 **성공**(FR-020 AC1), `declined`·`removed` 재초대 **성공**(FR-021 AC2), 일반 크루원 INSERT **거부**(FR-020 AC3), 정책 4건 유지.
- 비고:
  - **`STABLE` → `VOLATILE` 판단이 예리했다** — `public.profile_search`에 부수효과(카운터 INSERT)가 생겼는데 `STABLE`로 남기면 옵티마이저가 호출을 생략해 리밋 기록이 누락될 수 있다는 것을 스스로 잡아 고쳤다.
  - **절차 위반 1건을 자백했다**: 항목 9 점검을 위임한 서브에이전트가 `npx next build`를 실행했다 — "build·dev는 팀장 전용"을 서브에이전트 프롬프트에 전달하지 않은 것이 원인이다. 팀장이 같은 게이트를 직접 돌렸으므로 **팀원 실행 결과는 채택하지 않고 팀장 실측만 이 로그에 남긴다.** 이후 회차에서는 서브에이전트 프롬프트에 그 금지를 명시하기로 했다.

## 교차검증 결과

- **CORE → DESIGN (Task 032)**: major 3 · minor 1 발견. ① `respond_meetup_attendance`가 RLS 0행 UPDATE를 `full`로 오판정 + `absent` 분기 미catch 42501 ② `requested` 대상 초대의 조용한 실패 ③ 강퇴자 self 재신청 DB 미차단 ④ `onboarding_completed_at` 백필 누락. PASS: D-019 준수, `meetup_attendances_pkey` 기존 존재, service-role 경계, I-049 범위, import zone·문자열·D-030, advisor 0건.
- **CORE → DESIGN (Task 032 재검증)**: **전건 PASS**, 신규 0건. DESIGN 보고를 옮기지 않고 `begin`…`rollback`으로 직접 재현했고, 회귀 확인을 실 시드 데이터의 capacity를 좁혀 4개 시나리오 전부 실행했다. `not_found`/`forbidden` 구분이 정보 노출인지도 판단해 문제없음으로 결론(meetup id가 `gen_random_uuid()`라 열거 불가, D-007이 이미 허용한 부분 노출보다 적게 노출).
- **CORE → BOARD (Task 038)**: major 1 · minor 1 발견. ① `profile_search` RPC 직접 호출로 레이트 리밋 완전 우회(**CORE 소관이라 CORE가 수정**) ② 카운터 3테이블 정리 잡 없음(기존 패턴 계승 — 038 고유 결함이 아니라고 정확히 구분). PASS: `audit_logs` 출처·RLS, **`actor_id` 위조 불가**(3개 호출부 전부 서버 세션값), **자기 카운터 직접 삭제 불가**(완전 거부 RLS가 `row_count=0`으로 막음 — `crew_memberships`와 달리 구조적으로 안전), zone 8 경계, 삽입 지점 정확성, NFR-015·016·028, `/sample`·문자열.
- **DESIGN → CREW (Task 039)**: major 0 · minor 5 발견. ① 핸들 검색이 유예 중 사용자를 실명·실아바타로 노출 ② Mock `deactivated` 픽스처 없음 ③ 30일 경계 조건 미세 중첩 ④ §3.2의 근거 없는 인과 주장 ⑤ `auth.identities` 이메일 "파기" 문언. PASS: **D-010 익명화 범위(19테이블 전수 대조)**, 3단 상태 모델, NFR-031·cron, DESIGN 소유 파일 침습 적절, `ko.ts` 3자 충돌 0, D-030 ④, FR-005 AC·D-003.
- **DESIGN → CREW (Task 039 재검증)**: **전건 PASS**, 신규 0건. `git diff --stat`으로 파일 변경 시점을 먼저 대조한 뒤 검증했다(직전 오판 재발 방지).

## 발견·해결한 이슈

**major 6건**

1. [DESIGN] `respond_meetup_attendance`가 RLS 0행 UPDATE를 "정원 마감"으로 오판정하고, `absent` 분기는 row_count 미확인으로 강퇴 후 잔여 참석 행 사용자에게 **미catch 42501 예외**를 던졌다 → `private.get_meetup_crew_id` SECURITY DEFINER 헬퍼 신설 + `reason:'forbidden'` 분기 + 양쪽 `get diagnostics` 확인 (재검증 CORE pass, 독립 재현)
2. [DESIGN] `requested` 상태 대상을 초대하면 수락해도 멤버십이 `requested`에 멈추는 **조용한 실패**(`invitations`는 `accepted`인데 크루원이 아니다) → 2.4절 상태도에 `requested→invited` 전이가 없다는 근거로 트리거를 건드리지 않고 `evaluateInviteEligibility`에서 차단 (재검증 CORE pass)
3. [CORE] 강퇴자가 자기 `crew_memberships` 행을 직접 PATCH해 `removed→requested` 재신청이 **성공**했다(FR-022 E3·AC2, FR-027 AC2 DB 미강제) → self 분기 허용 목록에서 `removed` 제외, 오너 해제 경로(FR-027 E3)는 유지 (실측 4/4)
4. [CORE] `profile_search` RPC 직접 호출로 **핸들 검색 레이트 리밋 완전 우회**(R-012·D-005 무력화) → `private.profile_search`(SECURITY DEFINER, 조회+리밋 체크+기록) + `public` 얇은 래퍼 2단 구조 (실측 21회째 차단)
5. [CORE] `invitations_insert_staff_or_owner` WITH CHECK가 발신자 권한만 보고 초대 대상 상태를 확인하지 않아 Server Action 우회 직접 INSERT가 통과했다 → WITH CHECK에 `requested` 대상 차단 추가 (실측 5/5, FR-020 AC1·AC3·FR-021 AC2 회귀 없음)
6. [CREW] 핸들 검색이 유예 중(`deactivated`, 파기 전 실 PII 보유) 사용자를 **실명·실아바타로 노출**했다 → `projectHandleSearchResult`에 `status !== "active"`를 `searchOptOut`과 한 조건으로 합류(R-012 불변식 유지) (재검증 DESIGN pass)

**minor 7건**

1. [DESIGN] `onboarding_completed_at` 백필 누락(시드 19건이 픽스처와 어긋남) → 이메일 네임스페이스 한정 백필, 실 계정 2건 미완료 유지 (19/2 실측)
2. [DESIGN] `write-path-realdata-032.md`·`index.ts` 주석의 "`/sample`이 mock 픽스처를 직접 import한다"가 사실과 달랐다(실제로는 아예 import하지 않는다) → 양쪽 정정
3. [BOARD] 카운터 3테이블 정리 잡 없어 무한 증식 → 공통 pg_cron 잡 추가, 보존 기간에 근거 명시 (윈도 안 최신 행 보존 실측)
4. [CREW] Mock에 `deactivated` 픽스처 없음(NFR-035) → `profile-4` 독립 픽스처 + 생성기 분기 추가
5. [CREW] 30일 경계에서 restore/purge 조건 동시 참 → **고치지 않고 문서화**(하루 1회 cron + 조건부 UPDATE라 데이터 손상 경로 없음, 새 마이그레이션 비용 > 이득)
6. [CREW] `account-lifecycle-039.md` §3.2의 "`/auth/confirm` 부재가 FR-001 결손 원인"이 원문과 배치 → 철회·정정
7. [CREW] `auth.identities` 이메일 잔존을 "파기했다"고 서술 → "앱 관리 정보는 파기, GoTrue identity는 `banned_until`로 무효화"로 정확화(I-056과 동기화)

**팀장이 직접 발견한 것**

- **I-059**(신규 등재): 게스트가 `/home`·`/settings`에 접근하면 서버 로그에 "레이아웃 가드가 깨졌다"는 **오진단** 예외가 남는다. 화면·리다이렉트는 정상이고 사용자 영향은 없다. 진짜 원인은 Next.js App Router가 레이아웃과 페이지를 **병렬 렌더**해 `{children}`을 반환하지 않아도 페이지 서버 컴포넌트가 실행되는 것이다. 17일차 커밋 `4de34c7`이 `redirect("/login")`(렌더 즉시 중단)을 `<RedirectToLogin/>` 반환(중단하지 않음)으로 바꾼 부작용이며, 이번 회차 `(app)/layout.tsx` diff(+13행)는 원인이 아니다. I-052와 같은 뿌리.
- **I-058**(CORE에 등재 지시): `profiles_select_authenticated`가 `SELECT`·`TO authenticated`·qual=**`true`**라 로그인한 아무 사용자나 회원 명부를 통째로 덤프할 수 있다(팀장 실측: `authenticated` 세션으로 **21행 전부**, `search_opt_out=true` **1건 포함**). 게다가 앱의 FR-006 검색은 `profile_search`를 쓰지 않고 `getProfileByHandle`(`profiles` 직접 `select("*")`)을 쓴다 — RPC 경유 `searchProfilesByHandle`은 소비자 0건. **즉 CORE의 리밋 수정은 RPC 직접 호출 경로만 보호한다.** Task 029A의 기존 정책이고 좁히려면 작성자 표기를 쓰는 모든 읽기 경로에 영향이 가는 설계 결정이라 **이번 회차에 고치지 않고 이월**했다.
- `AccountWithdrawSection`에 로딩 상태 누락(CREW 수정 완료). **DESIGN이 자기 서브에이전트의 이 정탐을 "오탐"으로 기각했으나 팀장이 `git diff`로 정탐임을 확인했다** — DESIGN이 읽은 것이 CREW 수정 **이후** 파일이었다. 병렬 작업 중에는 검증 도중에도 파일이 바뀐다는 것을 합의사항으로 남겼다.
- `docs/ISSUES.md` 구조 드리프트(팀장이 직접 수정): 절 제목은 `## 열린 이슈` / `## 닫힌 이슈`인데 **I-027~I-058은 상태가 "열림"이어도 전부 뒤쪽 절에 시간순으로 쌓여 있었다.** BOARD가 제목이 뜻하는 대로 열린 이슈를 앞 절에 등재해 30건 넘는 기존 항목과 어긋났다 — **읽는 사람으로서는 옳은 행동이었고, 제목이 내용을 설명하지 못한 것이 원인이다.** I-059를 시간순 위치로 옮기고, 절 제목을 사실에 맞게(`이슈 기록 (시간순 — 열림·해결됨이 섞여 있다)`) 고치고, 머리말에 등재 위치 규칙과 "상태 판정은 `상태` 필드가 단일 소스"를 명시했다.
- `docs/prioritization-and-risks.md`의 "다음 결정 번호: D-043"이 실제(D-043·D-044 등재됨)와 어긋나 **D-045로 정정**하고, `ISSUES.md`처럼 "이 줄만 믿지 말고 grep으로 최댓값 확인" 경고를 붙였다.

## 이번 회차가 드러낸 구조적 문제

**같은 형태의 결함이 다섯 번 나왔다 — 비즈니스 규칙이 Next.js 앱 레이어에만 있고 DB에는 없다.**

| # | 규칙 | 우회 경로 | 처리 |
| --- | --- | --- | --- |
| 1 | 정원 판정(D-019) | RPC가 권한과 정원을 구분 못 함 | RPC에 소속 검사 추가 |
| 2 | 초대 대상 상태(2.4절 상태도) | `invitations` 직접 INSERT | RLS WITH CHECK 추가 |
| 3 | 강퇴자 재신청 차단(FR-022 E3) | `crew_memberships` self-PATCH | 트리거 허용 목록 축소 |
| 4 | 핸들 검색 리밋(D-005) | `profile_search` 직접 호출 | RPC 2단 구조로 리밋 이전 |
| 5 | 검색 필드 제한·옵트아웃(NFR-013·FR-006) | `profiles` 직접 조회 | **이월(I-058)** — 좁히는 것이 설계 결정 |

**Mock 단계에서는 이 문제가 존재할 수 없었다** — 앱 레이어가 유일한 데이터 경로였기 때문이다. Task 032가 쓰기를 실 DB로 옮기면서 publishable key로 PostgREST에 직접 닿는 경로가 처음 생겼고, 그때 비로소 "앱을 거치지 않으면 무엇이 막히는가"가 질문이 됐다. 1~4는 이번 회차에 SQL 레벨 강제 경계로 닫았고, 5는 영향 범위가 넓어 이월했다.

**19일차 이후 새 규칙을 구현할 때 물어야 할 것**: 이 규칙을 앱 레이어에만 두면 publishable key로 그 테이블·RPC에 직접 닿는 클라이언트가 규칙을 우회하는가. 우회한다면 SQL(RLS·트리거·SECURITY DEFINER RPC)이 강제 경계여야 하고, 앱 레이어는 UX(안내 문구·조기 반환) 담당이다. 두 곳에 같은 규칙이 존재하는 것은 **의도된 이중화**이며, 그 역할 구분을 결정 문서에 적어야 한다(`rls-policies-029b.md` §14, `ops-foundation-038.md` §2.6이 그 예다).

## 문서 정확성 — 이번 회차에 세 번 실제 오판을 유발했다

확인하지 않은 것을 확인한 것처럼 단정한 서술이 다음 판단을 망친 사례가 셋이다.

1. DESIGN의 `write-path-realdata-032.md`: "`/sample`이 mock 픽스처를 직접 import한다" → 실제로는 아예 import하지 않는다(CORE가 발견, DESIGN 정정).
2. BOARD의 `ops-foundation-038.md` §2.6: "RPC를 우회할 방법이 없는 한 SQL이 최종 경계" → 앱 검색 경로가 애초에 그 RPC를 안 쓴다(BOARD 자신이 발견, 정정).
3. DESIGN의 서브에이전트 보고 기각: "로딩 상태 누락은 오탐" → 정탐이었고 읽은 파일이 수정 이후였다(팀장이 `git diff`로 발견).

셋 다 **원 서술을 지우지 않고 정정 이력으로 남겼다.** 왜 그렇게 믿었는지가 남아 있어야 다음 사람이 같은 추론을 반복하지 않는다. CORE가 `rls-policies-029b.md` §14에 "이 리밋은 `profile_search` 경로만 보호한다"는 한계 문장을 넣은 것도 같은 목적이다 — 그 문장이 없으면 다음 회차가 §14만 읽고 "핸들 검색 리밋은 끝났다"고 판단한다.

## 팀장 전체 테스트 (항상 실행)

세 명령을 **3회** 실행했다(032 완료 직후 · CREW/BOARD 산출 후 · minor 수정 후). 최종 결과:

- `npm run lint`: **통과** (0 errors, 0 warnings)
- `npx tsc --noEmit`: **통과** (0 errors)
- `npm run build`: **통과** (Compiled successfully in 10.4s, 정적 페이지 20/20, 라우트 21→**25개**)

**프로덕션 서버 런타임 확인**(`npm start`, 팀장 전용):

| 경로 | 결과 |
| --- | --- |
| `/login` · `/signup` · `/sample` · `/settings` · `/home` | 200 |
| `/reset-password` | 200 (29,485 bytes, 이메일·재설정 문구) |
| `/reset-password/confirm` | 200 (27,322 bytes, 만료·다시 요청 문구) |
| `/auth/confirm-error` | 200 (27,608 bytes) |
| `/account/restore` (게스트) | **307 → `/login`** |
| `/sample` 4상태 | 기본 77 · 로딩 47 · **빈 상태 56** · 오류 182, 오류 마커 0건 |
| `/sample` 신규 컴포넌트 | `RequestPasswordResetForm`·`ConfirmPasswordResetForm`·`RestoreAccountForm`·`AccountWithdrawSection` 4개 등록 확인 |

배럴에서 mock 재노출을 제거한 뒤에도 쇼케이스가 4상태를 유지한다(이번 회차 최대 회귀 위험이었다).

**검증 과정에서 바로잡은 팀장 자신의 실수**: 처음 `/sample` 200을 받았을 때 그것은 **17일차 세션이 남긴 `next start` 서버**(2시간 45분째 3000번 점유)가 응답한 것이라 현재 코드의 증거가 아니었다. 포트를 바꿔 재확인하고 응답 해시가 다름을 확인한 뒤 낡은 서버 2개를 정리했다. **CREW가 "dev 서버가 변경분을 반영하지 못한다"를 I-048(Turbopack 캐시) 재발로 본 것도 같은 원인**이었다 — 빌드 산출물을 고정 서빙하는 프로덕션 서버였다.

## 미검증으로 남긴 것 (정직하게 기록)

**로그인이 필요한 인증 왕복을 팀원도 팀장도 하지 못했다.** 공유 Playwright 브라우저 프로필이 다른 세션에 잠겨 있었고(`Browser is already in use for .../mcp-chrome-698a372`), 다른 세션의 MCP 서버를 종료하지는 않았다. 미검증 항목:

- 레이트 리밋 **429 UI 발동**(`UserSearchField`의 Alert 렌더) — SQL 강제(CORE, 21회째 차단)와 카운터 동작(BOARD, 20/21)은 실측됐고 UI 배선은 코드 확인까지만.
- `requested` 대상 **초대 차단의 화면 동작** — 순수 함수 로직·서버 강제·DB WITH CHECK는 실측됐고 화면 문구 표시는 코드 확인까지만.
- **탈퇴 → 복구 실제 클릭 왕복** — RPC·트리거·cron·익명화는 SQL 실측됐고 화면 왕복은 미검증.
- 비밀번호 재설정 **이메일 링크 클릭 왕복** — 대시보드 템플릿 형식 확인 불가(**I-057**).

19일차에 브라우저를 확보하면 위 네 개를 먼저 확인한다.

## 문서 갱신

- `docs/ROADMAP/team/02.DESIGN.md` — Task 032 상태 마커 추가(완료, 18일차)
- `docs/ROADMAP/team/04.BOARD.md` — Task 038 상태 마커 추가(완료, 18일차)
- `docs/ROADMAP/team/03.CREW.md` — Task 039 상태 마커 추가(완료, 18일차)
- `docs/team/*.md` — **변경 없음**(팀원 상태 행이 바뀌지 않았다)
- `docs/ISSUES.md` — I-054~I-059 등재, 절 구조·머리말 규칙 정정(팀장)
- `docs/prioritization-and-risks.md` — D-044 등재, 결정 번호 카운터 D-043→D-045 정정(팀장)
- `docs/decisions/` 신규 3건 — `write-path-realdata-032.md` · `ops-foundation-038.md` · `account-lifecycle-039.md`
- `docs/decisions/rls-policies-029b.md` — §14·§15 추가(CORE)
- `supabase/migrations/` — 15건 추가(원격 적용 + 로컬 커밋, I-051 대응)

## 다음 회차에 열리는 Task

완료 집합이 {001~032 전량 · 035 · 038 · 039}가 되어 다음이 열린다:

- **033 · Realtime Broadcast 연결** (BOARD, 의존 031 ✓ · 032 ✓) — 10.0인일 L. **I-017·I-018이 부하 목표 확정을 막고 있어 구현은 진행 가능하나 용량 계획은 확정하지 않는다.** 029B가 만든 `realtime.messages` Authorization 정책 2건(토픽 `crew:{id}:chat`·`crew:{id}:polls`·`user:{id}:notifications`)을 인계받는다.
- **040 · 크루 생애주기** (CREW, 의존 032 ✓ · 035 ✓) — 9.5인일 L. Task 038이 감사 훅을 걸 곳이 없던 강퇴·해산이 여기서 구현된다.
- **041 · 커뮤니티 확장** (BOARD, 의존 032 ✓) — 9.5인일 L.
- **042A · 신고·차단** (CREW, 의존 032 ✓) — 6.5인일 L.

CORE는 여전히 담당 없음(044가 036 의존). 034는 033 의존, 036은 033·034 의존이라 대기. **1인 1건 폭 제한을 적용하면 BOARD가 033·041 중 하나, CREW가 040·042A 중 하나**를 지므로 실제 배치는 2건이 되고, 19일차 산정 시 재계산한다.

**19일차 착수 전에 확인할 것**: (1) 위 "미검증으로 남긴 것" 네 항목을 브라우저로 확인, (2) **I-054**(여러 PostgREST 호출로 나뉜 쓰기가 진짜 트랜잭션이 아니다)가 040·041의 새 쓰기 경로에 같은 형태로 번지지 않게 처음부터 RPC로 만들 것, (3) **I-058**(`profiles` 직접 조회)을 좁히는 설계를 별도 Task로 세울지 판단.

## git

- 브랜치: `day-18`
- 커밋: 아래 커밋 절 참고
- 푸시: 사용자 승인 후 `origin/day-18`
