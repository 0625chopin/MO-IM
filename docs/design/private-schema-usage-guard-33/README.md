# `private` 스키마 USAGE REVOKE 적용 가능성 실증 — 회귀 확인, 미적용 (I-155 처분, 33일차, CORE)

I-155(32일차)는 `private` 스키마의 `USAGE`가 `anon`·`authenticated`·`service_role` 전부에
명시 부여돼 있고, 유일한 방어가 git 밖 Supabase 대시보드 "Exposed schemas" 설정 하나뿐이라고
지적했다. 후속 후보 (a)(REVOKE로 SQL 2차 방어 이중화)는 32일차에 "`public.*` 얇은 래퍼가
SECURITY INVOKER라 호출자 USAGE가 실제로 필요할 수 있다"는 위험 때문에 보류됐다. 팀장 결정:
**이번 회차에 (a)의 적용 가능성을 먼저 실증하고, 회귀가 나면 적용하지 않고 (b)로 전환한다.**

## 결론 먼저

**적용하지 않는다.** 대표 공개 RPC 13개 전부가 REVOKE 후 `permission denied for schema
private`(42501)로 회귀했다 — 32일차의 우려가 **실제로 발생한다**는 것을 실증으로 확인했다.
(b)로 전환한다: 대시보드 "Exposed schemas" 값을 배포 검증 체크리스트에 등재한다(§3).

---

## 1. 선행 확인 — 호출자 롤이 `private` USAGE를 실제로 요구하는가 (`pg_proc.prosecdef` 전수조사)

```sql
select n.nspname as schema, p.proname, p.prosecdef, pg_get_userbyid(p.proowner) as owner, p.proacl::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosrc ilike '%private.%'
order by p.proname;
```

**33일차 실측 결과(정정 — 아래 "정정 이력" 참고)**: `public` 스키마에서 `private.*`를 호출하는
함수는 **정확히 23개**다. `prosecdef`로 나누면 **21개가 `prosecdef = false`(SECURITY
INVOKER)**, 나머지 2개(`invitations_guard_response_transition`·`polls_guard_decision_integrity`)만
`prosecdef = true`(SECURITY DEFINER)다. `has_function_privilege('authenticated', oid, 'EXECUTE')`로
재확인하면 이 2개 트리거 함수는 `authenticated`/`anon` EXECUTE 자체가 없어(트리거 전용,
`postgres`/`service_role`만) 이번 REVOKE 논의와 무관하다.

INVOKER 21개 전체(공개 RPC 19개 + 트리거 함수 1개 + cron 잡 러너 1개):
`admin_grant_system_admin`·`admin_grant_system_admin_by_handle`·`admin_list_reports`·
`admin_list_system_admins`·`admin_resolve_report`·`admin_revoke_system_admin`·
`create_join_request`·`create_poll`·`crew_directory_summary`·`disband_crew`·
`get_profile_public_by_id`·`list_pending_invitations_for_self`·`meetup_directory_summary`·
`poll_vote_tally`·`poll_vote_tally_for_decision`·`profile_search`·`request_account_deactivation`·
`respond_meetup_attendance`·`withdraw_join_request`(이상 19개, `authenticated` 직접 EXECUTE
가능) · **`crew_memberships_guard_self_transition`**(BEFORE UPDATE 트리거, RPC 아님 — §2.1에서
별도 실증) · `run_poll_auto_close_job`(**`authenticated`/`anon` EXECUTE 없음** — cron 전용
호출이라 이번 REVOKE 논의와 무관, "공개 RPC 전부가 INVOKER 래퍼다"라는 아래 판정의 유일한
예외로 함께 적어 둔다).

**`crew_memberships_guard_self_transition`은 EXECUTE가 열려 있는데도 직접 호출로는 안전하다
(D-077, 팀장 확인)**: `has_function_privilege` 실측대로 이 함수는 `authenticated`·`anon`
EXECUTE가 **열려 있다**(반환 타입이 `trigger`인 BEFORE 가드 함수 11개에 대해 D-077이 "기존
함수는 소급 REVOKE하지 않는다"고 결정한 그 그룹에 속한다 — 27일차 `docs/decisions/
permission-baseline.md` §9.3의 실측 대상). 하지만 EXECUTE가 열려 있다고 해서 아무나 이
함수를 SQL로 직접 불러 `private.*` 호출을 우회할 수 있는 것은 아니다 — 반환 타입이
`trigger`인 함수는 **트리거 매니저만 호출할 수 있고 일반 SQL 호출 자체가 차단된다.**
`authenticated`로 이 함수를 직접 호출을 시도하면 `0A000 trigger functions can only be
called as triggers`로 막힌다(27일차 D-077 §9.3 실측을 팀장이 33일차에 재현해 여전히
성립함을 확인 — 드리프트 0). **다만 이 방어는 "직접 호출"에만 적용된다** — §2.1이 재현한
"오너가 정상적으로 `crew_memberships`를 UPDATE해 이 트리거가 발동하는" 경로는 트리거
매니저를 통한 정상 호출이라 이 방어와 무관하게 그대로 실행되고, 그 안에서 `private.*`를
부르다 REVOKE에 막힌다. 즉 D-077이 막는 것("직접 SQL 호출로 이 함수를 불러 권한을 우회하는
것")과 이번 REVOKE가 깨뜨리는 것("트리거로 정상 발동했을 때 그 안의 `private.*` 호출")은
서로 다른 표면이라 D-077의 존재가 REVOKE 회귀 판정을 바꾸지 않는다.

**판정**: 팀장이 사전에 지적한 위험 조건("INVOKER 래퍼가 하나라도 private.*를 호출하면 그
호출자에게 USAGE가 필요하다")이 **정확히, 그리고 예외 없이** 성립한다 — 공개 RPC 전부가
INVOKER 래퍼다. `docs/decisions/rls-policies-029b.md`가 설계한 "`private.*` SECURITY DEFINER
구현체 + `public.*` SECURITY INVOKER 얇은 래퍼" 2단 구조 자체가 이 REVOKE와 구조적으로
충돌한다 — 얇은 래퍼가 INVOKER인 이유(호출자 권한으로 얇게 통과시키기 위함)가 곧 REVOKE가
회귀를 낳는 이유와 같다.

`private` 스키마 함수는 33일차 재조회 **28개**다 — 32일차 마감 DB 델타표
(`docs/dailyWorkLog/32_Day.md` 329행, `27→28`)와 동일하며, **33일차 증가는 0건**이다.

> **정정 이력(33일차)**: 최초 보고는 이 §1의 함수 수를 "15개 중 13개"·"19개"로, 위 함수 증가를
> "32일차 26개→33일차 28개(Task 044 등 후속 추가분)"로 적었다. 둘 다 틀렸다 — 팀장이 독립
> 재조회(`pg_proc` 전수조사, `docs/dailyWorkLog/32_Day.md` 대조)로 잡았다. ① 함수 수는 원 쿼리가
> 이미 23행을 반환했는데 수기로 옮겨 적으며 `crew_memberships_guard_self_transition`·
> `run_poll_auto_close_job` 2건을 빠뜨린 **집계 실수**였다(쿼리 자체는 처음부터 맞았다). ②
> "26→28"의 26은 32일차 **회차 중** 축 ③ 조사 시점 스냅숏이지 32일차 마감값이 아니며, "Task 044
> 등 후속 추가분"이라는 귀인은 근거 없이 추측한 것이었다(Task 044는 이미 오래전에 끝난 로드맵
> Task로 이번 증가와 무관) — 실제로는 32일차 **회차 안에서** CORE가 `list_pending_invitations_for_self`
> 쌍(`public.*`+`private.*`)을 신설해 27→28이 됐고(같은 델타표), 33일차는 그 값을 그대로
> 재확인했을 뿐 증가가 없다. 두 오류 모두 **결론(REVOKE는 적용 불가)을 바꾸지 않는다** — 오히려
> 대상 함수가 더 많다는 쪽으로 결론을 강화한다.

---

## 2. 실증 — `begin`…`set local role authenticated`…`rollback`

프로덕션에 흔적을 남기지 않기 위해 트랜잭션 안에서 REVOKE를 걸고 대표 RPC 13개를 authenticated
세션으로 호출한 뒤 롤백했다(서비스롤 검증 아님 — 32일차 교훈 3 회피).

```sql
begin;

revoke usage on schema private from anon, authenticated;

create temporary table _test_results(fn text, ok boolean, sqlstate text, msg text) on commit drop;
grant insert, select on _test_results to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a","role":"authenticated"}';

do $$
begin
  begin perform public.crew_directory_summary('729ced18-2016-459a-94c3-e7959dfe808c'::uuid);
    insert into _test_results values ('crew_directory_summary', true, null, null);
  exception when others then
    insert into _test_results values ('crew_directory_summary', false, sqlstate, sqlerrm); end;
  -- ... 나머지 12개 RPC도 같은 begin/exception 블록으로 반복(poll_vote_tally·
  --     poll_vote_tally_for_decision·profile_search·meetup_directory_summary·
  --     create_join_request·withdraw_join_request·respond_meetup_attendance·
  --     list_pending_invitations_for_self·get_profile_public_by_id·disband_crew·
  --     request_account_deactivation·create_poll — 전체 스크립트는 이 회차 세션 로그 참고)
end $$;

select * from _test_results order by fn;

rollback;
```

**33일차 실측 결과 — 13/13 전부 회귀**:

| RPC | 결과 |
| --- | --- |
| `crew_directory_summary` | `42501 permission denied for schema private` |
| `poll_vote_tally` | 동일 |
| `poll_vote_tally_for_decision` | 동일 |
| `profile_search` | 동일 |
| `meetup_directory_summary` | 동일 |
| `create_join_request` | 동일 |
| `withdraw_join_request` | 동일 |
| `respond_meetup_attendance` | 동일 |
| `list_pending_invitations_for_self` | 동일 |
| `get_profile_public_by_id` | 동일 |
| `disband_crew` | 동일(무효 UUID 인자라 로직 도달 전 실패 — 스키마 권한 검사가 인자 검증보다 먼저 일어남을 재확인, 32일차 REST 실증과 같은 순서) |
| `request_account_deactivation` | 동일 |
| `create_poll` | 동일 |

`rollback` 후 `select nspacl from pg_namespace where nspname='private'`로 권한이 원상태
(`authenticated=U/postgres, anon=U/postgres` 등 그대로)임을 재확인했다 — 프로덕션에 흔적 없음.

**판정**: 회귀 0건이 아니라 **13/13 100% 회귀**다. 절차상 "회귀가 하나라도 나면 적용하지
않는다"는 팀장 지시에 따라 **(a) 미적용을 확정**한다.

### 2.1 추가 실증 — 트리거 경유 회귀 (정정 과정에서 추가, `crew_memberships_guard_self_transition`)

§1 정정으로 드러난 `crew_memberships_guard_self_transition`(BEFORE UPDATE 트리거, SECURITY
INVOKER)은 officer 분기에서 `private.is_crew_active`·`private.my_crew_role` 등을 호출한다.
이 함수는 RPC가 아니라 **`crew_memberships` 테이블의 평범한 UPDATE**(FR-024 임원 임명, FR-027
강퇴 등)가 실행 시점에 실행하므로, REVOKE의 영향 범위가 RPC 13개보다 넓을 수 있다 — 실제
테이블 UPDATE로 재현했다.

```sql
begin;

revoke usage on schema private from anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"fb70ff1c-3736-44ee-a4a3-96993a3c62ed","role":"authenticated"}';

-- 실 오너(fb70ff1c)가 활성 크루 729ced18-…의 staff 멤버(30f44dd9)를 member로 강등 시도
-- (FR-024/027이 실제로 쓰는 officer 분기 경로).
update public.crew_memberships
  set role = 'member'
  where crew_id = '729ced18-2016-459a-94c3-e7959dfe808c'
    and profile_id = '30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a';

rollback;
```

**결과**: `ERROR: 42501: permission denied for schema private` —
`QUERY: not private.is_crew_active(old.crew_id)` /
`CONTEXT: PL/pgSQL function public.crew_memberships_guard_self_transition() line 63 at IF`.
`rollback` 후 대상 행이 여전히 `role='staff'`임을 재확인(변경 없음).

**의미**: REVOKE는 공개 RPC뿐 아니라 **임원 임명·강퇴 같은 평범한 테이블 UPDATE 경로까지
동시에 깨뜨린다** — 회귀 범위가 §2 표보다 넓다. (a) 미적용 판정을 한층 더 강하게 뒷받침한다.

---

## 3. (b)로 전환 — 배포 검증 체크리스트: Supabase 대시보드 "Exposed schemas"

SQL 레벨 이중 방어가 구조적으로 불가능하므로(§1·§2), 유일하게 남는 방어인 대시보드 설정값을
**정기적으로 사람이 확인하는 절차**로 문서화한다.

### 3.1 무엇을 확인하는가

| 항목 | 확인 위치 | 기대 값 | 확인 방법 |
| --- | --- | --- | --- |
| PostgREST 노출 스키마(`db-schemas`) | Supabase 대시보드 → Project Settings → API → **Exposed schemas** | `public, graphql_public` — **`private` 포함되면 안 됨** | 대시보드 직접 확인(우선), 또는 아래 3.2의 REST 재현으로 간접 확인 |

DB 내부에는 이 값이 전혀 저장되지 않는다(`current_setting('pgrst.db_schemas')`·
`pg_roles.rolconfig` 둘 다 32일차 조회에서 빈 값 — Supabase 컨트롤 플레인이 관리하는
PostgREST 프로세스 설정이라 `supabase/migrations/*.sql`로 추적·강제할 수 없다). **이것이 바로
SQL 이중화가 안 되는 근본 이유**이자 이 체크리스트가 필요한 이유다.

### 3.2 REST로 재현 확인하는 방법 (대시보드 접근 없이도 가능)

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/is_crew_active" \
  -H "apikey: $ANON_OR_AUTH_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Content-Profile: private" \
  -d '{"p_crew_id":"00000000-0000-0000-0000-000000000000"}'
```

- **정상(안전) 응답**: `HTTP 406`, 본문 `PGRST106 "Invalid schema: private"`, hint에 노출 스키마
  목록이 `public, graphql_public`로 나온다(32일차 실증과 동일해야 함).
- **위험 신호**: `HTTP 200`(또는 함수 인자 오류 `PGRST202`가 아닌 다른 오류)이 나오면 `private`가
  노출된 것 — **즉시 대시보드에서 Exposed schemas를 원복하고 팀장에게 보고한다.**

### 3.3 언제 이 체크리스트를 돌리는가

다음 중 하나라도 해당하면 3.2를 실행한다:

- Supabase 프로젝트 설정(API/Project Settings)을 누구든 변경한 직후
- 프로젝트를 복제(새 브랜치·새 프로젝트로 restore 등)했을 때 — **대시보드 설정은 git으로
  따라오지 않으므로 복제 직후 반드시 재확인**
- `private` 스키마에 새 함수를 추가하는 마이그레이션을 배포하기 직전/직후
- 정기 배포 전 점검(권장) — `docs/decisions/build-deploy-verification.md`의 절차에 이 항목을
  함께 확인하도록 다음에 그 문서를 갱신할 사람이 참고할 것(이번 회차는 이 신규 문서로만
  남기고 그 문서 자체는 수정하지 않았다 — 대상이 Vercel/Next.js 빌드 검증이라 주제가 달라
  별도 문서로 분리했다)

---

## 확인한 것 (33일차, CORE — 팀장 교차검증 반영판)

- `pg_proc.prosecdef` 전수조사로 `public.*`의 `private.*` 호출자 **23개 중 21개**가 SECURITY
  INVOKER임을 확인(§1, `has_function_privilege`로 EXECUTE 이중 확인) — 예외 2건(트리거 전용,
  EXECUTE 자체 없음)은 이번 논의와 무관. **최초 보고(19개/17개, "26→28 Task 044")의 집계·귀인
  오류를 팀장 교차검증으로 발견해 정정했다** — 정정이 결론을 바꾸지 않았음도 확인
- `begin`…`set local role authenticated`+JWT claims…`rollback`로 REVOKE 후 대표 RPC 13개 호출 →
  **13/13 `42501 permission denied for schema private`**(§2)
- 정정 과정에서 추가한 실증: 같은 REVOKE 아래 실 오너가 활성 크루 staff 멤버를 강등하는 평범한
  `crew_memberships` UPDATE도 **동일하게 회귀**함을 확인(§2.1) — 영향 범위가 RPC를 넘어선다
- `rollback` 후 `pg_namespace.nspacl`·대상 행 재조회로 권한·데이터 원상태 확인(프로덕션 흔적 없음)
- (b) 채택에 따른 배포 검증 체크리스트 작성(§3) — REST 재현 curl 커맨드 포함
