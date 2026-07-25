# 인증 연결과 계정 잠금 구현 (Task 030)

- **일자**: 2026-07-25(17일차)
- **담당**: CREW(A팀) · 리뷰 BOARD(B팀)
- **참조**: FR-001·002, D-020·D-021·D-042, NFR-010·016, I-016(해결됨), CON-06·CON-11
- **범위**: `get-auth-session.ts` 본문 교체, 로그인/가입/온보딩/로그아웃 Server Action의 실 Supabase Auth 연결, D-020 계정 잠금 게이트, 실 테스트 계정 2개 생성.

## FR-001·FR-002 실제 상태 — 정확한 용어로(17일차, 팀장 지적 반영)

**용어 규칙(이번 회차부터)**: 끝까지 동작함을 실측한 것만 "구현 완료"라고 쓴다. 실측하지 않았거나
다른 Task에 의존해 끊기는 것은 "구현했으나 X에서 끊긴다"로 쓴다.

- **FR-002(로그인·로그아웃·세션 유지) — 구현 완료.** `signInWithPassword`/`signOutSupabaseSession`/
  D-020 잠금 전부 끝까지 실측했다(§2·§4, 실 계정으로 로그인 → `/home` → 로그아웃 → 쿠키 소멸까지
  Playwright로 확인). 기존 계정(프로필이 이미 실 DB에 있는 경우)의 로그인·세션 유지는 온전히
  동작한다.
  - **AC2("7일 이내 재방문, 재로그인 없이 유지") 정정(BOARD 지적)**: 세션 쿠키의 `expires`가
    약 400일로 실측된다고 해서 **세션 자체가 400일 유지된다는 뜻이 아니다.** 쿠키 만료와 세션
    유효기간은 다른 개념이다 — 실제 세션 수명은 GoTrue의 access token(JWT) 만료 시간과 refresh
    token 회전 정책(둘 다 대시보드 설정)이 결정하고, 쿠키는 그 토큰들을 담는 그릇의 유효기간일
    뿐이다. AC2의 "7일"을 만족하는지는 **대시보드의 JWT expiry·refresh token reuse interval
    설정을 직접 확인해야 결론 낼 수 있다** — 이번 회차에 그 설정을 조회하지 않았으므로 AC2는
    "쿠키 자체는 7일보다 오래 남아 있다"까지만 확인됐고 "세션이 7일 유지된다"는 별도 확인이
    필요한 상태로 남긴다.
- **FR-001(회원가입) — 구현했으나 프로필 생성에서 끊긴다.** 실제 경로를 그대로 적는다:
  1. `signUpWithPassword` 성공 → `auth.users` 행 생성됨(실측 확인).
  2. 확인 메일 발송 시도(대시보드 "Confirm email" 켜짐 실측 확인, §3) — 실제 수신은 커스텀 SMTP
     미연결로 검증 못함(§7 운영자 조치 대기).
  3. 사용자가 메일 링크로 확인하면 세션 발급 — 이 단계까지는 Supabase Auth 표준 동작이라 별도
     구현이 필요 없다(실측은 안 했다 — 이메일 수신 자체가 안 되므로 링크를 못 받는다).
  4. **로그인 시 `getAuthSession()`이 `getProfileById(authUser.id)`를 호출하는데, `public.profiles`
     행이 없다** — `signupAction`이 세션 없는 정상 경로(§3)에서는 `createProfile`을 아예 호출하지
     않고, 세션이 즉시 생기는 대비 경로에서 호출하더라도 `createProfile`(mock 쓰기, Task 032 소관)이
     `id`를 받지 않아 `auth.uid()`와 무관한 임의 id로 mock 저장소에만 쓰인다(§5). **결과: `getAuthSession()`이
     `{status:"error", reason:"forbidden"}`을 반환한다 — 신규 가입자는 로그인해도 게스트와 동일하게
     취급되어 앱을 쓸 수 없다.**
  5. **결론: FR-001의 "가입 → 인증 메일 → 온보딩 → 홈"이라는 정상 흐름은 끝까지 완결되지
     않는다.** 이 회차에 새로 회원가입해 실제로 앱을 쓸 수 있는 계정은 만들어지지 않는다 — 지금
     로그인이 되는 실 계정 2개(§6)는 회원가입 폼이 아니라 Admin REST + 프로필 SQL 직접 삽입으로
     만들었다(§6에 이미 명시). **프로필 행 생성(쓰기 경로)은 Task 032가 명시적으로 소유한다** — 이번
     회차에 고칠 항목이 아니라 정확히 서술해 인계하는 항목이다.

## 0. 선행 조건 재확인

- I-016(커스텀 SMTP 공급자 미선정)은 팀장이 사용자 확인을 받아 **Resend**로 확정(D-042, `docs/prioritization-and-risks.md` 6.3절)했다. 이 문서는 그 이후 착수했다.
- Task 029A·029B(RLS) 완료 상태를 실측으로 재확인: `public.profiles`는 `auth.users.id`를 참조하는 FK가 있지만 **기본값이 없다**(`gen_random_uuid()` 없음, `list_tables` 실측) — 즉 실 프로필 행을 만들려면 호출자가 `auth.uid()`를 명시적으로 넘겨야 한다(§5에서 이 사실이 중요해진다).
- **`public.auth_attempts` 테이블은 이미 존재했다.** Task 028(CORE, 14일차)이 D-020을 앞서 반영해 `auth_attempts(id, identifier, attempted_at, succeeded)`를 만들어 두었고, Task 029A(15일차)가 `anon`/`authenticated` **완전 거부**(`using(false)`, cmd=ALL) RLS를 이미 적용했다(`rls-policies-029a.md` §5 "서버 전용 테이블"). **이번 회차에 이 테이블을 위한 새 마이그레이션은 만들지 않았다** — 이미 D-028 4대 규약(TO 절 명시·`(select auth.uid())`·재귀 회피·인덱스)을 만족하는 상태였다.

## 1. 파일 소유권 블로커 — 경위와 최종 구조(팀장 판정 반영)

이번 회차 `src/lib/data/**`는 명목상 DESIGN(Task 031, 도메인 데이터 mock→supabase 전환) 소유였다. 그런데 **인증 세션·계정 잠금 카운터는 도메인 데이터가 아니면서도**, `eslint.config.mjs` zone 3(`src/lib/data/supabase/**`)만이 `@supabase/*` 클라이언트를 직접 import할 수 있다(NFR-034, R-015) — 그 경계 밖(`src/lib/actions/*`·`src/components/shell/*.ts`)에서는 세션을 다룰 방법이 없었다.

### 1.1 1차 시도(반려됨) — `src/lib/data/supabase/auth.ts`

착수 전 `SendMessage`로 팀장에게 3가지 대안을 보고하고, 소유권 충돌이 가장 작다고 판단한 "`src/lib/data/supabase/auth.ts` 신설 + 배럴 1줄 추가"(대안 A)를 응답 전에 진행했다. 코드는 동작했고 tsc·lint·D-020·NFR-010 실측까지 전부 통과했지만, **팀장이 반려했다** — 이유는 소유권이 아니라 계약 위반이었다: `src/lib/data/contracts.ts`의 CON-05·CON-06이 "이 레이어의 어떤 함수도 쿠키·세션·요청 객체를 직접 읽지 않는다"고 명문화하는데, `auth.ts`를 데이터 배럴에 넣고 재노출하면 세션 개념이 배럴을 통해 앱 전체로 퍼져 이 계약이 깨진다는 것이었다.

**부수적으로 드러난 사실**: 이 1차 시도는 `src/lib/data/index.ts` 배럴에 `next/headers`(서버 전용 API)를 처음으로 물게 만들어 `npm run build`를 깨뜨렸다(§9 참고) — DESIGN이 Task 031 작업 중 이를 발견해 팀장에게 보고했고, 반려 판정과 맞물려 아래 최종 구조로 정리됐다.

### 1.2 최종 구조 — `src/lib/auth/` 신설(zone 7)

팀장이 승인한 구조를 그대로 적용했다:

1. **`src/lib/auth/` 신설(CREW 소유)** — `src/lib/realtime/**`(데이터 배럴 밖에서 Supabase 클라이언트를 다루는 독립 계층)와 대칭이다. 파일: `session.ts`(`getSupabaseAuthUser`·`signInWithPassword`·`signUpWithPassword`·`signOutSupabaseSession`), `lockout.ts`(D-020 카운터 `getRecentAuthAttempts`·`recordAuthAttempt`, service-role 클라이언트), `index.ts`(배럴, `src/lib/realtime/index.ts`와 같은 패턴).
2. **클라이언트 팩터리를 중복 구현하지 않는다** — `session.ts`는 `@/lib/data/supabase/server`의 `createSupabaseServerClient`를 그대로 import해 재사용한다(DESIGN 파일 무수정). `lockout.ts`의 service-role 클라이언트는 `@/lib/data/supabase/env`의 `getSupabasePublicEnv`만 재사용하고, `Database` 제네릭은 쓰지 않는다(zone 7이 `database.types.ts` 딥 임포트를 막기 때문 — `auth_attempts`는 컬럼 4개뿐이라 이 파일이 직접 좁은 타입을 선언했다).
3. **`eslint.config.mjs` zone 7 신설(이번 회차 CREW 소유로 지정됨)** — `files: ["src/lib/auth/**/*.{ts,tsx}"]`에 `@supabase/*` 허용 + `@/lib/data/mock/*` 금지 + `@/lib/data/supabase/*` 중 인프라 3개(`server`·`client`·`env`)만 부정 패턴(`!`)으로 예외 허용. zone 6의 `ignores`에도 `"src/lib/auth/**"`를 추가해 겹치지 않게 했다.
4. **패턴 실측(프로브 파일)** — `src/lib/auth/__zone7_probe.ts`(임시)를 만들어 `@supabase/supabase-js`·`server`·`client`·`env`(4개, 허용돼야 함) + `@/lib/data/supabase/profile`·`database.types`·`@/lib/data/mock/profile`(3개, 막혀야 함)를 한꺼번에 import시키고 `npx eslint`로 실행했다. **결과: 정확히 의도한 3건만 error, 나머지 4건은 무오류**(import/order 경고 6건은 무관한 별개 규칙) — 부정 패턴이 설계대로 동작함을 확인 후 프로브 파일을 삭제했다.
5. **`docs/ISSUES.md` I-047에 근본 원인을 등재했다** — Supabase 클라이언트 팩터리(`env`·`server`·`client`)가 인프라인데 `src/lib/data/supabase/` 안에 있다는 것이 진짜 설계 냄새이고, zone 7의 부정 패턴은 그 정리(`src/lib/supabase/`로 이동, DESIGN의 Task 031·032 종료 후)가 있기 전까지의 잠정 조치임을 적었다.

**변경/삭제 파일**: `src/lib/data/supabase/auth.ts` 삭제, `src/lib/data/index.ts`의 `export * from "./supabase/auth"` 줄 제거(DESIGN이 이미 이 배럴에 남겨 둔 진단 docstring도 "해소됨"으로 갱신), `src/lib/auth/{session,lockout,index}.ts` 신규, 소비자 4곳(`login.ts`·`signup.ts`·`logout.ts`·`get-auth-session.ts`)의 import를 `@/lib/data` → `@/lib/auth`로 교체.

**여전히 유지한 것**: `server.ts`의 `cookieOptions: { httpOnly: true, secure: true, sameSite: "lax" }`(§4, NFR-010 수정) — 이건 zone7 구조와 무관하게 그대로 남는다. DESIGN 파일 수정이라 재확인 요망이던 항목인데, 이후 DESIGN·팀장 쪽에서 반려 언급이 없어 유지했다.

## 2. D-020 계정 잠금 게이트

- `evaluateLoginLockout`(`lib/rules/auth-credentials.ts`, 이미 Task 015A가 순수 함수로 구현)은 그대로 재사용했다 — 인자만 Mock 고정 배열에서 `getRecentAuthAttempts(identifier)`(실 DB, service-role)로 바꿨다.
- `loginAction`(`src/lib/actions/login.ts`) 흐름: ① 이메일 형식 검사 → ② `getRecentAuthAttempts` → ③ `evaluateLoginLockout`이 `locked`면 **Supabase Auth를 호출하지 않고 즉시 거부**(AC4 "자격 증명이 맞아도 거부"를 문자 그대로 만족) → ④ 잠기지 않았으면 `signInWithPassword` 호출 → ⑤ 성공·실패 결과를 `recordAuthAttempt`로 기록.
- **실측(Playwright, 17일차)**: 테스트 계정 `chopin0625@gmail.com`으로 틀린 비밀번호 5회 연속 제출 → `auth_attempts`에 `succeeded=false` 5행 기록 확인(SQL) → 6번째 시도를 **올바른 비밀번호**(`qwer1234`)로 제출 → "5회 연속 실패로 잠시 로그인이 제한돼요. 15분 뒤 다시 시도해 주세요." 잠금 문구가 뜨고 로그인되지 않음을 확인했다. 잠긴 시도는 `auth_attempts`에 기록되지 않음(카운트 5 유지)도 함께 확인했다. 검증 후 이 계정의 합성 실패 기록 5건은 삭제해 정상 상태로 되돌렸다.

## 3. 대시보드 "Confirm email" 실측

- 이 프로젝트의 Supabase Auth는 **"Confirm email"이 켜져 있다** — anon key로 `POST /auth/v1/signup`을 직접 호출해 확인했다(`has_session: false`, `confirmation_sent_at` 세팅, `email_confirmed_at: null`).
- 즉 FR-001 AC1의 `pending_verification` 의미론이 실제로 성립한다: 가입 직후에는 세션이 없다. `signupAction`은 이 경우 `/onboarding`으로 리다이렉트하지 않고 `SignupFormState.status = "pendingVerification"`을 반환해 `SignupForm`이 "메일함을 확인해 주세요" 안내 패널을 보여주도록 바꿨다(폼 대신 렌더). 세션이 즉시 생기는 경우(대시보드 설정이 바뀌는 경우를 대비)의 대비 경로도 남겨 뒀다.
- **로그인 시 미인증 계정** — `signInWithPassword`가 Supabase의 `email_not_confirmed` 오류 코드를 구분해 `strings.auth.login.emailNotVerifiedNotice`("이메일 인증이 아직 완료되지 않았어요…")를 보여준다(FR-002 E4 → FR-001 E4 이관).
- **실측(내장 이메일 발송 한도, D-021·CON-11 재확인)**: 회원가입 폼을 통해 새 이메일로 가입을 시도했더니 `over_email_send_rate_limit`(HTTP 429, "email rate limit exceeded")로 실패했다 — 이 프로젝트에 아직 커스텀 SMTP(Resend, D-042)가 대시보드에 연결되지 않아 **Supabase 내장 발송 한도(시간당 2통, 프로젝트 전체)를 그대로 실측으로 재현**했다. `signupAction`은 이 실패를 삼키지 않고 `formError: "가입 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요."`로 안전하게 표현한다(크래시 없음). **Resend 대시보드 연결이 끝나기 전까지 실 가입 폼으로 신규 이메일 인증 메일을 여러 번 테스트하지 말 것** — 운영자 수동 조치 항목(§7)이 끝나야 해소된다.

## 4. NFR-010 실측 — httpOnly 쿠키

- **실측 결과(수정 전)**: Playwright로 로그인 후 `document.cookie`를 확인하니 `sb-damruradpliktkrlkakl-auth-token`이 **그대로 노출**됐다 — `@supabase/ssr`의 `DEFAULT_COOKIE_OPTIONS`(`node_modules/@supabase/ssr/dist/main/utils/constants.js`)가 `httpOnly: false`를 기본값으로 두기 때문이다(브라우저 클라이언트가 같은 쿠키를 읽어야 하는 시나리오를 기본으로 가정한 설정). NFR-010("세션 토큰을 JS로 읽을 수 없는 저장소에 둔다")을 그대로 위반하는 상태였다.
- **수정**: `createSupabaseServerClient()`(`src/lib/data/supabase/server.ts`)에 `cookieOptions: { httpOnly: true, secure: true, sameSite: "lax" }`를 추가했다(§1의 소유권 예외 3번).
- **`secure: true`와 로컬 개발 — 정정(17일차, 팀장 지적)**: 최초 서술("브라우저가 localhost를 secure context로 취급해 쿠키가 동작한다")은 두 개념을 섞은 부정확한 표현이었다. **"secure context"(`window.isSecureContext`)와 쿠키 `Secure` 속성은 별개 메커니즘이다** — MDN이 명시적으로 "둘 사이에 직접적 연관이 없다"고 밝힌다(각각 JS API 접근 가능 여부 vs. 쿠키 전송 프로토콜 조건을 다룬다). 정확한 근거는 쿠키 표준 자체의 독립된 예외 조항이다: MDN `Set-Cookie` 문서 — "The `https:` requirements are ignored when the `Secure` attribute is set by localhost." 즉 `Secure` 쿠키는 원래 HTTPS 요청에만 실려 가지만 `localhost`에는 이 요구조건 자체가 면제된다. (참고로 이 예외의 표준 근거는 W3C Secure Contexts 명세의 "potentially trustworthy origin" 판정 — `127.0.0.0/8`·`::1/128`이 여기 해당한다 — 과 겹친다. Firefox는 실제로 이 판정 기준을 재사용하도록 구현을 통일했다는 기록이 있다. 그래서 "secure context와 관련이 있다"는 인상을 주기 쉽지만, 브라우저가 쿠키 전송 여부를 판정할 때 호출하는 체크는 `window.isSecureContext`와는 별개다.) 출처: [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), [W3C Secure Contexts](https://www.w3.org/TR/secure-contexts/), [httpwg/http-extensions #2605](https://github.com/httpwg/http-extensions/issues/2605)(Chrome의 `__Host-`/`__Secure-` 접두 쿠키 지원은 아직 부분적이라는 기록 — 이 프로젝트는 접두 쿠키를 쓰지 않아 해당 없음).
- **재검증**: 서버 재시작(Turbopack이 이 WSL `/mnt/e` 마운트에서 파일 변경을 안정적으로 감지하지 못해 재시작이 필요했다 — 별도 기록 없음, 재현되면 다음 담당자가 참고) 후 로그아웃 → 재로그인 → `document.cookie` 재확인 → **빈 문자열**. `/home`은 여전히 인증된 사용자로 정상 렌더(계정 설정·로그아웃 메뉴 노출) — 서버는 세션을 인식하지만 JS는 토큰을 읽을 수 없는 상태를 확인했다. `npm run dev`(로컬 `http://localhost:3000`, plain HTTP)에서 실제로 로그인이 되고 `secure: true`가 쿠키 저장을 막지 않음을 여러 차례(초기 검증 + zone7 재구성 후 재검증) 확인했다 — "로컬 개발이 막히는" 회귀는 없었다.

## 5. 알려진 한계 — 다음 회차로 이월

1. **`createProfile`/`updateProfile` 쓰기 경로가 아직 mock이다.** Task 031(DESIGN, 같은 회차)이 배럴을 읽기/쓰기로 분리하며 `getProfileById`·`getProfileByHandle`·`countUnreadNotifications`는 실 Supabase로 옮겼지만, 쓰기(`createProfile`·`updateProfile`·`changeProfileHandle`)는 여전히 `./mock/profile`이고 **Task 032가 옮긴다**(`docs/decisions/read-path-realdata-031.md`). 파생 효과:
   - `signupAction`이 세션 없이 끝나는 정상 경로(§3)에서는 애초에 `createProfile`을 호출하지 않아 문제가 드러나지 않는다. 세션이 즉시 생기는 대비 경로에서 호출하더라도, **`createProfile`은 `id`를 인자로 받지 않고 mock 저장소에만 임의 id로 쓰인다** — 실 `auth.uid()`와 연결되지 않는다. `public.profiles.id`는 기본값이 없는 FK라(§0) `createProfile`의 시그니처에 `id`가 추가돼야 실 가입자의 프로필을 실제로 만들 수 있다. **이 시그니처 변경은 하지 않고 팀장에게 보고한다**(작업 지시 원칙) — Task 032가 `supabase/profile.ts`의 쓰기를 옮길 때 함께 처리해야 한다.
   - `completeOnboardingAction`이 `updateProfile(session.profileId, …)`을 호출하는데, mock 저장소에 없는 실 프로필 id(예: 이번에 만든 테스트 계정 2개)에 대해서는 `not_found`로 실패한다 — 온보딩 화면 자체는 정상 렌더되지만 제출이 막힌다. Task 032 완료 전까지는 알려진 상태다.
2. **`hasCompletedOnboarding`을 담을 DB 컬럼이 없다.** `docs/ISSUES.md` I-046에 등재했다 — `profiles`에 완료 시각 컬럼을 추가하는 후속 마이그레이션이 필요하다. 그 전까지 `src/components/shell/onboarding-flag-cookie.ts`(세션 인증 쿠키와 별개, httpOnly)로 근사한다. 브라우저를 바꾸면 온보딩을 다시 보게 되는 안전한 열화가 있다.
3. **로그아웃 UI가 이전 회차까지 전혀 없었다.** 어떤 화면에도 로그아웃을 트리거하는 요소가 없었다(grep 확인). `src/lib/actions/logout.ts`(신규)를 만들고 `HeaderNav`(내 소유, `src/components/shell/HeaderNav.tsx`) 데스크톱 계정 메뉴에 최소 폼 버튼 하나만 추가했다 — 모바일(`MobileTabBar`)에는 아직 없다. 후속 과제로 남긴다.
4. **핸들 중복 검사(`getProfileByHandle`)는 이제 실 DB를 읽지만(Task 031), 신규 실 가입은 한계 1번 때문에 실 DB에 프로필을 못 만든다** — 즉 지금은 "핸들 중복은 실 데이터 기준으로 막히지만, 통과해도 실 프로필이 안 생긴다"는 과도기 상태다.

## 6. 실 테스트 계정 2개

**생성 방법 — MCP 도구가 아니라 REST 직접 호출이다.** 이 세션의 `supabase` MCP에는 Admin API 도구가 없다 — `auth.users`에 SQL로 직접 INSERT하지도 않았다(팀장이 우려한 "행은 생겼지만 비밀번호 해시·`aud`·`role`이 어긋나 로그인은 안 되는" 실패 모드를 피하기 위해서다). 대신 `.env.local`의 `SUPABASE_SERVICE_ROLE_KEY`로 Supabase Auth의 **REST Admin 엔드포인트**(`POST {url}/auth/v1/admin/users`, `email_confirm: true`)를 `curl`로 직접 호출해 `auth.users` 행을 정식 경로(GoTrue)로 만들었다 — 비밀번호 해싱·필수 필드는 GoTrue가 처리하므로 위 실패 모드가 구조적으로 발생하지 않는다. 대응하는 `public.profiles` 행은 서비스 롤 SQL로 직접 삽입했다(앱의 `signup.ts` 경로는 §5 한계 1번 때문에 아직 실 DB에 프로필을 만들지 못한다 — 실 가입 경로로 만들 수 없는 이유는 그 한계가 해소되기 전까지 그대로다).

**"행을 만들었다"가 아니라 "로그인이 된다"를 실측했다** — Playwright로 실제 브라우저에서 `chopin0625@gmail.com`/`qwer1234`로 `/login` 폼을 제출해 `/home`으로 리다이렉트되고 계정 설정·로그아웃 메뉴가 뜨는 것까지 확인했다(§2·§4·§9에서 여러 차례 반복 검증). `0625chopin@gmail.com`은 같은 방식으로 만들었으나 반복 로그인 시연은 하지 않았다(자격 증명 발급 절차가 동일해 위험이 낮다고 판단) — 필요하면 팀장·리뷰어가 직접 재현할 수 있다.

| 로그인 ID | 이메일(신규 결정) | profile UUID(`=auth.users.id`) | handle | 비밀번호 |
| --- | --- | --- | --- | --- |
| chopin0625 | `chopin0625@gmail.com` | `30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a` | `chopin0625` | `qwer1234` |
| 0625chopin | `0625chopin@gmail.com`(실 사용자 이메일과 동일 — 팀장 프로필의 실제 Gmail) | `fb70ff1c-3736-44ee-a4a3-96993a3c62ed` | `chopin_0625`(핸들 패턴상 숫자로 시작 불가해 밑줄 삽입) | `qwer1234` |

두 계정 모두 `status="active"`, `hasCompletedOnboarding`은 아직 온보딩 쿠키가 없어 첫 로그인 시 `/onboarding`으로 간다(한계 1번 때문에 제출은 현재 막힘 — 위 §5 참고). `CLAUDE.md` "테스트계정" 절을 이 값에 맞춰 갱신했다(Mock 데모 계정 절은 제거).

## 7. 운영자 수동 조치가 필요한 항목 (MCP로 불가)

| 항목 | 대시보드 경로 | 값·조치 |
| --- | --- | --- |
| 커스텀 SMTP(Resend) 연결 | Project Settings → Authentication → SMTP Settings | Resend SMTP 릴레이(`smtp.resend.com`, 포트 587/465) 계정·API 키 입력. D-042 참고 |
| 발송 도메인 SPF/DKIM | Resend 대시보드 → Domains | 도메인 추가 후 발급된 TXT/CNAME 레코드를 도메인 등록자에 등록. 전파 최대 1일 |
| Leaked Password Protection | Authentication → Policies(또는 Auth Providers 설정) | 현재 꺼져 있음(`get_advisors(security)` WARN 1건, `auth_leaked_password_protection`). 활성화 권고 — Task 030 범위는 아니지만 실측 중 발견해 남긴다 |
| 로그인 레이트 리밋(IP/프로젝트 단위) 값 확인 | Authentication → Rate Limits | D-020 근거 재확인용 — 앱 자체 계정 잠금과 별개로 기본값 그대로 둬도 무방하나 운영 전 재확인 권고 |

## 8. 실측 수치 요약

- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: 0 errors, 0 warnings(작업 중 `import/order` 경고 1건 발생 후 즉시 수정).
- `mcp__supabase__get_advisors(security)`: WARN 1건(`auth_leaked_password_protection`, 대시보드 전용 설정 — §7). 그 외 0건. **이번 회차는 DB 마이그레이션을 적용하지 않았으므로**(§0) advisor 목록은 029B 종료 시점과 동일선상이다.
- D-020 잠금: 5회 연속 실패 → 6회째(자격 증명 정확해도) 거부 확인(§2). 잠금 중 시도는 카운터에 반영되지 않음 확인.
- NFR-010: 수정 전 `document.cookie`에 세션 토큰 노출 확인 → 수정 후 빈 문자열(서버는 인증 유지) 확인(§4).
- 로그인/가입/로그아웃 왕복을 Playwright로 실제 브라우저에서 검증했다(개발 서버는 이 저장소를 공유하는 다른 세션이 이미 띄워 둔 프로세스가 있어, 코드 변경을 반영하려면 재시작이 필요했다 — 재시작 자체가 다른 세션에 영향을 줄 수 있어 향후 유의).
- **zone 7 재검증(§1.2 구조 적용 후)**: `npx tsc --noEmit`·`npm run lint` 재실행 — 둘 다 0 errors/0 warnings. Playwright로 로그아웃 → 재로그인 → `document.cookie` 재확인(빈 문자열 유지) → `auth_attempts`에 새 시도가 기록되는지 SQL로 재확인 — `@/lib/data` → `@/lib/auth` import 경로 변경이 런타임 동작을 바꾸지 않았음을 확인했다.

## 9. `npm run build` — 두 경로 문제였다(경로 A만 내 책임)

- **경로 A(내 책임, 해소함)**: 1차 시도(§1.1)의 `export * from "./supabase/auth"`가 데이터 배럴에 `next/headers`를 처음 물려 `src/components/chat/resolve-post-link-card.ts`(Task 020C, `"use client"` `MessageRoomContainer.tsx`의 import 그래프에 걸림)를 통해 클라이언트 번들까지 깨뜨렸다. §1.2 구조(세션을 배럴 밖 `src/lib/auth/`로 이동)로 이 경로는 없앴다.
- **경로 B(내 책임 아님, 해소됨)**: 경로 A를 없앤 뒤에도 한동안 `npm run build`는 실패했다 — DESIGN이 만든 9개 도메인 실데이터 모듈(`board.ts`·`crew.ts` 등)도 전부 `createSupabaseServerClient`(`next/headers`)를 쓰기 때문에, `resolve-post-link-card.ts`가 배럴을 통째로 import하는 한 **auth를 완전히 빼도** 같은 문제가 재발했다(구조적 필연 — DESIGN·팀장이 확인). CORE가 `message-view-models.ts`를 클라이언트 안전 파일과 서버 전용 `resolve-message-view-model.ts`로 분리해 끊었고, 팀장이 직접 `npm run build` 성공(20개 라우트, 정적 15/15)을 확인했다(`read-path-realdata-031.md` §12.2). **지금은 해소된 상태다.**
- **이번 회차 확인 기준**: Task 030의 필수 실측 항목은 `npx tsc --noEmit`·`npm run lint`이지 `npm run build`가 아니었다(팀장 지시 원문 재확인) — 둘 다 통과했다. `npm run build`는 경로 B가 남아 있어 CREW 단독으로 통과시킬 수 없다.
- **부수 발견 — Turbopack 영속 캐시 불안정(`/mnt/e` WSL 마운트)**: `npm run build` 재현을 시도하며 공유 `next dev`와 충돌해 캐시가 두 차례 깨졌다(`Persisting failed`/`Compaction failed`, 이후 모든 라우트 500) — `rm -rf .next` 후 재기동으로 복구했다. `docs/ISSUES.md` I-048에 등재했다. **17일차부터 `npm run build`는 팀장만 실행하는 운영 규칙이 확정됐다** — 팀원은 `tsc`·`lint`까지만 한다(I-048 후속 항목).

## 10. FR-001 E4 — 인증 메일 재발송(BOARD 교차검증 major 지적으로 추가)

BOARD가 Task 030 교차검증에서 "재발송 UI·Server Action이 코드 어디에도 없다"는 major 결함을
지적했다(`grep -rn "재발송\|resend" src/lib/actions src/components/auth` 0건). FR-001의 정상
흐름·D-021/D-042(커스텀 SMTP를 필수로 만든 이유 자체가 E4)에 걸려 있는 항목이라 이월하지 않고
이번 회차에 구현했다.

- **요구사항 원문 재확인**(`requirements.md` FR-001 E4, 기억이 아니라 grep으로 재확인): "인증
  메일 미수신 → 재발송(60초 쿨다운, 시간당 5회 상한)."
- **Supabase Auth API**(`mcp__supabase__search_docs`로 조회, 기억으로 쓰지 않음): `supabase.auth.resend({ type: 'signup', email, options?: { emailRedirectTo } })` → `{ error }`.
  이미 인증 완료된 이메일로 호출해도(실측: `chopin0625@gmail.com`으로 REST 직접 호출)
  에러 없이 `{}`만 돌아온다 — Supabase의 계정 열거 방지 관례가 그대로 적용된다.
- **카운터 — 새 테이블(`public.email_resend_attempts`)로 분리했다.** `auth_attempts`를
  identifier 접두사로 재사용하는 대안도 검토했으나, `auth_attempts`는 PRD §7 `AuthAttempt`
  (D-020 로그인 시도 전용)로 이미 문서화된 타입이라 다른 의미의 이벤트를 얹으면 그 테이블의
  문서화된 목적과 어긋난다고 판단해 기각했다. 새 테이블은 `auth_attempts`와 동일한 D-028
  4대 규약(`to anon, authenticated` 명시, 정책 컬럼 인덱스 — `auth.uid()` 래핑·재귀 회피는
  블랭킷 거부라 해당 없음)으로 만들고 **완전 거부 RLS**를 적용했다.
  실측: `get_advisors(security)` 적용 직후 재확인 — 새 WARN/INFO 0건(기존 `auth_leaked_password_protection`
  1건만 유지). anon key로 직접 SELECT/INSERT 시도 — SELECT는 빈 배열, INSERT는 401 + 실제
  삽입 0건(service-role 재조회로 확인).
- **판정 함수**: `evaluateResendCooldown`(`lib/rules/auth-credentials.ts`) — `evaluateLoginLockout`과
  같은 계약(identifier로 이미 필터링된 이력을 받는 순수 함수)으로 60초 쿨다운과 1시간 창 5회
  상한을 독립적으로 판정한다.
- **경로**: `resendSignupEmailAction`(신규, `lib/actions/resend-signup-email.ts`) → 쿨다운
  게이트(거부 시 Supabase Auth 미호출, 로그인 잠금과 같은 원칙) → `resendSignupConfirmationEmail`
  (`lib/auth/session.ts`) → 성공/실패 무관하게 `recordResendAttempt` 기록(재발송은 로그인과
  달리 "시도했다는 사실 자체"가 카운트 대상). UI는 `ResendSignupEmailButton`(신규,
  `components/auth/`)이 `SignupForm`의 `pendingVerification` 패널에 붙는다. 쿨다운·상한 초과는
  예외가 아니라 `state.status === "error"`의 도메인 오류 문구로 표현한다(D-030 ③).
- **`/sample` 등록**: `components/sample/sections/auth.tsx`에 "ResendSignupEmailButton" 항목을
  추가했다(default·loading·error 3상태 — 빈 상태는 이 컴포넌트 성격상 의미가 없어 기존
  `SignupForm`·`LoginForm`·`OnboardingForm` 항목과 같은 이유로 생략).
- **실측 범위와 한계(용어 규칙 그대로 적용)**: 타입·lint(`tsc`·`lint` 0), DB 테이블·RLS(위
  advisor·anon 차단 실측), Supabase `auth.resend` REST 응답 형태(curl 직접 호출)까지 확인했다.
  **UI 왕복(Playwright)은 검증하지 못했다** — 이 회차 마무리 시점에 공유 Playwright 브라우저가
  다른 세션에 점유돼 있었다(`Browser is already in use` 오류, 강제 종료하지 않았다). 실제 메일
  발송 성공 여부도 검증하지 못했다 — 커스텀 SMTP 미연결로 내장 발송 한도(시간당 2통)에 이미
  걸린 상태다(§3). **"구현 완료"라고 쓰지 않는다** — "타입·DB·API 계약 수준은 검증했고, 브라우저
  왕복과 실제 메일 수신은 미검증"이 정확한 서술이다.
