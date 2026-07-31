# pg_cron 스케줄 실행 기반 (Task 027)

- **일자**: 2026-07-24
- **담당**: CORE(A팀)
- **참조**: D-027, CON-10, D-003, D-009, NFR-029·033
- **범위**: `pg_cron` 확장 활성화와 실패 감지 조회 패턴 정의만 한다. 도메인 잡(투표 자동 종료 — Task 034, 채팅 파기 — Task 035)은 대상 테이블이 아직 없어(스키마는 Task 028) 이번에 만들지 않는다.

## 결론

**`pg_cron` 1.6.4를 마이그레이션 `enable_pg_cron`으로 활성화했다.** `public` 스키마에는 아무 것도 만들지 않았다(도메인 테이블 0개 유지 — Task 028 몫). 실패 감지는 pg_cron 내장 `cron.job_run_details`를 서버(`service_role`)가 직접 조회하는 패턴으로 정하고, 그에 필요한 최소 권한(`select`)만 부여했다.

**13일차 교차검증(BOARD)에서 `cron.job`/`cron.job_run_details`에 PUBLIC 기본 grant(각각 `select`, `select`+`delete`)가 이미 존재한다는 지적을 받았다.** defense-in-depth로 회수(`revoke`)를 시도했으나, **실측 결과 이 프로젝트의 `postgres` role 권한으로는 반영되지 않는다**(5절 참고) — `cron.job`·`cron.job_run_details`의 소유자가 `postgres`가 아니라 `supabase_admin`이기 때문이다. 대신 이미 확인해 둔 대로 **`cron` 스키마 자체에 `anon`/`authenticated`/PUBLIC의 `USAGE`가 없다는 것이 유일하지만 실효적인 차단선**이며, 이 상태를 앞으로도 유지해야 한다는 규칙으로 문서화했다.

## 1. 착수 전 D-037 확인 (실제 값)

| 확인 항목 | 값 |
| --- | --- |
| `list_tables`(public) | `[]` — 0개 |
| `list_migrations` | `[]` — 0건 |
| `list_extensions` 중 `pg_cron` | `installed_version: null`, `default_version: 1.6.4` |

낯선 테이블(`player`·`fixture` 등 축구 시뮬레이션 잔재)은 없었다. 계속 진행했다.

## 2. 적용한 마이그레이션

- **이름**: `enable_pg_cron` (version `20260724103449`)
- **로컬 파일**: `supabase/migrations/20260724103449_enable_pg_cron.sql`

```sql
-- Task 027: pg_cron 확장 활성화 (Supabase Cron, D-027)
-- 공식 설치 절차: https://supabase.com/docs/guides/cron/install
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- 실패 감지 경로 기반: 서버(service_role)가 cron.job / cron.job_run_details를
-- 직접 조회할 수 있도록 최소 권한(select)만 부여한다.
-- insert/update/delete 권한은 postgres에만 남긴다 (cron.job_run_details 정리는 운영 작업).
grant usage on schema cron to service_role;
grant select on cron.job, cron.job_run_details to service_role;
```

`create extension ... with schema pg_catalog`는 Supabase 공식 설치 절차([`docs/guides/cron/install`](https://supabase.com/docs/guides/cron/install))를 그대로 따른 것이다. pg_cron은 이 절과 무관하게 항상 `cron` 스키마를 만들어 `cron.job`·`cron.job_run_details`를 그 안에 둔다.

**적용 후 검증**: `list_migrations` 1건(`enable_pg_cron`), `list_extensions`에서 `pg_cron.installed_version = "1.6.4"`, `list_tables`(public) 여전히 0건.

## 3. 운영 지침 (D-027)

- **동시 잡 8개 이내, 잡당 10분 이내.** pg_cron 자체에는 이를 강제하는 설정이 없다 — Supabase Cron 공식 문서가 권고치로만 명시한다. 따라서 이번 Task에서 마이그레이션으로 강제할 수단은 없고, **잡을 등록하는 쪽(Task 034·035)이 지켜야 하는 규약**으로 남긴다.
- 각 잡을 등록할 때는 `cron.schedule` 안의 SQL에 `set local statement_timeout = '10min'`(또는 그 이하)을 거는 것을 권장한다 — pg_cron은 잡이 무한정 도는 것을 자체적으로 끊지 않는다.
- 동시 잡 수는 이 문서(또는 후속 문서)에 등록된 잡 목록을 세는 방식으로 추적한다. 이번 회차에는 등록된 잡이 없다(0개).
- **15일차 부기(Task 035, DESIGN)**: 채팅 12개월 파기 잡 `purge_expired_chat_messages`(`0 18 * * *`, `jobid=1`)를 등록해 **동시 잡 1/8개**가 됐다. 배치 크기 제한 루프 + `statement_timeout` 이중 방어로 CON-10 잡당 10분을 지켰다. 상세는 `docs/decisions/chat-retention-035.md` 참고.

## 4. 실패 감지 패턴 (NFR-029)

**실측**: 이 프로젝트의 `cron.job_run_details`에는 `jobname` 컬럼이 없다(컬럼: `jobid`·`runid`·`job_pid`·`database`·`username`·`command`·`status`·`return_message`·`start_time`·`end_time`). 사람이 읽을 수 있는 이름을 얻으려면 `cron.job`과 `jobid`로 조인해야 한다.

**조회 패턴** (검증 완료 — 실행 결과 `[]`, 등록된 잡이 없어 정상):

```sql
select
  d.jobid,
  j.jobname,
  d.status,
  d.return_message,
  d.start_time,
  d.end_time,
  extract(epoch from (d.end_time - d.start_time)) as duration_seconds
from cron.job_run_details d
left join cron.job j on j.jobid = d.jobid
where d.status = 'failed'
  and d.start_time > now() - interval '24 hours'
order by d.start_time desc;
```

- **접근 권한**: `cron` 스키마는 기본적으로 `postgres`(관리 역할)만 접근 가능하다. 이 마이그레이션에서 `service_role`에 `select`만 별도로 부여했다 — 서버(Server Action·Route Handler 등 `service_role` 클라이언트를 쓰는 경로)에서 위 쿼리로 실패를 조회할 수 있다. **정정(13일차)**: "`anon`/`authenticated`에는 권한을 주지 않았다"는 **스키마 `USAGE` 기준으로는 정확**하지만, **테이블 단위로는 부정확**하다 — `cron.job`·`cron.job_run_details`에는 pg_cron 설치 스크립트가 남긴 PUBLIC 기본 grant(`select`, `job_run_details`는 `delete`도)가 이미 있다. 실질적으로는 `cron` 스키마의 `USAGE`가 `anon`/`authenticated`/PUBLIC 어디에도 없어서 차단되지만, 이는 "권한을 안 줬다"가 아니라 "다른 층(스키마 `USAGE`)에서 막고 있다"는 뜻이다. 상세 근거와 회수 시도 결과는 5절 참고.
- **알림 연동은 이번 범위 밖이다.** 위 쿼리로 "최근 실패 목록"을 가져오는 것까지가 이번 기반이며, 이를 주기적으로 조회해 담당자에게 알리는 것은 실제 도메인 잡(034·035)이 생긴 뒤 결정한다.

## 5. PUBLIC 기본 grant — defense-in-depth 시도와 실측 결과 (13일차 교차검증, BOARD)

**발견**: BOARD가 `information_schema.table_privileges`로 `cron.job`에 `PUBLIC = SELECT`, `cron.job_run_details`에 `PUBLIC = SELECT, DELETE`가 이미 부여돼 있음을 실측했다. 이 마이그레이션이 준 것이 아니라 `create extension pg_cron` 설치 스크립트 자체가 남기는 기본값이다.

**시도**: defense-in-depth로 회수하는 마이그레이션 `revoke_public_from_cron_tables`(version `20260724104430`)를 적용했다.

```sql
-- Task 027 후속(13일차 교차검증, BOARD): pg_cron 설치 스크립트가 cron.job/cron.job_run_details에
-- 남기는 PUBLIC 기본 grant(SELECT, job_run_details엔 DELETE도)를 defense-in-depth로 회수한다.
revoke all on cron.job from public;
revoke all on cron.job_run_details from public;
```

> **35일차 부기(CORE, I-167 전수 감사)**: 위 인용은 파일 맨 앞 2줄(주석 헤더)과 실행문
> 2줄만 발췌한 것이다 — `revoke_public_from_cron_tables.sql`의 이 두 줄 사이에는 "왜 이
> revoke가 필요한가"를 설명하는 문단이 더 있는데, **그 문단은 원격 `schema_migrations`
> 원장에 남은 텍스트와 현재 로컬 파일의 텍스트가 다르다**(적용 이후 로컬에서 사후 편집됨
> — 전수 감사 결과 `docs/design/migration-integrity-audit-35/README.md` §3.1). 여기 인용한
> 4줄은 두 버전 모두에서 동일해 이 발췌 자체는 어느 쪽으로도 틀리지 않지만, 혼동을 막기
> 위해 명시해 둔다. 본문(아래 "실측 결과"부터)은 이 문서 자신의 실측 기록이라 이슈와
> 무관하게 정확하다 — **본문·인용 모두 고치지 않는다**: 코드 블록은 원래 두 버전 공통
> 부분만 발췌해 이미 정확했고, 갈라진 문단(두 버전 중 어느 쪽이 "맞다"보다 "이 리비전에서
> 무슨 근거로 이렇게 썼는가"의 기록 가치가 있는 쪽)을 새로 여기 옮겨 적으면 이 문서에도
> 같은 종류의 "인용 대 원장" 불일치를 하나 더 만들 뿐이다. 단일 소스는 여전히 마이그레이션
> 파일(현재 로컬 버전)이다.

**실측 결과 — 반영되지 않았다(no-op).** `apply_migration`은 `success: true`를 반환했고 `list_migrations`에도 기록됐지만, 직후 `pg_class.relacl`을 재조회하면 PUBLIC 항목이 그대로 남아 있다:

```
job:             {supabase_admin=arwdDxtm/supabase_admin, =r/supabase_admin, postgres=r*/supabase_admin, postgres=r/postgres, service_role=r/postgres}
job_run_details: {supabase_admin=arwdDxtm/supabase_admin, =rd/supabase_admin, postgres=a*r*w*d*D*x*t*m*/supabase_admin, postgres=arwdDxtm/postgres, service_role=r/postgres}
```

(`=.../supabase_admin`가 PUBLIC 항목이다 — grantee가 비어 있으면 PUBLIC을 뜻한다.) `execute_sql`로 같은 `revoke`를 다시 실행하고 같은 트랜잭션 내에서 즉시 재조회해도 결과가 같았다 — 에러 없이 실행되지만 ACL이 바뀌지 않는다.

**원인**: `cron.job`·`cron.job_run_details`의 소유자는 `supabase_admin`이다(`pg_class.relowner` 실측 확인). 이 프로젝트의 `postgres` role은 `rolsuper = false`이고(Supabase 관리형 인스턴스는 최종 사용자에게 진짜 슈퍼유저 권한을 주지 않는다 — [공식 문서](https://supabase.com/docs/guides/database/postgres/roles-superuser)), `supabase_admin`의 멤버도 아니다(`pg_auth_members` 실측 — postgres는 `pg_monitor`·`pg_read_all_data`·`anon`·`authenticated`·`service_role` 등의 멤버일 뿐 `supabase_admin`은 없다). `relacl`에 `postgres=r*/supabase_admin`처럼 grant option이 있는 것처럼 보여도, `supabase_admin`이 PUBLIC에 직접 부여한 grant를 `postgres`가 revoke하는 경로는 이 관리형 환경에서 막혀 있다. **이는 "위험해서 하지 않은 것"이 아니라 "이 프로젝트에서 우리가 가진 권한으로는 구조적으로 불가능한 것"이다.**

**남긴 실효 방어선**: `pg_namespace.nspacl` 실측 확인 결과 `cron` 스키마에는 PUBLIC/`anon`/`authenticated`의 `USAGE`가 없다(`{supabase_admin=UC/supabase_admin, postgres=U*/supabase_admin, postgres=U/postgres, service_role=U/postgres}`). PostgreSQL은 스키마 `USAGE` 없이는 그 스키마 안 오브젝트에 전혀 접근할 수 없으므로, **테이블의 PUBLIC grant가 있어도 스키마 `USAGE` 미부여가 유일하지만 실효적인 차단선**이다. `revoke_public_from_cron_tables` 마이그레이션은 기록으로는 남기되(의도를 명시하는 문서 역할), **실제 방어는 이 스키마 `USAGE` 상태에 의존한다.**

**규칙(앞으로 지킬 것)**: `cron` 스키마에 `anon`/`authenticated`/PUBLIC의 `USAGE`를 **절대 부여하지 않는다.** 만약 v0.2 이후 클라이언트가 잡 상태를 직접 조회해야 하는 요구가 생기면, `cron` 스키마에 권한을 여는 대신 `public`(또는 노출 스키마)에 `SECURITY DEFINER` 래퍼 함수를 만들어 필요한 컬럼만 좁혀 노출하는 방식을 우선 검토한다 — 테이블 PUBLIC grant를 우리 권한으로 되돌릴 수 없다는 것이 이번에 확인됐기 때문에, 스키마 경계가 뚫리면 즉시 전체 노출로 이어진다.

## 6. 남은 리스크·다음 회차(028+)로 넘길 것

- **`cron.job_run_details`는 자동으로 정리되지 않는다**(Supabase 공식 문서가 명시적으로 경고 — in-place 업그레이드 시 대용량 테이블이 문제가 된다). 지금은 등록된 잡이 없어 정리 배치를 만들 근거(실측 삭제 대상)가 없으므로 만들지 않았다. **Task 034·035에서 실제 잡을 등록할 때 함께 정리 배치(예: 90일 초과 로그 주기 삭제)를 만들 것을 권고한다.**
- **동시 잡 8개·잡당 10분 지침은 코드로 강제되지 않는다.** 잡을 추가하는 사람이 이 문서를 참조해 수동으로 지켜야 한다 — 잡 수가 늘어나면(v0.2 이후) 강제 수단(예: 잡 등록 헬퍼 함수)을 재검토할 수 있다.
- **`cron` 스키마 `USAGE`를 앞으로도 `anon`/`authenticated`/PUBLIC에 주지 않는다** — 5절의 규칙. 이 문서가 단일 소스다.
- PRD §8.3에 pg_cron 활성화 완료 사실을 부기했다(D-027이 "PRD §8에 명시"를 요구).
