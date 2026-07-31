# I-056 실측 감사 — 탈퇴 계정 파기 `auth.users` 직접 SQL 경로 (36일차)

**배정**: 미착수 후속 항목 색인(`docs/design/unexplored-followups-index/README.md`) §2 랭킹
5위, I-056(`anonymize_expired_deactivated_profiles`가 `auth.users`를 Admin API가 아니라
`postgres` role의 직접 SQL로 수정한다). 이 문서는 그 배정에 대한 CREW의 실측 답이다.

**방법 원칙**: `docs/ISSUES.md` I-056 원문·`docs/decisions/cron-foundation.md`·
`docs/decisions/account-lifecycle-039.md`를 먼저 읽었지만, **그 서술을 그대로 믿지 않고
전부 `mcp__supabase__execute_sql`로 DB에서 직접 재확인했다**(팀장 지시, 35일차 판정
기준 — "append-only 문서 서술과 실물이 어긋날 수 있다"는 이 프로젝트의 반복된 교훈).
실제로 아래 §4에서 문서 서술과 실물이 어긋나는 지점을 하나 발견했다.

---

## 1. 배포된 함수 정의 (실측 원문, `pg_get_functiondef`)

```sql
CREATE OR REPLACE FUNCTION public.anonymize_expired_deactivated_profiles(
  batch_size integer DEFAULT 500,
  max_duration interval DEFAULT '00:07:00'::interval
)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  affected_count integer;
  total_affected bigint := 0;
  batch_ids uuid[];
begin
  set local statement_timeout = '1min';

  loop
    select array_agg(id) into batch_ids
    from (
      select id
      from public.profiles
      where status = 'deactivated'
        and deactivated_at is not null
        and deactivated_at <= now() - interval '30 days'
      order by deactivated_at
      limit batch_size
    ) as expired;

    exit when batch_ids is null or array_length(batch_ids, 1) is null;

    update public.profiles
    set
      display_name = '탈퇴한 사용자',
      handle = 'withdrawn-' || substr(id::text, 1, 8),
      avatar_url = null,
      bio = null,
      search_opt_out = true,
      status = 'withdrawn',
      anonymized_at = now()
    where id = any(batch_ids);
    get diagnostics affected_count = row_count;
    total_affected := total_affected + affected_count;

    update auth.users
    set
      email = 'withdrawn+' || id::text || '@anonymized.invalid',
      raw_user_meta_data = '{}'::jsonb,
      banned_until = 'infinity'::timestamptz
    where id = any(batch_ids);

    exit when clock_timestamp() - started_at > max_duration;
  end loop;

  return total_affected;
end;
$function$
```

**문서 대조**: `docs/ISSUES.md` I-056 본문이 서술한 "`email`·`raw_user_meta_data`·
`banned_until`을 직접 SQL로 갱신한다"는 실물과 **정확히 일치한다** — 이 부분은 문서가 맞다.
함수는 `id`(필터 키) 외 `auth.users`의 다른 컬럼을 **읽지 않는다**(SELECT 대상 아님).

---

## 2. `auth.users` 컬럼 전수 대응표

| 컬럼 | 직접 SQL 동작 | Admin API(`PUT /auth/v1/admin/users/{id}`, JS: `updateUserById`) 대응 파라미터 | 대체 가능 여부 |
| --- | --- | --- | --- |
| `email` | `= 'withdrawn+<uuid>@anonymized.invalid'` | `email` | **완전 대체 가능** — `search_docs`로 공식 예제 확인(`{ email: 'new@email.com' }`) |
| `raw_user_meta_data` | `= '{}'::jsonb` (초기화) | `user_metadata` | **완전 대체 가능** — 공식 예제가 `user_metadata`를 `raw_user_meta_data`에 매핑함을 명시 |
| `banned_until` | `= 'infinity'::timestamptz` | `ban_duration`(예: `'876000h'`, 상대 기간 문자열) | **근사 대체만 가능** — Admin API는 절대 타임스탬프 `infinity`를 받지 않고 **현재 시각 기준 상대 기간**만 받는다(공식 예제가 "100년 차단"을 `'876000h'`로 예시). 기능적으로는 이 앱 수명 내 동등하지만, 문자 그대로 `infinity`는 아니다 |

**읽기 대상 컬럼**: 없음. `where id = any(batch_ids)`는 `public.profiles`에서 이미 확정한
UUID 배열로 필터링할 뿐 `auth.users`의 값을 조회하지 않는다.

**결론**: 이 함수가 건드리는 `auth.users` 컬럼은 정확히 **3개**(`email`·
`raw_user_meta_data`·`banned_until`)이고, **3개 전부 공식 Admin API로 대체 가능**하다 —
다만 `banned_until`은 근사(긴 상대 기간)로만 가능해 "완전 동등"은 아니다.

---

## 3. 실행 방식 실측

`docs/decisions/cron-foundation.md`가 서술한 대로 `pg_cron`으로 등록돼 있다 — **수동 실행이
아니다.**

```
jobid=2, jobname='anonymize_expired_deactivated_profiles',
schedule='30 18 * * *', command='select public.anonymize_expired_deactivated_profiles();',
active=true
```

같은 데이터베이스에 잡이 4개 더 있다(`purge_expired_chat_messages` 18:00,
`anonymize_expired_deactivated_profiles` 18:30, `purge_expired_rate_limit_counters` 19:00,
`purge_expired_handle_availability_check_attempts` 19:30, `poll_auto_close_and_finalize`
5분 주기) — 동시 5개, `cron-foundation.md` D-027의 "동시 잡 8개 이내" 지침 안이다.

**실행 이력 실측**(`cron.job_run_details`, jobid=2): **6/6회 전부 `succeeded`**
(2026-07-25 ~ 2026-07-30, 매일 18:30 UTC, 각 실행 0.03~0.07초). **실패 이력 0건** —
Task 039가 이 잡을 만든 이래 지금까지 한 번도 깨진 적이 없다.

---

## 4. "조용히 깨지는가" — 실측 답

**결론: 절반만 참이다.** "완전히 무음"은 아니지만 "능동적으로 알려주는 경로는 없다."

### 4.1 실패하면 사라지지 않는다 (참이 아닌 부분)

- `pg_cron`은 잡 실행 중 예외가 발생하면 `cron.job_run_details.status = 'failed'`와
  Postgres 에러 텍스트를 `return_message`에 그대로 남긴다. 이 테이블은 **쿼리 가능하다**
  (`service_role`에 `select` 권한 부여, `cron-foundation.md` §2·§4) — 예를 들어
  `auth.users`의 컬럼명이 바뀌어 `update auth.users set raw_user_meta_data = ...`가
  `column "raw_user_meta_data" does not exist`로 실패해도, 그 사실 자체는 DB 안에 기록되고
  사람이 조회하면 즉시 원인 문구까지 볼 수 있다.
- 배치 루프 전체(여러 번의 `profiles`/`auth.users` UPDATE)가 **함수 하나를 호출하는 단일
  암묵적 트랜잭션** 안에서 실행된다(명시적 `COMMIT`/자율 트랜잭션 없음, 함수 정의 실측
  확인). `auth.users` UPDATE가 실패하면 같은 배치의 `profiles` UPDATE도 **함께 롤백**된다 —
  "일부만 파기됨" 같은 반쪽짜리 상태로 남는 경로는 구조적으로 없다.
- 대상 프로필은 `deactivated` 상태를 유지하므로 **다음날 같은 배치가 그대로 재시도된다**
  (멱등) — 실패가 데이터를 영구히 잃어버리게 만들지 않는다. 실패의 실질적 효과는 "파기
  시점이 하루씩 계속 밀린다"이지 "데이터 손상"이 아니다.

### 4.2 아무도 안 본다 (참인 부분 — 이게 실질적 위험이다)

이 실패를 **능동적으로 알려주는 경로가 하나도 없다**는 것을 세 방향에서 실측 확인했다:

1. **애플리케이션 오류 추적이 이 경로에 닿지 않는다.** `src/lib/audit/error-tracking.ts`
   (`captureError`, NFR-028 임시 구현)는 Next.js 서버 코드(Server Action·오류 경계)에서만
   호출된다. `anonymize_expired_deactivated_profiles`는 **순수 SQL로 `pg_cron`이 직접
   실행**하므로 Next.js 런타임을 전혀 거치지 않는다 — 이 함수가 실패해도 `captureError`가
   호출될 방법이 구조적으로 없다. `docs/decisions/observability-browser-045.md`에도
   `cron`·`pg_cron`·`job_run_details` 언급이 0건이다(grep 확인) — 관측성 축이 아예
   cron을 다루지 않는다.
2. **`audit_logs`에 이 잡의 흔적이 없다.** `select distinct action from audit_logs`는
   `admin.granted`·`admin.revoked`·`crew.disbanded`·`crew.staff_appointed`·
   `meetup.cancelled` 5종뿐이다 — 탈퇴 파기 관련 action은 성공이든 실패든 **하나도
   기록되지 않는다.**
3. **애플리케이션 코드 어디에도 `cron.job_run_details`를 조회하는 곳이 없다.**
   `grep -rn "job_run_details" src/`는 0건이다 — `/admin` 콘솔(Task 042B)도, 어떤 대시보드도
   이 실패 조회 쿼리(`cron-foundation.md` §4)를 자동으로 돌리지 않는다. 그 쿼리는
   **문서화된 수동 진단 패턴**일 뿐, 누가 정기적으로 실행하기로 정해진 절차가 아니다.

**종합 판정**: 지금 이 함수가 실패하면 —
- Postgres/pg_cron 층에서는 **관측 가능**(쿼리하면 보인다, 데이터 손상도 없다)
- 하지만 **이 프로젝트의 어떤 자동 경로도 그 실패를 사람에게 전달하지 않는다** — 누군가
  우연히 또는 의도적으로 `cron.job_run_details`를 SQL로 열어보기 전까지는, 탈퇴 유예가
  끝난 사용자의 이메일이 계속 남아 있는 상태가 **원인 불명 상태로 무한정** 유지된다.
  **이 의미에서는 "조용히 깨진다"는 서술이 정확하다.**

### 4.3 문서 서술과 실물의 불일치 발견 — `pg_net`

`docs/ISSUES.md` I-056 본문: *"`pg_net` 확장(이 프로젝트에 이미 설치돼 있음, 실측
확인)으로 비동기 HTTP 호출을 우회할 수는 있으나…"*

**실측(`pg_extension` 직접 조회, `list_extensions` 대조)**: `pg_net`의
`installed_version`은 **`null`**이다 — 설치돼 있지 않다. 설치된 것은 `pg_cron`(1.6.4)·
`supabase_vault`(0.3.1)뿐이다. 마이그레이션 파일 **134건**(`ls supabase/migrations/*.sql |
wc -l` = 134, 원격 `supabase_migrations.schema_migrations` count도 134 — 35일차 CORE
무결성 감사의 "134/134"와 일치) 전수를 `grep -rli "pg_net" supabase/migrations/*.sql`로
다시 돌려도 결과는 동일하게 **1건**,
`supabase/migrations/20260725072923_anonymize_expired_deactivated_profiles_job.sql`(Task
039) 뿐이다. 그 파일 안에서도 "우회하려면(pg_net으로)"라는 **가정법** 주석 한 줄이지 실제
`create extension pg_net` 실행은 어디에도 없다. **I-056의 "이미 설치돼 있음, 실측 확인"은
현재 DB 상태와 어긋난다** — 18일차 당시 오판이었는지, 이후 어떤 경로로 빠졌는지는 이번
조사로 특정하지 못했다(§6 미검증 잔여 참고). `docs/ISSUES.draft.CREW.md`에 번호 없이
기록했다.

> **정정(36일차, 팀장 지적)**: 이 절은 최초 작성 시 "137건"으로 잘못 적었다 — 같은
> 회차 안에서 직접 실행한 `ls supabase/migrations/ | wc -l` 결과가 134였는데도 문서에는
> 옮겨 적는 과정에서 숫자가 바뀌었다(다른 문서·다른 회차 숫자와 혼동한 것으로 보이나,
> 이 대화 안에서 137의 출처를 특정하지 못했다 — 근거 없는 오기로 판단한다). 위 문단은
> 134로 정정하고 grep을 재실행해 결과가 바뀌지 않음(여전히 1건)을 확인했다.

이 불일치는 아래 §5 대안 비교의 비용 산정에 직접 영향을 준다 — `pg_net` 기반 대안은
"이미 있는 확장을 쓰는 것"이 아니라 **새로 설치하는 것**이다.

---

## 5. 대안 비교와 권고

세 안을 이 프로젝트의 실제 제약(CI 없음 R-002, 이 저장소에 Edge Function 0개 — 전례 없음,
`pg_net` 미설치 — 위 §4.3, `pg_cron` 기반은 이미 안정 가동 중 D-027) 아래 비교한다.

### 안 A — 현행 유지 + 관측 가능성만 추가

**변경**: 함수는 그대로 두고, `/admin` 콘솔(Task 042B가 이미 만든 관리자 전용 라우트)에
`cron.job_run_details`를 조회하는 패널을 하나 추가한다. `service_role`은 이미
`cron.job`·`cron.job_run_details`에 `select` 권한이 있으므로(`cron-foundation.md` §2)
**새 권한 부여가 필요 없다** — 데이터 계층에 조회 함수 하나(`lib/data/supabase/admin.ts`에
`getCronJobFailures()` 추가하는 정도)와 컴포넌트 하나만 있으면 된다.

- **비용**: **낮음.** 새 마이그레이션 0건(권한이 이미 있다), 새 인프라 0개, 새 외부
  의존 0개. 순수 함수 아니고 데이터 조회라 vitest 범위(quorum·poll-decision·
  poll-eligibility 3개 모듈, `CLAUDE.md`) 밖이지만, 원래도 `/admin`은 자동 테스트가
  없는 영역이라 회귀 부담이 늘지 않는다.
- **리스크**: **근본 원인(공식 API 계약 밖)은 그대로 남는다.** 이 안은 "깨졌을 때 더 빨리
  안다"이지 "안 깨지게 한다"가 아니다. 관리자가 `/admin`을 열어봐야 알 수 있다는 점에서도
  완전 자동 알림은 아니다(다만 이미 이 회차 §4.2가 확인했듯 **지금은 자동 알림 경로가
  0개**이므로, 사람이 봐야 아는 것조차 지금보다는 개선이다).

### 안 B — Edge Function + Admin API로 전면 이전

**변경**: `profiles` UPDATE와 `auth.users` UPDATE를 모두 Deno Edge Function으로 옮기고,
`service_role` 키를 Edge Function 시크릿(Vault가 아니라 `supabase secrets set`, DB 내부
저장이 아니다)으로 보관, `supabase.auth.admin.updateUserById()`를 대상마다 호출한다.
스케줄은 Supabase 공식 문서가 명시한 패턴(`search_docs` 확인) — `pg_cron` + `pg_net`으로
Edge Function URL에 `net.http_post`를 거는 것이 **Supabase가 문서로 지원하는 유일한 스케줄
방식**이다(Edge Function 전용 별도 네이티브 크론 스케줄러는 문서에 없다 — 이 조합이
정식 경로다).

- **비용**: **높음.**
  1. 이 저장소에 Edge Function이 **0개**다(`list_edge_functions` 확인) — 전례 없는 컴포넌트
     추가. 배포·시크릿 관리·로컬 개발 흐름이 새로 생긴다.
  2. `pg_net` 확장이 **미설치**다(§4.3) — 설치 마이그레이션이 추가로 필요하다.
  3. Admin API는 **배치 UPDATE가 없다** — 현재 SQL 1회 `UPDATE ... WHERE id = ANY(...)`가
     대상 수만큼의 개별 HTTP 왕복으로 바뀐다. `batch_size=500` 그대로면 하루 최대 500회
     HTTP 호출 — 레이트 리밋·부분 실패(500건 중 250번째가 실패하면 나머지는?) 처리를
     새로 설계해야 한다. 지금의 "배치 전체가 한 트랜잭션" 원자성이 자동으로는 안 따라온다.
  4. **`npm run build`·`npm run dev` 실행이 이 세션에서 금지**(운영 규칙)이므로 Edge
     Function 코드를 이 세션에서 만들어도 로컬 실행 검증을 할 수 없고, `npx tsc --noEmit`은
     Deno 런타임 코드(별도 `deno.json`, Node 타입체커 대상 밖)를 검증하지 못한다. **자동
     테스트가 없는(R-002) 이 프로젝트에서 가장 검증하기 어려운 형태의 변경이다.**
- **효과**: `auth.users`를 건드리는 모든 경로가 공식 API 계약 안으로 들어와 I-056의
  근본 원인이 사라진다.

### 안 C — 하이브리드(부분 이전)

**변경**: `profiles` UPDATE는 지금처럼 `pg_cron` SQL에 남긴다(이건 애초에 앱이 소유한
테이블이라 I-056의 대상이 아니다). `auth.users` UPDATE만 떼어내 Edge Function으로
비동기 호출한다(`pg_net.http_post`, 안 B와 같은 확장·전례 없음 비용을 그대로 진다).

- **비용**: 안 B보다 약간 낮다(변경 범위가 `auth.users` 3컬럼뿐) — 그러나 **원자성이
  오히려 지금보다 나빠진다.** 지금은 `profiles`·`auth.users` UPDATE가 한 트랜잭션이라
  실패 시 둘 다 롤백되지만, 하이브리드는 `profiles`를 `withdrawn`으로 먼저 커밋해 두고
  `auth.users` 파기는 비동기 HTTP 응답을 기다려야 한다 — **그 HTTP 호출이 실패하면
  `profiles`는 이미 파기됐다고 표시됐는데 `auth.users.email`은 그대로 남는, 지금보다
  더 나쁜 불일치 상태**가 새로 생긴다. 이걸 막으려면 재조정(reconciliation) 잡이 또
  필요해 실제 비용은 안 B에 근접한다.

### 권고: **안 A를 이번 회차에 채택하고, 안 B는 보류(v0.2 이후 재검토 조건부)로 남긴다**

**근거**:

1. **실측된 현재 위험은 낮다.** 6/6회 성공, 실패해도 데이터 손상 없이 재시도되는 구조다
   (§4.1). I-056 원문도 스스로 "실질적 로그인 차단은 `banned_until`로 이미 달성된다"고
   적어 우선순위를 낮게 잡았고, 이번 조사가 이 판단을 뒤집을 새 증거를 찾지 못했다.
2. **실제로 고쳐야 할 것은 "위험도"가 아니라 "관측 가능성"이었다.** §4.2가 확인한 진짜
   갭은 "직접 SQL이라서 위험하다"가 아니라 "실패해도 아무 데도 안 뜬다"였다 — 안 A는
   정확히 이 갭을 비용 거의 0으로 메운다(이미 있는 `service_role` 권한만 쓴다).
3. **안 B·C의 비용은 이 프로젝트 제약과 정면으로 부딪힌다.** CI 없음(R-002) +
   `npm run build`/`dev` 세션 금지 조합은 Edge Function처럼 **로컬에서 즉시 확인할 수
   없는 런타임**을 검증할 방법을 이번 세션에 주지 않는다. Playwright 세션 공유 제약으로
   이미 여러 Task(039·040·042A/B)가 "브라우저 실클릭 미검증"을 이월한 전례가 있는데,
   Edge Function은 그보다 더 자동 검증 수단이 없다.
4. **`pg_net` 미설치 발견(§4.3)이 안 B·C의 실제 착수 비용을 문서가 시사하던 것보다
   올린다** — "이미 있는 확장을 연결만 하면 된다"가 아니라 "확장 설치부터 시작한다."

**재검토 조건(다음에 안 B를 다시 열 때 확인할 것)**: 탈퇴 처리 볼륨이 실사용 트래픽
규모로 늘어나거나, `cron.job_run_details`에서 실제 실패가 1건이라도 관측되거나,
Supabase가 `auth.users` 스키마 변경을 공지하면 — 그때는 안 A의 관측 패널이 그 신호를
잡아줄 것이므로, 신호가 잡힌 시점에 안 B 착수를 재논의한다.

---

## 6. 미검증 잔여

- **`pg_net`이 "이미 설치돼 있었다"는 18일차 서술이 왜 지금과 다른지는 특정하지 못했다.**
  18일차 당시 정말 설치돼 있다가 이후 제거됐는지, 애초에 오판이었는지는 마이그레이션
  이력만으로는 구분 안 된다(설치·삭제 양쪽 다 `apply_migration` 없이도 `execute_sql`로
  가능해서 마이그레이션 로그에 안 남을 수 있다).
- **Admin API의 `ban_duration`이 실제로 `banned_until='infinity'`와 동등하게 동작하는지는
  실측하지 않았다** — 문서상 파라미터 존재만 확인했고, 실제 호출·응답 검증은 이번 범위
  밖이다(마이그레이션·쓰기 실험 금지 지침).
- **Admin API 개별 호출의 실제 레이트리밋 수치**(초당 몇 건까지 허용되는지)는 조사하지
  않았다 — 안 B 비용 산정의 "500건이면 느릴 것"은 정성적 추정이지 실측이 아니다.
- **안 A(관측 패널)를 실제로 구현하지는 않았다** — 이번 배정은 감사·비교이지 구현이
  아니다(팀장 승인 없이 마이그레이션 적용 금지 지침, 이 안은 마이그레이션이 필요 없지만
  `/admin` 컴포넌트 추가는 별도 Task로 분리하는 편이 안전하다고 판단해 코드 변경을
  하지 않았다).

---

## 7. 산출물

- **신규**: 이 문서(`docs/design/pii-purge-path-audit-36/README.md`)
- **신규**: `docs/ISSUES.draft.CREW.md`(번호 없음, D-082) — §4.3 `pg_net` 문서-실물 불일치
- **수정 없음**: 마이그레이션·코드 변경 0건(지침대로 읽기 전용 조사만 수행, 쓰기 실험도
  하지 않았다 — SELECT만으로 충분히 답이 나왔다)

---

## 8. 36일차(BOARD) 교차검증 — §3·§5의 "6/6 성공, 위험 낮음"을 뒤집는 실증 결과

**리뷰 짝 교차검증(팀장 배정)**. 항목 1~4·6은 독립 재실측으로 그대로 확인됐다(정확한
컬럼·트리거·`cron.job`·관측 경로 3종·마이그레이션 134/134 재확인, `pg_net` 미설치 재확인).
**항목 2(원자성)는 코드 판독을 넘어 `begin...rollback`으로 감싼 강제 실패 주입으로
직접 실증했다** — `auth.users` UPDATE에 트리거를 걸어 강제로 실패시키면 이미 실행된
`profiles` UPDATE(`'withdrawn'`)도 함께 롤백됨을 확인(원자성 주장 CONFIRMED, 코드 판독보다
강한 근거).

**항목 5는 여기서 뒤집힌다.** `select status, count(*) from public.profiles group by status`로
직접 재확인한 결과 이 DB의 프로필 21건은 **전부 `active`다 — `deactivated`·`withdrawn`은
0건.** 즉 §3이 인용한 "6/6 성공"은 **매 실행마다 `batch_ids`가 `null`이라 첫 반복에서
즉시 종료된 결과**이고, **`update auth.users`(이 감사의 대상 그 자체)는 이 데이터베이스
역사상 단 한 번도 실행된 적이 없다.** "표본이 작은지"가 아니라 **위험한 경로 기준
표본이 0**이었다.

더 나아가, 실제로 대상 행이 생겼을 때 이 함수가 성공하는지를 **직접 실증했다**(가짜
`auth.users`+`profiles` 행을 `deactivated`(31일 전)로 만들고 실제 함수를 그대로 호출,
`begin...rollback`으로 감싸 DB에 흔적 없음). 결과: **`profiles_handle_check` 위반으로
즉시 실패한다.** 원인은 함수의 `handle = 'withdrawn-' || substr(id::text, 1, 8)`(하이픈
포함)가 **29일차(CREW, `20260730033654_product_value_check_constraints_083.sql`, D-083)가
Task 039 이후에 추가한** `profiles_handle_check`(`^[a-z][a-z0-9_]*$`, 하이픈 불허)와
충돌하기 때문이다 — 두 마이그레이션이 서로를 인지하지 못한 회귀다.

**종합**: §5의 "실측된 현재 위험은 낮다"는 근거가 되지 못한다. 이 함수는 **지금 상태로는
실제 대상 데이터를 만나면 항상 실패한다**(일시적 장애가 아니라 정적 SQL 버그라 §4.1의
"다음날 재시도되니 안전하다"도 위안이 되지 못한다 — 재시도해도 매번 같은 이유로 실패한다).
다만 §4.2("아무도 안 본다")·§5 안 A(관측 패널 우선)의 방향 자체는 이 발견과 상충하지
않는다 — 오히려 **더 시급해진다**: 지금 필요한 건 "이미 안전한 걸 관측 가능하게" 하는
것이 아니라 "**이미 깨져 있고 아직 아무도 모르는 것**을 관측 가능하게" 하는 것이다.
상세·재현 절차·후속 제안은 `docs/ISSUES.draft.BOARD.md`(번호 없음)에 기록했다 — 이
문서(§1~7)는 CREW 원 서술 그대로 보존한다(이 프로젝트 관례, append-only).

---

## 9. (A)급 확정 후 수정안 설계 (36일차, CREW — 팀장 배정)

**범위**: §8이 확정한 (A)급 버그(핸들에 하이픈을 쓰는 파기 함수 vs 하이픈을 불허하는
D-083 CHECK)의 수정 마이그레이션을 **설계·검증**한다. **`apply_migration`은 호출하지
않았다** — 아래 SQL은 전부 `begin…rollback`으로 감싼 검증이고, 실제 적용은 팀장 승인
후다(지침대로).

### 9.1 재현 — 독립 확인(BOARD 결과와 별개로 직접 재현)

```sql
begin;
insert into auth.users (id, email, raw_user_meta_data, banned_until)
values ('11111111-1111-4111-8111-111111111101', 'i063-fix-testA@example.invalid', '{}'::jsonb, null);
insert into public.profiles (id, handle, display_name, status, deactivated_at)
values ('11111111-1111-4111-8111-111111111101', 'crewfixtesta01', 'CREW 픽스 테스트 A', 'deactivated', now() - interval '31 days');
select public.anonymize_expired_deactivated_profiles();
rollback;
```

결과: `ERROR: 23514: new row for relation "profiles" violates check constraint
"profiles_handle_check" ... Failing row contains (..., withdrawn-11111111, ...)`.
BOARD와 동일한 결함을 별도 계정·별도 합성 데이터로 재확인했다. 세션 종료로 자동 롤백,
잔류 행 0건 확인.

### 9.2 항목 1 — 가장 단순한 안(하이픈→밑줄)이 통과하는가

`begin…rollback`으로 함수를 **트랜잭션 내부에서만** `handle = 'withdrawn_' ||
substr(id::text, 1, 8)`로 재정의(`CREATE OR REPLACE FUNCTION`은 DDL이라 트랜잭션 범위 —
롤백하면 원래(버그 있는) 정의로 정확히 되돌아간다, 별도로 확인함)하고 실제 호출까지
실행했다.

**결과**: 성공. `handle = 'withdrawn_11111111'`, `char_length = 18`, `status = 'withdrawn'`.
**PASS** — 팀장이 제안한 최소안은 그대로 작동한다.

### 9.3 항목 4 — 엔트로피 확장안과 비교

`'withdrawn_'`(10자) + `substr(replace(id::text,'-',''),1,10)`(하이픈을 뺀 10 hex)를
같은 방식으로 실증:

**결과**: 성공. `handle = 'withdrawn_1111111111'`, `char_length = 20`(정확히 상한).
8 hex(32비트, ≈43억 조합) → 10 hex(40비트, ≈1.1조 조합)로 **엔트로피가 256배** 늘고,
20자 상한을 정확히 채워 여유를 남기지 않는다(더 늘릴 방법이 없다는 뜻이기도 하다).
**비용은 8 hex 안과 완전히 같다**(같은 `substr` 패턴, 계산량 차이 없음) — 이 이유만으로도
9.2안보다 이 안을 권고한다.

### 9.4 항목 2 — 유일성 충돌의 실제 파급 범위(실증)

`substr(replace(id::text,'-',''),1,10)`이 같은 접두를 갖도록 **일부러** 두 UUID를
만들어(`aaaaaaaa-aa11-...`/`aaaaaaaa-aa22-...`, 둘 다 하이픈 제거 후 첫 10자가
`aaaaaaaaaa`로 동일) 9.3안 그대로 실행했다.

**결과**: `ERROR: 23505: duplicate key value violates unique constraint
"profiles_handle_key" DETAIL: Key (handle)=(withdrawn_aaaaaaaaaa) already exists.` —
**현재 구조(배치 전체를 하나의 `UPDATE ... WHERE id = ANY(batch_ids)`로 처리)에서는
충돌 한 건이 배치 전체(그 실행에 포함된 모든 대상, 최대 500명)의 파기를 막는다**는
팀장의 우려를 실측으로 확정했다. 8→10 hex 확장은 충돌 **확률**을 줄일 뿐 **구조적
취약성**(단일 충돌 = 전원 실패)은 그대로 남긴다.

**대응 설계(강화안)**: 배치 단위 `UPDATE`를 행 단위 루프 + `EXCEPTION WHEN
unique_violation`으로 바꿔, 첫 시도는 지금처럼 `id` 기반(읽기 쉽고 결정적)으로 하되
충돌 시 최대 5회까지 **`gen_random_uuid()` 기반 완전 무작위 접미사**로 재시도한다
(`id` 기반 값을 그대로 재시도하면 같은 충돌이 항상 재발해 무의미 — 그래서 재시도부터는
`id`와 무관한 난수를 쓴다). 충돌한 행 하나만 재시도되고 **같은 배치의 다른 행은
전혀 영향받지 않는다.**

**같은 충돌 시나리오로 강화안을 재실증**: 두 행 모두 `withdrawn` 전이 **성공** —
1번 행은 `withdrawn_aaaaaaaaaa`(결정적, 1차 시도), 2번 행은 충돌을 감지해 재시도한
`withdrawn_2c251f3c1b`(난수, 2차 시도)로 배정됐다. `RAISE WARNING`으로 재시도 발생을
로그에 남기게 해 뒀다(관측 가능성 — §5 안 A의 방향과 합류).

**비용**: 배치당 `UPDATE`가 2건(profiles·auth.users 벌크)에서 최대 1,000건(행 500개 ×
2)으로 늘어난다 — 전부 PK 단건 `UPDATE`라 개별 비용은 작고, `statement_timeout='1min'`
안에 충분히 끝난다(합성 실측이라 정확한 지연시간은 측정하지 않았다 — 미검증 잔여로
남긴다, §9.7). 대신 "한 명의 충돌이 전원을 막는다"는 구조적 결함이 사라진다.

### 9.5 항목 3 — 스쿼팅 가능성 확정

`checkHandleAvailabilityAction`(`src/lib/actions/check-handle-availability.ts:101-127`)을
읽었다 — `/signup`이 blur마다, 제출 직전에도 이 함수 하나만 거친다. 검사는 **①형식**
(`validateHandleFormat`, `HANDLE_PATTERN = /^[a-z][a-z0-9_]*$/`, 3~20자)**②중복**
(`getProfileByHandle`) 둘뿐이고, **예약 접두어 개념이 코드 어디에도 없다.**
`pg_trigger`로 `public.profiles`의 트리거를 전수 확인해도 `BEFORE UPDATE`(자기 상태
전이 가드) 하나뿐, `BEFORE INSERT` 트리거는 0개다.

**결론: 확정된다 — 지금 `/signup`으로 `withdrawn_xxxxxxxxxx` 패턴 핸들을 정상적으로
등록할 수 있다.** 형식 검사를 통과하고(소문자 시작, `[a-z0-9_]`), 아직 아무도 안
썼다면 중복 검사도 통과한다.

**다만 9.4의 강화안을 채택하면 이 위험의 실질적 심각도가 크게 낮아진다** — 스쿼팅과
우연한 충돌은 파기 함수 입장에서 **똑같이 `unique_violation`**이다. 강화안은 그 예외를
이미 잡아 무작위 접미사로 재시도하므로, 특정 대상의 예측 가능한 `id` 기반 핸들을
누군가 선점해도 **파기 자체는 그대로 성공**하고(대상자는 그냥 무작위 접미사를 받을
뿐), "파기가 영구히 막힌다"는 팀장이 우려한 최악의 시나리오는 강화안에서는 발생하지
않는다. 다만 "특정 패턴을 예약 없이 아무나 쓸 수 있다"는 위생상의 문제 자체는 남는다 —
**후속으로 `HANDLE_PATTERN`/`validateHandleFormat`에 `withdrawn_` 접두어 예약을
추가하는 것을 권고하지만, 이번 마이그레이션(SQL)의 범위 밖이다**(TS 코드 변경이라
별도 승인·별도 PR 대상, 이번 지시는 SQL 설계로 한정했다 — 코드는 건드리지 않았다).

### 9.6 항목 5 — 두 마이그레이션이 서로를 못 본 이유

`supabase/migrations/20260730033654_product_value_check_constraints_083.sql`(D-083,
29일차) 원문 1~10행을 확인했다: 이 마이그레이션은 명시적으로 "앱 레이어 정의(단일
소스)"라며 `src/lib/rules/handle-validation.ts`의 `HANDLE_PATTERN` 등 **TS 상수를
그대로 DB CHECK로 승격**하는 것이 목적이었다 — TS 쪽 기준을 정확히 미러링했다는 점에서
**그 자체로는 옳은 작업**이었다. 문제는 **승격 전에 기존 SQL 함수 중 이 패턴을 벗어난
값을 쓰는 곳이 있는지 감사하는 단계가 없었다**는 점이다. `anonymize_expired_deactivated_
profiles`(Task 039, 18일차, D-083보다 11일 앞서 만들어짐)는 PL/pgSQL 함수 본문 안의
리터럴이라 `grep`으로 TS 파일만 훑어서는 안 걸리고, `handle` 컬럼에 값을 쓰는 SQL
함수를 전수 조회(`pg_proc`+`pg_get_functiondef` 전체를 훑어 `handle` 대입을 찾는 식)
해야만 걸린다 — 그런 조회는 D-083 작업에도, 이번 조사 전까지 어떤 회차에도 없었다.
**재발 조건**: "기존 컬럼에 새 CHECK를 추가하는 마이그레이션은, 그 컬럼에 쓰기를
수행하는 기존 SQL 함수·트리거 전수를 `pg_get_functiondef`로 먼저 훑는다"는 절차가
아직 이 프로젝트에 없다 — 이번 사고와 정확히 같은 유형의 재발을 막으려면 이 점검이
필요하다(마이그레이션 체크리스트 후보로 `docs/ISSUES.draft.CREW.md`에 번호 없이
같이 적었다).

### 9.6-보충 같은 클래스의 다른 사례 — 전수 확인 결과(팀장 실측 + CREW 독립 재현, 0건)

**"나중에 추가된 CHECK가 먼저 있던 함수의 합성값과 충돌한다"는 결함 클래스가 이 함수
하나에 국한되는지**를 팀장이 먼저 전수 확인했고, CREW가 같은 조회를 독립적으로 다시
돌려 같은 결과를 얻었다(아래는 CREW가 직접 실행한 결과).

- D-083이 추가한 제약은 정확히 4개: `profiles_handle_check`·`profiles_bio_check`·
  `crews_name_check`·`crews_description_check`(대상 컬럼: `handle`·`bio`·`name`·
  `description`).
- `pg_proc`+`pg_get_functiondef`로 `public`·`private` 스키마 함수 90개 전체를 조회해
  본문에 `UPDATE (public.)profiles`/`UPDATE (public.)crews`가 있는 함수를 정규식으로
  걸렀다 — **정확히 7개**: `private/public` 두 겹 구조(029B 전례)로 등록된
  `admin_grant_system_admin`·`admin_resolve_report`·`admin_revoke_system_admin`·
  `disband_crew`(각 private·public 합쳐 사실상 4쌍) + `anonymize_expired_deactivated_
  profiles`·`request_account_deactivation`·`restore_deactivated_account`(public 단일).
  팀장이 보고한 목록과 정확히 일치했다.
- 이 7개(전부 14개 정의, private+public 포함) 함수 본문에서 정규식
  `\b(handle|bio|name|description)\s*=`(대입 문맥)로 다시 걸렀다 — **일치하는 줄은
  정확히 2줄, 전부 `anonymize_expired_deactivated_profiles` 안**:
  `handle = 'withdrawn-' || substr(id::text, 1, 8)`(결함 그 자체)와 `bio = null`
  (`profiles_bio_check`가 `bio IS NULL`을 명시 허용해 안전 — D-083 제약과 충돌하지
  않는다). 나머지 6개 함수(`disband_crew` 포함)는 `crews.name`·`crews.description`을
  전혀 건드리지 않았다(`disband_crew`는 `status`만 쓴다).

**결론(팀장 표현 그대로 채택)**: 이번 결함의 **폭발 반경은 이 함수 하나, 이 두 줄로
닫힌다** — "하나 찾았으니 더 있을 것"이라는 불안을 숫자로 닫아 뒀다. 다만 이건
**오늘 시점의 스냅샷**이다. §9.6이 진단한 재발 조건(새 CHECK를 추가하는 사람이 기존
함수의 그 컬럼 쓰기를 확인하지 않는 것) 자체는 이 전수 확인으로 사라지지 않는다 —
**이번 결함의 진짜 교훈은 "하이픈을 밑줄로 바꾼다"가 아니라 "제약을 추가할 때 그
컬럼의 기존 쓰기 경로를 전수 확인하는 절차가 없다"는 것**이고, 그 절차 부재는 다음에
`profiles`나 `crews`(또는 다른 테이블)에 새 CHECK를 추가하는 순간 그대로 재발할 수
있다. §9.6에서 `docs/ISSUES.draft.CREW.md`에 이미 등재해 둔 "마이그레이션 체크리스트"
후속 제안이 바로 이 재발 조건을 겨눈다.

### 9.7 권고 SQL(팀장 승인 후 적용 — 강화안, 9.4 설계 채택)

```sql
-- 수정: I-056/§8/§9 — anonymize_expired_deactivated_profiles가 하이픈 포함 handle을
-- 써서 D-083(profiles_handle_check, 하이픈 불허)과 충돌해 구조적으로 항상 실패하던
-- 결함을 고친다. 동시에(§9.4) 배치 단위 UPDATE를 행 단위 재시도 루프로 바꿔 handle
-- 유일성 충돌(우연이든 §9.5의 스쿼팅이든) 한 건이 배치 전체를 막지 못하게 한다.
create or replace function public.anonymize_expired_deactivated_profiles(
  batch_size integer default 500,
  max_duration interval default '00:07:00'::interval
)
 returns bigint
 language plpgsql
 set search_path to ''
as $function$
declare
  started_at timestamptz := clock_timestamp();
  total_affected bigint := 0;
  batch_ids uuid[];
  v_id uuid;
  v_handle text;
  v_success boolean;
  v_attempt integer;
begin
  set local statement_timeout = '1min';

  loop
    select array_agg(id) into batch_ids
    from (
      select id
      from public.profiles
      where status = 'deactivated'
        and deactivated_at is not null
        and deactivated_at <= now() - interval '30 days'
      order by deactivated_at
      limit batch_size
    ) as expired;

    exit when batch_ids is null or array_length(batch_ids, 1) is null;

    foreach v_id in array batch_ids loop
      v_success := false;
      for v_attempt in 1..5 loop
        -- 1차 시도는 id 기반(결정적, 읽기 쉬움) — 20자 상한을 정확히 채워 엔트로피를
        -- 최대화한다(§9.3, 8→10 hex). 충돌 시 재시도부터는 id와 무관한 완전 무작위
        -- 접미사를 쓴다 — id 기반 값을 그대로 재시도하면 같은 충돌이 항상 재발한다.
        v_handle := case
          when v_attempt = 1 then 'withdrawn_' || substr(replace(v_id::text, '-', ''), 1, 10)
          else 'withdrawn_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
        end;
        begin
          update public.profiles
          set
            display_name = '탈퇴한 사용자',
            handle = v_handle,
            avatar_url = null,
            bio = null,
            search_opt_out = true,
            status = 'withdrawn',
            anonymized_at = now()
          where id = v_id;
          v_success := true;
          exit;
        exception when unique_violation then
          -- 충돌한 행만 재시도. 같은 배치의 다른 행은 영향받지 않는다(§9.4).
        end;
      end loop;

      if v_success then
        total_affected := total_affected + 1;
        update auth.users
        set
          email = 'withdrawn+' || v_id::text || '@anonymized.invalid',
          raw_user_meta_data = '{}'::jsonb,
          banned_until = 'infinity'::timestamptz
        where id = v_id;
      else
        -- 5회 재시도(≈40비트 난수 5회 독립 시도, 사실상 불가능한 수준의 연속 충돌)를
        -- 모두 소진한 경우만 이 행을 건너뛴다 — deactivated 상태가 유지되므로 다음날
        -- 배치가 그대로 다시 시도한다(§4.1의 멱등 재시도 원칙 유지).
        raise warning 'anonymize_expired_deactivated_profiles: handle collision retries exhausted for id=%', v_id;
      end if;
    end loop;

    exit when clock_timestamp() - started_at > max_duration;
  end loop;

  return total_affected;
end;
$function$;
```

**대안(단순안, 강화 없이 최소 변경만 원하면)**: 위 함수 본문 대신 원본 구조를 유지하고
`handle = 'withdrawn-' || substr(id::text, 1, 8)` 한 줄만 `handle = 'withdrawn_' ||
substr(replace(id::text,'-',''), 1, 10)`로 바꾸는 안(9.3에서 실증 완료)도 있다 —
**구조적 충돌 취약성(9.4)은 그대로 남지만, 변경 범위가 한 줄뿐이라 리뷰·검증이 더
쉽다.** 이번 프로젝트 규모(합성 실측 기준 21개 프로필, 실사용자 극소수)를 고려하면
"P0(항상 실패)만 급하게 고치고 P2(저확률 충돌)는 별도 판단"으로 나누는 것도 합리적인
선택이다 — **최종 채택은 팀장 판단**으로 남긴다.

### 9.8 미검증 잔여

- **강화안(9.7)의 실제 배치 처리 시간**(500행 기준)은 측정하지 않았다 — 합성 데이터
  2건으로만 검증했다. `statement_timeout='1min'` 안에 들어오는지는 실사용 규모에서
  다시 확인이 필요하다.
- **`RAISE WARNING`이 실제로 어디에 남는지**(`get_logs(service: "postgres")`로 보이는지)
  는 확인하지 않았다 — §4.2가 지적한 "관측 가능하지만 아무도 안 본다" 문제를 이 경고
  하나로는 해결하지 못한다(§5 안 A의 관측 패널과 함께 가야 의미가 있다).
- **적용 절차(I-051 표준)는 아직 실행하지 않았다** — 팀장 승인 후 `apply_migration` →
  `schema_migrations.statements`에서 원문 추출 → 원격 `version` 접두 로컬 파일 생성
  순서를 그대로 따를 것이다.
- **9.5에서 권고한 `withdrawn_` 접두어 예약(TS 레이어)은 설계만 하고 코드를 만들지
  않았다** — 팀장이 필요하다고 판단하면 별도 작업으로 분리한다.

### 9.9 채택 판단·적용 결과(36일차, 팀장 승인)

**채택: §9.3+§9.4 = 최소 변경(하이픈→밑줄) + 엔트로피 확장(10 hex, 20자 상한).
§9.7의 행 단위 재시도 강화안은 이번 회차에 적용하지 않는다.**

**왜 강화안을 지금 넣지 않는가(팀장 판단, 그대로 기록)**: §8에서 BOARD가 `begin…
rollback` 안에서 `auth.users` UPDATE에 강제 실패를 주입해 **"배치 루프 전체가 단일
암묵 트랜잭션이라 실패 시 같은 배치의 `profiles` UPDATE도 함께 롤백된다"**는 원자성을
실증했다 — 이 성질이 "실패해도 데이터가 반쯤 파기된 채로 남지 않는다"는 이 잡의
안전성을 지탱하는 유일한 근거다. §9.7의 행 단위 `EXCEPTION` 블록은 반복마다 서브
트랜잭션(savepoint)을 만들어 **바로 그 성질을 바꾼다** — 이번 회차에 실증된 보장을,
이번 회차에 실증되지 않은 재구조화로 맞바꾸는 셈이 된다. **확정적으로 100% 실패하던
것을 고치는 변경과, 저확률 사고(§9.4 충돌·§9.5 스쿼팅)에 대비하는 재구조화를 한 번에
넣지 않는다** — 오늘의 목표는 "29일차부터 100% 실패하던 경로를 성공하게 만드는 것"
하나로 좁힌다. §9.7의 강화안 설계·재실증 결과는 그대로 문서에 남겨 다음 회차가
원자성 트레이드오프까지 따져 별도로 판단할 수 있게 한다. 스쿼팅(§9.5)은 별개 이슈로
분리해 `docs/ISSUES.draft.CREW.md`에 등재했다(재시도 강화안·`HANDLE_PATTERN` 예약
두 후속 선택지 명시).

**적용**: `mcp__supabase__apply_migration`으로 §9.3+§9.4(엔트로피 확장) 버전의
`CREATE OR REPLACE FUNCTION` 전문을 적용했다 — **`pg_get_functiondef`로 배포된 원
정의를 먼저 꺼내 그 위에서 `handle` 대입 줄만 바꿨다**(기억으로 재작성하지 않음).
`handle` 대입 줄 바로 위에 D-083 제약과의 관계를 설명하는 주석(이 컬럼에 새 CHECK를
추가하기 전에 먼저 확인할 것, 이 문서·draft 이슈 참조)을 추가했다.

| 항목 | 값 |
| --- | --- |
| 적용된 migration version | `20260731034803` |
| 로컬 파일 | `supabase/migrations/20260731034803_fix_anonymize_expired_deactivated_profiles_handle_083_conflict.sql` |
| 바이트 일치 | 로컬 `wc -c` = 2260, 원격 `octet_length(schema_migrations.statements[1])` = 2260 — **일치** |
| `get_advisors(security)` 적용 후 | WARN 1건(`auth_leaked_password_protection`, 기존부터 있던 무관 항목) — **신규 WARN 0건** |

**회귀 실증**(팀장 지시대로 "함수를 재정의해 시험"이 아니라 **배포된 함수를 그대로
호출**, `begin…rollback`):

```sql
begin;
insert into auth.users (id, email, raw_user_meta_data, banned_until)
values ('22222222-2222-4222-8222-222222222201', 'i063-postfix-regress@example.invalid', '{"note":"pre-purge"}'::jsonb, null);
insert into public.profiles (id, handle, display_name, status, deactivated_at, bio, avatar_url)
values ('22222222-2222-4222-8222-222222222201', 'crewpostfixreg01', '픽스 후 회귀 테스트', 'deactivated', now() - interval '31 days', '파기 전 자기소개', 'https://example.invalid/avatar.png');
select public.anonymize_expired_deactivated_profiles();
select p.*, u.email, u.raw_user_meta_data, u.banned_until from public.profiles p join auth.users u on u.id = p.id where p.id = '22222222-2222-4222-8222-222222222201';
rollback;
```

**결과 — 전부 기대 일치**:

| 컬럼 | 결과 |
| --- | --- |
| `profiles.handle` | `withdrawn_2222222222`(20자, `profiles_handle_check` 통과) |
| `profiles.display_name` | `탈퇴한 사용자` |
| `profiles.status` | `withdrawn` |
| `profiles.avatar_url`/`bio` | `null`/`null` |
| `profiles.search_opt_out` | `true` |
| `profiles.anonymized_at` | not null(파기 시각 기록됨) |
| `auth.users.email` | `withdrawn+22222222-2222-4222-8222-222222222201@anonymized.invalid` |
| `auth.users.raw_user_meta_data` | `{}` |
| `auth.users.banned_until` | `infinity` |

**29일차부터 100% 실패하던 경로가 이제 배포된 함수를 그대로 호출해도 성공한다.**
`rollback`으로 종료, 잔류 행 0건(`profiles`·`auth.users` 둘 다) 확인.

**미검증(이번 적용에서 새로 남은 것)**: 강화안(§9.7)은 팀장 판단에 따라 이번 회차
미적용 상태로 남는다 — 원자성 트레이드오프까지 함께 검토하는 것이 다음 회차 몫이다.
