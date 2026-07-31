# I-141 해소 — `withdrawJoinRequest`를 단일 트랜잭션 RPC로 전환

- **일자**: 2026-07-30(29일차) / **담당**: CORE / **관련**: I-141, I-054(같은 결함 클래스),
  D-064·D-065(참조만, 새 번호 없음), D-085(join_requests_update_requester_or_staff 원 근거)
- **번호 규칙**: 이 문서는 새 D 번호를 붙이지 않는다(28일차 확립 규칙, D-082). 기존 확정 번호는
  참조만 한다.

## 1. 문제

`docs/ISSUES.md` I-141(28일차, CORE가 I-054 처리 중 범위 밖으로 발견): `join-request.ts`의
`withdrawJoinRequest`(FR-022 E4, 자진 철회)가 `join_requests` UPDATE(`status: "withdrawn"`)와
`crew_memberships` UPDATE(`status: "rejected"`)를 별도 PostgREST 호출(=별도 트랜잭션) 두 개로
실행했다. I-054가 고친 `createJoinRequest`·`createPoll`과 정확히 같은 구조적 결함이다. 두 번째
호출이 실패하면 `join_requests='withdrawn'` / `crew_memberships='requested'`로 어긋난 상태가
확정되고, 사용자도 임원도 그 상태에서 빠져나올 수 없었다(재신청은 `already_pending`으로 막히고,
승인·반려는 `decideJoinRequest`의 `.eq("status","pending")`가 0행 매치로 걸린다).

## 2. 설계 — I-054와 동일한 029B 2단 구조

- `private.withdraw_join_request(p_id uuid)` — SECURITY DEFINER 실구현. `public.withdraw_join_request(p_id uuid)` — SECURITY INVOKER 얇은 래퍼(`select * from private.*(...)`).
- **반환 계약**: `returns table(ok boolean, reason_code text, ...나머지 필드)`. 실패는 예외가
  아니라 이 반환값으로 알린다(`forbidden`·`not_found`) — 27일차 팀장이 예외 기반 자기반증에서
  전부 "NO ERROR"로 오판했던 전례 때문에 이번에도 이 관례를 따랐다.
- **I-054 자기반증에서 나온 42702(OUT 파라미터-테이블 컬럼명 충돌) 재발 방지**: `create_join_request`는
  최초 버전에서 이 버그로 정상 흐름조차 도달하지 못했다(후속 마이그레이션으로 수정). 이번엔 처음부터
  함수 본문의 모든 바닥 컬럼 참조를 테이블 별칭(`jr.*`·`cm.*`)으로 명시 한정해 같은 버그가 발생할
  여지를 없앴다. 실제로 이번 마이그레이션은 한 번에 오류 없이 적용됐다.
- **D-077 관례(명시적 REVOKE 후 GRANT)**: `private.*`·`public.*` 양쪽 모두 `revoke all ...
  from public, anon, authenticated` 후 `grant execute ... to authenticated`만 허용한다.
- **크루멤버십 되돌리기 로직 무변경**: `join_requests_sync_membership_on_decision`(AFTER UPDATE)이
  `approved`/`rejected`만 처리하고 `withdrawn`은 대상이 아니라서, 이 RPC가 `crew_memberships`를
  직접 `requested→rejected`로 되돌린다 — 기존 `withdrawJoinRequest`와 동일한 값(I-039 근사)이다.
  **BOARD가 같은 회차에 이 값(`rejected`)에 의존하는 요구사항 제안서를 쓰고 있어, 이 값 자체는
  바꾸지 않았다** — 배정 지시의 경계 조건을 그대로 지켰다.

### 왜 예외 핸들러를 두지 않았는가 — savepoint 함정

`crew_memberships` UPDATE는 어떤 `begin...exception` 블록으로도 감싸지 않았다. plpgsql의
`BEGIN...EXCEPTION`은 진입 시 암묵적 SAVEPOINT를 만든다 — 그 안에서 예외가 나면 **그 블록
안에서 일어난 변경만** 롤백되고, **블록 진입 전에 이미 실행된 문장(여기서는 앞선
`join_requests` UPDATE)은 롤백되지 않는다.** 만약 `crew_memberships` UPDATE를 예외 핸들러로
감싸고 핸들러가 잡은 뒤 계속 진행했다면, 강제 실패 상황에서 `join_requests`만 `withdrawn`으로
커밋되고 `crew_memberships`는 그대로 남는 — 정확히 이 이슈가 고치려는 결함이 RPC 내부에서
재현됐을 것이다. 이 논거는 28일차 팀장이 검증에서 확립한 것과 같다(`i054-atomic-write-
rpcs.md` §4 참고). 그래서 이 RPC는 두 번째 UPDATE에서 예외가 나면 **아무 것도 잡지 않고 그대로
전파**시켜 함수 전체(=RPC 호출 전체 트랜잭션)가 롤백되게 했다.

### `join_requests_update_requester_or_staff` RLS 정책 narrowing

I-054가 INSERT GRANT를 회수한 것과 같은 근거(D-064 패턴 — 정당 경로가 client 직접 조작에서
서버 RPC 단독으로 바뀜)로, 이 정책의 신청자 본인(`requester_id = auth.uid()`) 분기를
완전히 제거했다. 이 분기는 원래 I-085(21일차)가 "새 값이 `withdrawn`일 때만" 허용하도록 좁혀
놓은 것으로, 옛 `withdrawJoinRequest`가 실제로 쓰던 유일한 self-service 목표였다. RPC 전환 후
이 분기를 남겨 두면 **클라이언트가 여전히 PostgREST로 `join_requests`만 직접 UPDATE(withdrawn)
하고 `crew_memberships`는 건드리지 않는 비원자적 2단 쓰기를 재현할 수 있어** — 이 이슈가 고치려는
결함을 클라이언트가 그대로 되살릴 수 있는 잔존 표면이 됐다. staff/owner의 승인·반려(FR-023,
`decideJoinRequest`) 분기는 이 이슈와 무관해 그대로 뒀다.

**정책 개수 델타**: `public` 스키마 정책 수는 마이그레이션 전후 **57건 → 57건(불변)** — narrowing만
했고(drop 후 같은 이름으로 재생성, I-085와 같은 관례) 정책을 추가·삭제하지 않았다.

## 3. 자기반증(Self-Falsification)

방법: `begin`...`rollback` 트랜잭션 안에서, **신규 테스트 크루 1개**(오너=`seed_owner03`)와
기존 실계정 3명(`seed_outsider01`·`seed_outsider02`·`seed_member01`, 각각 별도 join_request·
crew_memberships 행)을 이용했다. `set_config('request.jwt.claims', ...)` + `set local role
authenticated`로 PostgREST의 `auth.uid()` 해석을 재현했다(21일차부터 이 저장소가 써 온 표준
기법). 결과는 임시 테이블(`i141_results`)에 적재해 마지막에 한 번에 SELECT하고, 전체를
`rollback`해 실 데이터에는 어떤 흔적도 남기지 않았다.

### 3.1 Scenario A — `crew_memberships` 두 번째 쓰기를 강제 실패시킨다

강제 실패 수단: `alter table public.crew_memberships add constraint i141_force_fail check
(false) not valid;`(NOT VALID CHECK는 기존 행은 건드리지 않지만 신규 INSERT/UPDATE에는 즉시
적용된다).

원시 결과(요청자: `seed_outsider01`):

| label | detail |
| --- | --- |
| `A_call_result` | `EXPECTED_FAILURE_CAUGHT: new row for relation "crew_memberships" violates check constraint "i141_force_fail"` |
| `A_join_requests_withdrawn_count_after_forced_failure` | `0` |
| `A_crew_memberships_rejected_count_after_forced_failure` | `0` |
| `A_join_requests_actual_status` | `pending` |
| `A_crew_memberships_actual_status` | `requested` |

**두 테이블 모두 원래 상태 그대로다 — `join_requests` UPDATE가 함수 안에서 먼저 실행돼
커밋 대기 상태였음에도, `crew_memberships` UPDATE가 실패하자 함수 전체가 롤백되며 흔적 없이
사라졌다.** 이것이 이 마이그레이션이 증명하려는 원자성 그 자체다 — 예전 구현(별도 PostgREST
호출 2개)이었다면 `join_requests.status='withdrawn'` / `crew_memberships.status='requested'`로
어긋난 채 남았을 시나리오다(I-141 원문의 28일차 실측과 정확히 같은 조건).

### 3.2 Scenario A2 — 강제 실패 조건 제거 후 정상 경로 회귀 확인 (겸 self-service 트리거 재검증)

`alter table ... drop constraint i141_force_fail;` 후 같은 `join_request`로 재호출:

| label | detail |
| --- | --- |
| `A2_call_result` | `{"ok":true,"reason_code":null,"id":"65b1c541-...","crew_id":"a8501de7-...","requester_id":"b7470f13-...","message":"자기반증 A","status":"withdrawn","decided_by":null,"decided_at":null,"created_at":"2026-07-30T03:41:09..."}` |
| `A2_join_requests_actual_status` | `withdrawn` |
| `A2_crew_memberships_actual_status` | `rejected` |

정상 흐름이 회귀 없이 성공한다. **동시에 이 결과는 I-141 원문이 명시적으로 요구한
재검증이다**: `crew_memberships_guard_self_transition`의 `requested→rejected` self-service
전이 허용 분기가, `join_requests_sync_membership_on_decision`처럼 다른 트리거 안에서 중첩
호출되는 경로(`pg_trigger_depth() > 1`, 신뢰된 부수효과로 우회)가 아니라 **이 RPC처럼 일반
함수에서 직접 UPDATE하는 non-nested 경로(`pg_trigger_depth() = 1`)에서도** 정상적으로
`old.profile_id = auth.uid()` self-service 분기를 타고 `requested→rejected` 전이를 허용함을
실측으로 확인했다. 만약 이 트리거가 이 경로를 막았다면 A2 호출 자체가 예외로 실패했을
것이다 — 성공했다는 사실 자체가 재검증의 증거다.

### 3.3 Scenario C — RLS narrowing이 실제로 클라이언트 직접 경로를 막는지

요청자 `seed_outsider02`로 전환 후, RPC를 거치지 않고 `join_requests`를 직접 UPDATE 시도:

| label | detail |
| --- | --- |
| `C_direct_client_update_rows_affected` | `0` |
| `C_join_requests_actual_status_after_blocked_direct_update` | `pending`(변경 없음) |

**narrowing된 RLS 정책이 실제로 신청자 본인의 직접 client UPDATE를 0행으로 차단한다** — 이론상
설계뿐 아니라 실측으로 확인했다. 이어서 같은 요청자가 RPC로는 정상 철회할 수 있는지(회귀 없음):

| label | detail |
| --- | --- |
| `C_rpc_call_result` | `{"ok":true,...,"status":"withdrawn",...}` |
| `C_join_requests_actual_status_after_rpc` | `withdrawn` |
| `C_crew_memberships_actual_status_after_rpc` | `rejected` |

### 3.4 Scenario D — staff/owner 승인 직접 UPDATE(FR-023) 회귀 없음 확인

크루 오너(`seed_owner03`)로 전환 후, 세 번째 신청(`seed_member01`)을 직접 `approved`로 UPDATE:

| label | detail |
| --- | --- |
| `D_staff_direct_update_rows_affected` | `1` |
| `D_join_requests_actual_status` | `approved` |
| `D_crew_memberships_actual_status_after_approval_sync` | `active`(`join_requests_sync_membership_on_decision` 트리거가 정상 동기화) |

`decideJoinRequest`가 쓰는 staff/owner 분기는 narrowing 이후에도 회귀 없이 동작한다.

### 3.5 최종 정리 확인 — 트랜잭션 자체가 실 데이터에 흔적을 남기지 않았는가

```
test_crew_count: 0, test_jr_count: 0, test_membership_count: 0, leftover_force_fail_constraint: 0
```

전부 0 — `rollback`이 정상 적용됐고, 테스트로 만든 임시 데이터(신규 테스트 크루 1개 + 신청 3건)가
실 데이터베이스에 전혀 남지 않았다. 배정 경계 조건대로 CREW·BOARD가 다루는 테스트 크루
(`729ced18-...`·`c4283f8a-...`)나 실 시드 데이터는 전혀 건드리지 않았다.

## 4. DB 델타

| 항목 | 시작 | 종료 | 델타 |
| --- | --- | --- | --- |
| 마이그레이션(원격) | 120 | 122 | +2(본 작업 1건 + CREW `product_value_check_constraints_083` 1건, 동시 작업) |
| `public`+`private` 함수 수 | 82 | 84 | +2(`private.withdraw_join_request`·`public.withdraw_join_request`) |
| `public` 스키마 RLS 정책 수 | 57 | 57 | 0(narrowing만, drop+재생성) |
| `get_advisors(security)` WARN | 1(`auth_leaked_password_protection`, 무관) | 1 | 0(신규 WARN 없음) |

## 5. 로컬-원격 마이그레이션 대조 (28일차에 확립된 회차 마감 표준 절차)

작업 시작 시점(적용 전) 로컬 파일 버전 집합과 `list_migrations` 결과를 정렬 후 SHA-256으로
비교 — **120건, 해시 일치**(어긋남 없음, 별도 복구 불필요). 이번 마이그레이션 적용 도중
CREW가 동시에 `product_value_check_constraints_083`(2026-07-30 03:36:54)을 적용해 원격이
잠깐 121건이 됐고, CREW가 로컬 파일도 즉시 커밋해 둔 상태였다. 내 마이그레이션
(`i141_withdraw_join_request_atomic_rpc`, 03:37:48)의 로컬 파일은
`supabase_migrations.schema_migrations.statements`에서 원문을 그대로 가져와 작성했다.
최종 재대조 결과 **로컬 122건 / 원격 122건, 정렬된 버전 집합의 SHA-256 해시 완전 일치**
(`414c2f0b7b42b02946bb31f313f7f83b2ab4e49ead3b26ca66e78d3eb86a4d08`). CREW의 마이그레이션은
`join_requests`·`crew_memberships`를 건드리지 않아(grep 확인) 이번 작업과 충돌하지 않는다.

## 6. 정상 경로(Server Action) 영향

- `src/lib/actions/withdraw-join-request.ts`(`withdrawJoinRequestAction`)는 **수정하지
  않았다** — `withdrawJoinRequest`의 TS 시그니처(`DataResult<JoinRequest>`)가 그대로라 호출부는
  무변경이다. `npx tsc --noEmit`·`npm run lint` 통과(경고 0건).
- `withdrawJoinRequest`는 이제 두 번째 인자(`requesterId`)를 실제로 쓰지 않는다(RPC가 내부에서
  `auth.uid()`를 쓴다) — `createJoinRequest`(28일차)·`respondAttendance`와 같은 기존 패턴을
  재사용했다. Mock과의 시그니처 동일성(NFR-034)을 위해 파라미터는 남기고,
  `profile.ts`(`searchProfilesByHandle`)의 선례를 따라 `eslint-disable-next-line
  @typescript-eslint/no-unused-vars` 주석으로 정리했다.
- `src/lib/data/supabase/database.types.ts`를 재생성해 `withdraw_join_request` Functions 타입을
  추가했다 — `generate_typescript_types` 원본 출력과 수기 반영 결과를 전체 diff로 대조해 그 외
  구조 변화가 없음을 확인했다(R-003).

## 7. 남긴 것 · 리스크

- **동시 접속 레이스(진짜 병렬 HTTP 2개)는 재현하지 않았다** — `begin`...`rollback` 단일 세션
  시뮬레이션만 했다. I-054와 같은 신뢰 수준이다.
- **어긋난 상태의 UI 표시**는 이번에도 확인하지 않았다 — DB 상태(원자성)까지만 검증 범위다.
- `crew_memberships` 되돌리기 값(`rejected`)은 바꾸지 않았다 — BOARD가 같은 회차에 이 값에
  의존하는 요구사항 제안서를 작성 중이라는 배정 경계 조건을 지켰다. 이 값을 바꿀 근거가
  생기면 코드를 고치기 전에 먼저 팀장에게 보고해야 한다(배정 지시 사항).
- `join_requests_update_requester_or_staff` 정책 이름은 유지했다(narrowing 후에는 실질적으로
  staff-only이지만, 추적 편의를 위해 I-085 관례를 따라 이름을 바꾸지 않았다) — 다음에 이
  정책을 읽는 사람은 이름과 실제 동작이 다르다는 점을 감안해야 한다.

## 8. 후속 — 진짜 병렬 실 HTTP 2개 레이스 실증 (30일차, CORE)

**§7이 남긴 리스크(동시 접속 레이스 미재현)를 해소한다.** 22일차 BOARD가 확립한 "실계정 JWT +
병렬 실 HTTP" 방식(`begin`…`rollback` 단일 세션 시뮬레이션이 아니라, 실제로 분리된 프로세스
2개가 네트워크를 거쳐 같은 행을 동시에 두드리는 방식)을 그대로 적용했다.

### 8.1 방법

1. **JWT 확보**: `POST /auth/v1/token?grant_type=password`로 실계정 `0625chopin@gmail.com`
   (핸들 `chopin_0625`, profile id `fb70ff1c-3736-44ee-a4a3-96993a3c62ed`)의 access token을
   발급받았다. `user.id`가 기대한 profile id와 일치함을 확인했다.
2. **신규 픽스처** — 보호 크루(`729ced18-2016-459a-94c3-e7959dfe808c`)는 쓰지 않았다:
   - 크루 `06d62732-faef-4d22-80b7-f9558d58a5cc`(오너 `chopin0625`, `visibility=public`,
     `status=active`) — `trg_crews_provision_owner_bootstrap`이 오너 멤버십·기본 보드·채팅방을
     자동 생성했다.
   - `crew_memberships`: 요청자(`chopin_0625`) 행 `status='requested'`, `role='member'` —
     `crew_memberships_guard_self_insert_request` 트리거(I-120)가 `status='requested'` +
     `role='member'` + 크루 `public`·`active`만 허용해, 이 조합으로만 직접 INSERT가 통과했다.
   - `join_requests`: `id=9559838f-dbaf-495d-90b7-96a082d3c4fd`, `status='pending'`,
     `requester_id=chopin_0625`.
3. **병렬 호출**: 같은 `join_request.id`를 대상으로 `POST /rest/v1/rpc/withdraw_join_request`
   (`{"p_id": "9559838f-..."}`)를 **셸 백그라운드(`&`) + `wait`로 두 프로세스에서 동시에** 호출하고,
   각 응답을 별도 파일로 캡처했다.

### 8.2 원시 결과

두 호출 모두 HTTP `200`(RPC는 실패도 예외가 아니라 `reason_code`로 반환하는 설계이므로 HTTP
레벨에서는 둘 다 "정상 응답"이다):

| 호출 | HTTP | `ok` | `reason_code` | `status`(반환값) |
| --- | --- | --- | --- | --- |
| A | 200 | `false` | `not_found` | (null) |
| B | 200 | `true` | (null) | `withdrawn` |

**DESIGN 교차검증(30일차) 반영 — 재현 가능성을 위해 원시 근거를 인용한다.** 문서만으로는
"진짜 병렬"인지 검증할 수 없다는 지적이 정당해, 실제 실행한 셸 명령과 두 호출의 raw 응답
본문을 그대로 남긴다:

```bash
JR_ID="9559838f-dbaf-495d-90b7-96a082d3c4fd"
(
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/withdraw_join_request" \
  -H "apikey: ${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json" \
  -d "{\"p_id\":\"${JR_ID}\"}" > i141_race_A.txt 2>&1
) &
PID_A=$!
(
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/withdraw_join_request" \
  -H "apikey: ${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json" \
  -d "{\"p_id\":\"${JR_ID}\"}" > i141_race_B.txt 2>&1
) &
PID_B=$!
wait $PID_A $PID_B
```

원시 응답 본문(각각 별도 파일로 캡처, 무편집):

```
# i141_race_A.txt
[{"ok":false,"reason_code":"not_found","id":null,"crew_id":null,"requester_id":null,"message":null,"status":null,"decided_by":null,"decided_at":null,"created_at":null}]
HTTP_STATUS:200

# i141_race_B.txt
[{"ok":true,"reason_code":null,"id":"9559838f-dbaf-495d-90b7-96a082d3c4fd","crew_id":"06d62732-faef-4d22-80b7-f9558d58a5cc","requester_id":"fb70ff1c-3736-44ee-a4a3-96993a3c62ed","message":"I141 레이스 실증 픽스처","status":"withdrawn","decided_by":null,"decided_at":null,"created_at":"2026-07-30T05:03:00.067924+00:00"}]
HTTP_STATUS:200
```

**서버측 독립 근거(DESIGN이 `get_logs(api)`로 우회 검증)**: 두 `POST
/rest/v1/rpc/withdraw_join_request` 요청(UA `curl/8.18.0`)의 서버 수신 타임스탬프가
`1785387800188000`µs(`2026-07-30T05:03:20.188Z`)·`1785387800198000`µs
(`2026-07-30T05:03:20.198Z`)로 **10ms 이내**였다 — 클라이언트 쪽 `wait` 종료 시각(§8.1의
`date` 출력, 05:03:19.228Z 시작~05:03:19.572Z 종료)과 일관된 창(window) 안에 들어온다.
순차 실행이었다면 두 PostgREST 요청이 이보다 뚜렷이 벌어졌을 것이다(각 요청은 JWT 검증 +
RLS 평가 + PL/pgSQL 함수 실행을 거친다) — 10ms 이내 도착은 "셸에서 `&`로 백그라운드
실행했다"는 주장이 문서 자체의 근거만으로도 성립함을 뒷받침한다.

### 8.3 호출 후 DB 상태 (`count(*)` 실측)

| 대상 | 값 |
| --- | --- |
| `join_requests.status`(대상 행) | `withdrawn` — 정확히 1건 |
| `crew_memberships.status`(요청자 행) | `rejected` |
| `crew_memberships.status`(오너 행) | `active`(무변경, 회귀 없음) |

### 8.4 판정 — I-054·I-141이 요구한 세 조건

1. **둘 다 성공하지 않았다**: `ok=true`는 정확히 1건(B), `ok=false`(`not_found`)가 1건(A) —
   동시에 두 번 성공해 이중 처리되는 경우가 없었다.
2. **부분 커밋이 0건이다**: A(`not_found`) 쪽은 `join_requests`도 `crew_memberships`도 건드리지
   않았다 — RPC의 첫 UPDATE(`jr.status='pending'` 조건부)가 이미 0행 매치라 `v_row.id is null`
   분기로 즉시 반환했고(§ 2 함수 본문 44~48행), `crew_memberships` UPDATE 문장 자체에 도달하지
   않았다. "실패한 호출이 절반만 썼다"는 상태가 존재하지 않는다.
3. **최종 상태가 일관된다**: `join_requests='withdrawn'` / `crew_memberships='rejected'` — 이는
   **성공한 단일 호출(B)이 만들어냈을 상태와 바이트 단위로 같다.** I-141 원문(28일차)이 실측한
   "어긋난 상태"(`withdrawn`/`requested`)는 재현되지 않았다.

**결론**: `withdraw_join_request` RPC는 진짜 병렬 실 HTTP 레이스 아래에서도 원자성을 지킨다 —
`jr.status='pending'` 조건부 UPDATE가 사실상 낙관적 잠금 역할을 해, 두 번째 도착한 요청은
DB 레벨의 행 잠금(첫 UPDATE가 커밋될 때까지 두 번째 UPDATE가 대기)으로 안전하게
`not_found`로 걸러진다. §7의 "동시 접속 레이스는 재현하지 않았다"는 문구는 이 절로 갱신한다 —
**이제 재현했고, 결함이 없음을 확인했다.**

### 8.5 픽스처 정리

`join_requests`·`crew_memberships`(요청자·오너 둘 다) → `boards`·`chat_rooms`(오너 부트스트랩
트리거가 자동 생성, FK `ON DELETE RESTRICT`라 먼저 지워야 함) → `crews` 순서로 삭제했다.
정리 후 재실측: `crews_count=13`·`archived_count=0`·`profiles_count=21`·`leftover_crew=0` —
회차 시작 기준선과 완전히 일치한다. 보호 크루(`729ced18-...`)·시드 데이터는 전혀 건드리지
않았다.

### 8.6 남긴 것

- 이번 레이스는 정확히 2-way였다 — 3-way 이상 동시 요청은 시도하지 않았다. RPC의 조건부
  UPDATE 구조상 N-way로 늘려도 같은 원리(첫 커밋만 승리)가 성립할 것으로 예상하지만, 실측하지
  않은 이상 추정으로만 남긴다.
- UI가 `not_found`(`ok:false`) 응답을 사용자에게 어떻게 보여주는지는 이번에도 확인하지
  않았다 — DB·API 레벨 원자성까지가 이번 실증 범위다.
