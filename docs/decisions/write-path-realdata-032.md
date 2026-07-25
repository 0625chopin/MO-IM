# 쓰기 경로 Server Action 교체와 정원 동시성 (Task 032)

- **일자**: 2026-07-25(18일차)
- **담당**: DESIGN(B팀) · 리뷰 CORE(A팀)
- **참조**: FR-066·067·023·021, **D-019**·D-030, R-002, I-046(해소)·I-049(해소)·I-039
- **선행 산출물**: `docs/decisions/read-path-realdata-031.md`(Task 031, 배럴 read/write 분리 표),
  `docs/decisions/rls-policies-029a.md`·`029b.md`(RLS·트리거·private 헬퍼), `docs/decisions/
  auth-integration-030.md`(I-046 원 보고)

## 0. 범위

Task 031이 만든 배럴 read/write 분리 표(9개 도메인, `./mock/<domain>` 재노출 줄)의 **쓰기 칸
전부**를 `src/lib/data/supabase/<domain>.ts`로 옮기고, `src/lib/data/index.ts`를 9개
`export * from "./supabase/<domain>"` + `export * from "./contracts"`로 단순화했다. `./mock/*`는
이 배럴에서 더 이상 재노출되지 않는다. 더불어 17일차 인계 3건(I-046 핵심·I-049·D-007 재확인)을
함께 처리했다.

## 1. D-019 정원 원자성 — `respond_meetup_attendance` RPC

### 1.1 왜 client-side 조건부 UPDATE가 아니라 RPC인가

D-019 원문은 `update meetup set attending_count = attending_count + 1 where … and
attending_count < capacity`를 예시로 든다. 그런데 **PostgREST는 UPDATE 본문에 산술 표현식을
실을 수 없다** — `attending_count + 1` 같은 서버측 계산식이 아니라 리터럴 최종값만 전송
가능하다. 그래서 클라이언트가 이 조건부 UPDATE를 흉내내려면 ① 현재값 조회 ② 그 값 기준 CAS
UPDATE의 2단계 왕복이 필요한데, 그 사이 `meetup_attendances` upsert까지 세 번째 왕복으로
더해지면 두 테이블 사이에 경쟁 조건이 생긴다(카운터는 늘었는데 attendance 행은 실패하는 등).

`public.respond_meetup_attendance(p_meetup_id, p_status)` 함수(`security invoker`)는 이 세
단계를 **하나의 함수 호출 = 하나의 DB 트랜잭션**으로 묶는다. `security invoker`를 쓴 이유는
"RLS로 정원을 강제하지 않는다"(D-019)는 결정을 지키기 위해서다 — 이 함수는 RLS를 우회하지
않는다. 함수 본문의 `update … where … and attending_count < capacity`가 D-019가 요구하는 바로
그 조건부 UPDATE이고, RLS(`meetups_update_members_scoped_by_trigger`)와
`meetups_guard_attendee_scope` 트리거는 평소와 동일하게 적용된다(호출자가 그 크루의 활성
멤버가 아니면 UPDATE 자체가 0행이 되어 함수가 안전하게 실패한다).

### 1.2 함수 계약

```sql
respond_meetup_attendance(p_meetup_id uuid, p_status text)
returns table(ok boolean, changed boolean, reason text)
```

- 이미 같은 상태로 응답한 요청 → `ok=true, changed=false`(FR-067 E2 멱등).
- `attending`으로 전환 + 정원 초과 → `ok=false, reason='full'`.
- 정상 전환(증가/감소) → `ok=false`가 아니라 `ok=true, changed=true` + attendance 행 upsert.
- `authenticated`에게만 EXECUTE 부여, `anon`은 거부.

### 1.3 동시성 실측 (트랜잭션 롤백 아님 — 실제 커밋 후 원상 복구)

기존 시드 Meetup(`4be878cf-…`, 크루 "심야 독서 모임", 원래 capacity=8·attending_count=2)을
빌려 실측했다:

1. **정원 판정 로직 자체**(단일 세션, `begin…rollback` 안에서 capacity=1로 좁혀 재현):
   `full_attempt`(정원 가득 참) → `{ok:false, reason:'full'}`, `absent_ok`(정원 무관 이탈) →
   `{ok:true, changed:true}`, `absent_idempotent`(재요청) → `{ok:true, changed:false}`,
   `attending_success`(자리 생긴 뒤) → `{ok:true, changed:true}`, `attending_count` 1→2로 정확히
   반영. 전부 기대값과 일치, `rollback`으로 원상 복구.
2. **실제 동시 요청(커밋 상태, 수락 기준 그대로 재현)**: capacity를 3으로(현재 attending_count
   2 → 자리 1개) **커밋해서** 맞춘 뒤, 서로 다른 두 크루원(오너 `32843fea-…`, 일반 멤버
   `914d5f56-…`, 둘 다 이전에 attending 아님)이 **같은 메시지 응답 안에서 병렬로 실행되는 두
   개의 도구 호출**로 동시에 `respond_meetup_attendance(…, 'attending')`을 호출했다.
   - **결과**: 한쪽 `{ok:true, changed:true}`(오너), 다른 쪽 `{ok:false, reason:'full'}`(멤버) —
     **정확히 1명만 성공**했다. 부하가 아니라 실제 경쟁 상황에서 확인한 결과다.
   - 실패한 요청은 `meetup_attendances`에 어떤 행도 남기지 않았다(함수 전체가 한 트랜잭션이라
     "카운터만 반영되고 attendance는 안 생기는" 부분 실패가 없음을 함께 확인).
   - 검증 직후 성공한 쪽을 다시 `absent`로 되돌리고 `capacity`를 8로 복원해 시드를 원상태로
     되돌렸다(`attending_count=2` 재확인).

**수락 기준 문구("정원이 1 남은 Meetup에 2개 세션이 동시에 참석 요청 → 정확히 1명만 성공하고
다른 하나는 '정원 마감' 도메인 오류") 그대로 재현·통과했다.**

### 1.4 TS 레이어

`src/lib/data/supabase/meetup.ts`의 `respondAttendance`는 이 RPC 하나만 호출한다.
`RespondAttendanceInput.profileId`는 Mock 시그니처 호환용으로 남겼지만 쓰지 않는다 — RPC가
내부에서 `auth.uid()`를 쓴다(`listCrews`의 `viewerProfileId`와 같은 선례, `read-path-
realdata-031.md` §6). `AttendanceJoinResult`(`{success:true,changed}` |
`{success:false,reason:'full'}`) 계약은 그대로 유지했다 — `respond-meetup-attendance.ts` Server
Action은 한 줄도 고치지 않았다.

## 2. Mock에 없던 개념 — DB 트리거가 이미 처리하는 동기화

`read-path-realdata-031.md` §7이 미리 경고한 그대로("Mock의 쓰기 함수에도 없는 개념이
쓰기 경로에서 필요해진다")의 **반대 방향** 함정을 만났다 — 이번엔 Mock이 명시적으로 하던 일을
**실 DB가 이미 자동으로 하고 있어서**, Mock 그대로 옮기면 중복 처리가 됐다.

| 흐름 | Mock(017A/B) | 실 DB(029A/B) |
| --- | --- | --- |
| 초대 발급(FR-020) | `createInvitation` + `initiateCrewMembership("invite")` | `trg_invitations_provision_membership`(AFTER INSERT)이 `invited` 멤버십 자동 생성 |
| 초대 응답(FR-021) | `respondToInvitation` + `accept/declineCrewInvitationMembership` | `trg_invitations_sync_membership_on_response`(AFTER UPDATE)이 `active`/`declined` 자동 전이 |
| 가입 승인/반려(FR-023) | `decideJoinRequest` + `approve/rejectCrewMembership` | `trg_join_requests_sync_membership_on_decision`(AFTER UPDATE)이 `active`/`rejected` 자동 전이 |
| 가입 신청(FR-022) | `createJoinRequest` + `initiateCrewMembership("request")` | **자동 트리거 없음** — `createJoinRequest`가 직접 `crew_memberships`를 upsert(§3) |
| 가입 철회(FR-022 E4) | `withdrawJoinRequest` + `withdrawPendingCrewMembership` | **자동 트리거 없음** — `withdrawJoinRequest`가 직접 되돌림(§3) |

앞 3개 흐름에서 Mock처럼 두 함수를 순서대로 호출하면, 두 번째 호출이 시도하는 전이는 트리거가
**이미 끝낸 전이**라 상태 불일치로 막힌다(예: `approveCrewMembership`이 `requested→active`를
기대하는데 트리거가 이미 `active`로 바꿔놔서 조건부 UPDATE가 0행). 그래서 `initiateCrewMembership`·
`acceptCrewInvitationMembership`·`declineCrewInvitationMembership`·`approveCrewMembership`·
`rejectCrewMembership` 5개 함수를 **Supabase 구현하지 않고**, 호출부 4개 Server Action
(`invite-crew-member.ts`·`respond-to-invitation.ts`·`decide-join-request.ts`·이미 존재하던
`request-join-crew.ts`의 일부)에서 그 호출을 제거했다 — 죽은 export를 배럴에 남기지 않는다.

## 3. `join_requests`에는 대응 트리거가 없다 — 두 가지를 이 레이어가 직접 처리

`invitations`와 달리 `join_requests`에는 최초 생성 시 `crew_memberships`를 만드는 트리거가
없다(029A/029B 문서·`pg_proc` 실측 둘 다 확인). 그래서:

- **`createJoinRequest`**: `join_requests` INSERT 후 `crew_memberships`를 직접 확인해 ① 없으면
  INSERT(`status='requested'`, RLS `crew_memberships_insert_self_request`가 허용) ② 종착
  상태(`declined|rejected|left|removed`)면 UPDATE로 재활성화 ③ 이미 `active/invited/requested`면
  건드리지 않는다(호출자가 먼저 걸렀어야 하는 상태).
- **`withdrawJoinRequest`**: `join_requests.status='withdrawn'` 조건부 UPDATE 후
  `crew_memberships`를 `requested→rejected`로 직접 되돌린다(I-039 근사와 동일).

이 두 전이(`requested→rejected` 자진 철회, `(declined|rejected|left|removed)→requested`
재신청)는 **`crew_memberships_guard_self_transition`의 원래 self-service 허용 목록에 없었다**
(`invited→{active,declined}`, `active→left`만 있었음) — 그래서 마이그레이션
`crew_memberships_extend_self_service_join_request_transitions`로 두 전이를 추가했다(§5).
이 확장이 없으면 위 두 함수의 UPDATE가 트리거 예외로 막힌다.

## 4. I-046 해소 — `createProfile`에 `id` 매개변수 추가

- **마이그레이션** `profiles_add_onboarding_completed_at` — `profiles.onboarding_completed_at
  timestamptz null` 추가.
- **`createProfile(input: {id, handle, displayName})`** — `public.profiles.id`는 `auth.users.id`
  참조 FK이고 기본값이 없다. "Confirm email"이 켜져 있어(auth-integration-030.md §3) 가입
  직후에는 세션이 없는 게 정상 흐름이라 `auth.uid()` 기반 RLS(`profiles_insert_self`)로는 이
  시점에 프로필을 만들 수 없다 — `createProfile`만 예외적으로 service-role 클라이언트를 쓴다
  (`src/lib/auth/lockout.ts`의 로컬 헬퍼 패턴을 그대로 따름, 공유 모듈로 뽑지 않음). `id`는
  `signUpWithPassword`(`@/lib/auth`)가 반환한 실 `auth.users.id`만 신뢰한다(CON-06).
- **`signupAction`(`src/lib/actions/signup.ts`)** — 세션 유무와 무관하게 `signUpWithPassword`
  성공 직후 곧바로 `createProfile({id: signedUp.userId, …})`를 호출하도록 바꿨다(기존에는 세션이
  즉시 생기는 대비 경로에서만, 그마저 `id` 없이 mock에 썼다). 이제 이메일 인증 대기 상태에서도
  프로필 행이 실 DB에 즉시 생긴다 — 사용자가 나중에 메일 링크로 인증하고 로그인하면
  `getAuthSession()`이 이미 존재하는 프로필을 찾아 FR-001의 정상 흐름이 끝까지 완결된다.
- **`completeProfileOnboarding(id)`**(신규) — `onboarding_completed_at`을 갱신하는 전용 함수.
  `updateProfile`과 분리한 이유는 그 함수의 기존 원칙과 같다(시스템이 시점을 결정하는 필드를
  사용자 patch 경로로 받지 않는다). `completeOnboardingAction`이 `updateProfile` 다음에 이
  함수를 호출한다.
- **`get-auth-session.ts`** — `hasCompletedOnboarding`을 `profile.onboardingCompletedAt !==
  null`로 판정하도록 교체. 보조 쿠키(`onboarding-flag-cookie.ts`)는 삭제했다.
- **타입 전파(NFR-035)**: `Profile.onboardingCompletedAt` 필드를 도메인 타입에 추가하고
  `mappers.ts`·mock 픽스처(`fixtures.ts` 3건·`generate-profiles.ts` 시드 생성기)에도 반영해
  Mock과 실데이터가 계속 같은 타입을 쓰게 했다.

## 5. I-049 해소 — `cast-vote.ts` 트리거③ try/catch 격리

트리거③ 블록(`listEligibleVotersWithCurrentStatus`·`listVotes`·`decideAndClosePoll` 호출) 전체를
`try/catch`로 감쌌다. 실패해도 `console.error`로 로깅만 하고, 이미 저장된 `castVote` 결과
(`result`)를 그대로 반환한다 — poll은 여전히 `open`이라 트리거①(기한 도래)이 결국 마무리한다.
`close-poll.ts`의 두 호출부(`closePollEarlyAction`·`simulateScheduledPollClosureAction`)는
예고대로 손대지 않았다.

**부수 발견**: poll 쓰기가 실 Supabase로 옮겨진 지금, `closePoll`의 RLS
(`polls_update_proposal_author_or_staff`)는 제안자·임원 이상만 통과시킨다. 트리거③(마지막 표를
던진 사람이 자동 종료를 유발)은 그 사람이 임원이 아닐 수 있어 RLS가 조용히 0행을 반환할 수
있다(`closePoll`이 `err("conflict", …)`로 표현) — 이 역시 이번 try/catch가 함께 흡수하는 새
실패 경로다. 트리거②(조기 종료)는 `checkPermission({action:"poll:close_early"})`가 사전에
임원 이상만 통과시키므로 이 문제가 없다.

## 6. D-007 private 부분노출 회귀 — 이미 해소돼 있었다(재작업 안 함)

배정 지시문의 인계 3번("`getCrewById`가 `crew_directory_summary` RPC를 호출하지 않는다")은
**17일차에 이미 해소됐다** — `src/lib/data/supabase/crew.ts`의 `getCrewById`에 "원본 select
0행 → RPC 재확인" 폴백이 들어 있는 것을 확인했다(`docs/decisions/crew-directory-summary-
verification-hotfix.md`, `docs/ROADMAP/team/02.DESIGN.md` 17일차 기록과 일치). 코드를 다시
읽어 폴백이 실제로 존재함을 재확인했을 뿐, 추가 변경은 하지 않았다.

## 7. 나머지 도메인 쓰기 요약

- **crew.ts**: `createCrew`(id를 `crypto.randomUUID()`로 미리 생성해 D-016 색 해시를 INSERT
  전에 계산 — `crews_provision_owner_bootstrap` 트리거가 오너 멤버십·게시판·채팅방을 단일
  INSERT 안에서 원자적으로 만든다), `updateCrewInfo`, `updateCrewVisibility`(트리거가 오너
  전용으로 2차 방어), `setCrewMembershipRole`(FR-024), `updateCrewMembershipStatus`(FR-026
  탈퇴·FR-027 강퇴, 조건부 UPDATE로 이중 처리 방지).
- **poll.ts**: `createPoll`(polls + poll_eligible_voters 스냅샷), `castVote`(사전 확인 후
  upsert — 재투표는 `poll_votes_guard_immutability` 트리거가 `open` 동안만 허용), `closePoll`
  (조건부 UPDATE).
- **board.ts**: `createPost`/`updatePost`/`deletePost`(소프트 삭제, `editedAt` 갱신).
- **chat.ts**: `sendMessage`(`client_key` UNIQUE 위반을 재전송 멱등으로 해석), `deleteMessage`
  (소프트 삭제).
- **notification.ts**: `createNotification`(INSERT RLS 정책 자체가 없어 service-role 필수),
  `markNotificationRead`(본인 소유 확인 후 멱등 갱신), `markAllNotificationsRead`.

## 8. 남은 리스크

- **I-054**(신규): `createJoinRequest`·`createPoll`은 여러 PostgREST 호출(=여러 트랜잭션)을
  순서대로 실행할 뿐 원자적이지 않다 — 두 번째 호출이 실패하면 부분 상태가 남을 수 있다.
  `respondAttendance`·`createCrew`는 RPC/트리거로 이미 원자적이라 이 문제가 없다. 후속은
  같은 RPC 패턴으로의 전환.
- **§8 트리거③ RLS 실패**: 시스템(비임원) 주도 자동 종료가 RLS에 막히는 경로 자체는 남아
  있다 — try/catch로 사용자 경험은 보호했지만, "미투표자 0명"에서도 실제로는 종료되지 않고
  트리거①(기한 도래)까지 기다리는 지연이 생길 수 있다. Task 034(pg_cron 자동화)가 service-role
  기반 종료 경로를 만들 때 함께 재검토할 것을 권한다.
- `mock/crew.ts`의 5개 함수(§2)는 코드베이스에 그대로 남아 있다(호출부 없음, 죽은 코드는 아니고
  미사용 export) — **정정(18일차, CORE 교차검증)**: 이전 판은 이 자리에 "Mock 전용 소비자(있다면
  `/sample`)가 생기지 않는 한"이라고 적어 `/sample`이 mock을 참조할 수도 있다는 인상을 줬다.
  실제로는 `src/components/sample/**`가 `@/lib/data`를 전혀 import하지 않는다(4상태 데모는
  전부 손으로 쓴 정적 리터럴) — 따라서 이 5개 함수의 유일한 소비자는 없고, 정리 여부는 순수히
  코드 위생 문제다(우선순위는 여전히 낮다).

## 9. 실측 요약

- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: 0 errors, 0 warnings.
- `mcp__supabase__get_advisors(security)`: WARN 1건(`auth_leaked_password_protection`, 기존과
  동일 — 이번 마이그레이션과 무관, 대시보드 설정).
- 마이그레이션 3건 적용 + `supabase/migrations/`에 동일 파일 커밋(I-051 대응):
  `profiles_add_onboarding_completed_at`, `crew_memberships_extend_self_service_join_request_
  transitions`, `respond_meetup_attendance_function`.
- `database.types.ts` 재생성(`onboarding_completed_at` 컬럼 + `respond_meetup_attendance` RPC
  반영).
- 정원 동시성 실측: §1.3 — 정확히 1명만 성공 확인, 실측 후 시드 데이터 원상 복구 확인.
- `npm run build`·`npm run dev`는 실행하지 않았다(17일차 운영 규칙, 팀장 전용).
