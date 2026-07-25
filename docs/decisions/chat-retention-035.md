# 채팅 12개월 자동 파기 배치 (Task 035)

- **일자**: 2026-07-25(15일차)
- **담당**: DESIGN(B팀)
- **참조**: D-009, D-033, D-027, NFR-033, CON-10 / 선행: Task 027(pg_cron 기반), Task 028(스키마·인덱스)
- **범위**: `chat_messages` 12개월 경과분 배치 파기 함수 + pg_cron 잡 등록만 한다. 크루 해산 시 즉시 파기(D-009 후반)는 범위 밖 — 6절 참고. RLS 정책(029A 소관)은 만들거나 고치지 않았다.
- **개정**: 15일차 교차검증(CORE)에서 major 1건·minor 1건이 나와 후속 마이그레이션(`20260725011149_fix_chat_purge_permissions_and_timing.sql`, **DESIGN 본인이 작성·적용** — CORE의 별도 조치가 아니다, 9절 참고)으로 수정했다. 2.1절·4절에 정정 내용을 반영했다 — 원 서술은 취소선 없이 정정 사유와 함께 남긴다(무엇이 왜 틀렸는지가 기록으로서 가치가 있다고 판단). 팀장 지시로 이 마이그레이션 자체를 담당자 본인이 재검증했다 — 9절.

## 0. 착수 전 D-037 확인 (실제 값)

| 확인 항목 | 값 |
| --- | --- |
| `list_tables`(public) | 21개, 낯선 테이블(`player`·`fixture` 등) 없음 — 전부 Task 028 산출물 |
| `list_migrations` | 11건 — Task 027(2건) + Task 028(9건). 이번 회차 산출물 추가 전 상태 |
| `list_extensions` 중 `pg_cron` | `installed_version: "1.6.4"` |
| `chat_messages` RLS | `rls_enabled: true`, 정책 0개(029A 착수 전 상태, 028이 남긴 그대로) |

이상 없음을 확인하고 진행했다.

## 1. 보존 기간 근거 (D-009 · NFR-033) — 요구사항 원문 인용

`requirements.md` 5.2절 `ChatMessage` 행: "크루 `active` 멤버만 읽기/쓰기. 삭제는 발신자·임원+. `refPostId`는 같은 크루 게시글로 제한. **작성 12개월 후 배치 파기, 크루 해산 시 함께 파기(D-009)**".

같은 문서 NFR-033: "채팅 메시지는 작성 **12개월 후 배치로 자동 파기**하고, 크루 해산 시 함께 파기한다(D-009). 구현은 **배치 `DELETE` 루프**이며 `pg_partman` 파티셔닝은 채택하지 않는다(D-033 — 파티셔닝은 테이블 생성 시점에 결정해야 하고 나중에 바꾸려면 재생성이 필요하다. 삭제량이 배치 창을 넘으면 v0.2 스키마 설계에서 재검토). 개인정보 처리방침에 보관 기간 12개월을 고지한다" — 수락 기준: "13개월 전 메시지가 조회되지 않는다. 파기 배치가 v0.2에 존재하고 잡당 10분을 넘지 않는다(CON-10)".

기준 시점은 **`chat_messages.created_at`**(작성 시각)이다. `deleted_at`(발신자·임원의 소프트 삭제, 028 스키마)은 보존 기간 계산에 관여하지 않는다 — 소프트 삭제는 "화면에서 안 보이게" 할 뿐 저장 자체를 끝내지 않으므로, 개인정보 처리방침이 고지하는 12개월 보관 상한은 `deleted_at` 여부와 무관하게 `created_at` 기준으로 전량 적용해야 한다고 판단했다. 즉 파기 함수는 `deleted_at`으로 필터링하지 않는다.

## 2. 파기 함수 설계

### 2.1 배치 크기 제한 루프 + `statement_timeout` 이중 방어 (CON-10)

`public.purge_expired_chat_messages(batch_size int default 5000, max_duration interval default '7 minutes')` — `plpgsql` 함수, `security invoker`, `set search_path = ''`(처음부터 고정 — 14일차에 겪은 `function_search_path_mutable` WARN을 재발시키지 않는다).

```sql
set local statement_timeout = '2min';
loop
  delete from public.chat_messages
  where id in (
    select id from public.chat_messages
    where created_at < now() - interval '12 months'
    order by created_at
    limit batch_size
  );
  get diagnostics deleted_count = row_count;
  total_deleted := total_deleted + deleted_count;
  exit when deleted_count = 0;
  exit when clock_timestamp() - started_at > max_duration;
end loop;
```

- **방어선 ①**(소프트): 루프 자체가 경과 시간을 재서 기본 7분에서 스스로 멈춘다. 하루치 삭제 대상이 이 예산을 넘겨도 함수가 폭주하지 않고, 남은 행은 다음날 잡이 이어서 처리한다 — 파티셔닝 없이도(D-033) 밀린 삭제가 무한정 누적되지 않는 자기 수렴 구조다.
- **방어선 ②**(하드): `statement_timeout = '2min'`. 배치(statement) 단위로 매번 리셋되는 값이라, 이 자체는 "잡 전체 10분"이 아니라 "배치 1회 최대 2분"만 보장한다.

**정정(15일차 교차검증, CORE 지적 minor #2)**: 최초 버전은 `max_duration` 기본 8분 + `statement_timeout` 9분을 두고 "이중 방어로 10분 예산 안에 항상 종료되거나 실패로 기록된다"고 서술했으나 **엄밀하지 않았다.** `statement_timeout`은 배치마다 리셋되고 `max_duration` 체크는 각 배치가 **끝난 뒤에만** 평가되므로, worst-case는 "소프트 예산이 거의 다 찬 직후 시작한 마지막 배치가 하드 타임아웃까지 꽉 채우는" 경우다 — 정확한 상한은 `max_duration + statement_timeout`이며, 원래 값(8min+9min)으로는 **최대 약 17분**까지 갈 수 있어 CON-10(잡당 10분)을 실제로 보장하지 못했다. 지금은 파라미터를 좁혀 `max_duration`(7분) + `statement_timeout`(2분) = **worst-case 9분 < 10분**이 되도록 재계산했다 — CON-10 예산 안에 약 1분의 여유를 남긴다. 배치당 2분은 인덱스 기반 5000행 삭제가 정상 상황에서 걸리는 시간보다 넉넉하다고 판단했다(2.2절 EXPLAIN 실측상 극소 비용).
- **트랜잭션 경계를 하나로 유지**: 배치마다 `COMMIT`하는 PL/pgSQL 프로시저(PG11+ 트랜잭션 제어)도 검토했으나 채택하지 않았다. 이유: (a) 이번 규모(잡당 최대 7분·배치 5000행)에서 커밋 분리로 얻는 이득(락 보유 시간 단축)보다 **트랜잭션 하나로 유지해야 롤백 기반 검증이 가능하다**는 이점이 크다고 판단했다(3절) — 배치 COMMIT을 쓰면 검증 중 실 데이터가 커밋되어 버려 "소량 데이터로 실행 후 롤백" 절차 자체가 성립하지 않는다. (b) 삭제량이 실제로 이 방식의 락 보유 시간이 문제가 될 만큼 커지면, 그 시점이 바로 D-033이 예고한 "재검토 시점"(파티셔닝 여부까지 포함한 v0.2 스키마 재설계)이라고 본다.

### 2.2 `created_at` 인덱스 사용 — `EXPLAIN` 실측

Task 028이 만든 `idx_chat_messages_created`(btree, `created_at`)를 그대로 쓴다. 실측(`EXPLAIN (ANALYZE, BUFFERS)`, 현재 `chat_messages` 0행 상태):

```
Delete on chat_messages  (cost=17.57..34.10 rows=0 width=0)
  ->  Hash Semi Join  (cost=17.57..34.10 rows=133 width=46)
        Hash Cond: (chat_messages.id = "ANY_subquery".id)
        ->  Seq Scan on chat_messages  (cost=0.00..14.00 rows=400 width=22)
        ->  Hash  (cost=15.91..15.91 rows=133 width=56) (never executed)
              ->  Subquery Scan on "ANY_subquery"  (cost=0.15..15.91 rows=133 width=56) (never executed)
                    ->  Limit  (cost=0.15..14.58 rows=133 width=24) (never executed)
                          ->  Index Scan using idx_chat_messages_created on chat_messages chat_messages_1
                                Index Cond: (created_at < (now() - '1 year'::interval))
```

**정직한 결과 보고**: 삭제 대상을 고르는 서브쿼리(`created_at < now() - interval '12 months' order by created_at limit ...`)는 실측으로 **`idx_chat_messages_created` 인덱스 스캔을 확인했다** — 이게 D-033/NFR-033이 요구하는 "인덱스 기반 배치 스캔"의 핵심 경로다. 다만 `DELETE ... WHERE id IN (subquery)`의 바깥쪽 매칭 단계는 현재 테이블이 **0행이라 플래너가 Seq Scan을 골랐다**(0행 스캔이 133회 인덱스 룩업보다 비용이 낮다고 추정한 것 — 지시받은 대로 이 사실을 숨기지 않고 기록한다). 테이블이 커지면 이 바깥쪽 매칭도 통상 기본키(`chat_messages_pkey`) Nested Loop Index Scan으로 전환된다고 예상하나, 이는 **실측하지 못했다** — 실 데이터 볼륨이 쌓인 뒤(Task 036 통합 테스트 또는 그 이전 실사용 단계)  `EXPLAIN`을 재실행해 확인할 것을 다음 회차에 인계한다.

## 3. 검증 — 트랜잭션 롤백 기반 (실 데이터 오염 없음)

`execute_sql`로 `BEGIN` 안에서 합성 데이터를 만들어 검증하고 `ROLLBACK`했다. `chat_messages.sender_id → profiles.id → auth.users.id` FK 체인 때문에 `auth.users`에도 최소 컬럼(`id`만, 나머지는 전부 nullable이거나 기본값 있음)으로 합성 행을 넣었다 — 트랜잭션 안에서만 존재하고 롤백으로 사라진다.

**케이스 1** (경계값 포함 3건): 13개월 전 메시지 1건(파기 대상), 11개월 20일 전 메시지 1건(경계 안쪽, 보존), 1개월 전 메시지 1건(보존).

- 실행 전: 3건
- `purge_expired_chat_messages()` 실행 후 잔여: 2건(11개월 20일 전·1개월 전 메시지만 남음) — **13개월 전 메시지만 정확히 삭제됨을 확인**.

**케이스 2** (반환값 확인): 14개월·13개월 전 메시지 2건 생성 → `purge_expired_chat_messages()` 반환값 `deleted_count = 2` — **정확히 일치**.

**롤백 후 재확인**: `select count(*) from public.chat_messages` → `0`, `select count(*) from public.profiles` → `0`, `select count(*) from auth.users` → `0`. **실 데이터는 전혀 남지 않았다.**

**케이스 3(15일차 수정 후 재검증)**: `max_duration`/`statement_timeout` 파라미터를 바꾼 `CREATE OR REPLACE FUNCTION` 적용 후, 동일한 방식(트랜잭션 + 합성 데이터 + `ROLLBACK`)으로 13개월 전 메시지 1건·1개월 전 메시지 1건을 만들어 재실행 — 13개월 전 메시지만 정확히 삭제되고 1개월 전 메시지는 남았다(`client_key` 목록으로 확인). 롤백 후 `profiles`·`crews`·`chat_rooms`·`chat_messages`·`auth.users` 전부 `count=0` 재확인. **로직 자체는 파라미터 변경 전후로 동일하게 정확히 동작한다.**

(참고: 이 재검증 과정에서 029A가 크루 생성 시 `chat_room`을 자동으로 만드는 `crews_provision_owner_bootstrap()` 트리거를 붙였다는 것을 발견했다 — 검증용 합성 데이터를 만들 때 `chat_rooms`를 수동으로 insert하지 않고 이 트리거의 결과를 조회해서 썼다. CORE의 029A 산출물이며 이 문서·이번 Task의 책임 범위는 아니라 별도로 건드리지 않았다.)

## 4. RLS 상호작용 — 실측 결론

**결론: 이 함수는 RLS에 막히지 않는다. `SECURITY DEFINER`가 필요 없다.**

실측 근거:

| 확인 항목 | 값 | 의미 |
| --- | --- | --- |
| `chat_messages` 소유자(`pg_class.relowner`) | `postgres` | 마이그레이션을 적용한 role과 동일 |
| `chat_messages.relrowsecurity` / `relforcerowsecurity` | `true` / `false` | RLS ON, `FORCE`는 아님(028이 만든 상태 그대로) |
| `pg_roles`에서 `postgres.rolbypassrls` | **`true`** | 이 프로젝트의 `postgres` role은 `BYPASSRLS` 속성을 갖는다 |
| `cron.job.username`(잡 등록 후 실측) | `postgres` | `cron.schedule()`을 호출한 role(=이 작업을 수행한 MCP 세션의 role)이 그대로 잡 실행 주체로 기록된다 |

`BYPASSRLS` 속성을 가진 role은 `FORCE ROW LEVEL SECURITY` 여부와 무관하게 모든 RLS를 우회한다(PostgreSQL 표준 동작). 이 잡은 `postgres` role로 실행되고 `postgres`는 `rolbypassrls=true`이므로, **`chat_messages`에 정책이 0개든(현재) 029A가 정책을 다 채우든 이 파기 함수의 동작은 영향받지 않는다.** 따라서 함수를 `security invoker`로 두었다 — `security definer`로 권한을 격상할 필요가 없고, 격상하지 않는 편이 공격 표면이 작다.

**029A와의 경계**: 위 판단은 029A가 만들 RLS 정책 객체를 전혀 참조하지 않는다 — 029A가 무엇을 만들든 이 결론은 바뀌지 않는다(정책이 아니라 `postgres` role 자체의 `BYPASSRLS`에 의존하기 때문). 정책 객체는 이번 마이그레이션에서 만들거나 고치거나 지우지 않았다.

**두 실행 경로를 구분한다(15일차 교차검증, CORE의 "부가 지적" 반영)**:

| 경로 | 실행 role | RLS 적용 여부 | 지금 가능한가 |
| --- | --- | --- | --- |
| pg_cron 잡(`cron.schedule`로 등록된 스케줄 실행) | `postgres` | **우회**(`rolbypassrls=true`) | 예 — 이 문서의 파기 배치가 쓰는 유일한 경로 |
| 클라이언트가 `anon`/`authenticated`로 이 함수를 직접 RPC 호출 | 호출자 자신의 role | **적용**(`security invoker`이므로 호출자의 RLS가 그대로 걸림) | **아니오** — 아래 EXECUTE 권한 정정 이후 `anon`/`authenticated`에는 이 함수를 호출할 EXECUTE 권한 자체가 없다 |

**함수 실행 권한 — 정정(15일차 교차검증, CORE 지적 major #1)**: 최초 버전은 "`revoke all on function ... from public`으로 PUBLIC 기본 EXECUTE를 회수하고 `postgres`·`service_role`에만 부여했다"고 서술했으나, `information_schema.routine_privileges` 실측 결과 **`anon`·`authenticated`가 개별 grant로 EXECUTE를 갖고 있었다**(수정 전 grantee: `anon`, `authenticated`, `postgres`, `service_role` 4개 전부). 원인은 `public` 슈도롤에서의 revoke가 Supabase가 신규 함수에 기본으로 붙이는 `anon`/`authenticated` **개별** grant까지 회수하지는 못한다는 것 — 029A에서 CORE가 겪은 것과 동일한 함정이다. `get_advisors(security)`가 이를 잡지 못한 이유도 확인했다: `*_security_definer_function_executable` 계열 린트는 **`SECURITY DEFINER` 함수만** 검사 대상으로 삼는다. 이 함수는 `security invoker`라 그 린트의 스캔 범위 밖이었다 — "새 WARN 없음"이 "권한이 좁게 설정됐다"는 뜻은 아니었다.

**실질 피해 여부**: 수정 전에도 `anon`/`authenticated`가 이 함수를 호출했다면 `security invoker`이므로 호출자 자신의 RLS가 적용되고, 당시(그리고 지금도) `chat_messages`에는 **DELETE 정책이 없다**(`pg_policies` 실측 — 029A가 만든 정책은 `chat_messages_select_members`(SELECT)·`chat_messages_insert_members`(INSERT)·`chat_messages_update_self_or_staff_delete`(UPDATE, 소프트 삭제용) 3개뿐이며 DELETE 정책은 아직 없다) → RLS 기본 거부로 실제 삭제는 0건에 그쳤을 것이다. 즉 **이번에 데이터가 새어나가거나 삭제된 사고는 없었다.** 다만 "운영자 전용"이라는 의도한 권한 경계가 실제로 성립하지 않았던 것은 사실이고, 029B 이후 `chat_messages`에 DELETE 정책이 하나라도 생기면(예: 임원의 메시지 완전 삭제 기능) 이 gap이 즉시 악용 표면으로 바뀔 수 있었다 — 최소 권한 원칙 위반으로 보고 major로 받아들여 수정했다.

**조치**: 후속 마이그레이션 `20260725011149_fix_chat_purge_permissions_and_timing.sql`에서 `revoke execute on function public.purge_expired_chat_messages(integer, interval) from public, anon, authenticated;`로 `anon`·`authenticated`를 명시적으로 회수했다. **재실측**(`information_schema.routine_privileges`, 수정 후): grantee가 `postgres`·`service_role` **2개로 줄었다.** `get_advisors(security)` 재실행 결과 `lints: []`(신규 WARN 없음, 029A가 완료돼 있던 기존 `rls_enabled_no_policy` INFO들도 이제 전부 소멸 — 029A 정책이 채워진 결과이며 이번 Task의 변경과는 무관).

## 5. 잡 등록 — 스케줄·CON-10 준수

```sql
select cron.schedule(
  'purge_expired_chat_messages',
  '0 18 * * *',              -- 매일 18:00 UTC = 03:00 KST(저트래픽 시간대)
  $$select public.purge_expired_chat_messages();$$
);
```

**실측 확인**(`select * from cron.job`): `jobid=1`, `jobname='purge_expired_chat_messages'`, `username='postgres'`, `database='postgres'`, `schedule='0 18 * * *'`, `active=true`.

**CON-10(동시 잡 8개) 준수**: 등록된 도메인 잡은 이번 1개뿐이다(027 문서 3절의 "등록된 잡 목록을 세는 방식"을 그대로 따름) — cron-foundation.md에 한 줄 부기했다. 투표 자동 종료 잡(Task 034)이 아직 없어 현재 총 등록 잡 수는 1개.

**CON-10(잡당 10분) 준수**: 2.1절의 이중 방어(배치 루프 소프트 예산 7분 + 배치당 하드 `statement_timeout` 2분, worst-case 합산 9분)로 10분 예산 안에 항상 종료되거나(정상/소프트 종료) 실패로 기록된다(배치 하나가 2분을 넘겨 하드 타임아웃에 걸리는 경우, `cron.job_run_details.status='failed'`). 최초 값(8min+9min ≈ 최대 17분)이 실제로는 이 예산을 보장하지 못했던 것을 15일차 교차검증에서 CORE가 지적해 파라미터를 좁혔다 — 상세 계산은 2.1절.

## 6. 크루 해산 시 파기 — 이번 범위 밖

D-009 원문은 "작성 12개월 후 자동 파기, **크루 해산 시 함께 파기**" 두 트리거를 모두 요구한다. 이번 Task 035는 **전자(12개월 경과 스케줄 배치)만** 구현했다. 후자(크루 해산 즉시 파기)는 다음 이유로 이번 범위에 넣지 않았다:

- 팀장 지시문이 이번 Task의 산출물로 "크루 해산 시 파기와의 관계 및 이번 범위 밖 항목"을 문서화하라고 명시했다(구현이 아니라 관계 정리).
- 크루 해산은 **스케줄이 아니라 이벤트 트리거**다(`crews.status`를 `archived`로 바꾸는 애플리케이션 쓰기 경로에서 함께 실행돼야 한다) — pg_cron 잡의 책임 범위(주기 실행)와 성격이 다르다. 자연스러운 구현 지점은 크루 해산 Server Action(향후 CREW/CORE의 쓰기 경로 Task, 예: Task 032 계열)이거나, 그 경로에서 호출할 DB 함수(트리거 또는 명시적 호출)다.
- 스키마상 크루 해산은 `crews.status='archived'`로의 UPDATE이지 `chat_rooms`/`chat_messages` 삭제를 동반하지 않는다(028 문서 3.1절 — 소프트 삭제 원칙과 유사한 결이나, `chat_messages`는 콘텐츠가 아니라 로그성 데이터라 하드 삭제 대상이라는 점이 다르다).

**다음 회차 인계**: 크루 해산 기능을 구현하는 Task가 착수될 때, 이번에 만든 `public.purge_expired_chat_messages()`와는 별도로 "해당 `crew_id`의 `chat_room`에 속한 `chat_messages`를 즉시 삭제"하는 함수(또는 해산 트랜잭션에 인라인 `DELETE ... WHERE room_id = (select id from chat_rooms where crew_id = ...)`)를 추가해야 한다. RLS 우회가 필요하면 이번에 확인한 `postgres`/`service_role`의 `BYPASSRLS` 전제를 그대로 재사용할 수 있다(Server Action은 `service_role`로 실행되므로 — D-030 참고).

## 7. 운영 지침·실패 감지 (NFR-029)

027이 정의한 조인 조회 패턴을 그대로 쓴다(`cron.job_run_details`에 `jobname` 컬럼이 없어 `cron.job`과 `jobid`로 조인):

```sql
select d.jobid, j.jobname, d.status, d.return_message, d.start_time, d.end_time,
       extract(epoch from (d.end_time - d.start_time)) as duration_seconds
from cron.job_run_details d
left join cron.job j on j.jobid = d.jobid
where d.status = 'failed' and d.start_time > now() - interval '24 hours'
order by d.start_time desc;
```

`jobname = 'purge_expired_chat_messages'`로 필터링하면 이 잡만 추적할 수 있다. 알림 연동은 027 문서와 동일하게 이번 범위 밖이다.

`cron.job_run_details` 자체가 자동 정리되지 않는다는 027의 경고는 여전히 유효하다 — 이번 회차에도 그 정리 배치는 만들지 않았다(등록된 잡이 이제 1개뿐이라 아직 급하지 않다고 판단). 잡 수가 늘어나는 다음 회차(034 투표 자동 종료 등)에서 재검토를 권고한다.

## 8. 남은 리스크·다음 회차 인계 요약

- **실 데이터 볼륨에서의 `EXPLAIN`·배치 소요 시간 재검증 미완료**(2.2절·9.3절) — 0행 상태의 계획은 배치 매칭 단계에서 Seq Scan을 골랐다. 또한 `batch_size=5000`이 `statement_timeout=2min` 안에 끝나는지도 **현재 0행이라 실측하지 못했고**, `chat_messages`에 `BEFORE DELETE` 트리거가 없다는 점과 인덱스 5개(`pkey`·`client_key` unique·`idx_chat_messages_created`·`idx_chat_messages_room_created`·`idx_chat_messages_sender`) 기준 5000행 삭제 시 인덱스 항목 제거가 약 25,000건 규모로 락 경합 없는 정상 상황이면 초 단위로 끝나 2분에 한 자릿수 배 이상 여유가 있다는 **분석적 판단**(15일차 CORE 재검증, 실측 아님)에 근거한다. 실사용 데이터가 쌓인 뒤(**Task 036 통합 테스트 또는 그 이전**) `EXPLAIN` 재실행과 함께 **실제 배치 소요 시간을 한 번은 측정**해 이 판단을 검증해야 한다 — NFR-029 실패 감지 쿼리로 이 잡의 `failed` 발생 여부도 함께 확인. **측정 결과 2분을 넘기면 `batch_size`를 낮추는 방향으로 조정한다**(파라미터라 마이그레이션 없이 `cron.schedule`의 SQL 인자만 바꾸면 됨).
- **크루 해산 시 즉시 파기 미구현**(6절) — 크루 해산 기능 Task 착수 시 별도 구현 필요.
- **`cron.job_run_details` 정리 배치 없음** — 027부터 이어지는 리스크, 잡 수가 늘면(Task 034) 재검토.
- **배치 COMMIT 미채택**(2.1절) — 삭제량이 커져 락 보유 시간이 문제가 되면 D-033이 예고한 v0.2 스키마 재검토 시점에 배치 COMMIT형 프로시저 재검토.
- 다음 도메인 잡(Task 034, 투표 자동 종료)을 등록할 때 CON-10 "동시 잡 8개"를 이 문서 5절의 "등록된 잡 수 세기" 관행으로 계속 추적할 것.
- **(해소, 15일차)** ~~함수 EXECUTE 권한이 의도(운영자 전용)와 실제가 달랐던 문제~~ — `anon`/`authenticated` 개별 grant를 명시 회수해 수정 완료(4절). **교훈**: `security invoker`/`security definer` 무관하게 Postgres 신규 함수는 기본적으로 `PUBLIC`에 EXECUTE가 열리고, Supabase 프로젝트는 여기에 더해 `anon`/`authenticated`가 **개별** grant를 받는 경우가 있다 — `revoke ... from public`만으로는 부족하며, **앞으로 만드는 모든 함수는 `revoke execute on function ... from public, anon, authenticated;`처럼 세 대상을 항상 명시**해야 한다(029A가 먼저 겪은 패턴과 동일, 이번에 재확인). `get_advisors`는 `SECURITY DEFINER` 함수만 검사하므로 `security invoker` 함수의 권한 과다는 잡아내지 못한다는 것도 함께 기록.
- **(해소, 15일차)** ~~CON-10 "잡당 10분" 보장 문구가 엄밀하지 않았던 문제~~ — `statement_timeout`이 배치마다 리셋된다는 점을 반영해 `max_duration`(7분)·`statement_timeout`(2분)으로 worst-case를 9분으로 재계산해 수정 완료(2.1절·5절). **교훈**: "소프트 예산 체크 + 하드 타임아웃" 조합의 실제 worst-case는 항상 **두 값의 합**으로 계산해야 하며, "이중 방어"라는 표현만으로 예산 준수를 주장하면 안 된다.

## 9. 팀장 지시 — 후속 마이그레이션 직접 재검증 (15일차)

**9.0 저자 확인(질문 1·2 답)**: `20260725011149_fix_chat_purge_permissions_and_timing.sql`은 **DESIGN(본인)이 15일차 교차검증 지시를 받고 직접 작성해 `apply_migration`으로 적용한 것**이다. CORE가 별도로 같은 수정을 적용한 사실은 없다 — `list_migrations`에 동일 이름·버전(`20260725011149`)의 항목이 **하나뿐**임을 재확인했다(중복 없음). BOARD가 "25→26건"으로 관측한 그 1건 증가가 바로 이 마이그레이션이며, 마이그레이션 이력에는 적용 주체가 기록되지 않아 CORE로 오인된 것으로 보인다. 이 사실을 팀장에게 별도 보고했다. **새 후속 마이그레이션을 만들지 않았다** — 기존 파일을 그대로 두고 팀장 지시대로 함수·권한을 재검증했다.

**9.1 `pg_get_functiondef` — 파일과 DB 최종 정의 일치 확인**

```
CREATE OR REPLACE FUNCTION public.purge_expired_chat_messages(batch_size integer DEFAULT 5000, max_duration interval DEFAULT '00:07:00'::interval)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  deleted_count integer;
  total_deleted bigint := 0;
begin
  set local statement_timeout = '2min';
  loop
    delete from public.chat_messages
    where id in (
      select id from public.chat_messages
      where created_at < now() - interval '12 months'
      order by created_at
      limit batch_size
    );
    get diagnostics deleted_count = row_count;
    total_deleted := total_deleted + deleted_count;
    exit when deleted_count = 0;
    exit when clock_timestamp() - started_at > max_duration;
  end loop;
  return total_deleted;
end;
$function$
```

**PASS** — 파일(`20260725011149_...sql`) 내용과 정확히 일치한다. `max_duration` 기본값 `00:07:00`(7분), 함수 본문에 `COMMIT` 없음(전 배치가 한 트랜잭션 안에서 돈다 — 아래 9.2 worst-case 계산의 전제).

**9.2 worst-case 계산 재검토 — PASS**

- `statement_timeout`은 **statement(개별 SQL문) 단위로 매번 새로 적용**된다(PostgreSQL 표준 동작 — 세션에 누적되는 예산이 아니다). 함수 본문에 `COMMIT`이 없으므로(9.1) 전체 루프는 pg_cron이 감싸는 **단일 트랜잭션** 안에서 돈다.
- 루프 구조: `exit when ... > max_duration` 체크는 **매 배치 DELETE가 끝난 뒤**에만 평가된다. 즉 이 체크를 통과해 다음 배치를 "시작"하는 시점의 경과 시간은 7분 미만이 보장되지만, 그 배치 자체의 소요 시간(최대 `statement_timeout`=2분)은 이 체크 대상이 아니다.
- **worst-case**: 경과 시간이 7분에 근접한 순간 마지막 배치가 시작 → 그 배치가 하드 타임아웃(2분)까지 꽉 채우고 실패하거나 막 완료 → 총 경과 ≈ 7분 + 2분 = **9분**. CON-10의 10분 예산 안에 약 1분의 여유가 남는다. **직접 따져본 결과 문서의 계산(9분)은 성립한다.**
- pg_cron의 백그라운드 워커 기동·`select public.purge_expired_chat_messages();` 최초 파싱 등 함수 바깥의 오버헤드는 보통 수십~수백 ms 수준이라 9분 계산에 유의미한 영향을 주지 않는다고 판단했다(정밀 측정은 하지 않음 — 참고 사항으로 기록).

**9.3 `batch_size=5000`이 `statement_timeout=2min` 안에서 끝나는가 — PASS(추론, 실측 아님)**

- `chat_messages`에 걸린 트리거는 `trg_chat_messages_guard_delete_only`(`BEFORE UPDATE`) **하나뿐**이다(`pg_trigger` 실측). **`BEFORE DELETE` 트리거가 없으므로 DELETE 경로에는 트리거 오버헤드가 없다.**
- `chat_messages.id`를 참조하는 다른 테이블이 없다(028 스키마 설계, list_tables 재확인) — FK 캐스케이드 검사 비용도 없다.
- 삭제 대상 선별은 `idx_chat_messages_created` 인덱스 스캔(2.2절 EXPLAIN 실측)이고, 매칭 삭제는 PK(`chat_messages_pkey`) 기반이라 두 단계 모두 인덱스 경로다.
- 이 조건에서 5,000행 인덱스 기반 DELETE는 일반적인 Postgres 인스턴스에서 밀리초~수 초 수준이 통상적이다 — `statement_timeout=2min`은 상당한 여유(수십~수백 배)를 두고 있다고 판단한다.
- **다만 이 판단은 추론이다 — 실 데이터 볼륨(수만~수십만 행)에서 스트레스 테스트를 하지 못했다** (0행 테이블의 한계, 2.2절과 동일 제약). 락 경합이 심한 극단적 상황(예: 다수의 장시간 트랜잭션이 같은 range를 잡고 있는 경우)에서는 2분을 넘길 가능성을 완전히 배제할 수 없다. **이 조합이 "매번 실패해 파기가 영구히 안 되는" 회귀인지**를 가장 우려했는데, 위 근거(트리거 없음·FK 없음·인덱스 사용·저트래픽 시간대 스케줄)로 볼 때 그런 회귀 가능성은 낮다고 판단하되, 확정적 실측은 아니므로 §8 리스크에 남기고 NFR-029 실패 감지로 사후 확인하는 것을 권고한다.

**9.4 `information_schema.routine_privileges` 재실측 — PASS**

```
grantee=postgres,      privilege_type=EXECUTE
grantee=service_role,  privilege_type=EXECUTE
```

`anon`·`authenticated`는 없다 — 4절의 수정 내용과 일치.

**9.5 종합 판정**: 4개 항목 전부 **PASS**(9.3만 "추론 기반 PASS + 실측 인계"로 명시). 마이그레이션 내용을 원 담당자(DESIGN) 본인이 재검증했고, 추가 수정은 필요 없다고 판단했다 — 새 후속 마이그레이션을 만들지 않았다.
