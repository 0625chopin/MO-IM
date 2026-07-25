# Task 036 · v0.2 통합 테스트 (CRUD·인증·RLS·E2E)

- **일자**: 2026-07-25 (21일차) · **정정 1차**: 2026-07-26 (CORE 교차검증 반영 — §0·§2.2·§2.4·
  §4.1·§6.2·§8·§9) · **정정 2차**: 2026-07-26 (CREW의 조건부 셀 전수점검 반영 — §2.4를
  "두 가지 서로 다른 원인"으로 재작성, §0 동기화) · **정정 3차**: 2026-07-26 (BOARD의
  self-service RLS 전수조사 I-091 반영 — §2.4에 3축 추가, §9에 `invitations` 미실측 인계)
- **담당**: DESIGN
- **의존**: Task 030(CREW)·032(DESIGN)·033(BOARD)·034(BOARD) 전부 완료 확인 후 착수
- **리뷰 짝**: CORE(A팀)

## 0. 요약

**21일차 CORE 교차검증 반영 후 정정판.** 초판은 "정적 대조(코드만 확인, SQL 미실행) 8건"을
전부 PASS로 집계했으나, CORE가 그중 4건을 실제 SQL로 재현해 **2건이 실제로 뚫려 있음**을
확인했다(I-085·I-086, MAJOR). 즉 **측정(RLS/E2E) 22건은 위반 0건**이지만, **정적 대조로만
표시한 8건은 검증이 아니라 미검증에 가까웠다** — 이 정정 자체가 이 문서의 가장 중요한 결론이다
(§2.2 결과표·요약, §2.4 교훈 참고).

권한 매트릭스(3.3절, 34개 액션 × 6역할)를 실 Supabase DB(RLS + 트리거)와 실 브라우저(Playwright,
`npm run dev` 및 `npm run build && npm start` 양쪽)로 검증했다. **측정한 22개 행은 매트릭스가
지켜지고 있음을 확인**했으나, **정적 대조에만 의존한 8개 행 중 2개는 앱 레이어만 막혀 있고
DB는 독립적으로 강제하지 않았다** — 신청자 본인이 직접 REST로 자기 가입 신청을 승인하거나
(I-085, 매트릭스는 단순 allow/deny 셀이었고 뚫린 지점은 self-service RLS가 전이 대상 상태값을
제한 안 한 것), 오너가 승계·해산 없이 자기 멤버십을 `left`로 바꿔 크루를 고아 상태로 만들
수 있었다(I-086, 매트릭스가 정확히 표현한 조건부 셀인데 그 조건을 DB 트리거가 안 봤다) —
**두 결함의 원인이 서로 다르다는 것 자체가 이번 문서의 정정 요지다**(§2.4, 21일차 CREW
전수점검 반영). **BOARD가 이어서 self-service RLS 정책을 스키마 전체로 전수 조사해 세
번째 축(강제 지점 자체가 없음, `docs/ISSUES.md` I-091)을 정식화했다** — `polls`(I-089,
CRITICAL)·`meetup_attendances`(I-090)가 여기 해당하고, 후자는 **권한 매트릭스 34행 어디에도
대응 행이 없어 이 문서가 애초에 선언한 검증 범위(§1.1) 밖**이었다(§2.4). 그 밖에 신규 결함
3건(I-081~I-083, 뒤 2건은 앱 결함이 아니라 프로세스 기록)을 남겼다. NFR-012·FR-011 E1·
FR-012 AC4가 요구하는 문자 그대로의
403/401 대신 HTTP 200으로 렌더되는 D-040의 부분 전환 지점들은 **승인된 편차로 재확인**한다
(§5). 테스트 러너 도입은 **이번 회차에 하지 않는다** — 근거는 §6(D-052, 21일차 CORE 지적으로
근거② 정정).

이번 회차는 BOARD의 Task 041(댓글·메시지 삭제·Meetup 취소)과 CREW의 Task 042B(관리자 콘솔)가
**같은 작업 트리에서 동시에, 커밋 전 상태로** 진행됐다. 그 결과 검증 도중 두 가지 성격이 다른
사건을 만났다 — ① 아직 배선이 끝나지 않은 파일(`ChatMessageListPreview.tsx`, 내가 소유하는
`/sample` 파일이라 직접 고쳤다, §3) ② dev 서버가 파일 트리 변경 중 라우트를 일시적으로
오응답한 것(재시작으로 100% 해소, I-083). 둘 다 **범위 밖 파일을 고치지 않았다**는 원칙은
지켰다.

## 1. 검증 범위

### 1.1 포함

- 권한 매트릭스 34개 액션 × 6역할(비회원/일반회원/크루원/임원/오너/관리자) — RLS·DB 트리거
  레벨 실측 + `lib/rules/permission.ts` 코드 대조 + 대표 시나리오 E2E.
- PRD §3 여정 A(가입→탐색→가입신청→승인)·B(개설→초대→임명)·C(제안→투표→가결→캘린더→참석) —
  가능한 범위에서 실 계정으로 실측.
- RLS: anon·authenticated-비소속·크루원·임원·오너·강퇴자(및 관리자, 부분) 6역할의 테이블 접근.
- D-040(라우트 레벨 권한 거부 HTTP 200)의 재확인.
- 테스트 기반(러너) 도입 여부 판단(I-071 연계).

### 1.2 명시적 범위 밖 (건드리지 않음)

- **BOARD의 Task 041**(댓글, 타인 메시지 삭제, Meetup 취소·일정변경) — 권한 매트릭스 34행에는
  "댓글 작성"·"타인 메시지 삭제" 2행이 이미 있지만, 이번 회차에 처음 구현되는 중이라 **검증
  대상에서 제외**했다(§2.2 표의 "미구현" 행 참고, 코드 존재 여부만 확인). Meetup 취소·변경
  (FR-065)도 동일.
- **CREW의 Task 042B**(관리자 콘솔 UI) — DB 레벨(`admin_resolve_report` RPC)은 우연히 검증 범위에
  들어왔다(§4.6). `/admin` 화면 자체의 E2E는 dev 서버 불안정(I-083)으로 미완료.
- **CORE의 I-073 수정**(Meetup 상세 404→403) — 검증 시점 동작만 관찰해 기록했다(§4.5). 코드는
  건드리지 않았다.
- 기존 시드 크루 archived 처리 — 하지 않았다. 여정 B 검증용 신규 크루만 만들었다(§7).

## 2. 권한 매트릭스 검증

### 2.1 방법론

3중으로 교차 확인했다.

1. **정적 대조** — `docs/requirements/requirements.md` 3.3절 표(34행, 각주 1~5) vs
   `src/lib/rules/permission.ts`의 `PERMISSION_MATRIX`(34개 액션, `UserRole` 6종 완전
   `Record` 타입이라 누락이 있으면 컴파일 에러). **한 칸씩 대조한 결과 표와 코드가 일치한다.**
   이 판정 함수가 서버 액션 23개(`grep -l checkPermission src/lib/actions`)에서 실제로
   호출되는 것도 확인했다(코드 인용, 예: `set-crew-member-role.ts`가 `crew:appoint_staff`를,
   `remove-crew-member.ts`가 `crew:remove_member`+`targetRole` 컨텍스트를 정확히 넘긴다).
2. **DB RLS·트리거 실측** — `execute_sql`로 `begin ... rollback` 단일 호출 안에서 anon/
   authenticated 역할을 `SET LOCAL ROLE` + `set_config('request.jwt.claims', ...)`로 바꿔가며
   대표 시나리오를 실행했다(§2.3). **트랜잭션은 매번 `rollback`으로 닫아 DB에 남기지 않았다**
   (예외: 여정 B 검증용으로 실제 UI를 통해 만든 크루 1개는 커밋됐다, §7).
3. **E2E** — `npm run dev`(포트 3221) + Playwright로 실 계정 2개(`chopin0625`/`chopin_0625`)를
   오가며 대표 행위를 직접 클릭·제출했다. `npm run build && npm start`(포트 3222)로도 핵심
   지점(D-040 200 확인)을 재확인했다.

### 2.2 결과표 (34개 액션)

범례: **RLS**=DB 레벨 실측, **E2E**=브라우저 실측, **코드**=정적 대조만, **미구현**=이번 회차
착수 전(Task 041/042B 진행 중), **미검증**=시도했으나 확정 못함.

| # | 액션 | FR | 검증 방식 | 결과 |
| --- | --- | --- | --- | --- |
| 1 | `profile:update_own` | FR-004 | RLS+E2E | PASS — 본인 행 UPDATE 허용, 타인 행 0행(RLS) |
| 2 | `profile:withdraw` | FR-005 | 코드 | PASS(코드 대조만 — 실제 탈퇴 플로우는 실계정 손상 우려로 미실행, **미검증**) |
| 3 | `search:by_handle` | FR-006 | E2E | PASS — 멤버 초대 다이얼로그의 핸들 검색이 실제로 동작(§4.2) |
| 4 | `crew:create` | FR-010 | E2E | PASS — 크루 개설 폼 제출 확인(§4.2) |
| 5 | `crew:browse` | FR-014 | RLS+E2E | PASS — anon 8 public, 비소속 8 public, 소속(전부) 13. `/crews` 목록 UI로도 재확인 |
| 6 | `crew:read` | FR-011 | RLS+E2E | PASS — public 크루 소개(anon)·private "초대 전용"(anon) 양쪽 확인(§4.4) |
| 7 | `crew:update_info` | FR-011 | RLS+E2E | PASS — member DENY(0행/forbidden 200), staff ALLOW |
| 8 | `crew:update_visibility` | FR-012 | RLS+E2E | PASS — RLS는 staff까지 coarse 허용하지만 **DB 트리거**(`crews_guard_owner_only_fields`류, "only the crew owner may change visibility, status, or owner_id")가 staff를 막는다. 앱 레이어(`checkPermission`)도 동일 — 2중 방어 확인 |
| 9 | `crew:disband` | FR-013 | 코드→**CORE SQL 재현** | PASS — CORE가 21일차에 `begin...rollback`으로 오너 아닌 계정의 `disband_crew` 호출을 재현해 거부 확인(`docs/ISSUES.md` I-085/I-086 인접 재검증, "T4" 표기) |
| 10 | `crew:invite_member` | FR-020 | RLS+E2E | PASS — member DENY, staff ALLOW. 실 UI로 핸들 검색→초대 발송까지 확인 |
| 11 | `invitation:respond` | FR-021 | E2E | PASS — 실 계정으로 초대 수락→즉시 크루원 전환 확인(§4.2) |
| 12 | `crew:request_join` | FR-022 | RLS | PASS — public 크루 ALLOW, private 크루 DENY(RLS) |
| 13 | `crew:approve_join_request` | FR-023 | 코드→**CORE SQL 재현** | **FAIL(MAJOR) — 초판의 "PASS" 정정.** `permission.ts` 매트릭스·앱 레이어(`checkPermission`)는 정확하지만 **DB(`join_requests_update_requester_or_staff` RLS)는 신청자 본인의 `status='approved'` 자가 UPDATE를 막지 않는다** — REST 직접 호출로 FR-023을 완전 우회해 즉시 크루원(active)이 된다. `docs/ISSUES.md` **I-085**(CORE, 21일차), 수정은 CREW 배정. 초판이 "정적 대조만으로 PASS"라 쓴 것 자체가 이번 문서의 핵심 정정 대상이다(§2.4) |
| 14 | `crew:appoint_staff` | FR-024 | RLS+E2E | PASS — RLS는 self-row 수정을 허용하지만(coarse) **DB 트리거**(`crew_memberships_guard_self_transition`)가 "members cannot change their own crew role"로 자가 승격을 막는다. 실 UI로 오너가 일반 크루원을 임원으로 임명하는 것도 확인(§4.2) |
| 15 | `crew:transfer_ownership` | FR-025 | 코드→**CORE SQL 재현** | PASS — CORE가 21일차에 오너 이양 관련 제약을 SQL로 재현해 매트릭스대로 동작함을 확인("T2" 표기, I-086 인접 재검증) |
| 16 | `crew:leave` | FR-026 | 코드→**CORE SQL 재현** | **FAIL(MAJOR) — 초판의 "PASS" 정정.** 매트릭스·`leave-crew.ts`(앱 레이어, `hasOwnerSuccessorOrDisband: false` 하드코딩)는 정확히 오너를 막지만, **`crew_memberships_guard_self_transition` 트리거의 self-service 분기는 role과 무관하게 `active→left` 전이를 무조건 허용한다** — 오너가 이양·해산 없이 REST로 직접 자기 멤버십을 `left`로 바꾸면 `owner_id`는 남고 활성 오너 멤버십이 없는 고아 크루가 된다. 같은 조건부 각주(hasOwnerSuccessorOrDisband)를 공유하는 `profile:withdraw`(#2)는 `request_account_deactivation` RPC가 DB에서 정확히 막는 것과 대조적이다. `docs/ISSUES.md` **I-086**(CORE, 21일차), 수정은 CREW 배정 |
| 17 | `crew:remove_member` | FR-027 | RLS+E2E(간접) | PASS — RLS+트리거로 "임원은 일반 크루원만 강퇴 가능"(각주⁴), "오너 행은 강퇴 경로로 못 건드림" 확인. 실 UI 클릭까지는 안 했다(**부분 미검증**) |
| 18 | `board:read` | FR-031 | RLS+E2E | PASS — anon 전체 DENY(공개 크루라도), 비소속 DENY, 소속 ALLOW |
| 19 | `post:create` | FR-030 | RLS | PASS — 비소속 DENY, 소속 ALLOW |
| 20 | `post:update_own` | FR-032 | RLS | PASS — 타인 글 수정 0행(RLS) |
| 21 | `post:delete_own` | FR-032 | 코드 | PASS(코드 대조 — soft-delete만 실측, own 삭제는 **미실행**) |
| 22 | `post:delete_any` | FR-032 | RLS | PASS — staff가 타인 게시글 soft-delete(`deleted_at`) ALLOW. **단, 본문·제목 직접 수정은 DB 트리거(`posts_guard_non_author_delete_only`)가 별도로 막는다** — "only the author may edit post content; others may only soft-delete", 매트릭스가 "삭제"만 허용하고 "수정"은 언급하지 않는 것과 정확히 일치 |
| 23 | `comment:create` | FR-033 | **미구현** | Task 041 진행 중(BOARD, 이번 회차) — 검증 대상 아님. 관련 코드(`create-comment.ts`)는 존재하나 UI 배선(`board/[postId]/page.tsx`)이 미완이라 이번 세션 중 해당 라우트가 일시 404였다 |
| 24 | `poll:create_proposal` | FR-034 | 코드 | PASS(코드 대조만, INSERT RLS `polls_insert_proposal_author` 확인 — **미실행**) |
| 25 | `poll:vote` | FR-041 | RLS | PASS — 적격 투표자 ALLOW(기존 seed 투표와 PK 충돌로 간접 확인), 비적격 DENY(RLS) |
| 26 | `poll:close_early` | FR-043 | 코드 | PASS(코드 대조만, 제안자 본인 각주⁵ — **미실행**) |
| 27 | `chat:send_message` | FR-051 | RLS | PASS — 비소속 DENY, 소속 ALLOW, anon DENY |
| 28 | `chat:delete_own_message` | FR-054 | **미구현** | Task 041 진행 중 — RLS 정책(`chat_messages_update_self_or_staff_delete`)은 이미 있으나 UI/액션 없음 |
| 29 | `chat:delete_any_message` | FR-054 | **미구현** | 위와 동일 |
| 30 | `calendar:view` | FR-061 | E2E | PASS — 로그인 사용자 캘린더 페이지 정상 로드(콘솔 오류 0건) |
| 31 | `meetup:cancel_or_update` | FR-065 | **미구현** | Task 041 진행 중(취소는 `cancel-meetup.ts` 존재, D-051) — 검증 대상 아님 |
| 32 | `report:create` | FR-080 | RLS | PASS — 일반회원 ALLOW, anon DENY |
| 33 | `block:create` | FR-081 | RLS | PASS — 일반회원 ALLOW |
| 34 | `report:handle` | FR-082 | **RLS(신규 확보)** | PASS — `admin_resolve_report` SECURITY DEFINER RPC를 `is_system_admin=true` 계정으로 호출 시 성공(`{ok:true,status:'dismissed'}`), 비관리자 계정으로 호출 시 `{ok:false,reason_code:'forbidden'}`. **CREW의 Task 042B가 이번 회차에 착수해 이 열을 처음으로 검증 가능하게 만들었다** — 착수 전 가정("관리자 세션 자체가 없어 전 열 미검증")은 회차 중간에 갱신됐다 |

**요약(21일차 CORE 교차검증 반영, 정정판)**: 34개 액션 = **측정(RLS/E2E) 22건 + 정적 대조
(코드만) 8건 + 미구현 4건**.

- **측정 22건 — 위반 0건.** RLS·DB 트리거·브라우저로 직접 실측(또는 강한 간접 실측)한 행은
  전부 매트릭스대로 동작했다.
- **정적 대조 8건 — CORE가 4건을 SQL로 재현, 그중 2건이 MAJOR로 확인됨.** #9(disband)·
  #15(transfer_ownership)는 PASS. **#13(approve_join_request)·#16(leave, 오너 조건부)은
  FAIL** — `docs/ISSUES.md` **I-085**·**I-086**(둘 다 CORE 제보, 21일차, 수정은 CREW
  배정). 나머지 4건(#2 profile:withdraw, #21 post:delete_own 본인 삭제, #24
  poll:create_proposal, #26 poll:close_early)은 이번 회차에도 SQL로 재현되지 않아 **여전히
  미검증**이다 — "코드가 맞다"가 "DB가 강제한다"를 함의하지 않는다는 것이 이번 정정의
  요지이므로, 이 4건을 PASS로 세지 않는다. 이 중 `permission.ts`의 `Allowance`가
  `conditional`인 것은 **#2·#26 둘뿐**이다(§2.4 기준으로 다음 SQL 재검증 우선순위가 더
  높다) — #21은 own-scope 자기소유 확인, #24는 단순 allow/deny라 상대적으로 위험이 낮다.
- **미구현 4건**(comment:create, chat:delete_own/any_message, meetup:cancel_or_update —
  Task 041 진행 중이라 검증 대상 아님, 34개 카운트에는 포함하되 실패로 세지 않음).

**초판의 "매트릭스가 틀렸거나 뚫린 행은 발견하지 못했다"는 결론은 정확하지 않았다** — 정적
대조만으로 PASS 처리한 8건 중 2건이 실제로는 뚫려 있었다(§2.4).

### 2.3 RLS·트리거 실측 방법 (재현 절차)

`begin` 안에서 `create temp table`로 결과를 모으고, 매 시나리오 앞에 `set local role
{anon|authenticated}` + `select set_config('request.jwt.claims', json_build_object('sub',
'<profile-uuid>','role','authenticated')::text, true)`로 신원을 바꿨다. 세션 자체(`postgres`,
`rolbypassrls=true`)로 되돌아갈 때는 `reset role` 하나로 충분했다(RLS 정책 우회) — **단,
`crew_memberships_guard_self_transition` 같은 일반 트리거는 `rolbypassrls`와 무관하게
`auth.uid()`(잔존한 `request.jwt.claims`)를 그대로 읽으므로, admin 세션으로 되돌아가려면
`set_config('request.jwt.claims','',true)`도 함께 초기화해야 한다** — 이 실수로 최초 1차
시도가 "removed→active 자가 전이" 트리거 예외로 막혔었다(3.4절 상태도가 사람이 아니라 오너만
허용하는 전이라 트리거가 정확히 의도대로 막은 것 — 테스트 스크립트 버그였지 앱 결함이 아니다).

INSERT 테스트는 `DO $$ BEGIN ... EXCEPTION WHEN OTHERS THEN ... END $$;`로 감싸 RLS 위반이나
트리거 예외가 트랜잭션 전체를 중단시키지 않게 했다. UPDATE 테스트는 `GET DIAGNOSTICS rc =
ROW_COUNT`로 "0행(RLS가 조용히 거름)"과 "행 있음(허용)"을 구분했다.

**시행착오 셋을 정직하게 남긴다** — ① `poll_votes.choice` 체크 제약이 `for`/`against`/`abstain`
인데 처음에 `approve`를 써서 오탐(테스트 스크립트 버그, RLS와 무관), ② `join_requests.status`
기본값이 `pending`인데 `requested`를 써서 오탐, ③ `crew_memberships`의 "REMOVED 강퇴자" 시나리오를
직접 UPDATE로 만들려다 트리거에 막혀, **정상적인 "임원이 크루원을 강퇴"** 시나리오(§2.2 #17)가
만든 진짜 removed 상태를 재사용하는 것으로 바꿨다. 셋 다 스크립트를 고쳐 재실행해 최종 결과에는
반영됐다.

### 2.4 교훈 — 정적 대조가 실패하는 세 가지 서로 다른 이유, 그리고 이 방법론의 한계(21일차 CREW 전수점검 + BOARD의 I-091 정식화 반영, 정정 3차)

**정정 경위**: 이 절의 초판은 I-085·I-086을 하나로 묶어 "정적 대조는 조건부(conditional)
셀에서 실패한다"고 썼다. CREW가 I-085·I-086을 고치면서 `PERMISSION_MATRIX`의
`Allowance="conditional"` 셀을 전수 확인한 결과(`resolveConditional`의 switch case와 1:1인
**7개 액션 — `profile:withdraw`·`crew:leave`·`crew:remove_member`·`poll:close_early`·
`meetup:cancel_or_update`·`crew:browse`·`crew:read`**, 그중 `profile:withdraw`는
`crew_member`·`crew_staff`·`crew_owner` 3역할 모두가 `conditional`이라 셀 단위로 세면
**총 9개 셀**이다 — CREW의 최초 보고는 이 수치를 "6개"로 잘못 셌다가 BOARD가 21일차 재검증
중 직접 세어 정정했다), **`crew:approve_join_request`(I-085)는 이 목록에 없다** —
`src/lib/rules/permission.ts:166-173`을 직접 다시 읽어 확인했다: `guest/member/crew_member:
deny, crew_staff/crew_owner: allow`인 **단순 allow/deny 셀**이다. 조건부 셀 9개(7개 액션)
중 실제로 DB 미강제였던 것은 `crew:leave`(오너 조건부, I-086) 하나뿐이었다 — 셀 수 정정은
이 결론 자체를 바꾸지 않는다. **초판의 패턴 서술은 I-086만 설명하고 I-085는 설명하지 못한다**
— 아래로 정정한다.

**두 결함의 원인은 서로 다르다.**

- **I-086(`crew:leave`, 조건부 셀)** — 매트릭스가 `conditional`로 정확히 표현한 셀인데,
  그 조건("승계자·해산 선행")을 **DB가 아예 안 봤다.** `crew_memberships_guard_self_
  transition` 트리거의 self-service 분기가 "role 변경 금지"는 검사하면서 "오너인 채로
  active→left 전이"는 검사하지 않았다. **1축: 조건부 셀에서 "그 조건"을 DB(트리거)가
  독립적으로 재현하는지.**
- **I-085(`crew:approve_join_request`, 단순 allow/deny 셀)** — 매트릭스도 정확했고(staff/
  owner만 allow), `checkPermission` 호출부도 정확했다. 뚫린 지점은 **전혀 다른 곳**이다 —
  `join_requests_update_requester_or_staff` RLS의 `with_check`가 "신청자 본인(self-service)"
  분기를 허용하면서 **어떤 `status` 값으로 전이하는지는 제한하지 않았다**(자진 철회
  `withdrawn`만 허용했어야 하는데 `approved`/`rejected`까지 통과시켰다). CREW의 실제 수정도
  이걸 증명한다 — `with_check`를 `(requester_id=self AND status='withdrawn') OR (staff/
  owner)`로 좁힌 것이지(21일차 DB 재조회로 직접 확인, `join_requests_update_requester_or_
  staff` 정책 현재 정의), 조건부 판정 로직을 새로 추가한 게 아니다. **2축: self-service
  (본인 행) 쓰기를 허용하는 RLS 정책이 있다면, 그 정책이 "어떤 컬럼값으로의 전이까지"
  허용하는지.**

**세 번째 축 — self-service write에 강제 지점이 아예 없음(I-089·I-090, BOARD의 I-091
정식화).** BOARD가 self-service(행 소유권 = `auth.uid()`) RLS 분기를 가진 테이블 14개를
전수 조사했다(`docs/ISSUES.md` **I-091**, 표는 거기가 SSOT — 여기서 복제하지 않는다).
결론만 요약한다: 컬럼값 제한 지점이 **RLS `WITH CHECK` 자체·별도 BEFORE 트리거·둘 다 없음**
셋 중 하나이며, `polls`(I-089, CRITICAL — AFTER 트리거로 `meetups`까지 캐스케이드)와
`meetup_attendances`(I-090, 이번 회차 §4.6 인접 재검증 — 내가 진짜 동시 HTTP 요청으로
D-019 원자성까지 재확인했다)가 "강제 전무"였다가 이번 회차에 고쳐졌다. **이 축이 1·2축과
근본적으로 다른 점**: `crew:approve_join_request`(I-085, 2축)는 매트릭스에 액션 자체가
있었지만, **`meetup_attendances`(I-090, 3축)는 권한 매트릭스 34행 어디에도 대응 액션이
없다** — FR-066 참석/불참은 매트릭스 표에 실리지 않았고 순전히 `lib/rules`·RPC 레벨
규칙이다. `polls`(I-089)도 마찬가지로 매트릭스 행이 아니다(투표 자체의 조작이 아니라
"판정 결과" 컬럼의 self-service 위조였다).

**이 방법론의 한계(반드시 밝힌다)**: 이 문서(§1.1)는 검증 범위를 "권한 매트릭스 34개
액션×6역할"로 선언했다. **1·2축은 이 범위 안에서 발견됐지만, 3축 중 매트릭스에 대응 행이
없는 사례(`meetup_attendances`)는 이 범위를 애초에 벗어나 있어 매트릭스를 아무리 촘촘히
전수 검증해도 원리적으로 발견할 수 없다** — 이번 회차에 실제로 그렇게 됐다(§2.2가 34행을
전부 훑었어도 `meetup_attendances`는 표에 없어 못 걸렸고, I-090은 BOARD가 매트릭스 밖에서
self-service 정책을 따로 훑다가 찾았다). **다음 회차가 "매트릭스 34(37)행 다 봤으니 권한
검증은 끝났다"고 넘어가면 안 된다** — I-091 후속②가 제안한 대로 "self-service RLS write
정책 전수 + 그 위 트리거 유무" 조사를 매트릭스 검증과 **별개의 체크리스트 항목**으로
Task 036류 통합 테스트에 고정해야 한다.

**세 축을 함께 써야 한다** — 하나만 뒤지면 나머지를 놓친다:

- **1축(조건부 셀)**: "코드 대조만"으로 표시된 행이 `PERMISSION_MATRIX`에서
  `conditional`인가? 맞으면 그 조건(각주)을 DB(트리거·RLS)가 독립적으로 재현하는지 SQL로
  확인한다. 남은 미검증 행 중 `#2 profile:withdraw`·`#26 poll:close_early`가 여기 해당한다
  (§2.2 요약).
- **2축(self-service RLS 범위)**: 그 액션이 매트릭스에 있고 "본인 소유 행"에 대한 UPDATE를
  다루는가? 있다면 그 분기의 `with_check`가 **상태값·컬럼값까지 제한**하는지 확인한다.
- **3축(self-service write에 강제 지점 자체가 있는가, 매트릭스 밖 포함)**: `information_
  schema.role_table_grants`·`pg_policies`(전체 커맨드)·`pg_trigger`를 **스키마 전체**로
  훑어 self-service 분기가 있는 모든 테이블(매트릭스에 대응 행이 없어도)을 찾고, 그중
  강제 지점이 없는 것을 우선순위(다운스트림 트리거 캐스케이드 유무, I-091 심각도 기준)로
  가려낸다. 상세 절차·표는 `docs/ISSUES.md` I-091.

**바뀌지 않은 결론**: 정적 대조(매트릭스 vs `checkPermission` 코드)만으로는 DB가 실제로
강제하는지 알 수 없다는 원래 결론은 그대로 맞다 — 이번 정정은 그 결론을 뒤집는 게 아니라
"어디를 뒤져야 하는가"의 범위를 1축에서 1축+2축+3축으로, 그리고 **매트릭스 안에서
매트릭스 밖까지**로 넓힌 것이다.

## 3. 빌드 상태와 `ChatMessageListPreview.tsx` 수정

착수 시점 `npm run build`가 **실패**했다 — `ChatMessageListPreview.tsx`(내 소유 `/sample` 파일)가
`MessageList`의 신규 필수 prop `onDelete`·`canDeleteAnyMessage`(Task 041, BOARD의 동시 작업)를
넘기지 않았다. `MessageList.tsx` 자체는 BOARD 소관이라 손대지 않고, **내 파일에서 기존
`onLoadMore`/`onRetry`와 같은 no-op 패턴으로 두 prop을 추가**했다(docstring에 근거 기록).
이후 재확인 시 `npm run build`는 **통과했다**(CREW가 `admin.ts` 타입 오류를 그 사이 고친 것으로
보인다 — 내가 고치지 않았다).

## 4. 여정 A·B·C 실측 로그

### 4.1 여정 A — 신규 가입 → 크루 탐색 → 가입 신청 → 승인

- **회원가입(FR-001)**: **미실행**. CLAUDE.md 지침("테스트 계정이 더 필요하면 회원가입 폼을
  쓰지 말고 Admin REST 방식을 쓴다")에 따라 `/signup` 폼으로 새 계정을 만들지 않았다. 기존
  2계정으로는 이미 온보딩이 끝나 있어 이 구간을 재현할 수 없다 — **정직하게 미확인으로
  남긴다.**
- **로그인(FR-002)**: PASS — `/login?redirect=%2Fhome` → 로그인 → `/home`으로 정확히 복귀
  (AC3). 비로그인 상태에서 `/`가 `/login?redirect=%2Fhome`으로 리다이렉트되는 것도 확인.
- **크루 탐색(FR-014)**: PASS — `/crews`에서 chopin_0625(사설 크루 미소속) 기준 8개 public
  크루만 노출, chopin0625(사설 크루 다수 소속) 기준 13개 전부 노출.
- **가입 신청(FR-022)**: RLS로만 확인(§2.2 #12) — public 크루 ALLOW, private 크루 DENY. UI
  클릭까지는 안 함(**부분 미검증**).
- **승인(FR-023)**: 초판은 "코드 대조만(미검증)"으로 적었으나 **CORE의 21일차 SQL 재현으로
  FAIL(MAJOR) 확인** — 신청자 본인이 REST 직접 호출로 자기 신청을 `status='approved'`로
  바꿔 임원 승인 없이 크루원이 될 수 있다. §2.2 #13, `docs/ISSUES.md` **I-085** 참고.

### 4.2 여정 B — 크루 개설 → 크루원 초대 → 임원 임명 (전 구간 실 UI로 완주)

1. `/crews/new` 폼 — 크루명·소개·카테고리·공개범위 4필드만 있고 **색 입력란이 없음**을
   확인(D-016 일치).
2. 제출 → `/crews/729ced18-...`로 즉시 이동(D-008, 승인 대기 없음). "게시판"·"채팅" 탭 클릭 시
   각각 빈 상태 UI("아직 등록된 글이 없어요" + 글쓰기 버튼) 확인 — **FR-010 AC2 PASS**.
3. 멤버 관리 → "크루원 초대" → 핸들 `chopin0625` 검색 → 결과 카드(표시 이름·핸들·아바타 이니셜)
   → "초대 보내기" → "초대를 보냈어요"(disabled) 확인 — **FR-006 AC1, FR-020 PASS**.
4. 로그아웃 → chopin0625로 로그인 → `/invitations`에서 초대 확인("Task036 검증용 테스트
   크루", "테스트계정2님이 초대했어요", 만료일 표시) → "수락" 클릭 → 크루 홈으로 즉시 이동,
   "크루원 2명"으로 갱신 — **FR-021 PASS**.
5. 로그아웃 → chopin_0625(오너)로 재로그인 → 멤버 관리에서 chopin0625가 "크루원" 역할로 표시,
   "임원으로 임명" 클릭 → 즉시 "임원"으로 갱신, 버튼이 "임원 해임"으로 전환 — **FR-024 PASS**.

여정 B는 예외 흐름(거절, 재초대, 강퇴, 오너 이양)까지는 다루지 않았다(**부분 미검증**).

### 4.3 여정 C — 모임 제안 → 투표 → 가결 → 캘린더 → 참석 신청

- **글쓰기(모임 제안, FR-034)**: **미실행** — `/crews/[crewId]/board/new` UI 클릭까지는
  안 함(RLS INSERT만 §2.2 #24 확인).
- **투표(FR-041)**: RLS로만 확인(§2.2 #25).
- **판정·Meetup 생성(FR-043·FR-060)**: 이미 seed 데이터로 가결된 Meetup이 존재해 이 파이프라인
  자체(Task 034 소관)는 재실행하지 않고 **결과물**(Meetup 상세 화면)만 확인.
- **캘린더(FR-031·FR-032)**: PASS — `/calendar` 정상 로드(콘솔 오류 0건). 크루 색 바·날짜
  클릭 상세는 스크린샷 수준 확인은 안 함(**부분 미검증**).
- **Meetup 상세(FR-064)**: PASS — `/meetups/[meetupId]`에서 제목·일시·장소·정원·투표 결과 요약
  ("찬성 3표·반대 0표·기권 0표")·참석자 3구분 목록(참석/불참/미응답) 전부 정상 렌더.
- **참석 신청(FR-066·067)**: 이미 "참석"으로 응답된 상태라 "불참으로 변경" 버튼만 확인,
  상태 전환 클릭은 안 함(RLS INSERT/UPDATE는 §2.2 #12·36에서 별도 확인).

### 4.4 D-007/FR-012 실측 (여정 A·B와 겹치는 비회원 경로)

- **public 크루, anon**: 크루명·소개·"크루원 N명"(주의: 이 값이 §I-081 결함으로 항상 0으로
  보임)·"가입하고 참여하기" 버튼만 노출, 게시판/채팅/멤버 목록 없음 — **AC3 텍스트 노출은
  PASS, 멤버 수 값은 FAIL(I-081)**.
- **private 크루, anon**: 크루명 + "초대 전용 크루예요" 안내만, 설명·멤버 수 전부 비노출 —
  **AC2 PASS**(원문 "이름 + 초대 전용 안내뿐"과 정확히 일치, 소개조차 안 보임).

### 4.5 I-073(Meetup 상세 403 아닌 404) 관찰 — CORE 진행 중, 수정하지 않음

비소속 계정(chopin_0625)으로 `강아지산책모임` 소속 Meetup 상세에 직접 접근하니 **"접근
권한이 없어요"(forbidden, HTTP 200)** 가 렌더됐다 — 20일차 I-073이 보고한 "404"가 아니었다.
`docs/prioritization-and-risks.md` D-048("`getCrewById`와 같은 0행→private 최소정보 RPC
폴백 패턴으로 403(forbidden)에 도달시킨다")이 이번 회차 CORE가 이미 착수한 결정이고, 관찰
결과가 그 결정과 일치한다. **수정은 CORE 소관이라 코드는 보지 않았다** — 검증 시점 동작만
기록한다.

### 4.6 D-040 재확인 — `npm start` 프로덕션 빌드에서 실측

`/crews/f202047b-.../settings`(chopin_0625, 일반 크루원)를 **`npm start`로 띄운 프로덕션
서버(포트 3222)**에서 직접 접근 → 화면은 "접근 권한이 없어요", 네트워크 탭 확인 결과
**`POST .../settings => [200] OK`**. 20일차 문서(D-040)가 dev 서버 실측으로 남긴 결론을
**프로덕션 빌드로 재확인**했다 — §5에서 이 사실을 근거로 최종 판정한다.

## 5. NFR-012 · FR-011 E1 · FR-012 AC4 판정

**결론: 승인된 편차(approved deviation)로 재확인한다. "실패"로 새로 분류하지 않는다.**

근거:

1. **이미 팀장이 승인한 결정이다** — D-040은 2026-07-24(20일차)에 "사용자 확인 완료"로
   부분 전환(ⓒ안)을 채택했고, 그 결정문 자체가 "이 셋(NFR-012·FR-011 E1·FR-012 AC4)은 200을
   허용하지 않는다"·"문자 그대로 403을 내려면 `forbidden()`이 필요한데 여전히 experimental/
   canary라 보류했다 — 문구 정확성과 상태 코드 정확성 중 전자를 택했다는 뜻이다. 사용자가
   승인한 방향이라 되돌리지 않는다"고 **스스로 트레이드오프를 인정**하고 있다. Task 036의
   역할은 이 결정을 다시 뒤집는 것이 아니라 **여전히 유효한지, 그리고 실제로 그렇게
   동작하는지**를 확인하는 것이다.
2. **여전히 유효하다** — `forbidden()`/`unauthorized()`는 이번 세션에서 다시 확인하지
   않았지만(Next.js 버전이 20일차와 동일, 16.2.11), D-040이 "Task 029A·031 착수 전에 재확인"
   하라고 못박은 시점은 이미 지났고 재확인 책임은 D-040 자체가 "다음 이 throw 지점을 만지는
   사람"에게 넘겼다 — 이번 회차에 그 지점을 만진 사람(BOARD·CREW)이 있었는지는 §2.2 #23·28·29·31의
   "미구현" 표시가 답한다: **아직 아무도 새 throw 지점을 추가하지 않았다**(Task 041이 만드는
   것은 새 기능이지 기존 forbidden 패턴 재검토가 아니다).
3. **실측으로 재확인했다** — §4.6에서 프로덕션 빌드로 직접 200을 확인했다. dev 서버 실측에
   그쳤던 20일차보다 근거가 강해졌다.
4. **매트릭스 위반은 아니다** — 이 세 요구사항이 요구하는 "403"이라는 **상태 코드**는 여전히
   충족하지 못하지만, 매트릭스가 요구하는 **판정 결과**(누가 볼 수 있고 없는지)는 정확하다.
   화면·기능 수준에서는 요구사항을 만족한다.

**남는 것**: I-044(원 이슈)는 계속 "열림"으로 둔다. 상태 코드 자체를 고치는 일은 이번 회차
범위 밖이며, `forbidden()`/`unauthorized()`가 stable로 승격되는 시점에 재검토한다는 D-040의
방침을 그대로 유지한다.

## 6. 테스트 기반(러너) 도입 판단 — I-071 연계

**결론: 이번 회차에는 도입하지 않는다.** 아래는 판단 근거다.

### 6.1 도입에 유리한 신호

- I-071(투표 판정 공식이 TS·SQL 두 곳에 존재)이 구체적이고 재현 가능한 이중화 위험을 이미
  지목했다 — "TS 판정 함수와 SQL 판정 함수가 같은 입력에 같은 결과를 내는가"를 비교하는 계약
  테스트는 순수 함수 대 순수 함수(DB 붙일 필요 없음) 비교라 도입 비용이 낮다.
- `permission.ts`의 34×6 매트릭스는 이미 TypeScript의 완전성 검사(누락 시 컴파일 에러)로
  "정적 테스트"를 갖고 있다 — 이 패턴이 이미 검증됐으므로 `quorum.ts`·`poll-decision.ts`에
  같은 종류의 안전망(런타임 값 비교)을 추가하는 것이 자연스러운 다음 단계다.
- R-002(테스트 러너 부재)가 애초에 "컴포넌트가 늘기 전에 도입 여부를 D-\*로 결정한다"고
  대응 방침을 정해 뒀다 — 컴포넌트는 이미 늘어난 지 오래고, 이번이 사실상 마지막 결정 시점이다
  (다음 Task가 045 하나뿐, `docs/ROADMAP/team/02.DESIGN.md` 주차별 일정 참고).

### 6.2 도입을 미루는 근거

1. **지금이 최악의 타이밍이다** — 이번 회차 진행 중 `npm run build`가 최소 2회 실패 상태를
   오갔고(§3), 크루 스코프 라우트 전체가 dev 서버에서 일시적으로 404를 반환했다(I-083). 세
   팀원이 동시에 커밋 전 상태로 같은 파일 트리를 바꾸는 중에 새 도구(`vitest` 등)를 얹으면,
   그 도구의 초기 실패가 "내가 방금 도입해서 생긴 문제"인지 "동시 작업 중이라 생긴 문제"인지
   구분하기 어려워진다 — 이번 회차 자체가 그 구분이 얼마나 비용이 큰지 보여줬다.
2. **(21일차 CORE 지적으로 정정 — 원 근거 삭제) I-071은 정적 검사로 대체할 수 없다는 것이
   오히려 도입 필요성의 근거다.** 원래 이 자리에는 "TS·SQL 양쪽 모두 이번 회차에 안 바뀌어
   위험이 현실화되지 않았다"고 적었으나, 이건 **"안 터졌다"를 "안전하다"의 근거로 쓴 논리적
   오류**라 삭제한다. 대신 CORE의 판단을 남긴다 — "I-071을 I-074식 정적 검사(ESLint import
   구조 분석)로 막을 수 있는가"는 **불가능**하다. I-074는 "이 이름을 이 파일들 밖에서
   import하는가"라는 **구문** 문제라 정적 분석으로 충분했지만, I-071은 "TS 함수와 SQL 함수가
   같은 입력에 같은 출력을 내는가"라는 **의미** 문제라 반드시 실행·비교해야 한다 — 종류가
   다른 문제다. 이 사실 자체는 "도입을 늦춰도 된다"가 아니라 "정적 검사를 더 늘리는 것으로는
   이 위험을 절대 못 잡는다, 러너(또는 그에 준하는 실행 기반 검증) 없이는 원천적으로 불가능"
   이라는 뜻이라 오히려 미루는 쪽 근거로는 약하다 — 그래도 ①③④가 이번 회차엔 충분히
   방어한다고 판단해 결론(미도입)은 유지한다(`docs/prioritization-and-risks.md` D-052 근거②
   정정과 동일).
3. **남은 개발 여력이 크지 않다** — `docs/ROADMAP/team/02.DESIGN.md`상 이번 Task 036 이후
   남은 것은 Task 045(관측·브라우저 지원) 하나뿐이다. 테스트 러너를 "최소 규모"로 들여도
   후속 확장(커버리지 확대, CI 연동)을 담당할 다음 라운드가 실질적으로 없다 — 도입만 하고
   못 키우는 도구는 "도구가 있다"는 착시만 남긴다.
4. **34×6 매트릭스는 이미 검증됐다** — 이번 회차의 실측(§2)이 매트릭스 자체의 정합성을
   DB·브라우저 레벨로 다시 확인했으므로, "테스트 러너가 없어서 권한 회귀를 못 잡는다"는
   R-002의 원 우려가 **이번 한 번은** 수동 통합 테스트로 상쇄됐다 — 단, 그 실측 과정 자체가
   "정적 대조만"으로는 부족함을 스스로 증명했다(I-085·I-086, §2.4). 이 발견은 "러너가
   필요하다"의 근거가 아니다 — I-085·I-086은 RLS·트리거 레벨 결함이라 vitest 단위 테스트로는
   애초에 못 잡고, §2.4가 남긴 "조건부 셀·self-service RLS 범위는 SQL로 재현한다"는 수동
   규율의 영역이다.

### 6.3 대신 남기는 것 (다음 회차를 위한 최소 스펙)

도입하게 되면 이렇게 시작할 것을 권한다 — I-071에 그대로 반영해 뒀다.

- **범위**: `src/lib/rules/quorum.ts`·`poll-decision.ts`·`poll-eligibility.ts` 세 파일의
  순수 함수만. Zone 1(React/Next/데이터 레이어 import 금지) 규칙과 자연히 맞는다 — DB 연결
  없이 순수 입출력만 테스트하면 된다.
- **비교 대상**: `supabase/migrations/`의 `run_poll_auto_close_job` SQL이 인코딩한 같은
  공식을 골든 케이스(대상자 수·투표 분포 조합 10~15개)로 뽑아 TS 함수 결과와 나란히 표로
  적어 둔다 — SQL을 직접 실행하는 통합 테스트가 아니라, "이 SQL이 이렇게 계산한다"는 것을
  사람이 한 번 확인해 TS 쪽 fixture로 박아 두는 방식이면 DB 의존성 없이 시작할 수 있다.
- **도구**: `vitest`(Next.js 공식 예제와 가장 마찰이 적음) — `npm run test` 스크립트 하나,
  CI 연동은 이번엔 하지 않는다(R-002는 "테스트 러너·포매터·CI"를 함께 묶지만, 러너 도입과
  CI 연동은 분리 가능한 결정이다).

## 7. DB 잔존물 (전부 보고)

- **신규 테스트 크루**: `729ced18-2016-459a-94c3-e7959dfe808c`("Task036 검증용 테스트 크루",
  public, 스터디, 상태 `active`). 멤버: `chopin_0625`(fb70ff1c..., 오너) · `chopin0625`
  (30f44dd9..., 임원). **archived 처리하지 않았다** — CORE의 `crews_guard_archived_immutable`
  트리거가 archived를 종착 상태로 만들어 되돌릴 수 없다는 경고(팀장 지시)를 따라 해산 테스트
  자체를 하지 않았다. 필요하면 다음 회차에 이 크루로 해산 테스트를 이어갈 수 있다.
- **초대 1건**: 위 크루에 대한 `chopin_0625→chopin0625` 초대, 상태 `accepted`(수락 완료 상태로
  DB에 남음 — 정상 흐름의 결과물).
- **기존 시드 크루·계정**: 전혀 archived·삭제하지 않았다. RLS 테스트용 INSERT/UPDATE는 전부
  `begin...rollback` 안에서 실행해 **DB에 남지 않았다**(§2.3). 유일한 예외는 seed 데이터에
  이미 존재하던 투표(§2.2 #25, PK 충돌로 "이미 투표했음"을 확인한 것 — 새로 쓴 것 없음).
- **코드 변경**: `src/components/sample/sections/ChatMessageListPreview.tsx`(§3, 내 소유
  `/sample` 파일, 빌드 오류 수정).

## 8. 미충족·미검증 항목 목록 (정직하게)

| 항목 | 상태 | 사유 |
| --- | --- | --- |
| FR-012 AC3(공개 크루 멤버 수 노출) | **FAIL** | I-081, `CrewHomeContainer.tsx:69` |
| FR-014(`/crews` 목록 카드 멤버 수) | **FAIL(확인됨)** | 21일차 CORE 추가 실측 — `fetch-crew-cards.ts:33-35`도 같은 `listCrewMembers` 패턴, I-081에 통합 등재. 더 이상 미확인 아님 |
| FR-023(가입 신청 승인) | **FAIL(MAJOR)** | I-085, §2.2 #13 — 신청자 본인이 REST로 자기 신청 승인 가능(CORE SQL 재현) |
| FR-026(크루 탈퇴, 오너 조건부)/FR-005 AC1 인접 | **FAIL(MAJOR)** | I-086, §2.2 #16 — 오너가 승계·해산 없이 자기 멤버십을 `left`로 전이해 고아 크루 생성 가능(CORE SQL 재현) |
| 오너 이양(FR-025)·크루 해산(FR-013) | **PASS(확인됨)** | 21일차 CORE SQL 재현("T2"·"T4") — §2.2 #15·#9. 더 이상 미확인 아님 |
| NFR-012·FR-011 E1·FR-012 AC4(문자 그대로의 403) | 승인된 편차 | §5 |
| 회원가입(FR-001) 실측 | 미확인 | 신규 계정 생성 금지 지침 |
| 강퇴(FR-027) UI 클릭 | 부분 미확인 | RLS+트리거는 §2.2 #17에서 실측 완료, 실 UI 클릭만 안 함 |
| 위 FR-023·FR-025·FR-026·FR-013의 실 UI 클릭 | 미확인 | CORE 검증은 전부 SQL 레벨. Server Action·화면까지 거친 E2E는 다음 회차 과제 |
| 댓글·메시지 삭제·Meetup 취소(FR-033·054·065) | 검증 대상 아님 | Task 041 진행 중(BOARD) |
| 관리자 콘솔 UI(`/admin`) E2E | 미확인 | dev 서버 불안정(I-083)으로 세션 내 재시도 못함, DB 레벨(RPC)은 확인 |
| 캘린더 크루 색 바·날짜 클릭 상세 UI | 부분 미확인 | 페이지 로드만 확인, 상세 상호작용은 안 함 |

## 9. 다음 회차로 넘길 것

- **`invitations` self-service 강제 미실측 — 다음 회차 1순위 후보.** BOARD의 I-091 전수
  조사(§2.4 3축)가 찾은 유일한 "강제 전무 + 미수정 + 미실측" 칸이다 — `invitations` 테이블의
  `invitee_id=auth.uid()` self-service 분기에 컬럼값(상태) 제한이 RLS `WITH CHECK`에도
  BEFORE 트리거에도 없고, BOARD는 코드 리뷰만 했고 실제 익스플로잇 재현은 시간 제약으로
  못 했다(정직하게 미실측으로 표시됨). `sync_membership_on_response` AFTER 트리거가 있어
  I-089(polls, CRITICAL)류 캐스케이드 위험도 배제 못 한다 — 다음 회차가 가장 먼저 확인해야
  할 항목. 상세는 `docs/ISSUES.md` I-091 표.
- ~~I-085·I-086 수정~~ — **완료**(CREW, 21일차). `join_requests_update_requester_or_staff`
  RLS를 `status='withdrawn'`만 self-service 허용하도록 좁히고, `crew_memberships_guard_
  self_transition`에 오너 self-leave 가드(`owns_active_crew` 헬퍼)를 추가했다. DESIGN이
  §2.2 #13·#16을 직접 재검증 완료(FAIL→PASS 재확인, 프로브·회귀 포함).
- ~~I-090(meetup_attendances 정원 우회) 수정~~ — **완료**(CORE, 21일차). 직접 쓰기 전면 금지
  (GRANT 회수) + `respond_meetup_attendance`를 private DEFINER 래퍼 2단 구조로 전환. DESIGN이
  진짜 동시 HTTP 요청(Bash 병렬 curl, 실제 JWT)으로 D-019 원자성을 재실증하고 회귀 6종·
  `auth.uid()` 신원 보존까지 재검증 완료(§4.6 인접, 팀장 메시지 로그 참고 — 이 문서 §2.2에는
  #25 `poll:vote` 인접 항목으로만 짧게 남아 있어 상세는 별도 재검증 보고를 참고해야 한다).
- ~~I-074 major 재수정~~ — **완료**(CORE 3차 보완, 21일차). `noProfileHandleOracleRelative`를
  stem 3종×확장자 3종 9개 문자열로 확장. DESIGN이 프로브 10개(원래 gap + `.js` + 하위폴더 +
  2단계 `../../` 변형까지)로 재검증 완료, 무관 파일 회귀 0건 — 실질적으로 닫힌 것으로 판단.
- I-081(멤버 수 0 표시, `/crews` 목록 포함) — **완료**(CREW, 21일차, `getPublicCrewMemberCount`
  분기 신설). DESIGN이 게스트·비소속·소속(private 섞인 목록 포함) 5개 시나리오 전부 브라우저로
  재확인 완료.
- I-073 최종 해소 확인 — **완료**(CORE의 D-048 구현, 21일차). DESIGN이 SQL·브라우저 양쪽
  재현 완료.
- 테스트 러너 최소 스펙(§6.3) — 다음에 `quorum.ts` 계열을 만지는 사람이 참고. CORE 판단(I-071은
  정적 검사로 대체 불가, §6.2 항목2)도 함께 참고.
- **§2.4 교훈(정적 대조가 실패하는 세 축 — ①조건부 셀 미강제 ②self-service RLS 범위 과다
  허용 ③self-service write 강제 지점 자체 없음, 매트릭스 밖 포함)을 다음 회차 통합 테스트의
  표준 체크리스트로 삼는다** — "코드만 봤다"로 표시된 행은 ①②를 확인하고, **매트릭스와
  별개로** ③(`information_schema.role_table_grants`·`pg_policies`·`pg_trigger` 스키마
  전수)을 항상 함께 돈다. BOARD의 전수 조사 결과는 `docs/ISSUES.md` **I-091**에 반영
  완료(표는 거기가 SSOT).
- Task 045(관측·브라우저 지원)이 이 Task 036의 실측(NFR-002 근사치, 콘솔 오류 로그)을
  이어받을 수 있다.
