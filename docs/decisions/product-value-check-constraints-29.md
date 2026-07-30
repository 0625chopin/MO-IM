# D-083 확정값을 DB CHECK 제약으로 굳힌 기록 (29일차, CREW)

## 배경

28일차 `docs/decisions/product-value-proposals-28.md`가 조사·제안하고 팀장이 승인한 D-083
확정값(`docs/ISSUES.md` I-033·I-034·I-038·I-039·I-041·I-043) 중 DB 저장 필드에 해당하는
4개 값 — 핸들 형식(3~20자·`/^[a-z][a-z0-9_]*$/`), bio 상한(150자), 크루명 상한(30자), 크루
소개 상한(300자) — 은 지금까지 **앱 레이어(`src/lib/rules/*.ts`)에만** 걸려 있고 DB CHECK
제약이 없었다. 이 문서는 그 값을 DB CHECK로 굳힌 작업의 실측 기록이다.

**새 값은 만들지 않았다** — 아래 4개 CHECK는 D-083이 확정한 값을 문자 그대로 옮긴 것이다.
새 결정·새 이슈 번호도 붙이지 않았다(D-082 회차 규칙).

## 0. 중요 발견 — "삭제하지 말 것" 메모와의 충돌, 그리고 판단 근거

선행조건 정리를 시작하기 전 삭제 대상 크루(`c4283f8a-139c-4c69-ac4e-3c92e355e3bc`) 행을
SELECT로 먼저 열람했는데, `description` 컬럼 값이 다음과 같았다:

> `"20일차 archived 크루 브라우저 실측 전용 — 삭제하지 말고 그대로 둘 것"`

이 문구는 팀장의 이번 지시(이 크루를 캐스케이드 삭제하라)와 정면으로 충돌한다. 그대로
진행하지 않고 먼저 조사했다:

- 이 메모는 **20일차** DESIGN이 I-069/I-070 조사용으로 이 크루를 만들면서 남긴 것이다
  (`docs/ISSUES.md`의 I-069/I-070 관련 절, `docs/decisions/domain-error-channel-069.md`).
  그 시점엔 "증거로 남겨둔 archived 행"이 조사 재현에 필요했다.
- 그러나 **28일차**(오늘과 같은 날짜대, D-083 확정 시점)에 이 정확한 크루 id가 "크루명 30자
  상한의 유일한 소급 위반 행"으로 다시 지목됐고, `product-value-proposals-28.md`·
  `docs/issue-triage-release-readiness.md` §4-A가 **"DB CHECK 마이그레이션 착수 전 반드시
  정리해야 한다(D-083에 명시)"** 고 명시적으로 삭제(또는 처리)를 선행조건으로 못박았다. 즉
  **더 나중의, 팀장이 승인한 결정이 20일차 메모를 명시적으로 대체한다.**
- I-069·I-067(이 크루의 존재 이유와 연결된 이슈) 둘 다 현재 부분 해결 상태로 열려 있지만,
  두 이슈의 남은 범위(도달 불가능한 방어적 코드 패턴, `CrewHomeContainer` 세부 렌더) 어디에도
  "이 특정 행이 살아있어야 검증 가능하다"는 의존성이 문서화돼 있지 않다 — 20일차에 이 행으로
  수행한 검증(스크린샷·HTTP 200·다이제스트 대조)은 이미 문서에 결과로 남아 있어, 행 자체가
  더 남아있을 필요가 없다.
- 결론: **삭제를 진행한다.** 20일차 메모는 그 시점 기준으로는 유효했으나 28일차 D-083이
  명시적으로 대체했다. (팀장 지시의 "정당한 경로가 없으면 멈추고 보고하라"는 archived
  immutable 트리거 우회 국면에 해당하는 것이었고, 이 메모 충돌은 그와 별개로 스스로 조사해
  판단할 수 있는 사안이었다 — 다만 이 판단 근거를 여기 정직하게 남긴다.)

  **정정(팀장 교차검증, 29일차)**: 위에서 "어떤 미결 이슈도 이 행의 생존에 의존하지 않는다"고
  썼던 것은 **부정확했다.** 정확히는 "**문서화된** 의존성은 없다"까지만 사실이고, 거기서
  "의존성이 없다"로 일반화한 것이 실측과 어긋났다. 삭제 후 직접 재확인한 결과:

  ```sql
  select status, count(*) from public.crews group by status;
  -- active: 13, archived: 해당 행 없음(0건)
  ```

  **삭제 후 DB에 `status='archived'` 크루가 0건이 됐다** — 이 크루가 그 유일한 archived
  행이었다. I-067의 남은 미해결 범위(`docs/ISSUES.md` I-067, "`CrewHomeContainer`가 해산된
  크루를 실제로 열람 전용으로 렌더하는지 미검증")는 정의상 archived 크루가 있어야 검증
  가능한데, 그 픽스처가 사라졌다. **삭제 판단 자체는 뒤집지 않는다** — D-083이 이 crew id를
  명시적으로 선행조건으로 못박았고, 이 픽스처는 `private.disband_crew` RPC로 재생산 가능해
  되돌릴 수 없는 손실이 아니다. 문제는 원래 이 절에서 그 비용을 0으로("의존성 없음")
  보고한 것이었다 — 실제 비용은 "재생산 필요"였다.

  **재생산 절차**(I-067을 다음에 집는 사람을 위해): ① 임의 프로필 소유로 신규 크루 생성
  ② 그 크루를 `private.disband_crew` RPC로 archived 전이(이 함수가 같은 트랜잭션에서
  `chat_messages`를 함께 지운다는 것은 28일차 조사 `product-value-proposals-28.md`의
  I-039 절에서 이미 확인한 사실이다) ③ 이렇게 만든 archived 크루로
  `CrewHomeContainer`·`/board`·`/chat` 렌더를 검증. **`729ced18-2016-459a-94c3-e7959dfe808c`
  (Task 036 검증용, active)를 이 목적으로 archived 전이시키지 말 것** — 28일차부터 보호
  대상이다. `docs/ISSUES.md` I-067 블록에도 같은 안내를 남겼다.

## 1. 선행조건 — archived 테스트 크루 캐스케이드 삭제

### 1-1. `crews_guard_archived_immutable`가 DELETE도 막는가?

`pg_get_functiondef`로 트리거 함수 본문과 `pg_trigger` 정의를 직접 확인했다:

```
CREATE TRIGGER trg_crews_guard_archived_immutable BEFORE UPDATE ON public.crews ...
```

**`BEFORE UPDATE`뿐이다 — `BEFORE DELETE`가 아니다.** 함수 본문도 `TG_OP` 분기 없이
`if old.status = 'archived' then raise exception ...`만 있어,애초에 DELETE 이벤트에는
호출되지 않는다. 즉 **DELETE는 이 트리거로 막히지 않는다** — 우회 경로를 찾을 필요 자체가
없었다.

`crew_memberships`·`boards`·`chat_rooms`·`audit_logs`에 걸린 트리거도 전수 확인했다 —
`crew_memberships`에 INSERT/UPDATE 가드 3건이 있으나 DELETE를 막는 트리거는 없다. 나머지
3테이블은 트리거 자체가 없다(`boards`·`chat_rooms`·`audit_logs` 각 0건).

### 1-2. 캐스케이드 대상 열거 (자식→부모 순, 삭제 직전 SELECT)

대상 크루: `c4283f8a-139c-4c69-ac4e-3c92e355e3bc`
(name: `"I-069 검증용 테스트 크루 (DESIGN 20일차, 재사용 금지)"`, status: `archived`,
owner_id: `30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a`, created_at: `2026-07-25 12:12:49.183612+00`)

| 테이블 | 삭제 대상 행 수 | 삭제 전 덤프 |
| --- | --- | --- |
| `crew_memberships` | 1건 | `{crew_id: c4283f8a-..., profile_id: 30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a, role: owner, status: active, joined_at: 2026-07-25 12:12:49.183612+00, removed_reason: null}` |
| `boards` | 1건 | `{id: d898add7-9dbf-4fd2-82c3-cccb08e913d5, crew_id: c4283f8a-...}` |
| `chat_rooms` | 1건 | `{id: aa22c7e7-1f1a-46f7-83db-a8fcd2a6d686, crew_id: c4283f8a-...}` |
| `audit_logs` | 1건 | `{id: 35f758c3-b25f-42ec-a4fc-3d0d3cc04798, actor_id: 30f44dd9-..., crew_id: c4283f8a-..., action: crew.disbanded, target_id: c4283f8a-..., created_at: 2026-07-25 12:14:30.044146+00}` |

손자뻘 종속 행(`posts`(boards 경유)·`chat_messages`(chat_rooms 경유)·`meetups`·`invitations`·
`join_requests`·`notification_preferences`)도 전부 실측했다 — **전부 0건**, 28일차 조사와
일치. `crews`를 참조하는 FK 8개 전부 `ON DELETE RESTRICT`(`confdeltype='r'`)임을
`pg_constraint`로 재확인했다.

### 1-3. 삭제 실행 (단일 트랜잭션, `begin`…`commit`)

순서: `crew_memberships` → `boards` → `chat_rooms` → `audit_logs` → `crews`(자식 4테이블은
서로 종속이 없어 순서 무관, 부모 `crews`만 마지막). 실행 후 5개 테이블 전부 잔여 0건 확인.

- 삭제 후 `crews` 총 행수: **13건**(삭제 전 14건, 28일차 조사와 일치).
- **건드리지 말라고 지시받은 다른 테스트 크루** `729ced18-2016-459a-94c3-e7959dfe808c`
  (Task 036 검증용, active)는 삭제 전후 조회로 무변경 확인 — `crew_memberships`·`join_requests`
  등 어떤 삭제 쿼리도 이 crew_id를 대상으로 하지 않았다.

## 2. CHECK 추가 전 위반 0건 확인 (전수 SELECT)

```sql
select 'profiles.handle_length', count(*) from profiles where char_length(handle) < 3 or char_length(handle) > 20;       -- 0
select 'profiles.handle_pattern', count(*) from profiles where handle !~ '^[a-z][a-z0-9_]*$';                            -- 0
select 'profiles.bio_length', count(*) from profiles where bio is not null and char_length(btrim(bio)) > 150;            -- 0
select 'crews.name_length', count(*) from crews where char_length(btrim(name)) > 30;                                      -- 0
select 'crews.description_length', count(*) from crews where char_length(btrim(description)) > 300;                      -- 0
```

전부 **0건** — 대상 크루 삭제로 크루명 위반이 해소됐고, 나머지는 28일차 조사와 동일하게
애초에 0건이었다.

## 3. CHECK 제약 적용

기존 CHECK 제약 이름 관례(`pg_constraint` 전수 조회로 확인)는 두 갈래다: 단일 컬럼의 여러
조건을 AND로 묶을 때는 `<table>_<column>_check`(예: `crews_color_key_check`, 상·하한 두 조건),
개념이 더 구체적일 때는 서술적 이름(`reports_reason_not_blank`). 이번 4건은 모두 "한 컬럼의
길이/형식 조건 묶음"이라 전자 관례를 따랐다.

마이그레이션 `20260730033654_product_value_check_constraints_083`(로컬 파일도
`supabase/migrations/`에 동일 내용으로 남김, I-051):

```sql
alter table public.profiles
  add constraint profiles_handle_check
  check (
    char_length(handle) >= 3
    and char_length(handle) <= 20
    and handle ~ '^[a-z][a-z0-9_]*$'
  );

alter table public.profiles
  add constraint profiles_bio_check
  check (bio is null or char_length(btrim(bio)) <= 150);

alter table public.crews
  add constraint crews_name_check
  check (char_length(btrim(name)) <= 30);

alter table public.crews
  add constraint crews_description_check
  check (char_length(btrim(description)) <= 300);
```

**왜 `btrim()`을 쓰는가**: `bio`·crew `name`·`description`은 앱 레이어(`bio-validation.ts`·
`crew-name-validation.ts`·`crew-description-validation.ts`)가 전부 `.trim()` 후 `.length`를
잰다. Server Action 3곳(`update-account-profile.ts`·`create-crew.ts`·`update-crew-info.ts`)이
DB에 쓰기 전에도 이미 trim한다는 것을 확인했으나(§5), 미래의 다른 쓰기 경로(직접 SQL·다른
RPC)까지 같은 시맨틱을 강제하려고 CHECK 쪽도 trim 후 길이를 잰다 — `reports_reason_not_blank`
(`length(TRIM(BOTH FROM reason)) > 0`)와 같은 기존 관례다. `handle`은 정규식 자체가 공백을
허용하지 않으므로(`[a-z][a-z0-9_]*`) trim이 결과에 영향을 주지 않아 생략했다.

**적용 확인**(`pg_constraint` 재조회):

| conname | table | def |
| --- | --- | --- |
| `profiles_handle_check` | profiles | `CHECK (((char_length(handle) >= 3) AND (char_length(handle) <= 20) AND (handle ~ '^[a-z][a-z0-9_]*$'::text)))` |
| `profiles_bio_check` | profiles | `CHECK (((bio IS NULL) OR (char_length(btrim(bio)) <= 150)))` |
| `crews_name_check` | crews | `CHECK ((char_length(btrim(name)) <= 30))` |
| `crews_description_check` | crews | `CHECK ((char_length(btrim(description)) <= 300))` |

`get_advisors(security)` 재확인 — 신규 WARN 0건(기존 `auth_leaked_password_protection` 1건만
그대로, 이번 작업과 무관).

## 4. 양성/음성 실측 (전부 `begin`…`rollback` 또는 `begin`…`commit; DELETE`로 원복, 영구 데이터 없음)

### 음성(위반 → 거부) — 7건 전부 `23514 check_violation`으로 거부 확인

| # | 케이스 | 값 | 결과 |
| --- | --- | --- | --- |
| 1 | handle 너무 짧음(2자) | `'ab'` | 거부 (`profiles_handle_check`) |
| 2 | handle 너무 김(21자) | `'abcdefghijklmnopqrstu'` | 거부 (`profiles_handle_check`) |
| 3 | handle 대문자 시작 | `'Abcdef'` | 거부 (`profiles_handle_check`) |
| 4 | handle 숫자 시작 | `'1abcdef'` | 거부 (`profiles_handle_check`) |
| 5 | bio 151자 | `repeat('a',151)` | 거부 (`profiles_bio_check`) |
| 6 | 크루명 31자 | `repeat('a',31)` | 거부 (`crews_name_check`) |
| 7 | 크루 소개 301자 | `repeat('a',301)` | 거부 (`crews_description_check`) |

실패한 INSERT는 각각 별도 트랜잭션으로 실행돼 예외 시 자동 중단됐고, 이후 재조회로 5건
모두(`ab`·`abcdefghijklmnopqrstu`·`Abcdef`·`1abcdef`·`validhandle1`) `profiles`에 남지
않았음을 확인했다(`leaked` 카운트 0).

### 양성(경계값 → 통과) — 4건 전부 통과 확인, 트랜잭션 롤백으로 영구 반영 없음

| # | 케이스 | 값 | 결과 |
| --- | --- | --- | --- |
| 1 | 크루명 정확히 30자 + 소개 정확히 300자 | `repeat('a',30)` / `repeat('b',300)` | INSERT 성공(`crews_inserted=1`), rollback |
| 2 | handle 정확히 3자 + bio 정확히 150자 | `'abc'` / `repeat('a',150)` | UPDATE 성공(`handle='abc'`, `bio_len=150`), rollback |
| 3 | handle 정확히 20자, 숫자·밑줄 포함 | `'a_1234567890abcdefgh'`(20자) | UPDATE 성공(`handle_len=20`), rollback |

(`profiles.id`가 `auth.users`를 FK로 참조해 임의 UUID로 INSERT할 수 없었으므로, profiles
쪽 양성 테스트는 기존 시드 행을 임시 UPDATE한 뒤 rollback하는 방식으로 실측했다 — crews는
기존 owner_id를 재사용한 INSERT로 실측했다.)

모든 rollback 후 `crews` 13건·`profiles` 21건으로 실측 전과 동일함을 재확인했다 — 영구
데이터 변경 없음.

## 5. 앱 레이어 값과 DB CHECK 값 대조 — 조건부 일치(정정, 팀장 교차검증 29일차)

**원래 이 절을 "문자 그대로 일치"라고 썼던 것은 부정확했다.** 상한 숫자와 정규식은 문자
그대로 일치하지만, `bio`·crew `name`·`description`의 길이 비교 술어 자체는 **동치가 아니다**
— DB는 `char_length(btrim(x))`를, 앱은 `x.trim().length`를 쓰는데 **`btrim`과 JS `.trim()`은
같은 공백 집합을 제거하지 않는다.** Postgres `btrim(text)`(인수 1개)는 기본적으로 **스페이스
문자(U+0020)만** 앞뒤에서 제거하고, JS `String.prototype.trim()`은 탭·개행·NBSP(U+00A0) 등
유니코드 공백 전부를 제거한다. 직접 실측(`char_length`로 확인):

| 입력 | `char_length(btrim(...))` | 비고 |
| --- | ---: | --- |
| `'   x   '` (스페이스만) | 1 | 스페이스는 제거됨 |
| `E'\t x \t'` (탭 포함) | 5(무변화) | **탭은 제거되지 않음** — 원문 5자 그대로 |
| `'x' \|\| chr(160)` (NBSP 포함) | 2(무변화) | **NBSP도 제거되지 않음** |

즉 탭이나 NBSP로 채워 실제 상한을 초과한 값이 DB에 도달하면, 앱 기준(`.trim().length`)으로는
통과할 값이 DB CHECK에서는 거부될 수 있다(불일치 방향은 **DB가 더 엄격**해지는 쪽).

**그런데도 실제 쓰기 경로에서는 어긋나지 않는다** — 이 값을 쓰는 Server Action 3곳을 전수
확인한 결과 **전부 DB에 쓰기 전에 JS `.trim()`을 먼저 적용한다**:

- `src/lib/actions/create-crew.ts:70-71` — `name`·`description` 모두 `.trim()` 후 사용
- `src/lib/actions/update-crew-info.ts:65-66` — 동일
- `src/lib/actions/update-account-profile.ts:46` — `bio` `.trim()` 후 사용

저장되는 값에는 어떤 공백(스페이스·탭·NBSP 불문)도 앞뒤에 남지 않으므로, 그 값에 대해서는
`btrim`이 무연산이 되어 두 술어가 같은 길이를 본다. **즉 이번 CHECK와 앱 레이어의 등가는
"모든 쓰기 경로가 저장 전에 JS `.trim()`을 수행한다"는 불변식에 의존하는 조건부 등가다** —
그 불변식은 위 3개 파일 3곳이 지금 지키고 있지만, 앞으로 이 필드에 새로 쓰는 경로(다른
Server Action·RPC·관리자 도구)를 추가할 때 trim을 빠뜨리면 그 즉시 어긋난다. 그 경우
사용자에게는 친절한 폼 검증 메시지 대신 처리되지 않은 raw `23514 check_violation` 예외가
노출될 수 있다(D-030 ③ 도메인 오류 처리 대상) — 지금 코드에 결함이 있다는 뜻은 아니고,
이 전제가 깨지기 쉬우니 이름 붙여 남겨 둔다.

앱 레이어 값 자체(숫자·정규식)의 일치는 아래와 같다 — 이 부분은 정정 대상이 아니다.

| 필드 | 앱 레이어(`src/lib/rules/*.ts`) | DB CHECK | 일치 여부 |
| --- | --- | --- | --- |
| handle 최소/최대 | `HANDLE_MIN_LENGTH=3`, `HANDLE_MAX_LENGTH=20` | `>= 3 AND <= 20` | 일치 |
| handle 정규식 | `/^[a-z][a-z0-9_]*$/` | `~ '^[a-z][a-z0-9_]*$'` | 일치(이스케이프 포함 — JS 정규식과 POSIX 정규식 문법이 이 패턴 범위에서 동일해 변환 손실 없음) |
| bio 상한 | `BIO_MAX_LENGTH=150` | `<= 150` | 일치 |
| 크루명 상한 | `CREW_NAME_MAX_LENGTH=30` | `<= 30` | 일치 |
| 크루 소개 상한 | `CREW_DESCRIPTION_MAX_LENGTH=300` | `<= 300` | 일치 |

숫자·정규식은 어긋난 곳 없음(길이 술어의 조건부 등가는 위 참고). 다만 두 가지는 의도적으로
DB CHECK에 옮기지 않았다 — 근거를 남긴다:

- **크루명 최소 1자·크루 소개 최소 1자**(`CREW_NAME_MIN_LENGTH`·`CREW_DESCRIPTION_MIN_LENGTH`)는
  이번 배정(팀장 지시 대상 값 목록)에 포함되지 않았다 — 지시된 4개 값(핸들 3~20자+정규식,
  bio 150 상한, 크루명 30 상한, 크루 소개 300 상한)만 옮겼다. "새 값을 발명하지 마라"는 원칙을
  "지시 범위를 임의로 넓히지 마라"로도 해석해 최소 길이 CHECK는 추가하지 않았다. 참고로
  `crews.description`은 컬럼 기본값이 `''`(빈 문자열)이라 최소 1자 CHECK를 추가하면 스키마
  기본값과 충돌할 여지가 있어, 다음 회차에 다룰 경우 기본값도 함께 재검토해야 한다.
- **금칙어 필터**(`BANNED_WORDS`)는 D-083이 "적용 계층은 Server Action 유지, DB로 승격하지
  않는다"고 이미 확정했으므로(28일차 제안 3-C) 대상에서 제외했다 — 이번 CHECK 작업과 무관.

## 6. 코드(앱 레이어) 변경 여부

**변경 없음.** 이번 작업은 DB CHECK 추가와 선행 데이터 정리뿐이다. `src/lib/rules/*.ts` 4개
모듈은 이미 D-083 확정값과 일치해 손댈 필요가 없었다(28일차 조사 결과 그대로).
