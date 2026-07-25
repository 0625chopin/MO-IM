# 계정 생애주기 — 비밀번호 재설정·회원 탈퇴 (Task 039)

- **일자**: 2026-07-25(18일차)
- **담당**: CREW(A팀) · 리뷰 DESIGN(B팀)
- **참조**: FR-003·FR-005, **D-010**·D-021·D-042·**D-044**, NFR-031·032, `docs/decisions/write-path-realdata-032.md`(선행 산출), `docs/decisions/auth-integration-030.md`(직전 회차, 인증 계층)
- **범위**: 비밀번호 재설정(FR-003) 엔드투엔드 코드 경로, 회원 탈퇴 30일 유예·익명화(FR-005, D-010)

## 0. 결론 먼저 (용어 규칙 — `auth-integration-030.md`와 동일하게 적용)

- **FR-005(회원 탈퇴) — DB 계층은 끝까지 실측 완료.** 탈퇴 요청→30일 유예→복구/파기까지
  전체 시나리오를 시드 계정으로 `begin…rollback` 안에서 재현해 기대값과 정확히 일치함을
  확인했다(§4). 화면·Server Action까지 코드는 완성했으나(§5) **화면 왕복(Playwright)은
  검증하지 못했다** — 공유 dev 서버가 이번 회차 변경분을 반영하지 못하는 상태였다(§7,
  기존 I-048의 재발이지 이번에 새로 생긴 문제가 아니다).
- **FR-003(비밀번호 재설정) — 코드·타입·SQL 계약 수준까지 완성, 실제 이메일 링크 왕복은
  미검증.** Supabase Auth API 시그니처는 공식 문서로 확인했고 `/auth/confirm` 토큰 교환
  라우트도 문서의 PKCE 패턴 그대로 만들었지만, **실제로 클릭 가능한 링크가 나가는지는
  대시보드 이메일 템플릿 설정에 달려 있고 그건 확인할 방법이 없었다**(I-057, D-042의 SMTP
  설정과 같은 성격의 운영자 전용 설정).

## 1. FR-005 — 상태 모델 재설계(D-044)

### 1.1 왜 스키마를 다시 만졌는가

029A(Task 028)가 이미 `profiles.status`에 `withdrawn`을 넣어 뒀지만, 그건 "탈퇴 즉시
익명화까지 끝난 상태"를 가정한 것이었다(자기 전이 트리거가 `active→withdrawn` 1건만
허용, Mock 픽스처도 `withdrawn`이면 곧바로 `displayName="탈퇴한 사용자"`). 그런데 FR-005
정상 흐름은 `④ deactivated 전이 + 30일 유예 → ⑤ 유예 후 개인정보 파기`로 **2단계**이고
AC3("30일 미경과 시 복구")가 있다 — 값 하나로는 "유예 중(복구 가능)"과 "파기 완료(복구
불가)"를 구분할 수 없다. 상세 근거·대안 비교는 **D-044**(`prioritization-and-risks.md`).

### 1.2 마이그레이션 4건

| 파일 | 내용 |
| --- | --- |
| `profiles_add_deactivation_grace_period` | `profiles_status_check`에 `deactivated` 추가, `deactivated_at timestamptz` 컬럼 추가, `profiles_guard_self_status_transition()` 재정의(`active↔deactivated`, `deactivated→active`는 30일 이내만) |
| `account_deactivation_restore_functions` | `request_account_deactivation()`·`restore_deactivated_account()` RPC 2건 |
| `anonymize_expired_deactivated_profiles_job` | pg_cron 배치 파기 함수 + 매일 18:30 UTC 스케줄 |
| `fix_anonymize_job_issue_reference` | 위 함수 코멘트의 이슈 번호 오기(I-055→I-056) 정정, 기능 변경 없음 |

029A·032가 만든 기존 파일은 하나도 건드리지 않았다 — `crew_memberships_extend_self_service_join_request_transitions`(032)와 같은 관례로, 트리거 함수를 `create or replace`로 새 마이그레이션에서 확장했다.

### 1.3 RPC 계약 — `respond_meetup_attendance`(D-019) 패턴 재사용

둘 다 `security invoker` 단일 `public.*` 함수(호출자 자신의 데이터만 건드리므로 `private.*` SECURITY DEFINER 우회가 필요 없다 — 029B의 2단 구조는 "타인 데이터를 인가 재구현하며 열람"할 때만 쓴다), `returns table(ok, changed, reason)`으로 도메인 오류를 예외가 아니라 값으로 표현한다.

```sql
request_account_deactivation() returns table(ok boolean, changed boolean, reason text)
-- reason: 'forbidden' | 'owns_active_crew' | 'not_active' | null(성공)

restore_deactivated_account() returns table(ok boolean, changed boolean, reason text)
-- reason: 'forbidden' | 'not_deactivated' | 'grace_expired' | null(성공)
```

`request_account_deactivation`은 FR-005 AC1(오너 크루 보유 시 차단)을 `crew_memberships` +
`crews` EXISTS 서브쿼리로 직접 재구현한다 — `lib/rules/permission.ts`의
`profile:withdraw` 조건부 셀(`hasOwnerSuccessorOrDisband`)과 같은 규칙이지만, RPC는 SQL
레벨에서 원자적으로 재확인해야 하므로 TS 함수를 호출할 수 없다(같은 규칙이 SQL과 TS 양쪽에
따로 존재하는 것은 알려진 중복이다 — §6 남은 리스크 참고).

### 1.4 익명화 범위 — profiles 한 테이블이면 충분하다(사전 조사로 확인)

착수 전 20개 엔티티(게시글·댓글·채팅·투표·초대·가입신청·크루멤버십·알림 등)의 작성자 표시
방식을 전수 조사했다(`mappers.ts` 전체, `database.types.ts`의 profiles FK 참조 16곳
전부). **결과: 어떤 테이블도 `display_name`/`handle`을 복제(denormalize)하지 않는다** —
전부 `author_id`/`sender_id` 등 UUID FK만 갖고, 화면 렌더 시점마다 `profiles`를 다시
조회해 조인한다(`meetup-view-models.ts`의 기존 주석도 "탈퇴자면 이미 '탈퇴한 사용자'다"라고
같은 전제를 이미 명시하고 있었다). 그래서 **`anonymize_expired_deactivated_profiles()`는
`profiles` 테이블 하나만 UPDATE하면 20개 엔티티 전부에 자동 반영된다** — 팀장 지시문의
"익명화가 20 엔티티 전반의 작성자 표기에 걸린다"는 "20개 테이블에 개별 UPDATE가 필요하다"는
뜻이 아니라 "20개 화면 모두 이 한 번의 UPDATE 결과를 정확히 반영해야 한다"는 뜻이었음을
사전 조사로 확인했다.

`posts`·`comments`·`chat_messages` 등 콘텐츠 테이블은 `profiles(id)`를 **`on delete
restrict`** 로 참조한다(`schema-migration-028.md` §3.1) — 콘텐츠를 하나라도 남긴 사용자는
`auth.users` 행 자체를 하드 삭제할 수 없다. 스키마가 "진짜 삭제"를 구조적으로 막고 D-010의
익명화 워크플로만 통하도록 강제한다.

### 1.5 `auth.users` — 앱 관리 개인정보는 파기, GoTrue 내부 레코드는 로그인 차단으로 무효화(I-056)

이메일은 `Profile` 도메인 타입에 없고 `auth.users`에만 있다. `pg_cron`은 순수 SQL만
실행하므로 공식 지원 경로(Admin API `updateUserById`)를 호출할 방법이 없다 — 대신
`postgres` role이 `auth.users`에 UPDATE 권한을 실제로 갖는지 먼저 실측했다:

```sql
select has_table_privilege('postgres', 'auth.users', 'UPDATE');  -- true
```

이를 근거로 `anonymize_expired_deactivated_profiles()`가 `auth.users.email`을
`withdrawn+<uuid>@anonymized.invalid`로, `banned_until`을 `infinity`로 직접 UPDATE한다.

**정확한 서술(18일차 교차검증 minor 5, DESIGN 지적 — "파기했다"는 과장이다)**:
`auth.identities.identity_data->>'email'`은 이 갱신 대상이 아니라 **원본 이메일이 그대로
남는다** — D-010 문언("이메일을 파기한다") 기준으로는 **부분 미준수**다. 그래서 이 절의
제목과 본문에서 "파기"라는 단어를 `auth.users.email`에는 계속 쓰되, `auth.identities`에는
쓰지 않는다: **앱이 직접 관리하는 개인정보(`profiles`의 `display_name`/`handle`/
`avatar_url`/`bio`, `auth.users.email`)는 파기되고, GoTrue가 내부적으로 보관하는
`auth.identities` 레코드는 파기되지 않은 채 `banned_until='infinity'`로 로그인 자체가
차단돼 무효화된다.** 이 프로젝트 코드가 `auth.identities`의 값을 어디서도 읽지 않아(grep
확인) 실질적 노출 위험은 낮다고 판단했지만, "이메일이 시스템 어디에도 남지 않는다"는
문자 그대로의 파기는 아니다. 정식 해법(`pg_net` + Vault로 Admin API 비동기 호출, 성공하면
`auth.identities`까지 정리됨)은 이번 회차 범위를 넘어 **I-056**으로 남긴다.

## 2. FR-005 — Server Action·화면

| 계층 | 파일 | 비고 |
| --- | --- | --- |
| `lib/auth/session.ts` | `reauthenticateWithPassword`·`deactivateOwnAccount`·`restoreOwnAccount` 추가 | zone 7(server/client/env만 재사용) 유지 |
| `lib/rules/auth-credentials.ts` | `evaluateDeactivationGracePeriod` 추가 | 표시용 판정 — 최종 승인은 RPC의 조건부 UPDATE가 한다 |
| `lib/actions/deactivate-account.ts`(신규) | 비밀번호 재확인 → RPC 호출 → 성공 시 `/account/restore` | |
| `lib/actions/restore-account.ts`(신규) | RPC 호출 → 성공 시 `/home` | 재인증 없음(원문에 요구 없음) |
| `components/profile/AccountWithdrawSection.tsx`(신규) | `/settings` 맨 아래. 오너 크루 있으면 차단 안내, 없으면 비밀번호 확인 다이얼로그 | `AccountSettingsContainer`가 `listCrewsByProfile`로 조회해 내려줌 |
| `components/auth/RestoreAccountForm(Container).tsx`(신규) | `/account/restore` | |
| `app/account/restore/page.tsx`(신규) | `getAuthSession()`의 `reason:"deactivated"`만 이 화면을 그린다 | |
| `app/(app)/layout.tsx` | `reason==="deactivated"`면 `/account/restore`로 서버 `redirect()` | `RedirectToLogin`과 달리 원래 경로 복귀가 필요 없어 클라이언트 우회 불필요 |
| `components/shell/get-auth-session.ts` | `profile.status==="deactivated"`를 `forbidden`과 분리해 `reason:"deactivated"` + `graceEndsAt` 반환 | |
| `components/shell/auth-session.ts` | `AuthSession` 유니온에 `{status:"error", reason:"deactivated", graceEndsAt}` 추가 | |

**`checkPermission`(`lib/rules/permission.ts`)을 이 화면 경로에서 호출하지 않았다** — 이미
알고 있는 설계 갭이다. `profile:withdraw` 조건부 셀이 정확히 같은 규칙
(`hasOwnerSuccessorOrDisband`)을 갖고 있지만, 그 함수는 "member/crew_owner 역할"을
전제로 한 크루-스코프 판정이라 계정 전역 액션에 그대로 끼워 넣으려면 역할 계산을 새로
만들어야 했다. 대신 RPC가 SQL 레벨에서 같은 조건을 원자적으로 재확인하고, UI는
`listCrewsByProfile` 결과를 그대로 표시만 한다 — 규칙이 TS·SQL 두 곳에 따로 존재하는
중복이 남는다(§6).

**정정 2건(19일차, DESIGN 브라우저 검증·팀장 확인·CREW 수정 — 원 서술은 지우지 않고
이력으로 남긴다)**:

- **I-061**: `lib/actions/restore-account.ts`가 성공 경로에서 `redirect("/home")`만
  호출하고 `refresh()`를 호출하지 않았다 — CLAUDE.md "쓰기 후 갱신은 Server Action +
  `refresh()` 패턴" 원칙과 다른 배선이었다. 증상: 복구 후 `/home` 본문은 정상 인증 데이터를
  보여주지만 헤더(`HeaderNav`, 루트 레이아웃 공유 세그먼트)가 클라이언트 라우터 캐시를
  재사용해 로그아웃 상태로 보였다(주소창 재로드로만 정상화). `redirect()`는 예외를 던져
  렌더를 즉시 종료시키므로 `refresh()`는 그 **이전**에 호출해야 효과가 있다는 것이 원인이다
  — `refresh()`를 `redirect()` 앞으로 옮겨 수정했다. 같은 파일에 있는 `deactivate-account.ts`
  도 같은 배선이었다(증상은 이번 검증에서 관찰되지 않았지만 — "목적지 페이지가 매번 서버에서
  세션을 다시 읽어 드러나지 않았을 뿐" — 같은 원인이라 함께 고쳤다). 상세: `docs/ISSUES.md`
  I-061.
- **I-068**: `AccountWithdrawSection.tsx`의 탈퇴 확인 다이얼로그 카피
  (`account.settings.withdraw.notice.content`)가 "작성자는 '탈퇴한 사용자'로 표시돼요"라고
  시점을 밝히지 않아 "탈퇴 즉시"로 읽혔다. 실제로는 §1.2의 `request_account_deactivation()`
  이 `display_name` 등을 건드리지 않고, `anonymize_expired_deactivated_profiles()`(30일
  경과 후 pg_cron)가 그제서야 바꾼다 — **이건 D-044 설계(유예 중 PII 원본 보존) 그대로다,
  동작은 정확하고 카피만 부정확했다.** `ko.ts`에 "30일 유예가 끝난 뒤 바뀌고, 그 전까지는
  그대로 보여요"로 시점을 명시해 수정했다. 상세: `docs/ISSUES.md` I-068.

## 3. FR-003 — 비밀번호 재설정

### 3.1 PKCE 흐름(Supabase 공식 Next.js 패턴)

`mcp__supabase__search_docs`로 "Password-based Auth" 가이드를 조회해 그대로 따랐다:

1. `requestPasswordResetAction` → `requestPasswordReset(email, redirectTo)`
   (`supabase.auth.resetPasswordForEmail`). AC1(계정 열거 방지)은 이 API 자체가
   보장한다(미가입 이메일에도 에러 없이 성공) — 별도 처리 불필요.
2. 사용자가 이메일 링크 클릭 → `src/app/auth/confirm/route.ts`(신규, Route Handler)가
   `token_hash`+`type=recovery`를 `verifyEmailOtp()`로 교환 → 성공 시 임시 세션(httpOnly
   쿠키) 발급 + `next`(=`/reset-password/confirm`)로 리다이렉트.
3. `/reset-password/confirm`(신규) → `confirmPasswordResetAction` →
   `confirmPasswordReset(newPassword)`(`supabase.auth.updateUser({password})`).
4. ⑤(기존 세션 전부 폐기)는 Supabase Auth가 비밀번호 변경 시 자동 수행한다(공식 문서
   "User sessions" 가이드: "The user changes their password ... session terminates").
   **이 브라우저 자신의(방금 발급된) 세션**만 별도로 `signOutSupabaseSession()`으로 끝내
   ⑥(로그인 화면)까지 이어간다.

### 3.2 `/auth/confirm`과 FR-001의 관계 — 정정(18일차 교차검증 minor 4, DESIGN 지적)

**최초 버전의 이 절은 근거 없는 인과관계를 단정했다 — 정정한다.** `auth-integration-030.md`
27~30행을 다시 대조한 결과, 17일차 팀은 "메일 링크로 확인하면 세션 발급 — 이 단계는
Supabase Auth **표준 동작이라 별도 구현이 필요 없다**"고 이미 적어 뒀고, 그때 남긴 "알려진
한계"는 `createProfile`이 `id`를 받지 않는 것(I-046, Task 032가 해소)이었다 — **"confirm
라우트 부재"가 아니었다.** 즉 "이 라우트가 없어서 FR-001 가입 확인 링크도 세션을 못 만들고
있었다 → 이번에 그 결손을 부수적으로 해소했다"는 사슬은 **확인한 사실이 아니라 추측이었다.**

**`/auth/confirm` 라우트 자체는 여전히 유효하다** — Next.js 16 Route Handler 규약과
Supabase PKCE(`token_hash`+`type`) 계약을 올바르게 따른다(DESIGN이 별도로 확인). FR-003
(비밀번호 재설정)에는 이 라우트가 반드시 필요하고, `type=signup`도 같은 엔드포인트에서
받도록 만든 것도 유효한 설계다. **다만 "이 라우트가 FR-001의 기존 결손을 해소했다"는
주장은 근거가 없어 걷어낸다** — 가입 확인 이메일 링크의 실제 왕복(대시보드 템플릿 설정
포함)은 이번 회차에도 **확인하지 못했다**(I-057과 같은 사유 — 대시보드 이메일 템플릿
설정 여부를 MCP로 조회할 수 없다).

### 3.3 새 레이트 리밋 테이블을 만들지 않았다(결정)

`resend-signup-email.ts`(Task 030)는 FR-001 E4 원문이 "60초 쿨다운, 시간당 5회"를 못박아
전용 테이블(`email_resend_attempts`)을 만들었다. **FR-003 원문(E1~E3, AC1·AC2)은 구체적
상한을 명시하지 않는다** — 근거 없는 숫자를 지어내는 대신 Supabase Auth 자체의 내장
레이트 리밋(대시보드 설정)에 맡겼다. 필요하면 다음 회차에 원문을 재확인해 추가한다.

### 3.4 미검증 — 실제 이메일 링크 왕복(I-057)

코드·타입(`tsc --noEmit`)·SQL 계약(RPC 시그니처, `database.types.ts` 재생성)까지는
검증했다. **실제로 클릭 가능한 링크가 나가는지**는 대시보드 "Reset Password" 이메일
템플릿이 `token_hash`/`type=recovery`/`next` 패턴으로 설정돼 있어야 하는데, 이건 MCP로
조회·변경할 수 없는 대시보드 전용 설정이고(D-042의 SMTP 시크릿 입력과 같은 범주) **이번
회차에 확인하지 못했다.** 기본 템플릿 그대로면 이 라우트를 거치지 않고 다른 형태로
동작할 수 있다 — 추측하지 않고 I-057로 남긴다.

## 4. 실측 — 시드 계정으로 `begin…rollback` (실 테스트 계정 2개는 사용하지 않음)

`seed_owner05`(오너인 활성 크루 보유)와 `seed_member01`(오너 아님)로 전체 시나리오를
검증했다. 전부 하나의 트랜잭션 안에서 실행하고 마지막에 `rollback`으로 원상 복구했다 —
복구 후 `seed_member01`의 `status`·`deactivated_at`·`handle`·`display_name`,
`auth.users.email`·`banned_until`이 전부 원래 값으로 돌아왔음을 재조회로 확인했다.

| 단계 | 호출 | 결과 |
| --- | --- | --- |
| 1 | `seed_owner05`로 `request_account_deactivation()` | `{ok:false, reason:'owns_active_crew'}` — AC1 차단 확인 |
| 2 | `seed_member01`로 `request_account_deactivation()` | `{ok:true, changed:true}` |
| 3 | 위 직후 프로필 상태 조회 | `status='deactivated'`, `deactivated_at` 방금 시각 |
| 4 | `restore_deactivated_account()`(유예 이내) | `{ok:true, changed:true}` |
| 5 | 위 직후 프로필 상태 조회 | `status='active'`, `deactivated_at=null` — AC3 확인 |
| 6 | `active` 상태에서 `restore_deactivated_account()` 재호출 | `{ok:false, reason:'not_deactivated'}` |
| 7 | 다시 `request_account_deactivation()` → `deactivated_at`을 31일 전으로 직접 UPDATE(postgres role) | 유예 만료 재현 |
| 8 | `restore_deactivated_account()`(유예 만료) | `{ok:false, reason:'grace_expired'}` |
| 9 | `anonymize_expired_deactivated_profiles()` | `1`(파기된 행 수) |
| 10 | 파기 후 `profiles` 재조회 | `handle='withdrawn-f1692173'`, `display_name='탈퇴한 사용자'`, `avatar_url=null`, `bio=null`, `status='withdrawn'`, `anonymized_at`에 파기 시각 기록 — **AC4 그대로 재현** |
| 11 | 파기 후 `auth.users` 재조회 | `email='withdrawn+f1692173-...-@anonymized.invalid'`, `banned_until='infinity'` |

수락 기준(AC1·AC3·AC4)을 문구 그대로 재현·통과했다. `poll_votes`는 이번 익명화 대상이
아니므로(§1.4) 별도로 건드리지 않았다 — D-003의 집계 정합성 규칙이 그대로 유지된다.

## 5. 파일 목록

**신규(CREW 소유)**:
- `supabase/migrations/20260725072719_profiles_add_deactivation_grace_period.sql`
- `supabase/migrations/20260725072822_account_deactivation_restore_functions.sql`
- `supabase/migrations/20260725072923_anonymize_expired_deactivated_profiles_job.sql`
- `supabase/migrations/20260725075355_fix_anonymize_job_issue_reference.sql`
- `src/lib/actions/{request-password-reset,confirm-password-reset,deactivate-account,restore-account}.ts`
- `src/app/auth/confirm/route.ts`, `src/app/auth/confirm-error/page.tsx`
- `src/app/reset-password/page.tsx`, `src/app/reset-password/confirm/page.tsx`
- `src/app/account/restore/page.tsx`
- `src/components/auth/{RequestPasswordResetForm,RequestPasswordResetFormContainer,ConfirmPasswordResetForm,ConfirmPasswordResetFormContainer,RestoreAccountForm,RestoreAccountFormContainer}.tsx`
- `src/components/profile/AccountWithdrawSection.tsx`
- `docs/decisions/account-lifecycle-039.md`(본 문서)

**수정(CREW 소유 — Task 030/015B 자산)**:
- `src/lib/auth/session.ts`·`index.ts`(신규 함수 8개 추가)
- `src/lib/rules/auth-credentials.ts`(`evaluateDeactivationGracePeriod` 추가)
- `src/components/shell/get-auth-session.ts`·`auth-session.ts`(`deactivated` reason 추가)
- `src/app/(app)/layout.tsx`(deactivated 분기)
- `src/components/auth/LoginForm.tsx`(비밀번호 찾기 링크)
- `src/components/profile/AccountSettingsContainer.tsx`(탈퇴 섹션 조립)
- `src/lib/strings/ko.ts`(신규 문구만 추가, 기존 키 무수정)
- `src/components/sample/sections/{auth,account}.tsx`(4상태 등록, 18일차 교차검증 minor 1로 `AccountWithdrawSection`에 `loading` 패널 추가)
- `src/lib/rules/handle-search.ts`(18일차 교차검증 minor 1 — `projectHandleSearchResult`가 `status !== "active"`도 미존재와 동일하게 처리)

**DESIGN 소유 파일 최소 침습(각각 1~3줄, 보고)**:
- `src/lib/types/profile.types.ts` — `ProfileStatus`에 `"deactivated"` 추가, `deactivatedAt` 필드 추가. **이 파일은 명목상 어느 쪽 소유로도 명시되지 않았으나(`lib/types`는 Task 006 CORE 스캐폴드) 도메인 필드라 CREW가 직접 고쳤다.**
- `src/lib/data/supabase/mappers.ts` — `toProfile`에 `deactivatedAt: row.deactivated_at` 1줄.
- `src/lib/data/supabase/profile.ts` — `searchProfilesByHandle` 매퍼에 `deactivatedAt: null` 1줄 + docstring 갱신.
- `src/lib/data/supabase/database.types.ts` — `generate_typescript_types` 재생성(자동 생성 파일, 손으로 편집하지 않음).
- `src/lib/data/mock/{fixtures.ts,profile.ts,seed/generate-profiles.ts}` — `Profile` 리터럴에 `deactivatedAt` 필드 추가(NFR-035, 타입 동기화 — 컴파일 필수). **18일차 교차검증 minor 2** 후속으로 `fixtures.ts`에 `deactivated` 상태 픽스처(`profile-4`, `deactivatedAt` 30일 유예 중간 지점)를 추가하고, `generate-profiles.ts`의 대량 시드에도 `deactivated`를 `withdrawn`·`suspended` 옆 소확률 분기로 추가했다(`profile.ts`는 신규 프로필 템플릿 하나뿐이라 상태 변형 픽스처 자리가 아니다 — `fixtures.ts`/`generate-profiles.ts` 쪽에서 처리).

## 6. 남은 리스크·다음 회차 이월

- **I-056**: `auth.users.email`은 파기하지만 `auth.identities`의 이메일은 갱신하지 않는다
  — 정확한 서술은 §1.5(18일차 교차검증 minor 5로 문언을 "파기"에서 "앱 관리 정보는 파기,
  GoTrue 내부 레코드는 로그인 차단으로 무효화"로 정정했다).
- **I-057**: 비밀번호 재설정 이메일 템플릿의 대시보드 설정 여부 미확인. Resend 연결(D-042
  잔여 작업)과 같은 타이밍에 운영자가 함께 처리해야 한다.
- **I-058 각주(18일차 교차검증 minor 1)**: DESIGN이 지적한 대로, Task 039로 인해
  `profiles` 직접 조회 시 노출되는 blast radius가 `deactivated`(파기 전 실 PII 보유)까지
  확대됐다. **`getProfileByHandle`을 경유하는 앱 검색 경로(FR-006)는 이번에
  `projectHandleSearchResult`가 `status !== "active"`를 걸러 닫았다**(§2 후속, 아래
  단락). **그러나 I-058이 지적하는 `profiles` 테이블 직접 조회 경로(예: RLS를 우회하는
  service-role 호출, 관리자 콘솔 미구현 상태의 잠재 경로)는 여전히 열려 있다** — 그 경로는
  `status` 필터를 앱 계층에 두는 이 구조 자체의 한계이고, 이번 회차에서 닫지 않았다.
- **`checkPermission`/`profile:withdraw` 중복**(§2): AC1 규칙이 TS(`permission.ts`)와
  SQL(RPC) 양쪽에 따로 존재한다. RPC가 최종 권위이므로 기능적으로는 안전하지만, 다음에
  이 규칙이 바뀌면 두 곳을 함께 고쳐야 한다는 점을 남긴다.
- **30일 경계 조건의 미세 중첩(18일차 교차검증 minor 3, 고치지 않기로 확정)**:
  `restore_deactivated_account()`는 `now() - deactivated_at <= interval '30 days'`(이하),
  `anonymize_expired_deactivated_profiles()`는 `deactivated_at <= now() - interval '30
  days'`(정확히 `now() - deactivated_at >= 30일`)를 조건으로 쓴다 — **`now() -
  deactivated_at`이 정확히 30일 0초인 순간에는 두 조건이 동시에 참이 될 수 있다.** AC3
  문구("30일 미경과")를 엄밀히 읽으면 `<` 30일이어야 하므로 이 경계는 문자 그대로는 어긋난다.
  **의도적으로 고치지 않는다** — 실무 영향이 사실상 0이다: ① `anonymize_expired_deactivated_profiles`는
  하루 1회(18:30 UTC)만 돈다. 그 사이 사용자가 정확히 그 찰나에 복구를 시도할 확률은
  무시할 수준이다. ② 설령 겹쳐도 데이터가 손상되지 않는다 — cron이 먼저 실행되면 그 행은
  이미 `status='withdrawn'`으로 바뀌어 있어 `restore_deactivated_account()`의 조건부
  UPDATE(`where status='deactivated'`)가 자연스럽게 0행이 되고 `not_deactivated`로
  깨끗하게 실패한다. 반대로 복구가 먼저 실행되면 그 행은 더 이상 `deactivated`가 아니라
  cron의 `select`가 애초에 대상에서 제외한다. **두 경로 모두 원자적 조건부 UPDATE(D-019와
  같은 원칙)로 처리되므로 "카운터만 반영되고 나머지는 안 되는" 부분 실패가 없다.** 경계를
  배타적으로(`<`) 바꾸는 마이그레이션의 이득은 이 무시 가능한 확률의 사용자 경험 차이뿐인데,
  비용(새 마이그레이션·재검증)이 이를 넘는다고 판단했다.
- **Playwright 화면 왕복 미검증**(§0, §7): 공유 dev 서버가 이번 회차 신규 라우트는 물론
  기존 파일(`LoginForm.tsx`) 수정분도 반영하지 못했다 — I-048(Turbopack `/mnt/e` 캐시
  불안정)의 재발로 보인다. `npm run dev` 재시작은 팀장 전용 운영 규칙이라 이 세션에서
  시도하지 않았다. 다음에 dev 서버를 재시작하는 사람이 `/reset-password`·`/settings`
  탈퇴 섹션·`/account/restore`를 실제로 열어 확인해야 한다. **18일차 팀장이 프로덕션
  빌드로 대신 확인** — 신규 라우트 5개 정상 등록, `/reset-password`·`/reset-password/confirm`·
  `/auth/confirm-error` HTTP 200 렌더, `/account/restore` 게스트 접근 시 307→`/login`
  정상 확인. 로그인이 필요한 인증 왕복(로그인→탈퇴→복구 실클릭)은 공유 Playwright 브라우저
  점유로 팀장도 하지 못해 다음 회차로 이월.
- **동시 가입자 3명 시나리오(FR-001 E4·AC5)**: 이번 회차 범위 밖이지만, `/auth/confirm`이
  새로 생겼으니 다음에 SMTP·이메일 템플릿이 갖춰지면 이 라우트로 실제 검증이 가능해진다.

### 6.1 minor 1 실측 — `deactivated` 사용자의 핸들 검색 노출 차단 (18일차 교차검증)

**문제**: `profile_search` RPC(029B)는 `status='active'`로 필터하지만, 앱의 정확 일치
검색 경로(`getProfileByHandle` → `projectHandleSearchResult`, FR-006)에는 그 필터가
없어 탈퇴 유예 중(`deactivated`, 파기 전이라 실 PII 보유) 사용자가 실명·실아바타로 계속
검색됐다.

**수정**: `src/lib/rules/handle-search.ts`의 `projectHandleSearchResult`가 `profile.status
!== "active"`도 `searchOptOut`과 같은 한 줄(`{ found: false }`)로 합류하도록 확장했다 —
새 정책이 아니라 RPC가 이미 가진 규칙에 이 경로를 맞춘 것이다. BOARD가 추가한
`rateLimited`·`retryAfterSeconds` 필드는 손대지 않았다. 호출부(`search-user-by-handle.ts`)는
이미 `Profile` 전체 객체를 넘기고 있어 변경이 필요 없었다.

**실측**(`begin…rollback`, `seed_member01`을 `deactivated`로 전이):

| 검증 | 결과 |
| --- | --- |
| `deactivated`로 전이 후 `getProfileByHandle`이 실행하는 것과 동일한 쿼리(`select * from profiles where handle=...`) | 행이 그대로 반환됨(`status='deactivated'`, `display_name='강나은'` 실명 그대로) — **수정 전 이 행이 앱 계층 필터 없이 그대로 검색 결과로 나갔다는 증거** |
| 대조군 `seed_member02`(active) | 정상 반환, 회귀 없음 |

DB 쿼리 결과 자체(수정 전 상태 재현)는 SQL로 실측했다. `projectHandleSearchResult`의
`status !== "active"` 분기가 이 행을 `{ found: false }`로 바꾸는 것은 `tsc --noEmit`
통과와 코드 리딩으로 확인했다 — 이 함수는 Node 런타임 호출 없이는 SQL 도구로 직접
실행할 수 없어, 로그인 세션이 필요한 실제 Server Action 왕복(Playwright)은 §6의 다른
미검증 항목과 같은 사유로 이번에도 확인하지 못했다.

## 7. 실측 수치 요약

- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: 0 errors, 0 warnings.
- `mcp__supabase__get_advisors(security)`: WARN 1건(`auth_leaked_password_protection`, 기존과 동일 — 이번 변경과 무관).
- 마이그레이션 4건 적용 + `supabase/migrations/`에 동일 파일 커밋(I-051 대응).
- `database.types.ts` 재생성 확인(신규 컬럼·RPC 3개 반영, diff로 의도한 변경만 있음을 확인).
- FR-005 RPC·cron 실측: §4 표 — 11단계 시나리오 전부 기대값과 일치, 시드 데이터 원상 복구 확인.
- `npm run build`·`npm run dev`는 실행하지 않았다(운영 규칙, 팀장 전용).
- Playwright: `/login` 접근은 됐으나 이번 회차 코드 변경(비밀번호 찾기 링크)이 반영되지
  않아 공유 dev 서버가 stale 상태임을 확인 — 그 이상의 화면 검증은 진행하지 않았다(§6).
