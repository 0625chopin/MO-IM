# 17일차 작업 로그 (2026-07-25)

## 회차 요약
- 활성 팀원: **4명 전원**. 구현은 DESIGN(031)·CREW(030), 그 과정에서 발견된 결함 때문에 CORE(020C 핫픽스·RPC 2건)와 BOARD(030 검증·`poll-auto-close.ts` 교체)까지 투입됐다.
- 이번 회차 배치 근거: 완료 집합 {Task 001~028 전량 · 029A · 029B · 035} 기준으로 선행조건이 풀린 미완료 Task는 **031**(DESIGN)과 **030**(CREW) 2건이었다. 030은 로드맵이 **I-016(커스텀 SMTP 공급자 미선정) 해소를 추가 착수 조건**으로 걸어 두어 막혀 있었는데, **팀장이 사용자 확인을 받아 Resend 채택으로 결정(→ D-042)** 하고 차단을 해제했다. 두 Task는 로드맵상 같은 29~30주차 병렬 편성이며 서로 의존이 없어 동시 착수했다.
- 결과: **완료 Task 2건(030 · 031)**. 이슈 **9건 발견 / 전건 해소**(major 6 · minor 3). `docs/ISSUES.md` 신규 등재 **7건**(I-046~I-052). 결정 신규 **1건**(D-042). 전체 테스트 3/3 통과 + 프로덕션 빌드 런타임 확인.
- **12일차부터 이어진 CORE 단독 직렬 사슬이 끝나고 처음으로 4명이 동시에 굴러간 회차다.** 그만큼 팀 간 경계 충돌·소유권 문제가 처음 드러났고, 회차 중간에 운영 규칙 두 개(파일 소유권 사전 확정, 빌드·dev 팀장 전용)를 새로 세웠다.

## 팀원별 완료 내역

### CREW (03.CREW.md)
- 완료 Task: **030 · 인증 연결과 계정 잠금 구현**
- 산출물:
  - 신규 — `src/lib/auth/{index,session,lockout,resend-attempts}.ts`, `src/lib/actions/logout.ts`, `src/lib/actions/resend-signup-email.ts`, `src/components/auth/ResendSignupEmailButton.tsx`, `docs/decisions/auth-integration-030.md`, 마이그레이션 `20260725040400_create_email_resend_attempts_table.sql`
  - 삭제 — `src/components/shell/set-mock-session-cookie.ts`, `src/lib/data/supabase/auth.ts`(1차 시도, 팀장 반려 후 제거)
  - 수정 — `eslint.config.mjs`(zone 7 신설), `src/components/shell/get-auth-session.ts`, `src/lib/actions/{login,signup,complete-onboarding,update-account-profile}.ts`, `src/lib/rules/auth-credentials.ts`, `src/components/auth/{LoginForm,SignupForm}.tsx`, `src/components/shell/HeaderNav.tsx`, `src/lib/strings/ko.ts`, `CLAUDE.md`, `docs/ISSUES.md`, `docs/prioritization-and-risks.md`, `docs/prd/PRD.md`
- 실측 수치: D-020 잠금 5회 실패 → 6회째 **정답 비밀번호로도 거부** 확인(Playwright), 잠금 중 시도는 카운터 미반영. 세션 쿠키 `httpOnly:true · secure:true · sameSite:Lax`, `document.cookie` 빈 문자열(CDP 직접 조회). zone 7 프로브 7개 import 동시 검사 — 허용 4건 무오류 / 차단 3건 의도한 메시지. `get_advisors(security)` 신규 0건.
- 비고:
  - **FR-001은 "구현 완료"가 아니다.** `createProfile`(Mock 쓰기)이 `id`를 받지 않아 **신규 가입자의 `profiles` 행이 실 DB에 생성되지 않는다.** 그 결과 `getAuthSession()`이 `forbidden`을 반환해 신규 가입자는 로그인해도 게스트와 동일하게 취급된다. 프로필 행 생성은 쓰기 경로이므로 **Task 032가 소유하는 정당한 인계**이며, 완료 마커·결정 문서·`CLAUDE.md` 세 곳에 이 사실을 명시했다.
  - 실 테스트 계정 2개는 `/signup`이 아니라 **GoTrue REST Admin 엔드포인트 + 프로필 행 직접 삽입**으로 만들었다. `CLAUDE.md`에 "지금 가입 화면으로는 같은 결과를 얻을 수 없다"를 적어 두었다.
  - **커스텀 SMTP(Resend)는 대시보드 전용 설정이라 연결하지 못했다.** 내장 이메일 한도(시간당 2통)에 이미 걸려 있어 **실제 메일 수신은 검증 불가**다. FR-001 E4 재발송은 쿨다운·상한 로직까지 구현하고 `/sample`에 3상태로 등록했으나 발송 성공은 미검증이다.

### DESIGN (02.DESIGN.md)
- 완료 Task: **031 · 읽기 경로 실데이터 교체**
- 산출물:
  - 신규 — `src/lib/data/supabase/{board,chat,crew,invitation,join-request,meetup,notification,poll,profile}.ts` + `mappers.ts`, `src/components/auth/RedirectToLogin.tsx`, `supabase/seed.sql`, `supabase/seed-teardown.sql`, `docs/decisions/read-path-realdata-031.md`
  - 수정 — `src/lib/data/index.ts`(배럴 read/write 분리 조립), `src/lib/data/supabase/database.types.ts`(재생성), `src/app/(app)/layout.tsx`, `src/app/onboarding/page.tsx`, `src/lib/strings/ko.ts`
- 실측 수치: 시드 — `auth.users` 21(합성 19 + 실계정 2) · profiles 21 · crews 12 · crew_memberships 51 · posts 98 · polls 62 · poll_eligible_voters 222 · poll_votes 212 · meetups 60 · meetup_attendances 60 · chat_messages 132 · notifications 32 · join_requests 8 · invitations 8. **팀장이 전부 독립 재조회해 일치 확인.** NFR-005 기준선("소속 크루 12개 · 월 Meetup 60건") `chopin0625` 기준 성립.
- 비고:
  - **UI 컴포넌트 diff 0** — `git diff --stat -- src/components src/app`에서 DESIGN 귀속 변경 0건. D-030 ①의 형식 요건은 지켰다.
  - **그러나 형식 준수가 동작 보존을 뜻하지 않았다** — 아래 이슈 7번(private 크루 404 회귀) 참고. 이번 회차의 가장 값진 교훈이 여기서 나왔다.
  - 시드용 합성 `auth.users` 19행은 `profiles.id → auth.users(id)` FK 때문에 필요했다. 팀장 조건부 승인(6개 조건) 하에 진행했고, 이메일은 RFC 2606 예약 TLD `seed-N@mo-im.invalid`, `encrypted_password` 공란으로 **로그인 불가**하게 만들었다(팀장이 HTTP 로그인 시도로 400 `invalid_credentials` 실측 확인).
  - NFR-002는 **DB 실행시간만 실측**(전부 1ms 미만). PostgREST·네트워크 왕복은 CREW가 curl로 37~380ms를 실측했으나 **로컬↔원격 왕복이지 Vercel 배포 지연이 아니라** Task 036이 여전히 필요하다.

### CORE (01.CORE.md) — 신규 Task 없음, 발견된 결함 대응
- Task 020C 핫픽스: `src/components/chat/resolve-message-view-model.ts`(신규, 서버 전용 분리), `message-view-models.ts`(클라이언트 안전화), `MessageListContainer.tsx`·`src/lib/actions/{send-chat-message,load-earlier-messages,resync-chat-messages}.ts`(import 경로만), `docs/decisions/chat-client-bundle-leak-020c.md`
- 판정 전용 집계 RPC: 마이그레이션 `20260725035543_poll_vote_tally_for_decision_function.sql`, `docs/decisions/poll-vote-tally-for-decision-hotfix.md`
- `crew_directory_summary` 재검증: `docs/decisions/crew-directory-summary-verification-hotfix.md`(SQL 변경 없음 — 존재하지 않는 결함을 고치는 마이그레이션을 만들지 않았다)
- `server-only` 가드: `src/components/chat/resolve-*.ts` 3개
- 비고: **판정 전용 RPC의 설계가 이번 회차 최고 수준이다.** 판정 시점이 아니면 `private.poll_vote_tally`에 **그대로 위임**해 표시용 함수와 바이트 단위로 동일한 결과를 반환하므로, "이 함수가 더 보여주는 경우는 D-003 종료 트리거가 참일 때뿐"이 숨김 조건을 두 곳에 베끼지 않고 **SQL 재사용으로 구조적으로 보장**된다.

### BOARD (04.BOARD.md) — 신규 Task 없음, 교차검증과 후속 수정
- Task 030 교차검증(13항목), `src/lib/actions/poll-auto-close.ts` 교체(`getPollTally` → `getPollTallyForDecision`), `docs/ISSUES.md` I-049 등재
- 비고: **`auth_attempts` client 차단 검증 방식이 모범이다.** anon key로 `DELETE`를 보내 `204`를 받고도 멈추지 않고 **service-role로 재조회해 실제 삭제 0건**을 확인했다. `204`만 보고 판정했다면 정반대 결론이 났을 자리이며, 16일차 교훈("RLS 차단은 조용히 처리되므로 영향 행 수까지 봐야 한다")을 정확히 적용했다.

## 교차검증 결과
리뷰 짝은 각 프로필의 `리뷰 짝` 행을 그대로 따랐다.

- **BOARD → CREW(030)**: 13항목 PASS, **major 1 · minor 1**. 전부 독립 재현(execute_sql·CDP·실제 로그인·프로브 파일). 검증 후 프로브 파일 삭제와 `auth_attempts` 합성 데이터 원복까지 스스로 처리했다.
- **CREW → DESIGN(031)**: 10항목 중 9 PASS, **FAIL 1**(시드 idempotency). `begin`…`rollback`으로 `seed.sql` 전체를 재실행해 테이블별 델타를 실측했다. `decideAndClosePoll` 호출 경로를 `cron.job`까지 조회해 전수 확인했다.
- **DESIGN → CORE(020C 핫픽스)**: 6항목 중 5 PASS, 1 부분 PASS(런타임 미확인, 사유 명시). `@/lib/data` 값 import 파일 17개의 소비자를 역추적해 `"use client"` 파일 전체와 교차 대조(겹침 0건). `grep '"use client"'`가 주석 속 언급까지 잡는다는 것을 발견해 1행 실제 지시어 여부로 걸러냈다.
- **팀장 독립 검증**: 시드 행 수 전량 재조회 · 마이그레이션 로컬 36 ↔ 원격 36 전수 대조 · `sanitizeRedirectTarget` 14개 케이스 · `crew_directory_summary` 5시나리오 · `email_resend_attempts` RLS · 실 계정 로그인 · 시드 계정 로그인 불가 · 프로덕션 빌드 런타임 6건.

## 발견·해결한 이슈
9건 — major 6 · minor 3. 전건 회차 내 해소.

1. **[팀장 판정 · CREW 030] 인증을 데이터 배럴에 조립해 CON-06을 위반했다(major).** CREW가 ESLint zone 경계 때문에 `src/lib/data/supabase/auth.ts`를 만들고 배럴에 `export *`를 추가하는 안(A안)을 제안했다. **팀장이 반려했다** — `contracts.ts`가 "이 레이어의 어떤 함수도 쿠키·세션·요청 객체를 직접 읽지 않는다"(CON-05·CON-06)를 명문화하고 있어 소유권 예외로 줄 수 있는 종류의 문제가 아니었다. 대신 `src/lib/auth/` 신설 + `eslint.config.mjs` zone 7(인프라 3개만 부정 패턴으로 허용)로 판정했다. **반려 근거가 곧 빌드 에러로 실증됐다** — A안이 적용된 상태에서 `next/headers`가 배럴을 타고 클라이언트 번들로 새어 빌드가 깨졌다.
2. **[DESIGN 발견 · CORE 020C] `"use client"` 그래프가 데이터 배럴을 끌어들였다(major).** `MessageRoomContainer.tsx`가 `message-view-models.ts`에서 `createOptimisticTimelineItem`을 **값으로** import해 모듈 전체가 평가되고, 그 파일이 `resolve-post-link-card.ts` → `@/lib/data`를 물었다. 배럴이 Mock이던 동안은 드러나지 않았을 뿐 경계는 그때부터 새고 있었다. → CORE가 `resolve-message-view-model.ts`로 서버 전용 함수만 분리(로직 무변경, `git diff`로 실증). **`MessageBubble.tsx`·`MessageList.tsx`는 같은 파일에서 `import type`만 했으므로 처음부터 무관했다** — 값 import와 type-only import의 차이가 원인 진단의 핵이었다.
3. **[DESIGN 발견 · CORE→DESIGN→BOARD] `getPollTally`의 0-매핑이 FR-043·044 오판정을 만들었다(major).** `poll_vote_tally` RPC가 D-031(대상자 5명 미만 + open이면 숨김) 때문에 `null`을 반환하고 데이터 계층이 0으로 접는데, `decideAndClosePoll`이 poll이 `open`인 동안 호출되어 **0 집계로 정족수·가결을 계산**했다. → 3단 수정: CORE가 판정 전용 RPC 신설, DESIGN이 `getPollTallyForDecision` 추가(`tally_hidden===true`면 **예외** — `DataResult`로 감싸면 호출부가 조용히 계속할 여지가 남고 그게 애초 결함의 형태였다), BOARD가 `poll-auto-close.ts` 교체.
   - **사실관계를 정확히 하는 데 세 번의 정정이 걸렸다.** DESIGN이 처음 "이월 위험"으로, 다음 "도달 불가(버그 아님)"로, 다음 "실재 버그(매번 피해)"로 판정을 바꿨고, 팀장이 최종 정리했다: **잘못된 계산은 매번 실행되지만 그 결과는 오늘 저장되지 않는다** — Mock 쓰기가 실 UUID에 항상 `not_found`를 반환해 폐기하기 때문이다. **그 안전은 설계된 방어가 아니라 우연한 폐기이며, Task 032가 쓰기를 옮기면 사라진다.**
4. **[BOARD 발견 · CREW 030] FR-001 E4 재발송이 코드에 전혀 없었다(major).** `grep -rn "재발송\|resend" src/lib/actions src/components/auth` → 0건. **이월하지 않고 구현시켰다** — Task 030이 FR-001 전체를 참조로 걸었고 **D-021(커스텀 SMTP 필수)의 존재 이유가 정확히 E4**("내장 이메일은 시간당 2통이라 시간당 5회 재발송을 만족할 수 없다")여서, E4를 빼면 D-021·D-042 결정이 공중에 뜬다. → `email_resend_attempts` 테이블 + `evaluateResendCooldown` 순수 함수 + Server Action + 버튼 + `/sample` 3상태.
5. **[BOARD 발견 · DESIGN] FR-002 AC3(로그인 후 원래 경로 복귀)이 성립하지 않았다(minor).** `(app)/layout.tsx`가 `redirect("/login")`만 부르고 `?redirect=`를 붙이지 않았다. `/login/page.tsx`는 **이미** `searchParams.redirect`를 읽고 있어 받는 쪽은 완성돼 있었다. CREW의 diff에 없는 6일차 파일이라 CREW 책임이 아니고 Task 011(DESIGN) 소관이었다.
   - **"한 줄 규모"가 아니었다.** DESIGN이 Next 문서 원문으로 반박했다 — "Reading the current URL from a Server Component is not supported. This design is intentional"(`use-pathname.md`). 공유 레이아웃은 `searchParams`도 받지 않는다. 서버에서 경로를 아는 유일한 공식 수단은 `proxy.ts`인데 D-011로 범위 밖이다. → 클라이언트 컴포넌트 `RedirectToLogin`으로 해결.
6. **[팀장 발견 · CREW] `sanitizeRedirectTarget`에 오픈 리다이렉트 우회가 있었다(major).** `candidate.startsWith("//")`만 보아 **`/\evil.com`이 통과**했다 — WHATWG URL 표준이 특수 스킴에서 백슬래시를 슬래시와 동등하게 취급해 브라우저가 `//evil.com`으로 정규화한다. 더 나쁘게 docstring이 "`//evil.com`·`https://...` 전부 거부한다"고 **틀린 보장을 약속**하고 있었다. → `new URL(candidate, base)` 파싱 + origin 비교 + 제어문자 사전 거부로 재작성하고 `lib/rules/`로 이동. **팀장 14케이스·CREW 15케이스 각각 독립 실측.**
   - **DESIGN의 설계 배치(검증은 받는 쪽 서버)는 옳았다** — 문제는 검증 함수의 구현 강도뿐이었다. 다만 DESIGN이 그 코드를 읽어 보기 전에 "받는 쪽은 처음부터 완성돼 있었다"고 단정한 것은 정정됐다.
7. **[팀장 발견 · DESIGN 031] private 크루 비소속자에게 404가 떴다 — 이번 회차 유일한 사용자 영향 회귀(major).** `crews_select_authenticated`가 private 크루 비소속자에게 0행을 주므로 `getCrewById`가 `null`을 반환하고, `CrewHomeContainer`가 그것을 "크루 없음"으로 해석해 `notFound()`를 던졌다. D-007 명문("`private`: URL을 직접 알아도 **크루명과 '초대 전용' 안내까지만** 보인다") 위반이다. Mock에서는 RLS가 없어 이 분기가 동작했다.
   - **`git diff`는 UI 0줄이었다.** "UI 무수정"은 형식적으로 지켜졌는데 동작이 회귀했다 — `null` 하나의 의미가 Mock("존재하지 않음")과 실데이터("존재하지만 권한 없음")에서 달라졌고, DESIGN의 §4 결정("읽기에서 not_found와 forbidden을 구분하지 않는다")이 이 지점에서 대가를 치렀다.
   - → DESIGN이 `getCrewById`에 폴백 추가: 원본 select 0행이면 `crew_directory_summary` RPC 재확인 → **0행이면 진짜 404, 1행이면 `PrivateCrewNotice`용 부분 노출**. UI·컨테이너 무수정. **팀장이 프로덕션 빌드에서 "초대 전용 크루예요" + 크루명 노출을 실제 HTTP로 확인했다.**
8. **[CREW 발견 · DESIGN] `seed.sql`이 idempotent하지 않았고 문서가 틀렸다(major).** `begin`…`rollback` 재실행 실측: posts 62→122 · polls 62→122 · meetups 60→120 · notifications 32→64 · join_requests 8→12. 신원·소속 섹션만 idempotent였다. **이는 팀장이 시드를 승인할 때 걸었던 6개 조건 중 3번이었고, DESIGN이 실측 없이 "✅ 충족"으로 조건표에 적었다.** → 재작성 대신 문서 정정 + "재적용 전 `seed-teardown.sql` 선행" 절차 명시를 택했고(정당한 판단), **조건표에 "최초 '✅'는 실측하지 않고 적은 오표기였다"를 스스로 명시했다.**
9. **[팀장 발견 · CORE·CREW] 마이그레이션이 원격에만 적용되고 로컬 파일과 어긋났다(minor).** 로컬 35 ↔ 원격 36 대조 결과 CORE 파일은 **버전 불일치**(로컬 `20260725035414` / 원격 `20260725035543`), CREW 것은 **로컬 파일 자체가 없었다**. 원인은 하나 — **`apply_migration`은 원격에만 적용하고 로컬 파일을 만들지 않는다.** → CORE는 파일명 정정 + md5 대조(차이가 전부 주석이었음을 확인), CREW는 원격 `statements`에서 SQL을 꺼내 파일 생성. **최종 로컬 36 ↔ 원격 36 완전 일치(차집합 양방향 공집합).** I-051로 규약화했다.

### 팀장의 오판 정정 1건 (기록)
팀장이 `crew_directory_summary`가 "0행을 반환해 D-007 부분 노출을 못 한다"고 실측 보고했고 **CORE가 반박했다.** 재검증 결과 **CORE가 맞았다** — 팀장 쿼리가 `set local role authenticated` **뒤에** 인자를 서브쿼리로 뽑아, 그 서브쿼리 자체가 RLS에 막혀 `NULL`을 넘기고 `crew_directory_summary(NULL)`이 0행을 준 것이었다. 즉 "이 역할이 private 크루 id를 **찾을 수** 있는가"(정답: 못 찾는다, 정상)를 재고 있었고 정작 재려던 "UUID를 이미 아는 상태에서 마스킹이 올바른가"는 재지 못했다 — **D-007의 "URL을 직접 알아도"라는 전제를 테스트가 모델링하지 못했다.**
- **교훈**: 역할을 바꿔 RLS를 검증할 때 **테스트 입력 자체를 그 역할로 조회하면 안 된다.** 입력은 역할 전환 전에 확보해 리터럴로 넘겨야 한다.
- **부수 발견**: `mcp__supabase__execute_sql`에 여러 문장을 보내면 **어느 문장의 결과가 오는지 불확정적이다**(마지막 select 결과가 온 사례와 첫 `set_config` 결과가 온 사례를 모두 겪었다). 임시 테이블에 probe를 누적하고 마지막에 한 번 `select`하는 방식만 신뢰할 수 있다. 임시 테이블에 `grant`가 없으면 역할 전환 후 `42501`이 난다.
- **또 하나**: md5로 마이그레이션을 대조할 때 `schema_migrations.statements[1]`은 **말미 개행을 포함하지 않는다.** 로컬 파일이 개행으로 끝나면(정상 관례) md5가 달라지지만 의미 차이가 아니다 — 팀장이 이것 때문에 정상 파일을 결함으로 의심했다.

### 정정한 논거 (결론은 맞고 근거가 틀린 사례)
이번 회차에 네 명 모두에게서 같은 패턴이 나왔다. **결론이 맞아도 근거가 틀리면 다음 사람이 그 근거를 재사용해 틀린 판단을 한다**는 이유로 전부 정정시켰다.
- DESIGN — 빌드 실패 원인 귀속 **3회**(auth 줄이 "실제 원인" → 실제 client 트레이스는 `board.ts` 경유 / zone 7 이관이 "근본 원인 해소" → 배럴 오염은 9개 도메인 모듈 때문에 그대로 / "며칠간 조용히 깨져 있었다" → 빌드는 이번 회차에 처음 깨졌다), "받는 쪽 검증은 처음부터 완성돼 있었다"(그 코드를 읽기 전 단정), 시드 조건 3 "✅"(실측 없이 표기)
- CREW — `secure: true`의 근거를 "브라우저가 localhost를 secure context로 취급"으로 설명(secure context와 쿠키 `Secure` 속성은 별개 기제 — 실제 근거는 MDN `Set-Cookie`의 localhost 예외 조항), FR-001 "완전 구현"과 "프로필이 연결되지 않는다"를 같은 보고에 병기
- CORE — 트레이드오프를 "새 권한이 아니다"로 정당화(**BOARD 지적**: 종료는 1회성·비가역·전원에게 드러나고 RPC 반복 호출은 무기록·가역·비가시적이라 동등한 대체 수단이 아니다 → "정보의 양은 같지만 획득 양태가 다르다"로 정정, Task 034 인계로 "판정+종료를 한 트랜잭션에 묶어 읽기 전용 경로를 없애는" 설계 옵션 명시)
- 팀장 — 위 오판 1건

### 자진 신고 (이슈 아님, 기록)
- **CORE**: Playwright 검증 중 포트 충돌로 `pkill -f "next dev"`를 써 **다른 세션의 dev 서버까지 종료**했을 수 있음을 즉시 신고했다.
- **DESIGN**: 별도 포트에 dev 서버를 띄웠다가 `.next`를 공유해 `.next/dev/types/validator.ts`가 **동시 쓰기로 중간이 잘린 채** 남은 것을 발견해 신고하고, 파일 하나만 지우고 `.next` 전체는 건드리지 않았다(절제된 처리). 삭제 전후로 기존 서버의 여러 경로 응답을 확인했다.
- **두 신고가 숨겨지지 않았기 때문에** 팀장의 `npm run build` ENOENT·`npm run lint` ENODATA와 같은 뿌리(I-048)임을 빠르게 짚고 운영 규칙을 세울 수 있었다.

## 회차 중 세운 운영 규칙
1. **파일 소유권을 착수 전에 확정한다.** 4명이 동시에 굴러간 첫 회차에서 CREW가 DESIGN 소유 파일(`server.ts`)을 고치고, 배럴 한 줄을 두 사람이 건드려야 하는 상황이 나왔다. 팀장이 소환 시점에 소유 경계를 명시하고, 불가피한 침범은 사전 보고를 거치게 했다.
2. **`npm run build`와 `npm run dev`는 팀장 전용, 런타임·브라우저 검증도 팀장이 한다.** 근거는 I-048 — 여러 프로세스가 같은 `.next`를 동시에 쓰면 서로를 깨뜨려 **코드와 무관한 실패를 코드 문제로 오진**하게 된다. 실제로 stale한 dev 서버가 DESIGN과 팀장 양쪽에 "고쳤는데 옛 동작이 나온다"는 잘못된 관측을 줬다. 팀원은 `tsc`·`lint`까지만 하고, 런타임 확인이 필요한 항목은 **"코드 리뷰까지만 했고 런타임 미확인"으로 정직하게 넘긴다.**
3. **용어 규칙**: **끝까지 동작함을 실측한 것만 "구현 완료"로 쓴다.** 다른 Task에 의존해 끊기는 것은 "구현했으나 X에서 끊긴다"로 쓴다. 완료 마커가 다음 회차 배치 산정의 근거이므로 이 구분이 무너지면 팀장이 틀린 판단을 한다.
4. **경계 방어는 정적 규칙이 아니라 `server-only`로 한다.** CORE가 낸 ESLint 보강 3안을 모두 기각했다 — `no-restricted-imports`는 **직접 import만** 보고 전이 경로를 못 보는데, 이번 사고가 정확히 2단 전이였다(DESIGN 지적). Next 16 문서(`05-server-and-client-components.md` 555행·**577행 "installing `server-only` is *optional*"**)를 확인해 **새 의존성 없이** 그래프 단위로 판정하는 공식 기제를 채택했다. DESIGN(`data/supabase/*` 10개)·CREW(`lib/auth/*` 4개)·CORE(`chat/resolve-*` 3개)가 각자 적용했다.

## 팀장 전체 테스트 (항상 실행)
- `npm run lint`: **통과** (exit 0, 출력 없음)
- `npx tsc --noEmit`: **통과** (exit 0)
- `npm run build`: **통과** (exit 0). 20개 라우트 전부 `ƒ (Dynamic)`, 정적 페이지 15/15
- **프로덕션 런타임 확인** (`npm start`, 실제 HTTP):
  | 확인 | 결과 |
  | --- | --- |
  | 미인증 `/settings` | HTTP 200 + `<noscript>` 1개 + `href="/login?redirect=%2Fsettings"` — 폴백이 복귀 경로 보존 |
  | 미인증 `/onboarding` | **307 → `/login?redirect=/onboarding`** |
  | 인증 + private 크루 비소속 | **HTTP 200 + "초대 전용 크루예요" + 크루명 "심야 독서 모임"** — 이슈 7 복구 확인 |
  | 인증 + 존재하지 않는 크루 | 404 페이지 렌더(HTTP 상태는 200 — 아래 참고) |
  | 인증 `/home` | HTTP 200, 로그아웃 메뉴 노출 — 세션 정상 |
  | `/sample` | HTTP 200, 로딩·빈 상태·오류 라벨 + 재발송 컴포넌트 등록 |
  - private 크루 확인은 **브라우저 없이** 했다 — Playwright 프로필이 팀원 세션의 Chrome에 잠겨 있어 CORE의 사고를 반복하지 않으려고 죽이지 않고, Supabase 인증 REST로 세션을 받아 `sb-<ref>-auth-token` 쿠키를 직접 만들어 `curl`로 요청했다.
  - `.next/BUILD_ID` mtime 기준으로 **빌드 이후 `src/**` 변경 0건**을 확인해 빌드 결과의 유효성을 보장했다.
- **BOARD의 런타임 확인 요청 3건 중 1·2번은 실측 불가**: 대상자 5명 미만 크루의 트리거②③ 판정 경로는 `closePoll`이 아직 Mock 쓰기라 실 UUID에 대해 항상 `not_found`를 반환해 **판정 결과가 저장되지 않는다.** Task 032 검증 항목으로 이월한다.
- **DB 실측**: `get_advisors(security)` 신규 0건(기존 `auth_leaked_password_protection` WARN 1건만 — 대시보드 설정). 마이그레이션 **로컬 36 ↔ 원격 36 완전 일치**. `email_resend_attempts` RLS 활성 + 정책 1건(`{anon,authenticated}` ALL `qual=false`, D-028 규약 준수).

## 문서 갱신
- `docs/ROADMAP/team/03.CREW.md`: Task 030 `- 상태: 완료 (17일차, 2026-07-25)` + **FR-001이 신규 가입 경로에서 끊긴다는 사실 명시**
- `docs/ROADMAP/team/02.DESIGN.md`: Task 031 완료 마커 + 시드·NFR-002 측정 조건·FK 정정 경위
- `docs/ROADMAP/team/01.CORE.md`: Task 020C 핫픽스 노트, Task 029B 재검증 노트
- `docs/prioritization-and-risks.md`: **D-042 신설**(커스텀 SMTP = Resend), "다음 결정 번호" → D-043
- `docs/ISSUES.md`: **I-016 해결됨**(→ D-042). 신규 **I-046**(온보딩 완료 컬럼 부재) · **I-047**(클라이언트 팩터리가 인프라인데 데이터 계층에 있음, zone 7은 잠정 조치) · **I-048**(WSL `/mnt/e`에서 Turbopack 캐시 불안정 + 빌드·dev 팀장 전용 규칙) · **I-049**(`cast-vote.ts`가 `decideAndClosePoll` 예외를 감싸지 않아 이미 성공한 투표까지 오류로 보임) · **I-050**(CLAUDE.md D-030 ③ 읽기/쓰기 범위 미구분) · **I-051**(`apply_migration`이 로컬 파일을 만들지 않음) · **I-052**(`notFound()`가 HTTP 200으로 응답되는 soft 404 — 원인 Next 문서로 확정)
- `docs/prd/PRD.md`: §8 도입 예정에 Resend 등재
- `CLAUDE.md`: 테스트계정 절 전면 개편 — Mock 데모 계정 제거, **로그인 이메일 / `profiles.handle` / 요청받은 계정명 세 식별자 구분**(`0625chopin`은 로그인에도 handle에도 쓸 수 없다), 계정 생성 방식 명시
- `docs/decisions/`: 신규 5건 — `auth-integration-030.md` · `read-path-realdata-031.md` · `chat-client-bundle-leak-020c.md` · `poll-vote-tally-for-decision-hotfix.md` · `crew-directory-summary-verification-hotfix.md`
- `docs/team/*.md`: **변경 없음** — 팀원 상태 변화 없음

## 이번 회차 최대 교훈
> **Mock 모듈에 대응 함수가 없다는 것은 실데이터에서 그 경로가 불필요하다는 증거가 아니다 — Mock에는 RLS가 없어 "부분 노출"이라는 개념 자체가 없었다.**

이슈 7(private 크루 404)의 뿌리다. DESIGN이 §5에서 "`crew_directory_summary`는 Mock 어디에도 대응 함수가 없으니 이번 회차엔 쓰지 않는다"고 결정했고, **그 근거는 사실이었지만 결론이 틀렸다.** 어긋난 지점은 "Mock의 함수 목록"을 "실데이터의 필요 목록"의 대리 지표로 삼은 추론 자체다.

**Task 032가 정확히 같은 구조의 함정을 만난다** — D-019의 원자적 정원 판정, RLS의 2차 거부, `unique(meetup_id, profile_id)` 멱등성은 **Mock 쓰기에 없는 개념**이다. "Mock에 없으니 불필요"라는 판단을 반복하면 같은 회귀가 쓰기 경로에서 재현된다.

또 하나: **D-030 ①의 "UI 무수정"은 형식 요건이 아니라 동작 보존 요건이다.** 이번 회차에 `git diff` UI 0줄을 달성하고도 동작이 회귀했다. `null` 하나의 의미가 계층 교체로 바뀔 수 있다는 것이 그 통로였다.

## 다음 회차에 열리는 Task

| Task | 담당 | 의존 | 비고 |
| --- | --- | --- | --- |
| **032** 쓰기 경로 Server Action 교체와 정원 동시성 | DESIGN | 029A ✓ · 029B ✓ · 031 ✓ | 선행 대기 없음. **이번 회차 이월이 가장 많이 걸린 Task다**(아래) |
| **038** 레이트 리밋·검색 노출 제어 | BOARD | 030 ✓ | 선행 대기 없음(030 완료로 열렸다) |
| **039** 계정 생애주기 (FR-003·005) | CREW | 030 ✓ (암묵) | 선행 대기 없음 |

- **033**(BOARD)은 031·032 완료가 선행이라 032 이후다. **CORE의 다음 Task 044는 036 의존이라 한참 뒤다** — 다음 회차 CORE는 유휴이거나 리뷰어로 투입된다.
- **Task 032가 반드시 처리해야 할 이월 (이번 회차 산출)**:
  1. **`createProfile`/`updateProfile`이 `id`를 받지 않아 신규 가입자의 프로필이 실 DB에 생성되지 않는다** — FR-001을 end-to-end로 완성하는 열쇠다. 이걸 고치지 않으면 실 가입이 계속 불가능하다.
  2. **I-049** — `cast-vote.ts` 트리거③이 `decideAndClosePoll` 예외를 감싸지 않아, 쓰기가 실데이터로 바뀌면 **표는 저장됐는데 오류 화면이 뜨는** 상태가 된다.
  3. **`getPollTally` 0-매핑의 우연한 방어가 사라진다** — 오늘은 Mock 쓰기 실패가 잘못된 판정 결과를 폐기하지만, 쓰기를 옮기면 저장된다. 판정 경로는 이미 `getPollTallyForDecision`으로 교체됐으니 **그 교체를 되돌리지 말 것**.
  4. **`seed.sql`은 idempotent하지 않다** — 재적용 전 `seed-teardown.sql`을 먼저 실행해야 한다. 콘텐츠 섹션(6·8·12·13)이 중복 생성된다.
  5. **위 "최대 교훈"을 착수 전에 읽을 것.**
- **범위 밖으로 남긴 것**:
  - **커스텀 SMTP(Resend) 대시보드 연결과 SPF/DKIM 도메인 인증** — MCP로 불가능하다. FR-001 E4의 실제 메일 발송은 이 조치 전까지 검증할 수 없다. **D-042의 리드타임 리스크가 여기 걸려 있다.**
  - **Leaked Password Protection 활성화**(advisor WARN 1건) — 대시보드 전용.
  - **I-047** 클라이언트 팩터리를 `src/lib/supabase/`로 이동 — zone 7은 잠정 조치다.
  - **NFR-002 배포 환경 실측** — Task 036 몫.
  - **soft 404 (I-052)**: `notFound()`가 404 페이지를 렌더하면서 **HTTP 200을 반환**한다(팀장 실측). 이번 회차 회귀는 아니며 Mock 시절부터의 동작이다. **원인은 확정됐다** — Next.js 공식 문서가 이 동작을 명시한다: "Next.js will return a `200` HTTP status code for streamed responses, and `404` for non-streamed responses"(`not-found.md`), 그리고 `loading.md`의 "Status Codes" 절이 이 현상을 **"soft 404s"라고 직접 명명**하며 "response headers have already been sent... the status code cannot be updated"라고 설명한다. D-040과 함께 볼 사안이다.
    - 부수 효과 하나는 **열거 방어에 유리하다** — 존재하지 않는 크루(200 + 404 페이지)와 존재하는 private 크루(200 + 초대 전용)가 둘 다 200이라 외부에서 상태 코드만으로는 구분되지 않는다.

## git
- 브랜치: `day-17` (`day-16`에서 분기)
- 커밋: 아래 참고
- 푸시: 사용자 확인 대기
