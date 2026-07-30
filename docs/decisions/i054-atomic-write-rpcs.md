# I-054 해소 — `createJoinRequest`·`createPoll`을 단일 트랜잭션 RPC로 전환

- **일자**: 2026-07-30(28일차) / **담당**: CORE / **관련**: I-054, D-064, D-065(전제 일부 변경 —
  아래 "D-065와의 관계" 참고), D-025, D-019, D-007
- **번호 규칙**: 이번 회차부터 결정(D-\*) 번호는 팀장이 회차 마감에 일괄 부여한다(28일차 운영
  규칙). 이 문서는 새 D 번호를 붙이지 않고 "제안 A" 라벨만 쓴다 — 기존 확정 번호(D-064·D-065
  등)는 참조만 한다.

## 1. 문제

`docs/ISSUES.md` I-054(18일차, DESIGN 제보): `join-request.ts`의 `createJoinRequest`(join_requests
INSERT + crew_memberships INSERT/UPDATE)와 `poll.ts`의 `createPoll`(polls INSERT +
poll_eligible_voters bulk INSERT)이 각각 여러 PostgREST 호출(=여러 개의 독립 트랜잭션)로 나뉘어
있어, 두 번째 호출이 실패하면 첫 번째 호출만 커밋된 채 남을 수 있었다. 18일차 이후 신규 쓰기
경로(042A·042B·040)는 전부 "I-054 회피 원칙"(단일 RPC)을 따랐고, 이 두 함수만 원 방식 그대로
남아 있었다.

## 2. 설계 — `respond_meetup_attendance`와 동일한 029B 2단 구조

- `private.create_join_request(p_crew_id uuid, p_message text)` / `private.create_poll(p_post_id
  uuid, p_opens_at timestamptz, p_closes_at timestamptz, p_eligible_voter_ids jsonb)` —
  SECURITY DEFINER 실구현.
- `public.create_join_request(...)` / `public.create_poll(...)` — SECURITY INVOKER 얇은 래퍼
  (`select * from private.*(...)`). `get_advisors(security)` 재확인 — 마이그레이션 적용 전/후
  신규 WARN 0건(`authenticated_security_definer_function_executable` 재발 없음).
- **반환 계약**: `returns table(ok boolean, reason_code text, ...나머지 필드)`. 실패는 예외가
  아니라 이 반환값으로 알린다 — 27일차 팀장이 예외 기반 자기반증에서 전부 "NO ERROR"로 오판했던
  전례(`admin_grant_revoke_rpcs_075.md`) 때문에 이번에도 명시적으로 이 관례를 따랐다.
- **`p_eligible_voter_ids`를 `uuid[]`가 아니라 `jsonb`로 받는다** — 이 저장소에 클라이언트가
  PostgREST RPC로 `uuid[]` 파라미터를 보낸 선례가 없어(grep 확인), 검증되지 않은 배열 캐스팅
  경로 대신 이미 여러 함수(`admin_console_042b_*`·`notifications` payload 등)가 쓰는 jsonb 관례를
  그대로 재사용했다. 함수 내부는 `jsonb_array_elements_text`로 unnest한다.
- **D-077 관례(명시적 REVOKE 후 GRANT)**: `private.*`·`public.*` 양쪽 모두
  `revoke all ... from public, anon, authenticated` 후 `grant execute ... to authenticated`만
  허용한다 — `admin_grant_revoke_system_admin_rpcs_075`와 동일 패턴.

### D-065와의 관계 — 전제가 이 두 경로에 한해 바뀐다

D-065(23일차)는 "정당한 생성 경로가 클라이언트 직접 INSERT일 때는 REVOKE 대신 BEFORE 트리거를
쓴다"였고, `join_requests`(→`crew_memberships` self-insert)·`poll_eligible_voters`가 그 대상이었다
(I-102·I-103 수정). **이 마이그레이션은 그 전제 자체를 바꾼다**: 이제부터 정당한 생성 경로는 이
RPC뿐이므로, D-064(`meetups`)가 쓴 "REVOKE로 전면 금지" 패턴을 대신 적용한다.

- `join_requests`·`crew_memberships`(INSERT만)·`polls`·`poll_eligible_voters`의 `anon`·
  `authenticated` INSERT GRANT를 회수했다.
- 그 INSERT만 겨냥하던 RLS 정책(`join_requests_insert_self_public_crew`·
  `crew_memberships_insert_self_request`·`polls_insert_proposal_author`·
  `poll_eligible_voters_insert_proposal_author_or_staff`) 4건을 삭제했다 — GRANT 단계에서 이미
  막히므로 남겨 두면 "이것이 방어"라고 오독된다(I-090·D-064와 동일 이유).
- **BEFORE INSERT 트리거(I-102·I-103·I-120)는 그대로 남긴다.** RLS는 SECURITY DEFINER 함수
  안에서 우회되지만 트리거는 우회되지 않는다 — RPC 자신의 INSERT도 그 트리거를 통과해야 하므로
  방어 종심으로 계속 유효하다(§4 자기반증이 이 사실 자체를 실측으로 이용한다).
- UPDATE 권한(`decideJoinRequest`·`withdrawJoinRequest`의 `join_requests`/`crew_memberships`
  UPDATE, `closePoll`/`withdrawPoll`의 `polls` UPDATE)은 전혀 건드리지 않았다 — I-054 범위는
  INSERT 경로뿐이다.
- **제안 A(번호 없음, 팀장 확정 대기)**: "여러 INSERT를 단일 RPC로 묶는 게 정당 경로가 되면
  D-064 패턴(REVOKE)이 D-065 패턴(트리거)보다 우선한다"를 일반 규칙으로 승격할지는 팀장 판단에
  맡긴다. 이번엔 이 두 함수에만 적용했다.

## 3. 발견한 버그 — OUT 파라미터 이름과 테이블 컬럼 이름 충돌 (42702)

최초 마이그레이션(`20260730023723_i054_atomic_join_request_and_poll_creation_rpcs`) 적용 직후
자기반증 스크립트의 첫 호출에서 즉시 오류가 났다:

```
ERROR:  42702: column reference "status" is ambiguous
DETAIL:  It could refer to either a PL/pgSQL variable or a table column.
QUERY:  select visibility, status                                    from public.crews
  where id = p_crew_id
CONTEXT:  PL/pgSQL function private.create_join_request(uuid,text) line 15 at SQL statement
```

원인: `returns table(ok boolean, reason_code text, id uuid, crew_id uuid, ..., status text, ...)`의
OUT 파라미터 이름이 함수 본문 안에서 암묵적 PL/pgSQL 변수로 스코프에 들어가, 같은 이름의 테이블
컬럼(`crews.status`·`crews.id`·`crew_memberships.status`·`crew_memberships.crew_id`·
`join_requests.status`·`join_requests.crew_id`·`posts.id` 등)을 바닥(무한정) 참조할 때마다
모호성 오류를 던졌다 — **정상 흐름조차 도달하지 못하는 결함이었다.**

수정(`20260730024330_i054_fix_ambiguous_out_param_column_refs`): 함수 본문의 모든
바닥 컬럼 참조를 테이블 별칭으로 명시 한정했다(`c.status`·`c.id`·`cm.status`·`cm.crew_id`·
`jr.status`·`jr.crew_id`·`p.id` 등). 로직은 전혀 바뀌지 않았다 — 컬럼 참조 방식만 고쳤다.
**이 버그는 자기반증을 실제로 돌리지 않았다면 발견하지 못했을 것이다** — 정적으로는
`create or replace function`이 에러 없이 성공했고, `get_advisors`도 이 종류의 오류를 잡지
않는다.

## 4. 자기반증(Self-Falsification) — 강제 실패 유도 후 SELECT로 직접 확인

방법: `begin`...`rollback` 트랜잭션 안에서, 임시 테스트 크루(`b0000000-...-001`, 오너=실계정
`chopin0625@gmail.com`)와 기존 실크루("주말 러닝 클럽", `21fb8c31-...`)를 이용해 (1) 두 번째
쓰기를 강제로 실패시킨 뒤 첫 번째 쓰기의 흔적이 남지 않는지 SELECT로 직접 확인 (2) 강제 실패
조건을 제거한 뒤 같은 입력으로 정상 경로가 여전히 성공하는지 확인. `set_config('request.jwt.
claims', ...)` + `set local role authenticated`로 PostgREST의 `auth.uid()` 해석을 재현했다(이
저장소가 21일차부터 써 온 표준 기법). 결과는 임시 테이블에 적재해 마지막에 한 번에 SELECT하고,
전체를 `rollback`해 실 데이터에는 어떤 흔적도 남기지 않았다(별도로 `count(*)` 재조회로 롤백이
실제로 적용됐음을 재확인 — 아래 §4.3).

### 4.1 Scenario A — `create_join_request`: `crew_memberships` INSERT를 강제 실패시킨다

강제 실패 수단: `alter table public.crew_memberships add constraint i054_force_fail check (false)
not valid;`(NOT VALID CHECK는 기존 행은 건드리지 않지만 신규 INSERT/UPDATE에는 즉시 적용된다) —
`join_requests`에는 걸지 않아 그 INSERT 자체는 성공할 수 있는 조건을 만들었다.

원시 결과(요청자: 기존 실계정 `seed_owner02`, 이 테스트 크루에 사전 멤버십 없음):

| label | detail |
| --- | --- |
| `A_call_result` | `EXPECTED_FAILURE_CAUGHT: new row for relation "crew_memberships" violates check constraint "i054_force_fail"` |
| `A_join_requests_after_forced_failure` | `0` |
| `A_crew_memberships_after_forced_failure` | `0` |

**두 테이블 모두 0행 — `join_requests` INSERT가 먼저 성공했었음에도(두 번째 쓰기가 실패하기
전까지는 정상적으로 커밋 대기 상태였다) 함수 전체가 롤백되며 흔적 없이 사라졌다.** 이것이 이
마이그레이션이 증명하려는 원자성 그 자체다 — 예전 구현(별도 PostgREST 호출 2개)이었다면
`join_requests` 행만 남았을 시나리오다.

### 4.2 Scenario A2 — 강제 실패 조건 제거 후 정상 경로 회귀 확인

`alter table ... drop constraint i054_force_fail;` 후 같은 크루·같은 요청자로 재호출:

| label | detail |
| --- | --- |
| `A2_call_result` | `{"ok":true,"reason_code":null,"id":"4ca041c4-...","crew_id":"b0000000-...-001","requester_id":"fc91323c-...","message":"자기반증: 정상 경로","status":"pending","decided_by":null,"decided_at":null,"created_at":"2026-07-30T02:44:55...+00:00"}` |
| `A2_join_requests_after_success` | `4ca041c4-...:pending` |
| `A2_crew_memberships_after_success` | `member:requested` |

정상 흐름③(가입 신청 시 `crew_memberships` requested 프로비저닝)이 여전히 정확한 role·status로
성공한다 — 회귀 없음.

### 4.3 Scenario B — `create_poll`: `poll_eligible_voters` INSERT 중 하나를 (실제) 트리거로 실패시킨다

강제 실패 수단: 이번엔 인위적 제약을 추가하지 않고, **실제로 이미 존재하는**
`poll_eligible_voters_guard_insert_scope`(I-103) 트리거를 그대로 이용했다 — 대상자 목록에 그
크루의 활성 멤버가 아닌 실제 프로필(다른 크루의 오너 `seed_owner03`)을 하나 섞었다.

원시 결과(제안자: `chopin0625`, 크루: 실크루 "주말 러닝 클럽"):

| label | detail |
| --- | --- |
| `B_call_result` | `EXPECTED_FAILURE_CAUGHT: poll_eligible_voters.profile_id는 그 poll이 속한 크루의 활성 멤버여야 합니다(D-025)` |
| `B_polls_after_forced_failure` | `0` |
| `B_poll_eligible_voters_after_forced_failure` | `0` |

**`polls` 행도 0 — 대상자 스냅샷 중 단 한 명이 자격 미달이어도 poll 생성 자체가 통째로
롤백된다.** 예전 구현(별도 호출 2개)이었다면 `polls` 행만 남고 `poll_eligible_voters`는 부분
삽입된 상태로 어긋났을 시나리오다. 이 시나리오는 트리거를 인위적으로 깨지 않고도 "실제
있음직한 호출 실수"(대상자 스냅샷 계산 오류로 비회원이 섞이는 경우)를 그대로 재현했다는 점에서
Scenario A보다 더 현실적인 자기반증이다.

### 4.4 Scenario B2 — 정당한 대상자만으로 정상 경로 회귀 확인

같은 post에 정당한 대상자(크루 활성 멤버 2명)만으로 재호출:

| label | detail |
| --- | --- |
| `B2_call_result` | `{"ok":true,"reason_code":null,"id":"f54bdc9b-...","post_id":"c0000000-...-001","opens_at":"...","closes_at":"...","status":"open","closed_by":null,"result":null,"decided_at":null}` |
| `B2_polls_after_success` | `f54bdc9b-...:open` |
| `B2_poll_eligible_voters_after_success` | `30f44dd9-...,fb70ff1c-...`(2행, 요청한 대상자 전원) |

FR-040 정상 흐름(투표 생성 + 대상자 스냅샷)이 여전히 성공한다 — 회귀 없음.

### 4.5 최종 정리 확인 — 트랜잭션 자체가 실 데이터에 흔적을 남기지 않았는가

자기반증 스크립트 실행 후 별도 쿼리로 재확인(테스트 크루·포스트·조인신청·투표·강제실패
제약 5종 전부):

```
crew: 0, post: 0, join_request: 0, poll: 0, force_fail_constraint: 0
```

전부 0 — `rollback`이 정상 적용됐고, 테스트로 만든 임시 데이터가 실 데이터베이스에 전혀
남지 않았다.

## 5. 정상 경로(Server Action) 영향

- `src/lib/actions/request-join-crew.ts`(`requestToJoinCrewAction`)와
  `src/lib/actions/create-post.ts`(제안글 생성 시 `createPoll` 호출)는 **수정하지 않았다** —
  `createJoinRequest`·`createPoll`의 TS 시그니처(`DataResult<JoinRequest>`/`Promise<Poll>`)가
  그대로라 호출부는 무변경이다. `npx tsc --noEmit`·`npx eslint`(변경 파일 3개) 통과.
- `createJoinRequest`는 이제 `CreateJoinRequestInput.requesterId`를 실제로 쓰지 않는다(RPC가
  내부에서 `auth.uid()`를 쓴다) — `respondAttendance`(meetup.ts)와 같은 기존 패턴을 그대로
  재사용했다. Mock과의 시그니처 동일성(NFR-034)을 위해 타입 필드는 남겼다.

## 6. 산출물

- 마이그레이션: `supabase/migrations/20260730023723_i054_atomic_join_request_and_poll_creation_rpcs.sql`,
  `supabase/migrations/20260730024330_i054_fix_ambiguous_out_param_column_refs.sql`(42702 수정).
- `src/lib/data/supabase/join-request.ts`(`createJoinRequest` 재작성, `REACTIVATABLE_MEMBERSHIP_
  STATUSES` 제거 — 로직이 SQL로 이동), `poll.ts`(`createPoll` 재작성).
- `src/lib/data/supabase/database.types.ts` 재생성(`create_join_request`·`create_poll` Functions
  타입 추가, 그 외 diff 없음 — `git diff` 확인).
- `get_advisors(security)`: 마이그레이션 적용 전후 신규 WARN 0건.

## 6.5 부수 발견 — 로컬 `supabase/migrations/`가 원격과 14건 어긋나 있었다(I-051 재발, 이번 회차에서 복구)

작업을 시작하기 전 로컬 파일 목록과 `list_migrations` 결과를 대조(`comm -23`/`comm -13`)한 결과,
**원격에는 있지만 로컬 파일이 없는 마이그레이션 14건**을 발견했다 — `20260729123436`(I-111)부터
`20260729153137`(I-079 후속 수정)까지, 24~26일차 CREW·CORE 작업분 전체가 로컬에 저장되지 않은
채였다(`meetup_reschedule_pipeline_079`처럼 `docs/decisions/meetup-reschedule-079.md`가 인용하는
`polls_insert_proposal_author` RLS 확장분도 포함 — 그 문서 내용과 로컬 파일이 실제로 어긋나 있어
확인하다가 발견했다). `supabase_migrations.schema_migrations.statements`에서 원문 SQL을 그대로
가져와 14개 파일을 전부 복구해 커밋 대상에 포함했다(`git ls-files`로 신규 14개 + 이번 I-054용
2개, 총 16개 신규 마이그레이션 파일 확인). **DB에는 아무 변경도 가하지 않았다** — 순수하게
로컬 파일만 원격과 동기화했다. 복구 후 재대조(`comm`)로 로컬·원격이 정확히 일치함을 확인했다.

이 갭이 왜 생겼는지는 조사하지 않았다(이번 배정 범위 밖) — `apply_migration`이 로컬 파일을
만들지 않는다는 I-051의 근본 원인이 이 회차에도 반복됐다는 것만 확인했다. 팀장이 재발 방지
절차(예: 회차 마감 시 `list_migrations` vs 로컬 파일 diff를 표준 점검 항목으로 추가)를 검토할
것을 제안한다.

## 7. 남긴 것 · 리스크

- **`withdrawJoinRequest`(join_requests UPDATE + crew_memberships UPDATE 2개 호출)는 이번 범위
  밖이다.** 배정 지시("이 두 개가 마지막으로 남은 미수정 경로다")가 `createJoinRequest`·
  `createPoll`로 명시했고, I-054 원문도 이 두 함수만 지목했다. `withdrawJoinRequest`는 별도
  다단 쓰기이지만 새 이슈로 등재하지 않았다 — 같은 계열 결함일 가능성이 있어 다음에 이 파일을
  만지는 사람이 재검토할 만하다(범위를 넓히면 이번 배정의 자기반증 밀도가 옅어질 것 같아 좁혔다).
- **`p_eligible_voter_ids` jsonb 배열의 원소 개수 상한이 없다** — 기존 구현도 없었다(그대로).
  크루 규모가 커지면 이 함수 호출 하나의 페이로드가 커질 수 있으나 이번 회차 범위 밖.
- **동시 자기반증(진짜 동시 호출 레이스)은 하지 않았다** — `begin`...`rollback` 단일 세션
  시뮬레이션만 했다. `uq_join_requests_pending_crew_requester` UNIQUE 제약 + `exception when
  unique_violation`으로 레이스 방어를 코드로는 넣었지만, 실제 동시 접속 2개로 재현하지는
  않았다(`decideJoinRequest`의 조건부 UPDATE 패턴과 같은 신뢰 수준).
