# `crews_update_staff_or_owner` archived 방어 defense-in-depth 조사 (35일차, CREW)

**대상**: I-066 잔여 범위 — `docs/design/unexplored-followups-index/README.md` §2 랭킹 1위·§4.2.
19·20·31일차 세 번 이월된 질문("`crews_update_staff_or_owner`(RLS, "누가" 고칠 수 있는지)가
archived 방어를 RLS 레이어에도 이중으로 갖고 있는가")을 34일차 CREW가 `invitations`에서 확정한
방법(I-159, `docs/design/invitation-defense-symmetry-34/README.md`, D-098)으로 마저 닫는다.

**팀장 사전 판단(34일차)을 그대로 따른다** — 처음 할 일은 "RLS를 이중화할지"가 아니라 **"트리거가
archived에서 전부 막으면 안 되는 정당한 UPDATE가 있는지"**부터다. 아래 §1이 그 확인이고, §2가
실측, §3이 I-159 대비 동일·차이점, §4가 처분이다.

---

## 0. 대상 정리 — 지금 상태(코드·실 DB 대조 일치)

- **`crews_update_staff_or_owner`**(RLS, UPDATE) — `qual`·`with_check` 둘 다 "임원 이상의 active
  멤버십"만 확인한다. `crews.status`(archived 여부)는 어디에도 없다(마이그레이션
  `20260725004000_rls_crew_and_membership_policies.sql` + 실 DB `pg_policies` 재조회로 대조,
  아래 §2 STEP B가 이를 행동으로도 재확인).
- **`crews_guard_archived_immutable`**(트리거, 20일차 CORE, I-066 잔여분 해소) — `old.status =
  'archived'`면 **어떤 UPDATE도 무조건 거부**한다. `pg_trigger_depth()` 조건이 전혀 없다 — 즉
  nested 호출이든 직접 호출이든, SECURITY DEFINER를 거치든 상관없이 모든 UPDATE 실행 경로에
  무조건 발동한다(마이그레이션 `20260725114415_crews_guard_archived_immutable_i066.sql` + 실 DB
  `pg_get_functiondef` 대조 일치, 20260730085802 이후 이 함수를 재정의하는 마이그레이션 없음을
  `ls supabase/migrations`로 재확인).
- **`crews_guard_owner_only_fields`**(트리거, 029A + Task 040 확장) — `visibility`·`status`·
  `owner_id` 변경을 오너 전용으로 좁히고, 오너 이양 대상이 active 멤버여야 함(FR-025 E1)을
  강제한다. archived 여부와는 무관한 별개 축이라 이 조사 범위 밖이다.

---

## 1. STEP 1 — archived에서 막히면 안 되는 정당한 UPDATE가 있는가

**결론: 없다.** 아래 두 갈래로 확인했다.

### 1.1 `crews` 테이블 자체에 "archived 이후에도 써야 하는" 컬럼이 있는가

`crews` 테이블 스키마(`20260724234205_create_crew_membership_invitation_tables.sql`):

```sql
create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null,
  visibility text not null check (visibility in ('public', 'private')),
  color_key smallint not null check (color_key between 0 and 11),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
```

- **소프트삭제·감사 컬럼이 이 테이블 자체에 없다** — `deleted_at`·`archived_at`·`archived_by`
  같은, "archived가 된 뒤에도 시스템이 채워야 하는" 필드가 애초에 존재하지 않는다. 감사는
  별도 `audit_logs` 테이블(다른 테이블, `crews` UPDATE가 아니다)이 담당한다.
- **`status` CHECK 제약이 `active`·`archived` 2값뿐이다** — `profiles`(D-044, `deactivated`
  30일 유예 → `withdrawn`처럼 상태가 여러 개이고 복구 경로가 있는 경우)와 달리, **crews에는
  archived에서 되돌아가는 제3의 상태나 unarchive/복구 전이가 정의돼 있지 않다.** FR-013 원문
  (`docs/requirements/requirements.md` 518~528행)도 "해산 → archived 전이"만 규정하고 복구
  흐름이 없다. 저장소 전체에서 `unarchive`·"크루 복구"·"크루 되살" 류 표현을 grep해도(코드·
  마이그레이션·`docs/decisions/*.md`) 0건이다.

### 1.2 `crews` 테이블을 UPDATE하는 코드 경로 전수 대조

`update public.crews`(마이그레이션 전수) + `.from("crews").update(`(앱 코드 전수)를 모두
grep해 대조했다 — 정확히 4개 경로뿐이다.

| # | 경로 | archived 크루에서 성공해야 하는가 | 근거 |
| --- | --- | --- | --- |
| 1 | `updateCrewInfo`(`src/lib/data/supabase/crew.ts:315`) — 이름·소개·카테고리·색 | **아니오** | FR-011은 "크루 정보 수정"이고 해산된 크루의 정보를 계속 고칠 이유가 없다. I-070(20일차)이 이미 `err("forbidden")`로 도메인 오류 처리까지 맞춰 놓았다 |
| 2 | `updateCrewVisibility`(`crew.ts:350`) — 공개 범위 | **아니오** | FR-012, 오너 전용. 해산된 크루의 공개 범위를 바꿀 이유가 없다. I-070이 같은 방식으로 처리 |
| 3 | `transferCrewOwnership`(`crew.ts:410`) — `owner_id` | **아니오** | FR-025, 오너 이양은 크루가 살아 있을 때의 행위다. 해산된 크루에 새 오너를 앉힐 시나리오가 없다 |
| 4 | `private.disband_crew`(RPC 내부, `update public.crews set status='archived'`) | **해당 없음(트리거에 도달조차 안 함)** | 함수 본문이 `v_status <> 'active'`면 `already_disbanded`로 조기 반환한다(위 UPDATE 이전) — 이미 archived인 크루에 대해 이 UPDATE 문 자체가 실행되지 않는다. `old.status='archived'`인 행에 이 코드가 도달하는 경로가 없다 |

**결론**: 4개 경로 전부 "archived에서 막혀야 정상"이거나 "애초에 archived 행에 도달하지 않는다"다.
**archived 크루에 대해 성공해야 하는 정당한 UPDATE는 0건이다.**

이 결과 자체가 이미 팀장이 예고한 분기를 완성한다 — "그런 예외가 없으면 I-159와 동일 논리로
'이중화 불필요'가 빠르게 확정된다."

---

## 2. STEP 2 — 그래도 실측으로 "단일 지점 의존"을 확정한다

STEP 1에서 정당한 예외가 없다고 결론 내렸지만, 그것과 "RLS가 실제로 archived를 방어하는가"는
별개 질문이다(RLS가 이미 막고 있다면 트리거는 그저 이중 방어일 뿐이고, 이중화 여부를 논할
필요가 없다). `begin...rollback` + `set local role authenticated` + 실제 계정
(`0625chopin@gmail.com`, `fb70ff1c-3736-44ee-a4a3-96993a3c62ed`)의 JWT claims로 실측했다(32일차
교훈 2 — 서비스롤 금지, 34일차 교훈 — `reset role` 직후 `request.jwt.claims`를 매번 명시적으로
비웠다).

### 방법

1. 브랜드뉴 UUID로 합성 크루를 만들고 이 계정을 오너로 지정(status=`active`) — 기존 데이터
   오염 경로가 원천적으로 없다.
2. 사전 상태를 별도 질의로 증명(오너 멤버십 `role=owner, status=active` 확인 — `crews_update_
   staff_or_owner`의 USING/WITH CHECK를 통과할 조건을 갖췄음을 먼저 확인, 32일차 교훈 3).
3. 같은 오너로 크루를 `active → archived`로 전환(old.status가 아직 active라 두 트리거 모두
   통과 — 정상 동작).
4. **STEP A**: 같은 오너가 이미 archived인 크루의 무해한 필드(`color_key`)를 고치려 시도.
5. 트리거를 **트랜잭션 안에서만** `alter table ... disable trigger`로 끄고(커밋 전까지만
   존재, D-098에서 DESIGN이 `expired` 구멍을 검증할 때 쓴 것과 같은 기법), **STEP B**: 같은
   오너가 같은 편집을 다시 시도 — 이번엔 트리거가 없으므로 RLS만 남는다.
6. 트리거를 다시 켜고 `rollback`.

### 결과

| step | 결과 |
| --- | --- |
| `pre_state` | `crew_status="active"`, `owner_membership={"role":"owner","status":"active"}` |
| `after_archive_transition` | `status="archived"` (정상 전이, 두 트리거 모두 미발동 — old.status='active') |
| `step_A_owner_edit_archived`(트리거 켜짐) | **차단** — `sqlstate=P0001`, `message="archived crews cannot be modified (FR-013, I-066)"` |
| `post_stepA_state` | `color_key=5`(변경 없음 — 차단이 진짜였음을 재확인, 조용한 0행이 아니라 예외로 확인됨) |
| `step_B_rls_only_trigger_disabled`(트리거 꺼짐, RLS만) | **성공** — `outcome="succeeded_at_rls_layer"` |
| `post_stepB_state` | `color_key=9`(실제로 값이 바뀜 — RLS 혼자서는 archived를 전혀 막지 못함을 값 변화로 확정) |

트랜잭션 종료 후 별도 질의로 오염 0건 확인: `leftover_crew_rows=0`,
`archived_trigger_enabled_flag='O'`(트리거 정상 상태로 복귀, `rollback`이 `disable trigger`도
함께 원복했음을 재확인).

**결론**: `crews_update_staff_or_owner`는 archived 여부를 전혀 보지 않는다 — archived 크루에
대한 UPDATE 차단은 **`crews_guard_archived_immutable` 트리거 단일 지점에만 의존**한다.
I-159가 `invitations`에서 확정한 것과 정확히 같은 모양의 "단일 지점 의존"이 `crews`에도
실재한다.

---

## 3. I-159 대비 동일점·차이점

**동일점**:
- 둘 다 "RLS엔 없고 트리거에만 있다"는 단일 지점 의존이 실측으로 확정됐다.

**차이점(팀장이 명시적으로 물은 지점)**:

1. **crews는 archived가 되돌려지지 않는다 — invitations보다 예외가 구조적으로 더 적다.**
   `invitations`는 `pending → accepted/declined/expired` 4개 상태를 오가고, "거절(declined)은
   archived에서도 허용한다"는 **실제로 지켜야 하는 예외**가 있었다 — 그래서 나이브 이중화가
   그 예외를 깨뜨리는 **진짜 결함**을 만들었다(STEP B, D-098). `crews`는 `active`·`archived`
   2상태뿐이고 archived에서 벗어나는 전이 자체가 없다(§1.1) — **살아남아야 하는 예외가
   원천적으로 없다.**
2. **트리거 자체도 invitations/join_requests 계열보다 이미 더 견고하다.**
   `docs/design/rls-regression-checklist-33/README.md` §5의 33일차 전수조사(표 #3)가 이미
   확인해 둔 사실: `crews_guard_archived_immutable`은 `pg_trigger_depth()` 조건이 **전혀
   없다** — nested 우회 시나리오 자체가 crews에는 존재하지 않는다.
3. 아래 §4가 이 두 차이점을 근거로 **처음의 "이중화 전면 불필요" 결론을 정정한다** — 35일차
   재검토(BOARD 지적 + 팀장 반론) 참고.

---

## 4. 처분 — 35일차 재검토로 정정됨(초판 결론 오류, 아래에서 경위를 그대로 남긴다)

### 4.0 초판의 오류 — "이득을 관측할 방법이 없다"는 틀렸다

초판(이 문서의 최초본)은 "이중화해도 그 RLS 조건이 잡아내는 순간을 관측할 방법이 없다(트리거가
항상 먼저 막는다)"고 썼다. **BOARD의 교차검증(35일차)이 이를 반박**했고, 팀장이 반론 논거를
제시하며 실측을 요구했다 — 그 논거를 그대로 옮기지 않고 직접 실측으로 검증했다.

**PostgreSQL RLS 실행 순서 실측 확정**: `USING`은 UPDATE 대상 행을 고르는 스캔 단계에서
적용되고, `BEFORE UPDATE` 트리거는 그 스캔에서 **선택된** 행에 대해서만 실행된다. 즉
`USING`이 행을 걸러내면 트리거는 **아예 발동하지 않는다.**

```sql
-- 나이브 이중화(USING·WITH CHECK 양쪽에 is_crew_active(id) 추가), 트리거는 그대로 켠 채:
update public.crews set color_key = 8 where id = '<archived 크루>';
-- 결과: 예외 없음, rows_affected = 0 (조용한 0행 — I-159 STEP B와 정확히 같은 패턴)
```

실측(트랜잭션 안, `rollback`)으로 확정: 나이브 전면 이중화(USING+WITH CHECK 양쪽에
`private.is_crew_active(id)`)를 넣으면 archived 크루 UPDATE는 **RLS 단계에서 0행 처리되고
트리거는 발동조차 하지 않는다.** 현재는 이 시도가 `P0001`(`"archived crews cannot be modified
(FR-013, I-066)"`)로 명확히 실패하는데, 나이브 이중화 후에는 **조용한 0행**으로 바뀐다.

**앱 계층 영향(코드 대조, 실측 아님)**: `updateCrewInfo`(`crew.ts:315`)는
`.update(...).select("*").maybeSingle()` 뒤 `if (error) return err("forbidden", …)` →
`if (!data) return err("not_found", …)` 순서다. RLS가 조용히 0행을 만들면 `error`는 없고
`data`도 없어 **`err("not_found", …)`로 떨어진다** — 크루가 존재하는데 "찾을 수 없다"는
잘못된 도메인 오류로 바뀐다. `updateCrewVisibility`도 동일 패턴이다. (`transferCrewOwnership`을
부르는 `transfer-crew-ownership.ts:67-69`는 `crew.status !== "active"`를 **호출 전에 앱
레이어에서 먼저 걸러 `errors.crewArchived`로 안내**하므로 이 특정 경로는 정상 UI 흐름에서
SQL 계층까지 도달하지 않는다 — 다만 REST 직접 PATCH 같은 앱 우회 경로에는 여전히 적용된다.)

**결론**: 초판의 "이득 관측 불가"는 틀렸다 — 이중화의 효과는 **지금 당장, 트리거 회귀와
무관하게** 관측된다(에러 코드가 `forbidden`에서 `not_found`로 바뀐다). 이건 "이득이 조건부"가
아니라 **비용이 조건부가 아니라 상시**라는 뜻이었다. BOARD·팀장의 지적이 옳다.

### 4.1 그런데 나이브 이중화만 시도한 것이 실수였다 — WITH CHECK 전용 이중화는 비용이 0이다

I-159가 이미 "나이브 vs 좁은 대안"을 구분해 뒀는데, 초판은 crews에 "예외가 없다"는 이유로
그 구분을 건너뛰고 나이브 전면 이중화(USING+WITH CHECK)만 검토했다 — **이게 이번 재검토에서
드러난 진짜 실수다.** `WITH CHECK`만 추가하고 `USING`은 원본 그대로 두는 안을 마저 실측했다.

**PostgreSQL 실행 순서 재확인**: `WITH CHECK`은 `USING`을 통과해 스캔된 행이 `BEFORE UPDATE`
트리거를 거친 **뒤**, 최종 NEW 값에 대해 평가된다. `USING`을 건드리지 않으면 archived 크루도
여전히 스캔되므로 트리거가 여전히 먼저 실행된다 — `WITH CHECK`은 트리거가 **없을 때만** 뒤를
받친다.

**실측 3건(전부 `begin...rollback`, 트랜잭션 밖 흔적 0건 재확인)**:

| 시나리오 | 정책 상태 | 트리거 상태 | 결과 |
| --- | --- | --- | --- |
| ① 오늘과 동일(대조군) | 원본 | 켜짐 | `P0001`, `"archived crews cannot be modified (FR-013, I-066)"` |
| ② WITH CHECK 전용 이중화, archived 크루 편집 | `with check`에만 `is_crew_active(id)` 추가 | 켜짐 | **`P0001`, 대조군과 완전히 동일** — 트리거가 여전히 먼저 발동, RLS는 도달조차 안 함(비용 0) |
| ③ WITH CHECK 전용 이중화, **트리거를 회귀 시뮬레이션으로 끈 채** 같은 편집 | `with check`에만 `is_crew_active(id)` 추가 | **꺼짐**(`alter table ... disable trigger`, 트랜잭션 안에서만) | **`42501`, `"new row violates row-level security policy for table \"crews\""`** — RLS가 즉시 받쳐 쓰기를 막는다. 조용한 0행도, 조용한 성공도 아니다 |
| ④ WITH CHECK 전용 이중화, **활성(active) 크루** 편집(회귀 없음 확인) | `with check`에만 `is_crew_active(id)` 추가 | 켜짐 | **성공**(`rows_affected=1`, `color_key`가 실제로 바뀜) — 정상 경로에 회귀 없음 |

세 트랜잭션 모두 종료 후 재확인: 스크래치 크루 3건(`222…602`·`333…703`·`444…804`) 잔존 0건,
`crews_update_staff_or_owner`의 `qual`/`with_check`가 원본과 바이트 단위로 일치, 트리거
`tgenabled='O'`로 복귀.

**해석**:
- **오늘 이 순간의 비용은 0이다.** ②가 ①과 완전히 동일한 결과(`P0001`)를 냈다 — WITH CHECK
  전용 이중화는 트리거가 살아있는 한 아무 것도 바꾸지 않는다. 나이브 전면 이중화가 냈던
  "`forbidden`→`not_found` 열화"가 **여기선 발생하지 않는다.**
- **트리거 회귀 시의 이득은 진짜이고, 관측 가능하다.** ③이 그 증거다 — 트리거가 사라져도
  RLS가 자동으로, 실시간으로 받쳐 **`42501`이라는 명시적 예외**로 쓰기를 막는다. 조용한
  0행(§4.0의 나이브 안 문제)도, 조용한 성공(현재 무방어 상태의 문제)도 아니다.
- **BOARD가 지적한 "무방비 창"이 이 안으로는 사라진다.** 지금(트리거 단일 방어) 상태에서
  트리거가 회귀하면, 다음에 누군가 `docs/design/rls-regression-checklist-33/README.md` §7을
  수동으로 돌릴 때까지 archived 크루가 **실제로 조용히 수정될 수 있는 창**이 있다(사람이
  기억해야 발동하는 방어, R-002 CI 부재의 연장). WITH CHECK 전용 이중화는 이 창을 **즉시,
  자동으로** 닫는다 — 사람이 체크리스트를 돌릴 필요 없이 다음 UPDATE 시도 자체가 실패한다.

### 4.2 처분 (35일차 재확정)

- **나이브 전면 이중화(USING+WITH CHECK 양쪽)는 기각을 유지한다** — 비용이 상시 발생한다
  (`forbidden`→`not_found` 열화, §4.0).
- **WITH CHECK 전용 좁은 이중화(`crews_update_staff_or_owner`의 `with check`에만
  `private.is_crew_active(id)` 추가)를 채택 제안한다** — 오늘 비용 0(§4.1 ②), 트리거 회귀
  시 즉시·자동 방어(§4.1 ③), 정상 경로 회귀 없음(§4.1 ④)을 전부 실측으로 확인했다.
- `docs/design/rls-regression-checklist-33/README.md` §7(트리거 자체의 회귀 감지)은 **그대로
  유지한다** — WITH CHECK 이중화가 적용돼도 "트리거 정의가 조용히 바뀌었는가"를 사람이
  가끔 확인하는 가치는 남는다(RLS와 트리거가 **둘 다** 동시에 잘못 편집되는 이중 회귀까지
  막지는 못하므로).
- 정본 결정문은 `docs/DECISIONS.draft.CREW.md`(번호 없음, D-082 규약)에 재작성했다.

### 4.3 적용(35일차, 팀장 조건부 승인 후)

**조건 1 — BOARD 독립 교차검증**: BOARD가 이 문서의 스크립트를 재사용하지 않고 다른
프로필(`30f44dd9`)·다른 스크래치 UUID·별도 로그 테이블로 세 시나리오를 처음부터 새로 짜서
재현했다 — 결과 전부 일치(트리거 켠 채+이중화=`P0001`/트리거 disable+이중화=`42501`/활성
크루=성공). 추가로 카탈로그 대조: `crews_insert_self_owner`(INSERT, `polcmd='a'`)는
`crews_update_staff_or_owner`(UPDATE, `polcmd='w'`)와 물리적으로 분리된 별개 정책 객체라
이번 수정이 INSERT에 영향 없음, WITH CHECK은 BEFORE ROW 트리거가 전부 끝난 뒤 최종 NEW 값에
정확히 한 번만 평가됨(재귀 평가 경로 없음)을 확정 — **4/4 pass.**

**조건 2 — 마이그레이션 무결성 감사**: 적용 후 `python3 docs/design/migration-integrity-
audit-35/audit_compare.py`를 재실행 — 로컬 134건·원격 134건 일치, 불일치 20건은
`docs/design/migration-integrity-audit-35/README.md` §3 표와 정확히 동일한 20개 버전(신규
불일치 0건). 새 마이그레이션 `20260731025523`은 불일치 목록에 없다(로컬↔원격 완전 일치).

**조건 3 — 적용 후 회귀 3종(전부 `begin...rollback` 실측)**:

| # | 확인 | 결과 |
| --- | --- | --- |
| ① | archived 크루 편집 시도(오너 세션) | `sqlstate=P0001`, `"archived crews cannot be modified (FR-013, I-066)"` — 그대로, `42501` 아님 |
| ② | 활성 크루 편집(오너 세션) | 성공, `rows_affected=1` |
| ③ | `updateCrewInfo`가 여전히 `forbidden`을 반환하는가 | ①이 SQL 예외이므로 `if (error) return err("forbidden", ...)` 분기를 그대로 탄다 — `not_found`로 바뀌지 않았다(코드 대조 + ①의 실제 예외 발생 확인) |

`get_advisors(security)` 신규 WARN 0건(`auth_leaked_password_protection` 기존 항목 1건만
남음). 적용된 마이그레이션 파일(`supabase/migrations/20260731025523_crews_update_staff_or_
owner_archived_with_check_backstop_i066.sql`)은 이후 사후 편집하지 않는다(I-167).

- `docs/design/unexplored-followups-index/README.md`(§1·§2·§4.1·§4.2)·`docs/ISSUES.md`
  I-066·`docs/prioritization-and-risks.md` D-098(근거 3 정정)를 전부 "적용 완료"로 최종
  반영했다.
