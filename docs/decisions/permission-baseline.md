# 권한 회귀 감지 기준선(Permission Regression Baseline)

- **일자**: 2026-07-29(25일차) / **담당**: CREW(A팀) — 팀장 배정
- **성격**: 이 문서는 새 결함을 찾는 조사 문서가 아니다. **오늘 시점 권한 상태를 기계가
  재현 가능한 형태로 고정**해, 다음 회차부터 "같은 조회를 다시 돌려 출력을 대조하는 것"만으로
  회귀를 잡을 수 있게 하는 것이 유일한 목적이다. **CI 연동·자동화 스크립트는 이번 범위가
  아니다**(D-072가 CI를 별개 결정으로 분리해 뒀다) — 여기 있는 것은 문서 + 재현 가능한 SQL
  뿐이다.
- **정정 이력(25일차, 같은 날 — BOARD 독립 재현 교차검증)**: 최초 작성 직후 BOARD가
  전체 쿼리를 독립적으로 재실행해 대조했다. 쿼리 1(RLS 활성화)·3(테이블 권한·TRUNCATE
  0건)·5(default privileges)·8(publication)은 **바이트 단위로 완전 일치**(쿼리 5의 일치는
  D-074 원복이 완전한 원상태임을 별도로 증명한다). 쿼리 2·4·6·7의 **집계 숫자 3곳
  (정책 59→60, 함수 74→69, 트리거 29→32행)은 틀려 있었다** — 원인은 실제 DB 변화가
  아니라 **최초 작성 시의 집계 오류**였음을 CREW가 원시 데이터 재대조로 확인했다(정책·
  함수 이름 집합 자체는 100% 불변, 트리거는 "정의 29개/부착 행 32개"를 혼동한 표현
  오류). 아래 각 쿼리 절에 정정 내역을 인라인으로 남겼다. **이 정정을 반영해 재스냅샷한
  시점: 25일차, D-074(함수 기본 EXECUTE 잠금 원복) 이후.** 회차 중 DB가 계속 바뀌는
  날에는 "언제 뜬 스냅샷인가"가 숫자만큼 중요하므로 명시해 둔다 — 이 문서의 모든 수치는
  이 시점 기준이다.

## 0. 왜 지금인가

24일차 CREW가 `docs/decisions/insert-axis-audit-102-103.md`(또는 관련 교차검증 기록)에
남긴 말: "UPDATE(I-091) · INSERT(I-101~103) · DELETE/TRUNCATE(I-111·112) 네 축이 전부
소진됐다. **다음 결함은 새 축이 아니라 기존 축의 회귀일 가능성이 높다.**" 25일차 실제로
CREW(I-030 필터 추가)·DESIGN(컨테이너 수정)이 각각 코드를 고쳤고, I-120 수정 때
`CREATE OR REPLACE FUNCTION`이 기존 REVOKE를 유지하는지 **매번 손으로**(`information_schema.
role_routine_grants` 재조회) 확인해야 했다. 손으로 확인하는 한 언젠가 빠진다 — 그래서 그
확인 자체를 "다시 실행 가능한 조회 + 저장된 기준선"으로 고정한다.

## 1. 스냅샷 대상과 근거

| # | 대상 | 근거(어느 축이 여기서 무너졌는가) |
| --- | --- | --- |
| 1 | 테이블별 RLS 활성화·강제(FORCE) 상태 | 모든 권한 사고의 전제조건 — RLS가 꺼지면 정책 자체가 무의미해진다. FORCE는 테이블 소유자(`postgres`)에게도 RLS를 적용할지를 결정하는 별도 플래그라 따로 추적한다 |
| 2 | 테이블별 RLS 정책 전문(정책명·명령·`using`·`with_check`) | I-091(UPDATE)·I-101~103(INSERT)이 전부 "정책의 `with_check`/`using`이 특정 불변식을 빠뜨렸다"는 모양이었다 — 정책 텍스트 자체가 회귀 감지의 핵심 대상 |
| 3 | `anon`/`authenticated`/`public` 롤의 테이블 권한(특히 TRUNCATE) | **I-111이 정확히 여기서 나왔다** — TRUNCATE 권한이 anon/authenticated에 열려 있었다 |
| 4 | 함수 EXECUTE 권한(그랜티 목록) | **I-114 헬퍼가 여기서 회귀했다** — SECURITY DEFINER 헬퍼의 EXECUTE를 회수했다가(24일차 CREW 자신의 회귀) 재확인 없이 넘어갈 뻔한 사례가 바로 오늘(I-120)도 있었다 |
| 5 | `ALTER DEFAULT PRIVILEGES` 상태(신규 테이블·함수의 기본 권한) | "미래 신규 오브젝트가 같은 실수를 반복하지 않는가"를 보는 유일한 지점 — I-111 이후 테이블 기본 권한에서 TRUNCATE가 실제로 빠졌는지 여기서만 확인 가능하다 |
| 6 (추가) | `public`/`private` 스키마 함수 인벤토리 — `SECURITY DEFINER` 여부·`search_path` 설정·본문 해시(`md5(prosrc)`) | D-055/I-092가 확립한 "SECURITY DEFINER 함수는 `set search_path = ''`을 강제한다" 규칙이 유지되는지, 그리고 **정책 텍스트는 그대로인데 정책이 참조하는 헬퍼 함수 내부가 바뀌는 회귀**(아래 §5 한계 참고)를 최소한 "이 함수 자체가 바뀌었다"는 신호로는 잡기 위해 추가했다 |
| 7 (추가) | 트리거 부착 상태(테이블·이벤트·타이밍·연결 함수) | I-120류(가드 트리거) 회귀는 "함수 내용은 멀쩡한데 트리거 자체가 다른 함수를 가리키게 되거나 사라지는" 경우도 있을 수 있다 — 정책·함수 인벤토리만으로는 이 축을 못 잡는다 |
| 8 (보너스) | `supabase_realtime` publication에 등록된 테이블 목록 | D-030 ②/CON-12(이 프로젝트는 Realtime **Broadcast**를 쓰고 Postgres Changes replication은 쓰지 않는다) 전제가 깨지는지 확인하는 1줄짜리 확인 — 오늘은 0건(전제 그대로) |

### 뺀 것과 이유

- **컬럼 단위 GRANT(`information_schema.column_privileges`)** — 전수 grep
  (`grep -rniE "grant\s+(select|insert|...)\s*\([^)]+\)\s+on" supabase/migrations/*.sql`)
  결과 이 프로젝트에 컬럼 단위 GRANT가 **0건**이다. 이 뷰는 테이블 단위 GRANT만 있어도
  모든 컬럼에 대해 행을 만들어내(효과적 권한을 컬럼 단위로 펼쳐 보여줌) `role_table_grants`와
  거의 완전히 중복되고(오늘 기준 2,466행), 실제 컬럼 단위 GRANT가 생기기 전까지는 순수
  잡음이다. 컬럼 단위 GRANT를 쓰기 시작하면 그때 추가한다.
- **함수 오버로드(동일 이름, 다른 시그니처) 대응** — `role_routine_grants`는 인자 타입을
  구분하지 않아 오버로드가 있으면 그랜티 집계가 어느 시그니처의 권한인지 모호해진다. 오늘
  기준 `public`·`private` 스키마에 오버로드된 함수가 **0건**임을 확인했다(§4 쿼리 3 참고)
  — 생기면 이 기준선도 함수 인자까지 그룹핑 키에 넣어야 한다.
- **`storage`·`auth`·`realtime` 등 Supabase 관리 스키마 자체의 정책·권한** — 이 프로젝트가
  직접 만들거나 수정하지 않는 영역이다(마이그레이션이 전부 `public`/`private`만 건드린다).
  다만 §4 default privileges 조회는 전체 스키마를 보되(다른 스키마는 Supabase 관리 롤만
  보이는 게 정상 — 아래 §3-5 참고), 이상 여부를 한눈에 대조할 수 있게 남겨 뒀다.

## 2. 재현 절차(다음 회차부터)

1. `mcp__supabase__list_tables`로 대상이 MO-IM 프로젝트인지 먼저 확인한다(낯선 테이블이
   보이면 멈춘다 — CLAUDE.md 지침 그대로).
2. 아래 §4의 쿼리 8개를 **문구 그대로** 실행하고 출력을 저장한다(SQL 실행 도구 — 이
   프로젝트는 `mcp__supabase__execute_sql`을 쓴다).
3. 이 문서 §4의 "오늘(25일차) 기준선" 절과 **줄 단위로 대조**한다 — 모든 쿼리가 명시적
   `ORDER BY`로 정렬을 고정해 뒀으므로 실행 순서·시각과 무관하게 같은 데이터면 같은 순서로
   나온다. 표(사람이 읽는 형태)가 아니라 쿼리 자체의 원시 출력(행 집합)을 대조 대상으로
   삼는다.
4. 다른 점이 있으면:
   - **의도된 변경**(이번 회차 마이그레이션이 설명하는 변경)이면 이 문서의 해당 절을 그
     회차의 새 기준선으로 갱신하고 "왜 바뀌었는가"를 한 줄 남긴다.
   - **설명되지 않는 변경**이면 회귀다 — 어떤 마이그레이션이 이 변경을 만들었는지
     `list_migrations`로 시각을 대조해 역추적하고, 즉시 팀장에게 보고한다(이번 문서 작성
     지침과 동일하게 "발견했다고 그 자리에서 고치지 말고" 보고를 우선한다 — 단, 이미
     알려진 CRITICAL 축이 실증되면 팀 관행상 즉시 수정 후 사후 보고가 맞다, I-114 전례
     참고).
5. **주의**: 이 대조는 사람이 눈으로 하거나 `diff` 커맨드로 텍스트를 비교하는 수준이다.
   CI 연동은 하지 않는다(범위 밖).

## 3. 자기반증(Self-Falsification) — 오늘 실제로 수행

무해한 변경을 가하고 diff가 실제로 잡아내는지 확인한 뒤 원복했다. 대상은
`public.notification_preferences`(0행, 최저 위험) — I-111이 다룬 축과 **같은 종류**(TRUNCATE
권한)를 정확히 재현했다.

1. **베이스라인**(변경 전): `notification_preferences` × `authenticated` →
   `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,UPDATE` (TRUNCATE 없음).
2. **변경 적용**: `grant truncate on public.notification_preferences to authenticated;`
3. **재조회**(§4 쿼리 3과 동일 쿼리, `notification_preferences`로 좁힌 것): →
   `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` — **TRUNCATE가 나타남**.
   **diff가 정확히 이 한 단어를 잡아낸다.**
4. **원복**: `revoke truncate on public.notification_preferences from authenticated;`
5. **재확인**: 다시 `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,UPDATE`로 복귀 — 베이스라인과
   완전히 일치.

**결론**: 이 기준선(§4 쿼리 3)은 I-111과 같은 모양의 회귀를 diff 한 줄로 잡아낸다 — 24일차
CREW가 헬퍼 EXECUTE 회귀를 스스로 잡았던 감각을, 이번엔 "사람이 매번 손으로 재확인"이 아니라
"저장된 값과 대조"로 옮겼다.

## 4. 오늘(25일차) 기준선 — 쿼리 8개 + 원문 출력

### 쿼리 1 — 테이블별 RLS 활성화·강제 상태

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
```

**결과(26개 테이블, 전부 `rls_enabled=true`·`rls_forced=false`)**: `audit_logs`·
`auth_attempts`·`blocks`·`boards`·`chat_messages`·`chat_room_reads`·`chat_rooms`·`comments`·
`crew_memberships`·`crews`·`email_resend_attempts`·`handle_availability_check_attempts`·
`handle_search_attempts`·`invitations`·`join_requests`·`meetup_attendances`·`meetups`·
`notification_preferences`·`notifications`·`poll_eligible_voters`·`poll_votes`·`polls`·
`posts`·`product_events`·`profiles`·`reports`.

**회귀 판정 기준**: 목록에서 테이블이 빠지거나(= 새 테이블이 RLS 없이 생성됨), 어느 행이라도
`rls_enabled=false`면 즉시 CRITICAL.

### 쿼리 2 — RLS 정책 전문

```sql
select tablename, policyname, cmd, permissive, roles::text as roles, qual as using_expr, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

**결과**: **60개** 정책, 전부 `permissive=PERMISSIVE`(**25일차 재확인·정정 — 원래 "59개"로
적었던 것은 DB 변화가 아니라 이 문서를 처음 쓸 때의 집계 오류였다.** BOARD가 독립 재현
중 60개로 세어 팀장에게 보고했고, CREW가 테이블별 카운트를 직접 재대조한 결과
`audit_logs 1·auth_attempts 1·blocks 3·boards 1·chat_messages 3·chat_room_reads 3·
chat_rooms 1·comments 3·crew_memberships 3·crews 4·email_resend_attempts 1·
handle_availability_check_attempts 1·handle_search_attempts 1·invitations 3·
join_requests 3·meetup_attendances 1·meetups 2·notification_preferences 4·
notifications 2·poll_eligible_voters 3·poll_votes 3·polls 3·posts 3·product_events 1·
profiles 3·reports 3` — 합산하면 60이다. **정책 텍스트 자체(아래 예시 3개 포함)는 최초
스냅샷과 전부 일치** — 정책이 늘거나 바뀐 게 아니라 처음 셀 때 숫자를 잘못 적은 것이다.
재확인 시점: 25일차, D-074 원복 이후). 원문 전체(테이블·정책명·명령·롤·`using`·
`with_check`)는 이 조사의 원시 출력에 있고 분량상 이 문서엔 대표적으로 아래만 옮긴다(전체
재현은 위 쿼리를 그대로 실행하면 된다) — **다음 회차 대조는 쿼리 결과 전체를 대상으로 한다**,
아래는 사람이 읽기 위한 요약일 뿐이다:

- `crew_memberships_insert_self_request`(INSERT) — `with_check`:
  `(profile_id = auth.uid()) AND (status = 'requested')` — **I-120이 트리거 레벨에 이중화한
  바로 그 조건**. 이 정책 텍스트가 바뀌면 트리거의 명시 검사와 이중 방어가 어긋난다.
- `invitations_insert_staff_or_owner`(INSERT) — `not private.is_blocked(invitee_id,
  inviter_id)` 절 포함(FR-081 AC2, 042A). 이 절이 사라지면 차단자 우회 재발.
- `crews_select_anon_public`(SELECT, `anon` 대상) — `visibility = 'public'`. `crews` 테이블에
  대해 `anon` 롤이 갖는 유일한 정책 — 이게 없어지거나 조건이 느슨해지면 D-007 붕괴.

**회귀 판정 기준**: 어느 정책이든 `using`/`with_check` 텍스트가 이전 기준선과 한 글자라도
다르면 — 그 변경이 이번 회차 마이그레이션으로 설명되지 않는 한 — 회귀로 간주한다.

### 쿼리 3 — 테이블 권한(anon/authenticated/public, 롤별 권한 목록 하나로 병합)

```sql
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated','public')
group by table_name, grantee
order by table_name, grantee;
```

**결과 요약(전체 26개 테이블 × `anon`/`authenticated`, `public` 그랜티는 0건)**:

| 테이블 | anon/authenticated 권한 |
| --- | --- |
| `audit_logs`·`auth_attempts`·`blocks`·`chat_messages`·`chat_room_reads`·`comments`·`crew_memberships`·`crews`·`email_resend_attempts`·`handle_availability_check_attempts`·`handle_search_attempts`·`join_requests`·`notification_preferences`·`notifications`·`poll_eligible_voters`·`poll_votes`·`polls`·`posts`·`profiles`·`reports` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,UPDATE` |
| `boards`·`chat_rooms` | `DELETE,REFERENCES,SELECT,TRIGGER,UPDATE`(INSERT 없음 — 자동 생성 전용) |
| `invitations` | `INSERT,REFERENCES,SELECT,TRIGGER,UPDATE`(DELETE 없음 — 하드 삭제 없는 설계) |
| `meetup_attendances` | `REFERENCES,SELECT,TRIGGER`(I-090 — INSERT/UPDATE/DELETE 전부 회수, RPC 전용) |
| `meetups` | `REFERENCES,SELECT,TRIGGER,UPDATE`(INSERT 없음 — 생성은 `posts`/`polls` 경유) |
| `product_events` | `authenticated`만: `INSERT,REFERENCES,TRIGGER`(SELECT 없음 — self-service INSERT 전용, 집계는 service_role) |

**TRUNCATE는 위 26개 테이블 어디에도, 어떤 그랜티에도 나타나지 않는다** — I-111 수정이 오늘도
유지되고 있음을 이 한 줄로 확인한다. **회귀 판정 기준**: 이 목록 어디에든 `TRUNCATE`가
나타나면 즉시 CRITICAL(§3의 자기반증이 증명하듯 이 쿼리는 그 즉시 잡는다).

### 쿼리 4 — 함수 EXECUTE 그랜티

```sql
select routine_schema, routine_name, string_agg(distinct grantee, ',' order by grantee) as grantees
from information_schema.role_routine_grants
where routine_schema in ('public','private')
group by routine_schema, routine_name
order by routine_schema, routine_name;
```

**결과**: `private` 스키마 **20개** 함수, `public` 스키마 **49개** 함수(**25일차 재확인·
정정 — 원래 "21개"·"53개"로 적었던 것도 위 정책 개수와 같은 종류의 오류다.** BOARD가
독립 재현 중 20/49로 세어 보고했고, CREW가 `select count(*) from pg_proc ... where
nspname='private'/'public'`로 직접 재확인한 결과 20/49가 맞다 — **이번 회차에 CREW가
D-074에서 만든 임시 검증 함수(전부 확인 후 즉시 DROP)나 다른 팀원의 병행 작업 때문에
줄어든 게 아니라, 최초 스냅샷 원시 출력을 셀 때부터 이미 20/49였는데 문서 요약 문장에
21/53이라고 잘못 옮겨 적은 것이다** — CREW가 이 문서 작성 당시 캡처해 둔 원시 함수
목록(`private`: `admin_list_reports`·`admin_resolve_report`·`compute_poll_decision`·
`crew_directory_summary`·`disband_crew`·`get_meetup_crew_id`·`get_profile_public_by_id`·
`has_valid_pending_invitation`·`is_active_crew_member`·`is_blocked`·`is_crew_active`·
`is_crew_staff_or_owner`·`meetup_directory_summary`·`my_active_crew_ids`·`my_crew_role`·
`owns_active_crew`·`poll_vote_tally`·`poll_vote_tally_for_decision`·`profile_search`·
`respond_meetup_attendance` = 20개)를 다시 세어 직접 확인했다. **함수 이름 집합 자체는
최초 스냅샷과 100% 일치**(추가·삭제 0건) — 순수하게 문서 집계 실수였다. 로컬 마이그레이션
파일 부재(I-051, `apply_migration`은 원격에만 적용하고 로컬 `.sql`을 안 만든다)로 "그 사이
어떤 마이그레이션이 함수를 지웠을 수도 있다"는 가설을 SQL 이력으로 재구성해 배제하는 것은
불가능했지만, 원시 데이터 자체의 재대조만으로 이번 건은 카운트 오류임을 확정할 수 있었다.
재확인 시점: 25일차, D-074 원복 이후. 전체 그랜티 목록은 이
조사의 원시 출력에 있다(분량상 생략, 재현은 쿼리 그대로 실행). **다음 회차 대조 시 특히
확인할 것**:

- `public.crew_memberships_guard_self_insert_request` → `postgres,service_role`만(오늘
  I-120 수정 후 확인 — anon/authenticated 없음).
- `public.poll_eligible_voters_guard_insert_scope` → `postgres,service_role`만(I-103 수정
  유지).
- SECURITY DEFINER **트리거** 함수(반환 타입이 `trigger`인 것) 전부가 `postgres,
  service_role`만 갖고 있어야 한다 — 아래 쿼리 6과 교차 대조.
- `private.*` 함수 중 `anon`/`authenticated`가 있는 것들(`crew_directory_summary`·
  `has_valid_pending_invitation` 등)은 **의도된 것**이다 — 대응하는 `public.*` 얇은
  래퍼(SECURITY INVOKER)가 그 권한으로 내부 호출을 하기 때문(2단 구조 패턴, Task
  040/042A/042B가 확립). 이 자체가 사라지면(= 래퍼가 호출을 못 하게 됨) 그것도 회귀지만
  방향이 반대다 — **없어서 생기는 회귀**(기능 장애)와 **생겨서 문제인 회귀**(권한 상승)를
  구분해서 봐야 한다.

**함수 오버로드 확인**: `public`·`private`에 동일 이름·다른 시그니처 함수 **0건**
(오늘 확인) — 이 쿼리가 여전히 함수 하나당 한 줄임을 보장하는 전제다.

### 쿼리 5 — `ALTER DEFAULT PRIVILEGES` 상태

```sql
select pg_get_userbyid(d.defaclrole) as owner_role, n.nspname as schema,
       d.defaclobjtype as object_type, d.defaclacl::text as acl
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
order by schema, object_type, owner_role;
```

**`public` 스키마 결과(이 프로젝트가 실제로 건드릴 수 있는 유일한 스키마)**:

| object_type | acl |
| --- | --- |
| `S`(시퀀스) | `postgres=rwU/postgres, anon=rwU/postgres, authenticated=rwU/postgres, service_role=rwU/postgres` |
| `f`(함수) | `postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres` |
| `r`(테이블) | `postgres=arwdDxtm/postgres, anon=arwdxtm/postgres, authenticated=arwdxtm/postgres, service_role=arwdDxtm/postgres` |

**중요한 관찰(회귀는 아니다, 구조적 관찰)**:

1. **테이블 기본 권한은 `anon`/`authenticated`에서 대문자 `D`(TRUNCATE)가 이미 빠져 있다**
   (`postgres`/`service_role`엔 `arwdDxtm`로 있음) — 새로 만드는 테이블은 **기본값만으로**
   TRUNCATE가 막힌다. I-111 이후 이 기본 권한 자체를 고쳐 뒀다는 뜻이고, 오늘 재확인했다.
2. **함수 기본 권한(`f`)은 `anon`/`authenticated`에 `X`(EXECUTE)가 그대로 있다** — 이건
   PostgreSQL/Supabase의 표준 기본값이고 **이 프로젝트가 별도로 잠가 두지 않았다.** 그
   결과 **새 SECURITY DEFINER 함수를 만들 때마다 그 자리에서 수동으로 EXECUTE를 회수해야
   한다** — 이 프로젝트가 지금까지 실제로 그렇게 해 왔다(I-092/I-101~103/I-114/I-120 전부
   "함수 생성 마이그레이션 + REVOKE" 짝으로 되어 있다). **오늘 쿼리 4·6 교차 대조 결과
   예외 0건**(SECURITY DEFINER 트리거·RPC 함수 중 anon/authenticated에 EXECUTE가 남은 것
   없음) — 지금까지는 이 수동 규율이 지켜졌다는 뜻이지, 구조적으로 강제됐다는 뜻은 아니다.
   **25일차 후속(D-074) — 팀장이 적용을 판단했으나 자기반증으로 무효를 확인해 원복했다.**
   팀장이 이 관찰을 근거로 "테이블에 이미 같은 조치를 했다·실패 방향이 옳다·기존 함수엔
   영향 없다"고 판단해 `alter default privileges ... revoke execute on functions from
   anon, authenticated`(및 Supabase 공식 문서의 여러 변형 구문)를 `public`·`private` 양쪽에
   적용했다. **팀장이 명시적으로 요구한 자기반증**("새 테스트 함수를 만들어 EXECUTE가
   안 붙는지 확인하라") 도중, 완전히 새로 만든 검증 전용 스키마에서도 **새 함수가 매번
   여전히 `PUBLIC`(전체 롤 대상) EXECUTE를 자동으로 갖는다**는 것을 `pg_proc.proacl` 직접
   조회로 확인했다 — `pg_default_acl`엔 의도한 대로 anon/authenticated가 빠진 행이 저장
   됐지만, 실제 `CREATE FUNCTION` 시점엔 그 행과 무관하게 `PUBLIC` 기본권한이 항상 다시
   깔린다. 원인은 특정하지 못했다(`public` 스키마 소유자가 PG15+ `pg_database_owner`
   유사역할인 점, `postgres`가 `rolsuper=false`인 점을 후보로 확인). **효과 없는 변경이라
   판단해 원복했다** — 상세·근거·원복 확인은 **D-074**(`prioritization-and-risks.md`)
   참고. **결론: 이 환경에서는 함수 기본 EXECUTE를 기본권한 메커니즘으로 잠글 수 없다 —
   기존 "함수 생성마다 명시적 REVOKE" 관행이 사실상 유일한 차단 수단이며 계속 그것에
   의존한다.**

**회귀 판정 기준**: `r`(테이블) 행의 `anon`/`authenticated` ACL에 대문자 `D`가 나타나면
즉시 CRITICAL. `f`(함수) 행은 위 관찰대로 원래도 열려 있으므로 이 자체는 판정 기준이 아니다
— 대신 쿼리 4·6이 개별 함수 단위 판정을 담당한다.

### 쿼리 6 — 함수 인벤토리(SECURITY DEFINER·search_path·본문 해시)

```sql
select n.nspname as schema, p.proname as name,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       coalesce(p.proconfig::text, '') as proconfig,
       md5(p.prosrc) as body_hash,
       pg_get_function_result(p.oid) as result_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private')
order by schema, name, args;
```

**25일차 추가**: `result_signature`(`pg_get_function_result`) 컬럼을 추가했다 — §5 한계
6번(BOARD가 실증)을 최소한이라도 닫기 위해서다. `RETURNS TABLE(...)` 함수의 결과 컬럼명이
바뀌면 `body_hash`는 그대로여도 이 컬럼은 바뀐다(예: `poll_vote_tally`의 실제 시그니처는
`TABLE(poll_id uuid, poll_status text, eligible_count integer, participant_count integer,
for_count integer, against_count integer, abstain_count integer, tally_hidden boolean)` —
`participant_count`가 다른 이름으로 바뀌면 이 문자열이 즉시 달라진다).

**결과 요약**: `private` **20개**(전부 `security_definer=true`, 전부
`proconfig={"search_path=\"\""}`— D-055/I-092 규칙 100% 준수), `public` **49개**(SECURITY
DEFINER·INVOKER 혼재 — INVOKER는 사용자 트리거 가드·RLS 보조용, DEFINER는 RPC·프로비저닝
트리거). **(25일차 정정 — 원래 "21개"·"53개"로 적었던 것은 위 쿼리 4 절과 같은 종류의
집계 오류다. 상세·재현 경위는 위 쿼리 4 절 참고.)** 전체 함수의 `body_hash`(원시 출력에
함수당 1개씩 있음)가 오늘의 기준값이다 —
**다음 회차에 어느 함수든 `body_hash`가 바뀌었는데 그 함수를 건드리는 마이그레이션이 이번
회차 목록에 없다면, 그것이 바로 §5가 말하는 "정책 텍스트는 같은데 헬퍼가 바뀐" 회귀를 잡는
지점이다.**

**예외 없음 확인(`search_path`)**: `public`·`private` **69개**(20+49, 위 함수 수 정정 반영)
함수 중 `search_path` 설정이 없는 함수는 **0건**(`chat_messages_broadcast`·
`join_requests_stamp_decided_at` 2개만 `search_path=public`이고 나머지 **67개**는
`search_path=""` — 이 둘은 트리거 브로드캐스트용으로 `public.` 접두 없이 테이블을 참조해야
해서 의도적으로 다르다는 것을 원 마이그레이션 주석에서 확인했다. 나머지 67개는 전부 완전
격리).

**회귀 판정 기준**: `security_definer=true`인 함수가 `proconfig`에서 `search_path` 설정을
잃으면(검색 경로 하이재킹 취약점, D-055/I-092 클래스) 즉시 CRITICAL. `body_hash` 변경은
자동으로 CRITICAL은 아니지만 반드시 "무슨 마이그레이션이 왜 바꿨는가"를 설명할 수 있어야
한다.

### 쿼리 7 — 트리거 부착 상태

```sql
select event_object_table as table_name, trigger_name, event_manipulation, action_timing, action_statement
from information_schema.triggers
where event_object_schema = 'public'
order by table_name, trigger_name, event_manipulation;
```

**결과**: **고유 트리거 정의 29개 / 실제 부착 행 32개**(25일차 재확인·정정 — 원래 "29개
트리거 행"이라고 적은 것은 표현 오류였다. 트리거 *정의*는 정확히 29개가 맞지만, 그중
**3개**가 INSERT·UPDATE 양쪽에 걸려 각각 2행으로 잡힌다 — `chat_messages_broadcast_trigger`·
`poll_votes_broadcast_trigger`에 더해 **`notification_preferences_guard_mandatory_types`
도 INSERT+UPDATE 2행**인데 최초 작성 시 이 세 번째를 목록에서 빠뜨리고 정의 개수 29를
그대로 "행 개수"라고 적었다 — BOARD가 세 번째 트리거를 짚어 정정했다. 29(정의) + 3(2행
트리거) = 32행). 전체 목록은 원시 출력
참고. **오늘 확인한 것**: `crew_memberships` 테이블의 `trg_crew_memberships_guard_self_
insert_request`(BEFORE INSERT → `crew_memberships_guard_self_insert_request()`)가
정상 부착돼 있음 — I-120 수정이 함수 본문만 바꾸고 트리거 부착 자체는 그대로임을 이 쿼리로
확인했다.

**회귀 판정 기준**: 트리거가 목록에서 사라지거나, `action_statement`가 가리키는 함수 이름이
바뀌거나, `action_timing`(BEFORE/AFTER)이 바뀌면 — 설명되지 않는 한 회귀.

### 쿼리 8 — Realtime publication 등록 테이블(보너스)

```sql
select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
```

**결과**: 0행. D-030 ②/CON-12(Broadcast만 쓰고 Postgres Changes replication은 쓰지 않는다)
전제가 오늘도 유지된다. **회귀 판정 기준**: 1행이라도 나타나면 — 의도된 아키텍처 변경(새
결정 필요)이 아닌 한 — 이 전제가 깨진 것이므로 팀장에게 보고한다.

## 5. 이 기준선이 잡지 **못하는** 회귀 유형(정직한 한계)

1. **정책 텍스트는 그대로인데, 정책이 참조하는 헬퍼 함수의 "논리"가 바뀌는 경우** — 예:
   `crews_select_authenticated` 정책은 `id IN (SELECT crew_id FROM crew_memberships WHERE
   ...)`처럼 다른 테이블을 직접 서브쿼리로 참조하지, 헬퍼 함수를 부르지 않는 경우가
   많다 — 이런 정책은 애초에 이 문제가 없다. 하지만 `private.is_active_crew_member(crew_id)`
   같은 헬퍼를 참조하는 정책(`crew_memberships_select_self_or_fellow_member` 등)은, **정책
   텍스트 자체(쿼리 2)는 안 바뀌어도 헬퍼 함수 내부가 바뀌면 정책의 실제 동작이 바뀐다.**
   쿼리 6의 `body_hash`가 이 경우를 **잡아낸다** — 단, "이 헬퍼가 어느 정책들에서 쓰이는가"
   까지 자동으로 알려주지는 않는다(그 매핑은 쿼리 2의 `using`/`with_check` 텍스트를 사람이
   읽고 헬퍼 이름을 찾아야 한다). **완전 자동 계약 테스트가 아니라 "뭔가 바뀌었다"는 신호**
   까지만 준다.
2. **애플리케이션 레이어(`src/lib/rules/*`·Server Action·`checkPermission`)의 권한 판정** —
   이 기준선은 **DB 레벨**(RLS·GRANT·트리거)만 본다. `checkPermission`(순수 함수)의 권한
   매트릭스가 잘못 바뀌어도 DB가 여전히 올바르게 막고 있다면(또는 반대로 DB가 느슨해도 앱이
   막고 있다면) 이 기준선은 그 층을 전혀 보지 못한다 — `docs/decisions/cross-verification-
   core-crew-24.md`류의 앱 레이어 대조가 별도로 필요하다.
3. **데이터 자체에 의존하는 권한 판정의 우회** — 예: `crews.status`가 `'active'`가 아닌
   갑자기 다른 문자열(오타·새 상태값)로 들어오면 정책의 `status = 'active'` 비교가 항상
   거짓이 되어 "과도하게 막힘"이 생길 수 있다. 이건 권한 설정의 회귀가 아니라 **데이터
   무결성 문제**라 이 기준선의 대상이 아니다(CHECK 제약·타입으로 방어해야 한다).
2.5. **Realtime Broadcast 채널 자체의 인가**(`supabase_realtime.messages` 토픽별 RLS
   등, Broadcast Authorization을 쓰게 되면 생기는 새로운 정책 계층) — 이 프로젝트는 아직
   Broadcast RLS를 정책 레벨로 걸지 않은 것으로 보이며(마이그레이션 전수에 `realtime.
   messages` 관련 정책 0건), 걸게 되면 이 기준선에 새 항목을 추가해야 한다.
4. **역할(role) 자체의 속성 변경** — 예: `authenticated` 롤에 `BYPASSRLS`가 실수로 부여되면
   이 기준선의 어떤 쿼리도 잡지 못한다(전부 "정책이 있다"는 전제 위에서만 본다). 이건
   발생 가능성이 극히 낮고(슈퍼유저 권한 조작이 필요) Supabase 관리 콘솔 밖에서 일어나기
   어려워 이번엔 쿼리를 추가하지 않았다 — 필요하면 `select rolname, rolbypassrls from
   pg_roles where rolname in ('anon','authenticated');` 한 줄을 더하면 된다.
5. **PostgREST 설정 자체**(노출 스키마 목록, 익명 역할 매핑 등) — DB 내부가 아니라
   Supabase 프로젝트 설정이라 SQL로 스냅샷할 수 없다. 이 프로젝트의 `.mcp.json`/프로젝트
   설정이 바뀌면 이 기준선과 무관하게 별도로 확인해야 한다.
6. **(25일차, BOARD 실증) `body_hash`는 함수 "본문 텍스트"만 해시한다 — `RETURNS
   TABLE(...)`의 결과 컬럼 이름이 바뀌어도 본문이 그대로면 해시가 안 바뀐다.** BOARD가
   임시 함수로 직접 증명했다: `RETURNS TABLE(participant_count int, ...)`를
   `RETURNS TABLE(participants_count int, ...)`로 **컬럼명만** 바꾸고 본문(`prosrc`)은
   그대로 두자 `md5(prosrc)`가 완전히 동일했다. **이게 왜 위험한지가 핵심이다**: 이
   프로젝트의 실제 결함 I-119가 정확히 이 모양이었다 — `getPollTally`(앱 데이터 레이어)가
   `poll_vote_tally` RPC의 결과를 `row.participant_count`라는 **이름으로** 매핑한다
   (`src/lib/data/supabase/poll.ts`). RPC가 이 컬럼명을 조용히 바꾸면 `body_hash`만 보는
   기준선은 전혀 못 잡고, 앱은 `undefined`를 받아 I-119류 결함이 조용히 재발한다.
   **대응**: 쿼리 6에 `pg_get_function_result(p.oid)`(`result_signature`)를 추가해 이
   특정 모양(RETURNS TABLE 컬럼명 변경)은 이제 잡는다 — 컬럼명이 바뀌면 이 문자열이
   즉시 달라진다. **`pg_get_function_result`를 넣기로 한 판단과 그 한계**: 이 컬럼을
   추가하면 "컬럼 이름이 그대로인데 의미만 바뀌는 경우"(예: `participant_count`라는
   이름은 유지한 채 그 값의 계산식만 바뀌는 경우)는 여전히 못 잡는다 — 그건 오히려
   `body_hash`(본문 텍스트 변경)가 잡아야 할 몫이고, 두 컬럼(`body_hash`+
   `result_signature`)을 같이 둬야 "본문 안 바뀜+시그니처 안 바뀜"일 때만 안전하다고
   말할 수 있다. 즉 이번 추가는 §5-1이 이미 인정한 한계("완전 자동 계약 테스트가 아니라
   '뭔가 바뀌었다'는 신호까지만 준다")를 좁힌 것이지 없앤 것은 아니다.

## 6. 오늘 발견했지만 "결함이 아닌" 것 — 새 이슈로 등재하지 않은 이유

기준선을 뜨는 과정에서 처음엔 이상해 보였던 것 하나: `public` 스키마의 여러 트리거 가드
함수(`chat_messages_guard_delete_only`·`crews_guard_archived_immutable`·`crews_guard_
owner_only_fields`·`meetups_guard_attendee_scope`·`notification_preferences_guard_
mandatory_types`·`notifications_guard_read_only_self_update`·`posts_guard_non_author_
delete_only`·`profiles_guard_self_status_transition`·`join_requests_stamp_decided_at`·
`comments_guard_non_author_delete_only`·`crew_memberships_guard_self_transition`)가
`PUBLIC,anon,authenticated,postgres,service_role` 전체에 EXECUTE를 열어 두고 있다.
**결함이 아니다** — 전부 `security_definer=false`(SECURITY INVOKER)다. 트리거 함수는
Postgres가 애초에 직접 호출을 막고("trigger functions can only be called as triggers"),
설령 호출된다 해도 INVOKER 함수는 호출자 자신의 권한으로만 실행되므로 권한 상승이 없다.
반면 SECURITY DEFINER인 트리거·RPC 함수는 오늘 확인한 전부(`crew_memberships_guard_self_
insert_request`·`poll_eligible_voters_guard_insert_scope`·`crews_provision_owner_
bootstrap`·`invitations_provision_membership` 등)가 이미 `postgres,service_role`로만
좁혀져 있다 — 예외 0건. `get_advisors(security)`도 이를 뒷받침한다(오늘 재확인, 신규
WARN 0건). 새 이슈로 등재하지 않았다.

## 7. 산출물

- 이 문서(`docs/decisions/permission-baseline.md`), 신규.
- DB 변경 없음(자기반증용 GRANT/REVOKE는 즉시 원복, §3 참고). 마이그레이션 미적용.
- 이슈 등재 없음(§6 — 조사 중 발견한 것은 결함이 아니라고 판단, draft에도 올리지 않음).

## 8. 26일차 첫 정기 대조 — 이 도구의 첫 실전 재사용

- **일자**: 2026-07-29(세션 시각 기준 — 시스템 "오늘"은 2026-07-30이지만 DB 서버 시각은
  세션 내내 2026-07-29였다, `now()` 결과로 확인) / **담당**: CREW.
- **전제 변화**: 이번 회차 중 CORE가 `meetup_reschedule_pipeline_079` 마이그레이션
  (version `20260729152504`, FR-065 AC2 "일정 변경 투표")을 적용했다. 로컬에
  `docs/decisions/meetup-reschedule-079.md`가 이 세션 시점엔 아직 없어(CORE 작업 진행 중으로
  추정) 문서 대조 대신 **`supabase_migrations.schema_migrations.statements`로 실제 적용된
  SQL 원문을 직접 읽어** 대조 기준으로 삼았다 — 이 마이그레이션은 (1) `posts`에
  `target_meetup_id` 컬럼·CHECK 2개 추가, (2) 신규 트리거 함수
  `posts_guard_reschedule_target_scope`(+명시적 REVOKE 포함, D-074 요건 충족) 및 트리거
  `trg_posts_guard_reschedule_target_scope`(INSERT+UPDATE 2종 이벤트), (3) `polls_insert_
  proposal_author` 정책 DROP+CREATE(허용 타입에 `meetup_reschedule_proposal` 추가), (4) 신규
  테이블 `meetup_schedule_changes`(RLS 활성화 + SELECT 정책 1개 + 클라이언트 쓰기 전부
  REVOKE), (5) `private.respond_meetup_attendance`·`public.finalize_closed_poll`·
  `public.run_poll_auto_close_job` 3개 함수 본문 교체(시그니처 불변)로 구성된다.
- **재현 절차 준수**: `list_tables`로 대상이 MO-IM(26개→27개 테이블, ref
  `damruradpliktkrlkakl`)임을 먼저 확인했다. 쿼리 8개를 문서 그대로 재실행했다.

### 쿼리별 대조 — 원시 출력에서 직접 센 숫자만 적는다

| # | 최초 기준선(25일차) | 오늘(26일차) | 판정 |
| --- | --- | --- | --- |
| 1 (RLS 활성화) | 26개 테이블 | **27개**(+`meetup_schedule_changes`, `rls_enabled=true`·`rls_forced=false`) | **정당한 변경** — CORE 마이그레이션 ④. 그 외 26개는 값 불변 |
| 2 (RLS 정책 전문) | 60개 | **61개**(원시 출력에서 테이블별로 다시 세어 합산 확인 — 오탈 방지) | **정당한 변경** — `meetup_schedule_changes_select_members` 신규 +1. 추가로 `polls_insert_proposal_author`의 `with_check` 텍스트가 `p.type = 'meetup_proposal'` → `p.type = ANY (ARRAY['meetup_proposal','meetup_reschedule_proposal'])`로 바뀜(정책 개수는 DROP+CREATE라 불변, 텍스트만 변경) — 마이그레이션 ③과 정확히 일치. 그 외 정책 텍스트(예시로 재확인한 `crew_memberships_insert_self_request`·`invitations_insert_staff_or_owner`·`crews_select_anon_public`) 전부 바이트 단위 불변 |
| 3 (테이블 권한) | 26개 테이블×anon/authenticated, TRUNCATE 0건 | **27개 테이블**(+`meetup_schedule_changes`: 양쪽 롤 모두 `REFERENCES,SELECT,TRIGGER` — `meetup_attendances`와 동일 패턴). **TRUNCATE 여전히 0건** | **정당한 변경**(신규 테이블) + **회귀 없음 확인**(I-111 축) |
| 4 (함수 EXECUTE 그랜티) | private 20 / public 49 | private **20**(불변) / public **50**(+1) | **정당한 변경** — 신규 `posts_guard_reschedule_target_scope`가 `postgres,service_role`만 가짐(D-074 요건대로 같은 마이그레이션 안에서 REVOKE 포함 확인). 기존 3개 교체 함수(`respond_meetup_attendance`·`finalize_closed_poll`·`run_poll_auto_close_job`)의 그랜티는 `CREATE OR REPLACE`에도 불구하고 **불변**(자기반증 통과 — D-074가 우려한 "교체 시 grant 유실" 없음). 문서가 명시적으로 짚어둔 두 함수(`crew_memberships_guard_self_insert_request`·`poll_eligible_voters_guard_insert_scope`)도 `postgres,service_role`만으로 불변 확인 |
| 5 (default privileges) | `public` 스키마 `S`/`f`/`r` 3행 | **바이트 단위 완전 일치**(`r`: `anon=arwdxtm`·TRUNCATE 없음 그대로, `f`: `anon=X` 그대로 — D-074 원복 상태 계속 유지) | **회귀 없음** |
| 6 (함수 인벤토리) | private 20 / public 49, 예외 없는 `search_path`, 2건만 `search_path=public` | private 20(불변) / public **50**(+1, 신규 함수도 `search_path=""` 정상 — 예외 아님, 여전히 2건만 `public`: `chat_messages_broadcast`·`join_requests_stamp_decided_at`) | **정당한 변경** — `body_hash` 변경은 마이그레이션이 명시한 3개 함수(`respond_meetup_attendance`·`finalize_closed_poll`·`run_poll_auto_close_job`)로 전부 설명됨. `result_signature`는 이 3개 모두 **불변**(`TABLE(ok,changed,reason)`·`void`·`bigint`) — 시그니처 드리프트 없음 |
| 7 (트리거) | 정의 29개 / 행 32개 | 정의 **30개**(+1) / 행 **34개**(+2) | **정당한 변경** — `trg_posts_guard_reschedule_target_scope`가 INSERT+UPDATE 2개 이벤트에 걸려 정의 1개가 행 2개를 만든다(기존 3개 2행-트리거와 같은 패턴). 나머지 29개 정의·32행은 이름·타이밍·연결 함수 전부 불변 |
| 8 (Realtime publication) | 0행 | **0행** | **회귀 없음** — D-030 ②/CON-12 전제 유지 |

### 3분류 요약

- **정당한 변경**: 쿼리 1·2·3·4·6·7 — 전부 `meetup_reschedule_pipeline_079`(I-079, FR-065 AC2)
  하나로 완전히 설명된다. 숫자·텍스트 델타가 마이그레이션 원문과 한 글자도 어긋나지 않았다.
- **가짜 diff(도구 결함)**: **0건.** 이번 대조는 최초 기준선과 달리 집계 오류를 만들지
  않았다 — 표에 적은 숫자는 전부 원시 JSON 출력을 육안으로 다시 세어 합산한 값이다(산문을
  베끼지 않았다, 팀장 지시 준수).
- **실제 회귀**: **0건.** 쿼리 5·8은 바이트/행 단위로 완전 불변. 쿼리 3의 TRUNCATE(I-111 축)도
  0건 유지.

### 관찰(회귀는 아니다) — 새 트리거 함수의 EXECUTE 관례 이탈

`posts_guard_reschedule_target_scope`는 `security_definer=false`(다른 BEFORE 가드 트리거
함수들과 동일)인데도 CORE가 `public,anon,authenticated`의 EXECUTE를 명시적으로 REVOKE했다.
기존 관례(§6, 25일차)는 "트리거 함수는 Postgres가 직접 호출을 막고 INVOKER라 권한 상승도
없으므로 `PUBLIC` EXECUTE를 그대로 둔다"였다 — `chat_messages_guard_delete_only`·
`meetups_guard_attendee_scope` 등 11개가 여전히 `PUBLIC,anon,authenticated,postgres,
service_role`로 열려 있다. 이번 REVOKE는 **더 엄격한 방향의 이탈**이라 결함이 아니고
새 이슈로 올리지 않는다 — 다만 "가드 트리거 함수는 EXECUTE를 안 잠가도 된다"는 관례와
"새 함수는 REVOKE"라는 D-074 관례가 서로 다른 함수에 다르게 적용된 사례로 남는다.

### BOARD 한계 6번(`result_signature`) 재검증 — 실제로 작동함을 재확인

25일차 이후 이 세션에서 직접 재현했다(스크래치 함수, 즉시 DROP로 정리): `RETURNS
TABLE(participant_count int, other_count int)`을 본문 변경 없이 `RETURNS
TABLE(participants_count int, other_count int)`으로 컬럼명만 바꾸자 —
`body_hash`는 두 버전 모두 `b2df11a5d04bb76fd0af48b4e2d47ff4`로 **동일**(예상대로 못 잡음),
`result_signature`는 `TABLE(participant_count integer, ...)` → `TABLE(participants_count
integer, ...)`로 **정확히 달라짐**. 25일차 BOARD가 추가한 이 컬럼이 의도한 대로 작동한다.

### 한계(이번 대조에서 드러난 것)

- **문서 §2가 요구하는 "원시 출력과 줄 단위 대조"를 문자 그대로는 못 했다** — 25일차 문서에는
  쿼리 6·4의 전체 원시 출력(함수 70개 각각의 body_hash)이 보존돼 있지 않고 "원시 출력에
  있다(분량상 생략)"로만 적혀 있어, 이번 세션은 그 원시 출력에 접근할 수 없었다. 대신
  (1) 문서가 명시적으로 인용한 개별 값(정책 텍스트 3건, 함수 그랜티 2건)은 바이트 단위로
  재확인했고, (2) 카운트 델타는 CORE 마이그레이션의 실제 SQL 원문과 대조해 "설명 가능한
  변경"임을 구조적으로 검증했다. 완전한 회귀 감지(모든 함수의 이전 해시와의 전수 diff)는
  **다음 회차부터 이 문서에 원시 카운트 스냅샷을 그대로 첨부해 두어야** 가능하다 — 이 자체를
  새 이슈로 draft에 남긴다.
- `docs/decisions/meetup-reschedule-079.md`가 이 세션 시점엔 없어 CORE의 1차 문서와
  대조하지 못했다(대신 실제 적용된 SQL 원문으로 대조) — 문서가 이후 생기면 내용이 이번 절과
  어긋나지 않는지 한 번 더 확인이 필요하다(미확인으로 남김).
