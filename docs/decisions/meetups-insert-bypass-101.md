# `meetups` 직접 INSERT로 위조 Meetup을 만들 수 있었다 — I-101 CRITICAL 재현·수정

- **일자**: 2026-07-29(22일차)
- **담당**: BOARD(B팀)
- **제보**: CREW(DESIGN의 Task 045 검증 중 인접 발견) → 팀장이 SQL로 1차 확인 → BOARD가 실측·수정
- **참조**: D-003(투표는 정족수·과반으로 가결), FR-060(가결 Meetup 자동 등록, 행위자=시스템), I-089(같은 급의 CRITICAL, 다른 경로), I-090(같은 도메인 `meetup_attendances`의 선례)

## 0. 요약

`meetups_insert_proposal_author_or_staff` RLS의 `WITH CHECK`가 **`polls.status`를 전혀 검사하지 않았다.** 제안글 작성자는 자기 poll이 `open`(진행 중)·`closed_rejected`(부결)·`cancelled`(철회, Task 044 신설)든 상관없이 그 `poll_id`로 `meetups`에 직접 INSERT할 수 있었고, staff/owner는 poll_id가 **자기 크루의 것인지조차 확인 없이** 아무 poll이나 빌려 Meetup을 위조할 수 있었다. `meetups`에는 INSERT를 보는 BEFORE 트리거가 전혀 없어(`trg_meetups_guard_attendee_scope`는 BEFORE UPDATE 전용) RLS가 유일한 문이었다. 5개 시나리오를 실 REST로 재현했고 4개가 성공했다(비신뢰 crew_member 대조군만 정상 차단). **CRITICAL로 판정**하고 즉시 수정했다.

## 1. RLS 원문 (수정 전)

```sql
-- meetups_insert_proposal_author_or_staff, WITH CHECK
crew_id IN (내 활성 크루)
AND (
  poll_id IN (select po.id from polls po join posts p on p.id=po.post_id where p.author_id=auth.uid())
  OR
  crew_id IN (내가 staff/owner인 크루)
)
```

`poll_id`가 `NOT NULL`이라 "poll 없이" 만드는 것 자체는 막혔지만(스키마 제약), **어떤 poll이든 상태·소속 크루와 무관하게** 통과했다.

## 2. 실측 재현 (실 REST, `chopin0625@gmail.com`=A·`0625chopin@gmail.com`=B)

크루 `f202047b`(알고리즘 스터디, A=staff·B=member)에 A가 작성자인 테스트 poll 4개(open·closed_rejected×2·cancelled)를 만들고 실 REST `POST /rest/v1/meetups`로 시도했다.

| # | 시나리오 | 계정 | 결과(수정 전) |
| --- | --- | --- | --- |
| a | 작성자 본인, poll=**open**(아직 안 끝남) | A | **201 성공** |
| b | 작성자 본인, poll=**closed_rejected**(부결) | A | **201 성공** |
| c | 작성자 본인, poll=**cancelled**(철회, Task 044 신설 상태) | A | **201 성공** |
| d+e | staff, **다른 크루**(`729ced18`)에 **자기가 만들지도 않은 문맥의** `f202047b` 소속 rejected poll을 빌려 씀 | A | **201 성공** |
| f(대조군) | 작성자도 staff/owner도 아닌 plain crew_member | B | **403**(RLS가 정상 차단, 대조군 통과) |

생성된 행은 `status='confirmed'`(컬럼 기본값)로 정상 Meetup과 **완전히 동일한 모양**이었다 — `meetups_select_members` 조회·캘린더(FR-061)·`respond_meetup_attendance` 참석 신청(FR-066)까지 전부 그대로 반응한다(추가 캐스케이드 없이도 이미 "진짜처럼" 취급됨).

정리: 4건의 위조 Meetup은 확인 직후 DELETE로 제거, 재조회로 0건 확인.

## 3. 심각도 판정 — CRITICAL (I-091 기준: 다운스트림 캐스케이드 여부)

- **공격자 범위가 넓다** — I-090(정원 우회, "이미 참석 대상인 크루원"으로 좁음)보다 넓고, I-089(poll 조작으로 간접 Meetup 위조)와 같은 급이다. **크루의 아무 제안 글이나 하나라도 써 본 사람**이면(부결·철회·진행 중인 것도 상관없이) 자기 poll_id로 위조가 가능했고, **staff/owner는 사실상 무제한**이었다(자기 크루 것도 아닌 poll을 가져다 써도 막지 않았다).
- **캐스케이드가 실제로 발동한다** — 위조 즉시 `status='confirmed'`인 완전한 Meetup 행이 생겨 캘린더에 노출되고(FR-061 AC4), 참석 신청(FR-066)까지 받을 수 있는 상태가 된다. 알림(FR-045 `poll_closed`)만 안 갈 뿐, 그 외 모든 기능이 "진짜 가결된 모임"과 구분되지 않는다.
- **I-089와 다른 점**: I-089는 `polls` 자체를 조작해 `finalize_closed_poll` 트리거가 "정상 경로로" Meetup을 만들게 유도했다. 이건 **그 트리거를 아예 안 거치고 `meetups`에 직접 쓰는, 독립적인 두 번째 문**이었다 — I-089를 막았어도 이 문은 그대로 열려 있었다.

## 4. 수정 — I-090과 같은 원칙(전면 금지, 신뢰 경로만 통과)

**"조건을 더 얹어 RLS를 고친다" 대신 클라이언트 직접 쓰기 자체를 막았다.** 이유:

1. **패치보다 안전하다.** WITH CHECK에 "poll.status='closed_passed' AND poll이 속한 crew=crew_id"를 추가하는 방식도 가능했지만, 이런 다중 조인 boolean 식은 I-090의 1차 시도가 겪었던 것과 같은 종류의 실수(조건 하나를 빠뜨리는)에 취약하다. REVOKE는 조건식이 아니라 "권한 자체가 없다"이므로 잘못 쓸 여지가 구조적으로 없다.
2. **정당한 생성 경로가 이미 RLS/GRANT를 우회한다.** `finalize_closed_poll`(SECURITY DEFINER, 테이블 소유자 `postgres`)은 애초에 `anon`·`authenticated`에게 준 GRANT와 무관하게 항상 쓸 수 있다 — REVOKE는 이 경로에 아무 영향이 없다.
3. **staff/owner의 "poll 없이 수동으로 Meetup 만들기"는 애초에 요구사항에 없다.** FR-060 "행위자: 시스템", D-003 "Meetup은 오직 투표로만 확정된다"를 재확인했고, `permission.ts` 권한 매트릭스에도 `meetup:create` 같은 행 자체가 없다(grep 확인) — **팀장이 우려한 "이게 결함이 아니라 설계일 수 있다"는 가능성은 근거 확인 결과 기각**한다.

```sql
revoke insert, delete, truncate on public.meetups from anon, authenticated;
drop policy if exists meetups_insert_proposal_author_or_staff on public.meetups;
```

`DELETE`·`TRUNCATE`도 함께 회수했다 — I-090이 겪은 정확히 같은 패턴("DELETE 정책이 없어 지금은 무해하지만, 나중에 정책이 생기면 조용히 열린다")을 미리 막는다. `UPDATE` 권한은 건드리지 않았다 — `cancelMeetup`(FR-065, `status='cancelled'` 조건부 UPDATE)과 `respond_meetup_attendance`의 `attending_count` 갱신이 정당하게 쓰고 있고, `trg_meetups_guard_attendee_scope` + `meetups_update_members_scoped_by_trigger` RLS가 이미 독립적으로 지킨다.

## 5. 회귀 검증 (실측)

**공격 재현 — 전부 차단 확인**: §2의 5개 시나리오를 수정 후 다시 실행 → a·b·c·d+e 전부 `403 permission denied for table meetups`(RLS가 아니라 GRANT 단계에서 차단, 더 앞선 방어선)로 변경. f(대조군)도 여전히 차단.

**정상 경로 회귀 — 둘 다 확인**:

1. **사람이 직접 조기 종료하는 경로**: 테스트 poll에 A가 투표(`for`) → A가 실 REST `PATCH /polls`로 조기 종료(`closePoll`과 동일한 형태) → `200`, `status=closed_passed` → **0.5초 내 `meetups`에 poll_id로 조회하면 실제로 생성돼 있음을 확인**(`finalize_closed_poll`이 REVOKE와 무관하게 정상 동작).
2. **pg_cron 자동 종료 경로**(팀장이 "가장 위험한 자리"로 지목): `closes_at`을 과거로 설정한 poll + 투표 1건을 만들고 `run_poll_auto_close_job()`을 직접 호출(cron이 실제로 부르는 것과 동일 함수) → poll이 자동으로 닫히고(`processed:1`) **Meetup이 정상 생성됨을 확인**.

두 경로 모두 테이블 소유자(`postgres`) 권한으로 실행되는 `finalize_closed_poll`을 거치므로 REVOKE의 영향을 받지 않는다는 설계 그대로 동작했다.

`get_advisors(security)`: 수정 전후 둘 다 신규 WARN 0건(기존 `auth_leaked_password_protection` 1건만 무관하게 잔존).

## 6. 산출물

- 마이그레이션: `supabase/migrations/20260729084949_major_fix_i101_meetups_direct_insert_bypass.sql`.
- `src/lib/data/supabase/meetup.ts`의 `createMeetupFromPoll` 독스트링 갱신 — 이 함수는 원래도 미사용 dead code였지만(grep 확인), 세션 클라이언트로 호출하면 이제 항상 실패한다는 사실과 되살리려면 service-role 경로가 필요하다는 점을 남겼다(코드 동작 자체는 무변경).
- `docs/ISSUES.md` I-101(번호는 팀장 배정), `docs/prioritization-and-risks.md` D-064(필요 시 팀장 등재).

## 7. 남은 것

- **다른 테이블에 같은 패턴(RLS만 있고 상태 검사 없음 + 정당 경로가 SECURITY DEFINER로 GRANT 우회)이 더 있는지는 전수 조사하지 않았다** — 이번 조사는 `meetups`로 범위를 좁혔다(팀장 인계 범위). I-091이 이미 self-service(행 소유권) 패턴을 전수 조사했지만, 이건 그것과 다른 축("staff/owner의 광역 권한이 값 검증 없이 열려 있다")이라 I-091 표에 없던 칸이다 — 다음 회차 후보로 남긴다.
- 실 데이터 오염은 없었다(전부 신규 테스트 크루/poll로 재현, 실 시드 데이터에 위조 Meetup을 심지 않았다).

## 교차검증 (CREW, 22일차)

이 건의 출발점(DESIGN Task 045 검증 중 인접 발견)이라 직접 재검증했다. 전부 **실 REST**(실
로그인 토큰, 테스트 크루 `729ced18…`에 실 proposal post·poll·투표를 새로 만들어)로, SQL
시뮬레이션에 기대지 않고 재현했다 — 21일차 교훈("REST 직접 호출로 확인해라")과, 이번 회차
직접 겪은 교훈(입력값을 SQL에서 조인해 만들면 REST의 실수를 못 잡는다, `chat_messages`
오진 사건) 둘 다 반영했다.

### 1. 정상 경로 생존 여부 — **PASS (둘 다 실측)**

- **사람이 직접 조기 종료**: 새 proposal post(`ee36b2f1…`) → poll(`45130665…`) → A·B 둘 다
  `for` 투표 → A가 실 REST `PATCH /rest/v1/polls`로 조기 종료(`status:closed_passed,
  result:passed` 전송) → `200`. **직후 `meetups`에 해당 `poll_id`로 실제 행이 생성됨을 SQL로
  확인**(`crew_id`·`title`·`date`·`start_time`·`place`·`capacity` 전부 post에서 정확히
  복사됨, `status='confirmed'`).
- **pg_cron 자동 종료**: 새 proposal post(`b9613607…`) → poll(`71ec42c6…`, `closes_at`을
  과거로 설정) → A·B 투표 → **`select public.run_poll_auto_close_job();`을 직접 호출**(cron이
  실제로 부르는 것과 동일 함수, service-role 우회가 아니라 그 함수 자체) → `processed:1` →
  poll이 `closed_passed`로 전이되고 **`meetups`에 실제로 생성됨을 확인**.
- 결론: `finalize_closed_poll`(SECURITY DEFINER, 테이블 소유자 `postgres`)이 REVOKE의 영향을
  받지 않는다는 BOARD의 근거가 실측으로도 확인된다. FR-060·D-003 회귀 없음.

### 2. UPDATE 경로 생존 여부 — **PASS (둘 다 실측)**

- **`respond_meetup_attendance` RPC**: B가 방금 생성된 실 Meetup에 실 REST RPC로 `attending`
  응답 → `{"ok":true,"changed":true}`, `meetups.attending_count`가 0→1로 실제 증가 확인.
- **`cancelMeetup`과 같은 모양의 UPDATE**: A가 그 Meetup을 실 REST `PATCH /rest/v1/meetups`로
  `status:"cancelled"` 전송 → `200`, 실제로 `cancelled`로 전이. FR-065 AC1 회귀 없음.

### 3. 4개 익스플로잇 시나리오 독립 재현(수정 후 전부 막혀야 함) — **PASS**

실 REST로 2개 변형을 재시도했다(같은 `meetups_insert_proposal_author_or_staff` GRANT 회수가
막는 지점이라 4개 전부를 다시 돌 필요 없이, "본인 poll_id 재사용"과 "타인 poll_id 차용" 두
축을 대표로 확인하면 충분하다고 판단했다):

- A(제안자 본인·staff)가 **자기가 방금 가결시킨 실 poll_id**로 `meetups` 직접 INSERT 시도 →
  **`403 permission denied for table meetups`**(RLS 메시지가 아니라 GRANT 단계 메시지, `hint:
  "GRANT INSERT ON public.meetups TO authenticated"` — RLS까지 가지도 못하고 더 앞에서 막힘).
- A(staff)가 **전혀 무관한 다른 poll_id**(`ca5f2550…`, 다른 크루 소속)로 `meetups` 직접 INSERT
  시도 → **동일하게 `403 permission denied`**.

두 경우 모두 예전엔 `201`이 나던 자리다 — 수정이 실제로 막는 것을 확인했다.

### 4. DELETE/TRUNCATE 회수 부작용 — **PASS**

`grep -rn "\.delete("`로 `src/lib/data/supabase/meetup.ts`·`lib/actions/*.ts` 전체를 훑어
meetups에 대한 DELETE 호출 0건 확인(`cancelMeetup`은 UPDATE, 취소는 소프트 상태 전이다).
`information_schema.role_table_grants`로 직접 조회 — `anon`·`authenticated` 둘 다 남은 권한이
`SELECT`·`UPDATE`·`REFERENCES`·`TRIGGER`뿐, `INSERT`·`DELETE`·`TRUNCATE` 전부 없음을 확인했다.

### 5. advisors·마이그레이션 파일/DB 일치 — **PASS**

`get_advisors(security)` 신규 WARN 0건(기존 `auth_leaked_password_protection` 1건만 잔존,
수정 전후 동일). `list_migrations`에 `20260729084949_major_fix_i101_meetups_direct_insert_
bypass`가 있고, 로컬 `supabase/migrations/`에 같은 이름의 파일이 실재함을 확인 — 로컬/DB
어긋남 없음.

### 정리

테스트로 만든 post 2건·poll 2건·poll_votes/poll_eligible_voters·meetup 2건·meetup_attendances
1건·해당 poll을 참조하는 `notifications`(poll_closed) 전부 직접 DELETE로 정리, 재조회로 0건
확인(21일차·BOARD Task 037 검증에서 얻은 "notifications도 반드시 확인한다" 교훈을 그대로
적용했다). 실 시드 데이터는 건드리지 않았다.

### 요약

| # | 항목 | 판정 |
| --- | --- | --- |
| 1 | 정상 경로(수동 종료 + pg_cron 종료) 생존 | PASS |
| 2 | UPDATE 경로(참석 응답·취소) 생존 | PASS |
| 3 | 4개 익스플로잇 재현(전부 막혀야 함) | PASS |
| 4 | DELETE/TRUNCATE 회수 부작용 없음 | PASS |
| 5 | advisors·마이그레이션 일치 | PASS |

새로 등재할 이슈는 없다.
