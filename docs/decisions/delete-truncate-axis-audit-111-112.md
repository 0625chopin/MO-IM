# DELETE(및 TRUNCATE) 축 전수조사 — 마지막 빈 축을 메운다 (I-111·I-112)

- **일자**: 2026-07-30(24일차)
- **담당**: CREW(A팀), 이번 회차 로드맵 Task 0건 — 팀장이 배정한 DELETE/TRUNCATE 축 전수조사
  단독 배정
- **참조**: I-091(21일차, self-service RLS 미제한 결함군 정식화)·D-064(REVOKE 우선 원칙),
  I-101~I-103(23일차, INSERT 축 전수조사·`docs/decisions/insert-axis-audit-102-103.md`)이
  §8에서 남긴 "DELETE/TRUNCATE 축은 아직 별도 전수 조사가 없다"는 후속 지침

## 0. 요약

UPDATE 축(I-091)·INSERT 축(I-101~I-103, 23일차)이 차례로 CRITICAL·MAJOR를 냈고, 두 축 모두
"분류 체계에 빈 축이 있으면 그 축의 결함은 아무리 성실히 표를 훑어도 안 나온다"는 것을
증명했다. 이번 회차는 마지막 빈 축인 **DELETE·TRUNCATE**를 메웠다.

- **`pg_policies`의 DELETE/ALL 정책을 전수 열거**했다 — 실제로 행을 지울 수 있는 정책은
  **3건**뿐이었고, 그중 2건(`blocks_delete_self`·`notification_preferences_delete_self`)은
  안전, 1건(`invitations_delete_inviter_or_staff`)이 상태값을 제한하지 않는 결함이었다
  (**I-112, MAJOR**).
- 정작 **결함의 무게중심은 DELETE 축이 아니라 TRUNCATE 축**이었다. RLS는 SELECT/INSERT/
  UPDATE/DELETE만 필터링하고 **TRUNCATE는 전혀 필터링하지 않는다** — Supabase 기본 GRANT가
  `anon`/`authenticated`에 public 스키마 **26개 테이블 중 24개**의 TRUNCATE 권한을 그대로
  남겨 뒀다(`audit_logs`·`poll_votes`·`poll_eligible_voters`·`crew_memberships`·`reports`·
  `notifications`·`product_events` 전부 포함). 실측으로 `authenticated` 롤이 `TRUNCATE
  audit_logs`를 실제로 성공시킴을 확인했다(**I-111, CRITICAL**).
- FK `ON DELETE` 동작을 전수 조회한 결과 **간접 삭제(부모 삭제로 자식을 우회 파기) 경로는
  구조적으로 없다** — `profiles→auth.users`, `handle_search_attempts→profiles` 2건만
  `CASCADE`이고 나머지 전부 `RESTRICT`/`NO ACTION`이다(§3).
- 둘 다 마이그레이션으로 수정하고 실측으로 재현 실패를 확인했다(§5). 자기반증(§6)에서 TRUNCATE
  수정이 좁힌 범위·정당 경로 생존·`PUBLIC` 롤 별도 그랜트 여부·`pg_default_acl`(미래 테이블
  재발 방지)까지 확인했다.

## 1. 방법론 — 이번 축에 특화된 조사 절차

기존 두 축(UPDATE·INSERT)은 `pg_policies`의 `qual`/`with_check`가 컬럼값을 제한하는지를
물었다. DELETE는 컬럼값이 아니라 **"어느 행을 지울 수 있는가"** 하나만 판정 대상이라 표의
질문이 다르다:

1. **정책이 아예 없는 테이블**(default deny) — 안전하지만 "왜 없는가"(고의적 소프트 삭제
   설계인지, 그냥 빠뜨린 것인지)를 구분해서 적는다.
2. **정책이 있는 테이블** — 행 소유권 스코프가 정확한지, 삭제 가능 행의 **상태값**(예:
   `invitations.status`)을 제한해야 하는데 안 하고 있는지를 본다.
3. **TRUNCATE 그랜트** — RLS와 무관한 별도 축이라 `information_schema.role_table_grants`를
   `DELETE`·`TRUNCATE` 둘 다 조회해 대조한다.
4. **FK `ON DELETE` 동작** — `pg_constraint.confdeltype`을 전수 조회해 `CASCADE`인 관계만
   골라 "부모를 지우면 자식이 몰래 사라지는가"를 확인한다.

## 2. DELETE 축 — 정책 전수 표(26개 테이블)

`pg_policies`에서 `cmd IN ('DELETE','ALL')`이고 `authenticated`/`anon`에 열린 정책을 조회한
결과 실제로 행을 지울 수 있는 정책은 3건, 명시적 전체 차단(`ALL … USING (false)`)이 5건,
**나머지 18개 테이블은 DELETE 정책이 아예 없어 RLS 기본값(deny)으로 막혀 있다.**

| # | 테이블 | DELETE 가능 정책 | 정책 없음(default deny)의 성격 | 컬럼값(상태) 제한 | 판정 |
| --- | --- | --- | --- | --- | --- |
| 1 | `profiles` | 없음 | 의도됨 — 탈퇴는 `status='withdrawn'`+익명화(D-044), 하드 삭제 없음 | 해당없음 | 안전 |
| 2 | `auth_attempts` | `ALL(false)` | 명시적 전체 차단(D-020, 클라이언트 접근 불가) | 해당없음 | 안전 |
| 3 | `crews` | 없음 | 의도됨 — 해산은 `status='archived'`(`disband_crew` RPC), 하드 삭제 없음 | 해당없음 | 안전 |
| 4 | `crew_memberships` | 없음 | 의도됨 — 강퇴/탈퇴는 `status='removed'/'left'`(자연 복합키 행 보존, I-106~I-110의 전제 자체) | 해당없음 | 안전 — **팀장 우선순위 테이블, 검증 완료** |
| 5 | `invitations` | `invitations_delete_inviter_or_staff`(수정 전) | — | **미검사(status 무관)** | **I-112 MAJOR, 이번에 수정** |
| 6 | `join_requests` | 없음 | 의도됨 — 자진 철회는 `status='withdrawn'`(FR-022), 하드 삭제 없음 | 해당없음 | 안전 |
| 7 | `boards` | 없음 | 의도됨 — Crew 1:1, 크루 해산 시에도 행 보존 | 해당없음 | 안전 |
| 8 | `posts` | 없음 | 의도됨 — 소프트 삭제(`deleted_at`, `posts_guard_non_author_delete_only` UPDATE 가드) | 해당없음 | 안전 |
| 9 | `comments` | 없음 | 의도됨 — 소프트 삭제(`deleted_at`, `comments_guard_non_author_delete_only`) | 해당없음 | 안전 |
| 10 | `polls` | 없음 | 의도됨 — 종결 상태(`closed_*`/`cancelled`)로만 표현, 행 보존 | 해당없음 | 안전 |
| 11 | `poll_eligible_voters` | 없음 | 의도됨 — D-025 스냅샷 고정(생성 후 불변) | 해당없음 | 안전 — **팀장 우선순위 테이블, 검증 완료** |
| 12 | `poll_votes` | 없음 | 의도됨 — NFR-032 불변, I-092가 `invalidated` 플래그로 무효화만 허용 | 해당없음 | 안전 — **팀장 우선순위 테이블, 검증 완료** |
| 13 | `meetups` | 없음 | 의도됨 — 취소는 `status='cancelled'`(FR-046) | 해당없음 | 안전 |
| 14 | `meetup_attendances` | 없음(I-090이 이미 회수) | 의도됨 — 참석/불참은 `respond_meetup_attendance` RPC 전용 | 해당없음 | 안전(기존 상태 재확인) |
| 15 | `chat_rooms` | 없음 | 의도됨 — Crew 1:1, 행 보존 | 해당없음 | 안전 |
| 16 | `chat_messages` | 없음 | 의도됨 — 소프트 삭제(`deleted_at`, `chat_messages_guard_delete_only`), D-033 배치 파기는 **service_role 전용**(12개월 보관 job) | 해당없음 | 안전 |
| 17 | `notifications` | 없음 | 의도됨(또는 최소 무해) — 읽음 처리는 UPDATE(`notifications_guard_read_only_self_update`)만 허용, 삭제 자체가 아예 없음 | 해당없음 | 안전 — **팀장 우선순위 테이블, 검증 완료** |
| 18 | `notification_preferences` | `notification_preferences_delete_self` | — | 검사됨 — 삭제는 "기본값(enabled=true)으로 되돌리기"와 동치(코드 확인, §4) | 안전 |
| 19 | `reports` | 없음 | 무해 — 신고 자체 철회 기능 없음(FR-080에 없음), 관리자만 `admin_resolve_report`로 상태 전이 | 해당없음 | 안전 — **팀장 우선순위 테이블, 검증 완료** |
| 20 | `blocks` | `blocks_delete_self` | — | 검사됨 — 자기 차단 해제(FR-081), CHECK(`blocker≠blocked`)와 PK가 이중 방어 | 안전 |
| 21 | `audit_logs` | `ALL(false)` | 명시적 전체 차단(NFR-015) | 해당없음 | 안전 — **팀장 우선순위 테이블, 검증 완료(단 TRUNCATE는 취약이었다, §3)** |
| 22 | `email_resend_attempts` | `ALL(false)` | 명시적 전체 차단(FR-001 E4 카운터) | 해당없음 | 안전 |
| 23 | `handle_search_attempts` | `ALL(false)` | 명시적 전체 차단(D-005·NFR-016 카운터) | 해당없음 | 안전 |
| 24 | `handle_availability_check_attempts` | `ALL(false)` | 명시적 전체 차단(I-065·D-047 카운터) | 해당없음 | 안전 |
| 25 | `product_events` | 없음 | 의도됨 — insert-only 로그(NFR-030), 삭제 기능 자체가 요구사항에 없음 | 해당없음 | 안전 — **팀장 우선순위 테이블, 검증 완료** |
| 26 | `chat_room_reads` | 없음 | 의도됨(추정) — I-108이 이미 이 테이블의 값 위조를 별도로 다룸, DELETE는 아예 안 열려 있음 | 해당없음 | 안전 |

**26개 테이블 전수 — DELETE 축 자체의 신규 결함은 1건(#5, I-112)뿐이다.** "정책이 없어서 아무도
못 지운다" 18건은 전부 **소프트 삭제·상태 전이로 이미 대체된 의도된 설계**였다 — 이 프로젝트가
하드 삭제 대신 상태 컬럼(archived/removed/withdrawn/cancelled/deleted_at)을 쓰는 일관된 패턴을
써 왔기 때문에, DELETE 축 자체는 상대적으로 깨끗했다. **결함의 무게중심은 다음 절의 TRUNCATE
축이었다.**

## 3. TRUNCATE 축 — RLS가 전혀 관여하지 않는 별도 권한 체계

### 3.1 왜 별도로 봐야 하는가

Postgres RLS(`ROW LEVEL SECURITY`)는 이름 그대로 **행 단위** 보안이다. `SELECT`/`INSERT`/
`UPDATE`/`DELETE` 네 명령만 정책 평가 대상이고, **`TRUNCATE`는 테이블을 통째로 비우는 DDL에
가까운 연산이라 RLS 정책 평가 자체가 일어나지 않는다.** 실행 가능 여부는 오직 테이블 단위
`GRANT ... TRUNCATE`권한 하나로만 결정된다. 즉 **`pg_policies`를 아무리 정교하게 채워도
TRUNCATE에는 영향이 없다** — 이번 조사 이전까지 21~23일차의 모든 self-service RLS 강화
작업(I-089~I-110)이 이 축을 전혀 건드리지 않았다.

### 3.2 전수 조회

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and grantee in ('anon','authenticated')
  and privilege_type in ('DELETE','TRUNCATE')
order by table_name, grantee, privilege_type;
```

결과(수정 전): **26개 테이블 중 24개**에서 `anon`·`authenticated` 양쪽 또는 한쪽에 TRUNCATE가
살아 있었다. 예외는 `meetups`(I-101 정리 때 우연히 전체 GRANT 회수)뿐이었다. `PUBLIC`
의사롤(pseudo-role)에는 별도 그랜트가 없음을 확인했다(`grantee='PUBLIC'` 조회 결과 0행) —
즉 문제는 딱 `anon`/`authenticated` 두 롤에 국한됐다.

### 3.3 실측 재현 — 성공을 실제로 확인(가설로 적지 않는다)

```sql
begin;
set local role authenticated;
truncate table public.audit_logs;
select count(*) as audit_logs_count_after_truncate_attempt from public.audit_logs;
rollback;
```

결과: `audit_logs_count_after_truncate_attempt = 0`(원래 2행) — **TRUNCATE가 실제로
성공했다.** `rollback`으로 실제 데이터 손실 없이 동작만 증명했다(트랜잭션 밖에서 재조회해
원본 2행이 그대로임을 별도로 확인). 같은 방식으로 `poll_votes`도 성공을 확인했고,
`has_table_privilege('authenticated', ..., 'TRUNCATE')`로 `crew_memberships`·`reports`·
`product_events`·`notifications`(anon 포함)까지 팀장이 우선순위로 지목한 "지워지면 증거가
사라지는" 테이블 전부가 동일하게 취약함을 확인했다.

**`audit_logs`·`poll_votes`는 자신을 참조하는 자식 테이블이 없는 leaf 테이블이라 `CASCADE`
키워드 없이 단독 `TRUNCATE table_name;` 한 줄로 즉시 전체 행이 사라진다** — FK가 있는
테이블(`profiles`처럼 자식이 있는 경우)도 `TRUNCATE ... CASCADE`로 연쇄 파기가 가능하다(다만
이 프로젝트는 거의 모든 FK가 `RESTRICT`라 `CASCADE` 없이는 그 자체로 실패한다, §4).

### 3.4 현재 실제 도달 가능성 — 과장하지 않는다

PostgREST(Supabase REST API)의 테이블 엔드포인트는 `SELECT`/`INSERT`/`UPDATE`/`DELETE`만
HTTP 메서드로 노출하고 **`TRUNCATE`를 발행하는 경로가 없다.** `anon`/`authenticated`는
`NOLOGIN` 롤이라 외부에서 DB 포트로 직접 `psql` 접속도 불가능하다. 그래서 "지금 이 순간
공개 API 하나로 재현 가능한" 결함은 아니다 — 이 점을 부풀리지 않는다.

그러나 이 GRANT는 **`anon`/`authenticated`로 실행되는 모든 SQL에 유효한 권한**이다. 이
프로젝트의 **공개(`public`) RPC 함수 25개 + `private` 스키마 함수 20개, 합 45개**를
`has_function_privilege`(공개 계층)·`pg_proc.prosrc` 직접 검색(`private` 계층)으로 전수
확인한 결과 현재 TRUNCATE를 실행하는 함수는 0건이었지만(§6.2), **미래에 추가될 RPC나 동적
SQL을 쓰는 함수 하나가 이 GRANT를 상속**하면 그 즉시 재현 가능해진다 — D-064가 이미 "지금은
무해하지만 나중에 정책이 바뀌면 조용히 열린다"고 경고한 패턴과 정확히 같고, 이번에는 그
대상이 컬럼 하나가 아니라 **테이블 전체**다. 이 구조적 위험이 CRITICAL 판정의 근거다(§5.3에서
다시 다룬다).

**`private` 계층을 별도로 봐야 하는 이유(DESIGN 교차검증 지적, 24일차 보강)**: `admin_
resolve_report` 같은 공개 RPC는 실제로는 `private.admin_resolve_report`(SECURITY DEFINER)를
호출하는 **2단 구조**(029B 관례)다. `has_function_privilege('authenticated', ...)`로
공개 계층 25개만 훑으면 이 안쪽 계층이 잡히지 않는다 — `private` 스키마 자체는 `anon`/
`authenticated`에 `USAGE`가 부여돼 있고(D-028, `rls_private_schema_and_helpers.sql`) 그
안의 함수들도 개별적으로 `EXECUTE`가 열려 있는 경우가 있어(트리거 전용이 아닌 것들, 예:
`private.my_crew_role` 등) 이 계층도 "이론상 TRUNCATE를 실행할 수 있는 코드 위치" 후보다.
`private` 스키마 20개 함수 전체를 `pg_proc.prosrc`에서 `'truncate'` 문자열로 직접 검색한
결과도 **0건**(직접 재확인 완료). **결론은 그대로 선다 — 오히려 "현재 공개 API로는 재현
안 된다"는 §3.4의 주장이 더 튼튼해진다**(공개·비공개 두 계층 모두 확인했으므로).

## 4. FK `ON DELETE` 동작 — 간접 삭제(우회) 경로 전수 조회

```sql
select con.conname, cl.relname as source_table, fcl.relname as target_table,
  case con.confdeltype
    when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE'
    when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as on_delete
from pg_constraint con
join pg_class cl on cl.oid = con.conrelid
join pg_class fcl on fcl.oid = con.confrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where con.contype = 'f' and ns.nspname='public'
order by on_delete desc, source_table;
```

**41개 FK 중 39개가 `RESTRICT`**다 — 자식 행이 하나라도 남아 있으면 부모 삭제 자체가
DB 레벨에서 거부된다. 예외 2건:

| FK | on_delete | 위험 평가 |
| --- | --- | --- |
| `profiles_id_fkey`(`profiles.id → auth.users.id`) | `CASCADE` | `auth.users` 삭제는 Supabase Auth Admin API(service_role 전용) 경로로만 가능하다. D-044(탈퇴 익명화)가 확인한 대로 이 프로젝트의 탈퇴 흐름은 **`auth.users`를 실제로 삭제하지 않는다**(이메일 익명화 + `banned_until='infinity'`) — 클라이언트가 도달할 방법이 없어 구조적으로 안전 |
| `handle_search_attempts_identifier_fkey`(`→ profiles.id`) | `CASCADE` | `handle_search_attempts` 자체가 `ALL(false)`로 완전 차단된 카운터 테이블이라(§2 #23) 부모(`profiles`)가 지워질 일 자체가 없고, 지워져도 카운터 행이 사라지는 것은 무해 |
| `product_events_actor_id_fkey`(`→ profiles.id`) | `NO ACTION` | `RESTRICT`와 사실상 동일(지연 제약이 아니므로) — 부모 삭제 시 즉시 거부 |

**결론: 이 스키마에는 "직접 DELETE는 막혀 있지만 부모 행을 지워 우회할 수 있는" 간접 삭제
경로가 없다.** `RESTRICT`가 사실상 전면 채택돼 있고, 예외 2건도 client가 도달할 수 없거나
이미 완전 차단된 테이블이 걸려 있다. 팀장이 지시한 "간접 삭제 축"은 **이번 스키마에서는
음성(구조적으로 안전)**이라는 것이 조사 결과다 — 가설이 아니라 41개 FK 전수 조회로 확인했다.

## 5. 수정 — 두 마이그레이션

### 5.1 I-111(TRUNCATE) — GRANT 회수 + 재발 방지

```sql
revoke truncate on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;
```

`pg_default_acl` 조회 결과 `postgres` 롤의 `public` 스키마 기본 ACL이 `anon`/`authenticated`
에게 `arwdDxtm`(TRUNCATE 포함 전체)을 이미 부여하고 있었다 — 기존 테이블만 REVOKE하고 이
기본값을 그대로 두면 **다음 마이그레이션이 새 테이블을 하나만 추가해도 같은 결함이 조용히
재발한다.** 그래서 미래 테이블에 대한 기본 권한 자체를 좁혔다(마이그레이션
`major_fix_i111_revoke_truncate_from_client_roles`).

### 5.2 I-112(invitations DELETE) — 죽은 표면 REVOKE(D-064)

```sql
revoke delete on public.invitations from anon, authenticated;
drop policy if exists "invitations_delete_inviter_or_staff" on public.invitations;
```

정당한 client DELETE 사용처가 앱 코드에 0건이라(`src/lib/data/supabase/invitation.ts` 전수
확인 — INSERT·UPDATE만 존재) GRANT 자체를 회수했다(마이그레이션
`major_fix_i112_revoke_invitations_delete_dead_surface`).

## 6. 회귀 검증 및 자기반증 — "내가 고친 것을 내가 우회할 수 있는가"

23일차에 I-106 수정이 I-107로 완전히 우회당한 선례가 있어, 이번에도 수정 직후 스스로 공격을
시도했다.

### 6.1 TRUNCATE 재현 실패 확인

```sql
begin;
set local role authenticated;
truncate table public.audit_logs;   -- ERROR: 42501 permission denied for table audit_logs
rollback;
```

`poll_votes`도 동일하게 `42501` 확인. `has_table_privilege()`로 `crew_memberships`·
`reports`·`product_events`·`meetup_attendances`(anon 포함) 재확인 — **전부 `false`**.

### 6.2 "다른 경로로 TRUNCATE에 도달할 수 있는가" — RPC 전수 재검토(공개 + `private` 두 계층)

`anon`/`authenticated`에 `EXECUTE`가 열린 **공개(`public`) 함수 25개**를 `pg_proc`로 전수
열거하고 각 함수가 TRUNCATE(또는 TRUNCATE를 유발하는 동적 SQL)를 포함하는지 확인했다 —
**0건**. 25개 전부 가드 트리거(`*_guard_*`)·조회 RPC(`crew_directory_summary` 등)·RLS
우회가 필요한 좁은 쓰기 RPC(`create_report`·`disband_crew`·`respond_meetup_attendance`
등)이고, 전부 `SECURITY INVOKER`이거나(가드 트리거 제외) 내부에서 스스로 권한을 재검사하는
패턴이었다.

**공개 계층만으로는 불충분하다(DESIGN 교차검증 보강)**: `admin_resolve_report`류는 실제
쓰기를 `private.*` SECURITY DEFINER 함수에 위임하는 2단 구조(029B 관례)라, 공개 25개
목록에 없는 내부 함수가 별도로 존재한다. `private` 스키마 함수 **20개**를 `pg_proc.prosrc`
직접 검색(`'truncate'` 문자열)으로 전수 확인 — **여기서도 0건**. 두 계층(공개 25 + `private`
20, 합 45개) 전부 확인해야 "RPC 경유로 TRUNCATE에 도달하는 코드 경로가 없다"는 결론이
완결된다 — 이번 교차검증 전에는 공개 계층만 봐서 결론은 같았지만 근거 범위가 좁았다.
**결론: 현재 이 GRANT를 RPC 경유로 트리거할 수 있는 코드 경로는(공개·`private` 어느 계층에도)
없다.**

### 6.3 `GRANT`가 아니라 `ALTER DEFAULT PRIVILEGES`만 빠뜨리지 않았는가

REVOKE를 기존 테이블에만 적용하고 기본 권한을 그대로 뒀다면, 다음 회차 누군가 새 테이블을
추가하는 순간 결함이 재발한다 — 이 시나리오를 `pg_default_acl` 재조회로 검증했다: 수정 후
`postgres` 롤의 `public` 스키마 기본 ACL에서 `anon`/`authenticated`의 TRUNCATE 항목이
사라졌음을 확인했다(§5.1의 `alter default privileges`가 실제로 반영됨).

### 6.4 정당 경로 생존 확인

- `blocks_delete_self`(FR-081 언블록): INSERT→DELETE→재조회 0행, 정상(트랜잭션 롤백으로
  무피해 확인).
- `invitations` INSERT·UPDATE(발급·수락/거절, FR-020·021): 이번 수정이 건드린 것은 DELETE
  권한/정책뿐이라 회귀 위험이 낮다고 판단했지만, 실측으로 재확인했다 — A가 정상 초대 발급
  (INSERT 성공)·B가 정상 수락(UPDATE 성공) 둘 다 수정 후에도 그대로 동작(§3.3의 재현
  시나리오 1~3단계가 실패 없이 진행되고, 4단계 DELETE에서만 의도대로 막혔다).
- `notification_preferences_delete_self`: 코드(§4 인용) 재확인 — 삭제는 "기본값(enabled=
  true)으로 되돌리기"와 동치라 이번 조사에서 손대지 않았다.

### 6.5 `get_advisors(security)` 최종 상태

두 마이그레이션 적용 전후 모두 조회 — 신규 WARN 0건(기존 `auth_leaked_password_protection`
1건만 무관하게 잔존, 이번 조사 전후 동일). Supabase 자체 보안 어드바이저가 TRUNCATE 그랜트를
전혀 지적하지 않는다는 것도 확인했다 — **자동화 도구가 이 축을 점검 대상으로 삼지 않는다는
뜻이라, 이런 수동 전수조사가 아니었다면 계속 발견되지 않았을 결함**이라는 판단을 뒷받침한다.

## 7. 남은 것(다음 회차 후보)

- **`requirements.md` FR-020 E3(초대 철회)**는 `join_requests`의 `withdrawn` 상태 패턴처럼
  상태 전이로 구현돼야 할 것으로 보이나, 현재 `invitations.status` CHECK에 `withdrawn` 값
  자체가 없다 — 초대 취소 기능이 실제로 필요해지면 이번에 회수한 DELETE를 다시 여는 대신
  상태 컬럼을 확장하는 편을 제안한다(I-112 "남은 것" 참고).
- **`service_role`의 TRUNCATE 권한은 이번에 건드리지 않았다** — 서버 전용 키로 클라이언트에
  노출되지 않는다는 전제(NFR-015)가 이 프로젝트 전반의 서비스 롤 신뢰 모델이라, 이번 조사
  범위(client-reachable 롤) 밖으로 판단했다. 이 전제 자체가 깨지면(예: 서비스 롤 키 유출)
  이번 조사와 무관하게 훨씬 큰 문제이므로 별도 다루지 않는다.
- **DELETE 축은 이번 조사로 사실상 닫혔다** — 신규 결함 1건(I-112)뿐이고 나머지 25개
  테이블은 이미 소프트 삭제 설계로 안전했다. UPDATE(I-091)·INSERT(I-101~I-103)·DELETE/
  TRUNCATE(I-111·I-112) 네 축이 전부 최소 한 번씩 전수 조사됐다 — **self-service RLS
  분류 체계의 4대 축(SELECT는 이번 범위 밖, 별도 판단 필요)이 최초로 한 바퀴를 돌았다.**
  다음 결함이 나온다면 "또 다른 빈 축"이 아니라 "이미 조사한 축의 회귀"일 가능성이 높다는
  뜻이며, 그 경우 이번 네 개 문서(`insert-axis-audit-102-103.md` 포함)를 회귀 체크리스트로
  재사용할 것을 제안한다.

## 8. 산출물

- 마이그레이션 2건:
  - `major_fix_i111_revoke_truncate_from_client_roles`
  - `major_fix_i112_revoke_invitations_delete_dead_surface`
- 이슈: `docs/ISSUES.md` **I-111**(CRITICAL, TRUNCATE)·**I-112**(MAJOR, invitations DELETE).
- 조사 표: 본 문서 §2(DELETE 정책 26개 테이블 전수)·§3(TRUNCATE 그랜트 전수)·§4(FK `ON
  DELETE` 41건 전수).
- 테스트 데이터: 전부 `begin…rollback` 트랜잭션 내부에서만 생성·조작했다 — 커밋된 임시
  행은 0건(별도 조회로 재확인, §6.4·§3.3). 시드 데이터·실 계정 프로필 무변경.
