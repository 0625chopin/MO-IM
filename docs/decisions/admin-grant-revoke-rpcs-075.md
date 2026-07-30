# 관리자 지정/회수 RPC (I-075, 27일차, CORE)

## 1. 배경

I-075(관리자 콘솔에 관리자 지정/회수 UI가 없음, 유일한 방법이 마이그레이션 직접
`UPDATE public.profiles set is_system_admin = ...`)의 데이터 레이어 전체를 담당했다.
선행 결정:

- **D-076**(26일차): 관리자가 다른 사람을 관리자로 지정·회수할 수 있되, **자기 자신은
  대상이 될 수 없다.** "관리자가 0명이 되는 것을 막을지"는 구현 시점 판단으로 명시적으로
  미뤘다.
- **D-078**(27일차, 이번 회차 시작 시 사용자 결정): **회수 결과 관리자가 0명이 되는 경로를
  DB에서 막는다 — 최소 1명 보장.** D-076의 미결을 이것으로 닫았다.

## 2. 함수 시그니처 (DESIGN 인계 — UI가 그대로 소비)

`supabase/migrations/20260730090000_admin_grant_revoke_system_admin_rpcs_075.sql`.
`admin_resolve_report`(042B)의 `is_system_admin` 자기 확인 패턴을 그대로 재사용했다 — 새
패턴을 발명하지 않았다. 029B 2단 구조(`private.*` SECURITY DEFINER 실제 로직 + `public.*`
SECURITY INVOKER 얇은 래퍼)를 따른다. **클라이언트(Server Action)는 `public.*`를 호출한다.**

```
public.admin_grant_system_admin(p_profile_id uuid)
  returns table(ok boolean, reason_code text)

public.admin_grant_system_admin_by_handle(p_handle text)
  returns table(ok boolean, reason_code text, profile_id uuid)

public.admin_revoke_system_admin(p_profile_id uuid)
  returns table(ok boolean, reason_code text)

public.admin_list_system_admins()
  returns table(profile_id uuid, handle text, display_name text, avatar_url text, status text)
```

TypeScript 쪽 대응(`src/lib/data/supabase/admin.ts`):

```ts
listSystemAdmins(): Promise<SystemAdminSummary[]>
grantSystemAdmin(profileId: Id): Promise<DataResult<{ profileId: Id }>>
grantSystemAdminByHandle(handle: string): Promise<DataResult<{ profileId: Id }>>
revokeSystemAdmin(profileId: Id): Promise<DataResult<{ profileId: Id }>>
```

`SystemAdminSummary`·`SystemAdminGrantReasonCode`·`SystemAdminRevokeReasonCode`는
`src/lib/types/moderation.types.ts`. Mock 구현은 만들지 않았다 — Task 032 이후 신설 도메인은
mock 대응물을 만들지 않는 전례(`report.ts`·`block.ts`·`admin.ts` 기존 docstring과 동일 판단).

### 2.1. `admin_grant_system_admin_by_handle` — handle로 지정 (27일차 후속, DESIGN 요청)

`/admin` 관리자 지정 UI는 핸들 검색으로 대상을 고른다(FR-006 크루 초대와 같은 UX). 그런데
`profile_search`는 NFR-013 3필드 계약상 `id`를 반환하지 않으므로, 검색 결과만으로는
`admin_grant_system_admin(uuid)`을 호출할 UUID를 얻을 수 없다.

**앱 레이어에서 "handle 해석(`getProfileByHandle`) → RPC 호출" 순서로 조립하지 않는다.**
그렇게 하면 인가(관리자 여부) 검사보다 존재 확인이 먼저 실행돼 R-012를 위반한다 — 비관리자가
`forbidden`을 받기 전에 "그 핸들의 사용자가 존재하는가"를 알아낼 수 있다. I-074가 이 순서
실수로 두 번 실제로 뚫렸던 자리이고("문서 규약은 컴파일러가 강제하지 않는다"는 결론), ESLint
허용 목록에 세 번째 예외를 추가하면 규칙의 억지력이 더 약해진다 — 그래서 handle 해석을
**DB 함수 내부**로 옮겼다. `private.admin_grant_system_admin_by_handle`는:

1. 권한 검사(`is_system_admin`)를 **먼저** 실행한다 — 비관리자는 이 지점에서 `forbidden`만
   받고, handle 조회는 실행조차 되지 않는다.
2. 그다음에만 `handle = p_handle` 정확 일치로 대상을 조회한다(D-005와 같은 원칙, `search_
   opt_out`은 검사하지 않는다 — "검색 결과 노출"이 아니라 이미 알고 있는 handle의 직접
   해석이라 `profile_search`가 아니라 `getProfileByHandle`(FR-020 초대 경로)과 같은
   성격이다). 없으면 `handle_not_found`.
3. 나머지 판정(자기 자신·비활성·이미 관리자)은 새로 짜지 않고 `private.admin_grant_system_
   admin(uuid)`에 위임한다 — 로직 중복 없음. 응답에 `profile_id`가 항상 함께 온다(handle이
   이미 이 시점에 실존이 확인됐으므로 성공·실패 무관하게 채워진다).

**reason_code 오라클 방지**: `handle_not_found`는 권한 검사를 통과한 뒤에만 나온다 —
비관리자는 어떤 handle을 넣어도 `forbidden`만 받는다(같은 값, handle 존재 여부와 무관).
관리자에게는 구분해 주는 것이 UX상 맞고, 이미 인가를 통과했으므로 열거 문제가 아니다.

`admin_grant_system_admin(uuid)`은 그대로 유지한다(대체하지 않음, 오버로드가 아니라 별도
함수명 — PostgREST 오버로드 해석 리스크를 피하려 했다). 이 uuid 버전을 내부적으로 재사용하고,
공개 표면으로도 계속 남아 있지만 `/admin` UI의 실제 소비자는 handle 버전이다.

## 3. 가드와 reason_code

공통 가드(둘 다): 호출자가 관리자가 아니면 `forbidden` / 대상 profile이 없으면
`target_not_found` / 대상 profile이 `active`가 아니면 `target_not_active`.

**`admin_grant_system_admin`** 고유:
- 대상이 호출자 자신이면 `cannot_target_self` (D-076) — 공통 가드보다 **먼저** 검사한다.
- 대상이 이미 관리자면 `already_admin`.

**`admin_revoke_system_admin`** 고유 — **가드 순서가 의도적이다**:
1. `forbidden`
2. 대상 조회(`for update`로 행 잠금) → `target_not_found` / `target_not_active`
3. 대상이 관리자가 아니면 `not_admin`
4. **`last_admin_forbidden`(D-078)** — 이 회수를 적용하면 남는 관리자 수(`is_system_admin
   = true and id <> 대상`)가 0인가
5. **`cannot_target_self`(D-076)** — 대상이 호출자 자신인가

last-admin 검사(4)를 self-target 검사(5)보다 먼저 두었다. 두 가드가 항상 같은 호출에서
함께 걸리는 것은 아니다 — 실 DB처럼 관리자가 1명뿐일 때 그 1명을 대상으로 삼는 모든 호출은
(자기 자신이 호출하든 아니든) `last_admin_forbidden`으로 먼저 걸린다. `cannot_target_self`는
관리자가 2명 이상이라 인원 수 가드를 통과했는데도 자기 자신을 대상으로 삼은 경우에만
나온다. 수학적으로 self-target 가드 하나만으로도 순차 호출에서 "관리자 수가 0이 되는 것"은
이미 불가능하다(호출자는 항상 자기 자신이 아닌 대상을 회수하므로 호출자 자신은 항상
관리자로 남는다) — last-admin 검사는 그 불변식이 깨지는 경우(동시 호출 레이스, 향후 다른
경로에서 `is_system_admin`이 바뀌는 경우)에 대비한 방어 종심이며, D-078을 SQL 문면에
명시적으로 남기기 위함이다.

## 4. UI가 사전 검증으로 막아야 하는 조건 (DESIGN 인계 — 핵심)

**RPC/트리거 예외 메시지를 파싱해 분기하지 마라.** 아래 두 조건은 `listSystemAdmins()`
결과만으로 호출 전에 판정할 수 있다:

- **자기 자신 대상**: `listSystemAdmins()`의 각 행 `profileId`를 세션 프로필 id와 비교해
  같으면 지정/회수 버튼 자체를 숨기거나 비활성화한다.
- **마지막 관리자**: `listSystemAdmins()`의 배열 길이가 1이면, 그 유일한 행의 회수 버튼을
  비활성화한다(어차피 그 행은 세션 본인일 가능성이 높지만, 다른 세션에서 지정한 두 번째
  관리자가 이 화면을 보는 경우도 대비해 "배열 길이==1"로 판단한다 — "이 행이 나인지"와는
  독립적인 조건이다).
- **비관리자 호출**: 이 RPC들은 `/admin` 진입 자체가 `checkPermission`(role: "system_admin")
  으로 막힌 뒤에만 도달하는 화면이라 정상 흐름에서 `forbidden`에 도달하지 않는다 — RPC 내부
  재확인은 방어선일 뿐이다(042B와 동일 원칙).

reason_code는 위 사전 검증이 새는 경우의 방어선 표현으로만 쓴다 — 정상 흐름에서 사용자가
보게 되는 1차 UX는 "버튼이 아예 없음/비활성"이어야 한다.

**지정(grant) 화면 전용 — handle 입력에는 위 사전 검증을 적용할 수 없다.** "자기 자신 대상"
사전 차단은 지금 화면에 있는 UUID(예: 목록의 행)에는 걸 수 있지만, 사용자가 **타이핑한
handle**이 자기 자신의 것인지는 제출 전에는 알 수 없다(그걸 알려면 handle→id를 먼저
해석해야 하는데, 그게 바로 이 설계가 피하려는 것이다 — §2.1). 그래서 지정 폼은 **제출 후**
`cannot_target_self`·`already_admin`·`handle_not_found`를 방어선 오류 문구로 그대로
보여주면 된다(§2.1의 오라클 방지 논증에 따라 이 시점엔 이미 인가를 통과했으므로 안전하다).
이것이 §4 서두의 "예외를 파싱해 분기하지 마라"의 유일한 의도적 예외다 — handle 입력 폼은
파싱이 아니라 `errors[reason_code]` 사전 조회로 처리한다(코드 자체가 반환값이라 파싱이
아니다).

## 5. 트리거 회귀 확인 — `profiles_guard_self_status_transition`

**가장 중요한 확인 항목**(26일차 `meetups_guard_attendee_scope`가 신규 마이그레이션을
막았던 것과 같은 실패 모드가 우려됐다). 이 트리거의 현재(20260725142305) 정의:

```sql
if auth.uid() = old.id then
  if new.is_system_admin is distinct from old.is_system_admin then
    raise exception '...';
  end if;
  ...
end if;
return new;
```

`auth.uid() = old.id`(호출자가 자기 자신의 행을 고치는 경우)일 때만 `is_system_admin` 변경을
막는다. 우리 RPC는 D-076 가드로 **호출자가 자기 자신을 대상으로 삼는 것을 이미 차단**하므로,
정상 경로에서 `old.id`(대상 profile)는 항상 `auth.uid()`(호출자)와 다르다 — 트리거의
`if` 조건 자체가 성립하지 않아 `UPDATE`가 그대로 통과한다. **정적 분석만으로 끝내지 않고
아래 §6 자기반증(S6·S10)에서 실제로 `UPDATE`가 성공하는 것으로 실측 확인했다** — 이
트리거가 우리 RPC의 `UPDATE`를 막지 않는다.

## 6. 자기반증 (`begin`…`rollback`, 커밋하지 않음)

`set local role authenticated; set local request.jwt.claim.sub = '<uuid>';`로 여러 프로필의
세션을 시뮬레이션했다(`docs/decisions/rls-policies-029a.md` §가 세운 기존 기법). 임시
`temp table test_log`에 각 단계 결과를 적재하고 마지막에 한 번에 조회 → `rollback`.

**실 DB 상태(적용 전 확인)**: 관리자 정확히 1명(`chopin_0625`, `fb70ff1c-3736-44ee-a4a3-
96993a3c62ed`). `list_tables`·`list_migrations`로 낯선 테이블 없음 확인(D-037 절차).

### 원시 출력 (전체, step 순)

| step | 시나리오 | ok | reason_code | note |
| --- | --- | --- | --- | --- |
| 0 | baseline_admin_count | – | – | `1` |
| 1 | S1_non_admin_grant (비관리자 호출) | false | `forbidden` | – |
| 1 | S1_non_admin_revoke (비관리자 호출) | false | `forbidden` | – |
| 2 | S2_self_grant (관리자가 자기 자신을 지정) | false | `cannot_target_self` | – |
| 3 | **S3_last_admin_self_revoke (유일한 관리자가 자기 자신을 회수)** | false | **`last_admin_forbidden`** | – |
| 4 | S4_grant_target_not_found | false | `target_not_found` | – |
| 4 | S4_revoke_target_not_found | false | `target_not_found` | – |
| 5 | S5_grant_target_not_active (대상 임시 suspended) | false | `target_not_active` | – |
| 6 | S6_grant_success (seed_owner04 지정) | **true** | – | – |
| 6 | S6_verify_target_flag(postgres, RLS 우회 재확인) | – | – | `true` |
| 6 | S6_verify_audit_log(postgres) | – | – | `1` (`admin.granted` 1건) |
| 7 | S7_already_admin (같은 대상 재지정) | false | `already_admin` | – |
| 8 | S8_new_admin_list_count (신규 관리자 세션으로 목록 조회) | – | – | `2` |
| 8 | S8_new_admin_list_reports_access (신규 관리자가 기존 admin_list_reports 호출) | – | – | `0`(정상 호출, reports 0행) |
| 9 | **S9_self_revoke_multi_admin (관리자 2명 상태에서 자기 자신 회수)** | false | **`cannot_target_self`** | – |
| 10 | S10_revoke_success (chopin_0625가 seed_owner04 회수) | **true** | – | – |
| 10 | S10_verify_target_flag(postgres) | – | – | `false` |
| 10 | S10_verify_audit_log(postgres) | – | – | `1` (`admin.revoked` 1건) |
| 10 | S10_admin_count_final(postgres) | – | – | `1` |
| 11 | S11_revoke_not_admin (이미 회수된 대상 재회수) | false | `not_admin` | – |
| 12 | S12_admin_resolve_report_regression (기존 RPC 회귀 확인, 존재하지 않는 신고) | false | `not_found` | – |

**S3 vs S9가 핵심 대조**다 — 관리자 1명뿐일 때의 자기 회수는 `last_admin_forbidden`(D-078
가드가 먼저 걸림), 관리자 2명일 때의 자기 회수는 `cannot_target_self`(D-076 가드, last-admin
검사는 통과)로 서로 다른 reason_code를 반환한다. 이는 §3의 가드 순서 설계가 의도한 그대로다.

### 롤백 후 잔존 확인

```sql
select
  (select count(*) from public.profiles where is_system_admin) as admin_count,        -- 1
  (select handle from public.profiles where is_system_admin) as sole_admin_handle,     -- chopin_0625
  (select status from public.profiles where id = 'b7470f13-...') as seed_outsider02_status, -- active
  (select count(*) from public.audit_logs where action like 'admin.%') as admin_audit_rows, -- 0
  (select count(*) from public.profiles) as total_profiles;                            -- 21
```

전부 마이그레이션 적용 전 실측값과 일치 — 자기반증 트랜잭션이 남긴 잔존물 0건.

`get_advisors(security)` 재확인: 신규 WARN 0건(기존 `auth_leaked_password_protection` 1건만
잔존, 이 작업과 무관 · 기존에도 있던 항목).

## 7. D-074/D-077 요건 — 명시적 REVOKE

이 마이그레이션 작성 시점에는 CREW의 I-134(D-077, BEFORE 가드 트리거 EXECUTE 관례)가 아직
확정 전이었다. `admin_resolve_report`와 동일한 관례(모든 신규 함수는 `public, anon,
authenticated`에서 전체 회수 후 `authenticated`에만 재부여, `anon`은 명시적으로도 재차
회수)를 그대로 따랐다 — 이후 확정된 D-077("모든 신규 함수는 예외 없이 명시적 REVOKE")과도
그대로 일치해 추가 조정이 필요 없었다.

## 8. 결정 번호 정정 메모

이 마이그레이션 작성 당시 "다음 결정 번호"를 D-077로 예상하고 SQL 주석·TS docstring에
그렇게 적었으나, 같은 회차에 CREW가 I-134 판정을 D-077로 먼저 등재했다. 이 결정(최소 1명
관리자 보장)은 **D-078**로 재등재했다 — SQL 주석·TS docstring·이 문서 전부 D-078로
정정했고, 이미 적용된 마이그레이션의 `comment on function` 저장값도 후속 마이그레이션
(`admin_grant_revoke_rpcs_075_fix_decision_number_refs`)으로 고쳤다(042B의
`admin_console_042b_fix_decision_number_refs`와 같은 선례).

**추가 발견**: 위 후속 마이그레이션은 `comment on function`(pg_description, 함수의 외부
설명)만 고쳤을 뿐, `admin_revoke_system_admin` 함수 **본문 내부**의 SQL 주석(`-- D-077(오늘)
— 이 회수를…`, `pg_proc.prosrc`에 그대로 저장됨)은 고치지 못했다는 것을 `select prosrc from
pg_proc where proname = 'admin_revoke_system_admin' and pronamespace =
'private'::regnamespace`로 실측 확인했다 — `comment on function`과 함수 본문은 서로 다른
카탈로그(`pg_description` vs `pg_proc.prosrc`)라 하나를 고쳐도 다른 하나는 그대로 남는다.
`admin_grant_revoke_rpcs_075_fix_inline_comment_decision_ref` 마이그레이션으로
`create or replace function`을 다시 실행해(로직 무변경, 주석 텍스트만 D-078로 교체) 바로잡고,
권한(REVOKE/GRANT)도 D-074/D-077 관례대로 같은 마이그레이션에서 재확인했다. 재실측:
`prosrc like '%D-078%'` → `true`, `like '%D-077%'` → `false`; 재생성 후에도 `EXECUTE`
그랜티는 `private.*`가 `authenticated`(+ `postgres`·`service_role`, 소유자/서비스 기본
권한), `public.*`가 `authenticated`만(`anon`·`PUBLIC` 없음)으로 불변임을 `information_schema.
role_routine_grants`로 재확인했다. 자기반증 3종(사전 회귀 확인용, `rollback`)도 재실행해
동일 결과를 얻었다: 유일한 관리자의 자기 회수 → `last_admin_forbidden`, seed_owner04 지정
→ `ok:true`, 그 회수 → `ok:true`, 최종 관리자 수 1 유지.

## 9. 남은 것 / 이월

- `/admin` 관리자 목록·지정 UI는 이번 회차 범위 밖(데이터 레이어만). §4의 사전 검증 조건을
  그대로 구현하면 된다.
- `strings` 모듈에 이 reason_code용 사용자向 문구가 아직 없다 — UI 작업 시 함께 추가한다
  (`strings.admin.reports.errors`와 같은 패턴 참고).
- CREW의 I-134(D-077)가 이 마이그레이션 이후 확정됐지만, 이미 D-074/D-077 요건을 충족하고
  있어 추가 마이그레이션이 필요 없었다(§7).
